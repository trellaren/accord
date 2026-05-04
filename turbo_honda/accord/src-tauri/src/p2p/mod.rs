//! P2P networking module.
//!
//! Uses libp2p with:
//!   - TCP transport + Noise encryption + Yamux multiplexing
//!   - mDNS for local-network peer discovery
//!   - GossipSub for pub/sub messaging (text channels, signalling, presence)
//!   - Identify for exchanging peer metadata
//!   - Ping for keepalive

pub mod identity;

use anyhow::{anyhow, Result};
use futures::StreamExt;
use libp2p::{
    gossipsub, identify, mdns, noise, ping,
    swarm::{NetworkBehaviour, SwarmEvent},
    tcp, yamux, Multiaddr, PeerId,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use crate::commands::p2p::PeerInfo;

/// GossipSub topic used to exchange channel-presence announcements.
const PRESENCE_TOPIC: &str = "accord/presence";

/// GossipSub topic used to send server-join invites between peers.
const SERVER_INVITE_TOPIC: &str = "accord/server-invite";

/// JSON payload published on [`PRESENCE_TOPIC`].
#[derive(Serialize, Deserialize)]
struct PresenceMessage {
    peer_id: String,
    /// `None` means the peer has left all channels.
    channel_id: Option<String>,
}

/// JSON payload published on [`SERVER_INVITE_TOPIC`].
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerInviteMessage {
    /// The invite code the recipient should use to join the server.
    pub invite_code: String,
    /// Human-readable server name (for display purposes).
    pub server_name: String,
    /// PeerId of the sender.
    pub from_peer_id: String,
}

/// Invite pending transmission once a specific peer address is connected.
struct PendingOutboundInvite {
    /// The multiaddr string that was dialled (used to match `ConnectionEstablished`).
    target_addr: String,
    /// Serialised [`ServerInviteMessage`].
    data: Vec<u8>,
}

/// Combined libp2p behaviour for Accord.
#[derive(NetworkBehaviour)]
pub struct AccordBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub mdns: mdns::tokio::Behaviour,
    pub identify: identify::Behaviour,
    pub ping: ping::Behaviour,
}

/// Commands sent to the swarm event-loop task.
enum SwarmCommand {
    Dial(Multiaddr),
    Disconnect(PeerId),
    Subscribe(String),
    Publish { topic: String, data: Vec<u8> },
}

type PeerMap = Arc<Mutex<HashMap<String, PeerInfo>>>;
/// Maps peer_id -> current channel_id (None = not in any channel).
type PresenceMap = Arc<Mutex<HashMap<String, Option<String>>>>;
type PendingOutboundInvites = Arc<Mutex<Vec<PendingOutboundInvite>>>;
type PendingReceivedInvites = Arc<Mutex<Vec<ServerInviteMessage>>>;

/// Handle to the local libp2p node.
///
/// Internally this owns a command-sender channel; the actual `Swarm<AccordBehaviour>` runs
/// inside a dedicated Tokio task spawned by [`P2PNode::new`].
pub struct P2PNode {
    local_peer_id: String,
    command_tx: UnboundedSender<SwarmCommand>,
    peers: PeerMap,
    /// Channel presence: peer_id → channel_id (None = not in any channel).
    channel_presence: PresenceMap,
    discovery_started: bool,
    /// Invites to be sent once the target peer connects.
    pending_outbound_invites: PendingOutboundInvites,
    /// Server invites received from remote peers, waiting to be consumed.
    pending_received_invites: PendingReceivedInvites,
}

impl P2PNode {
    /// Build a real libp2p swarm using a persisted (or freshly generated)
    /// Ed25519 keypair and spawn its Tokio-driven event-loop task.
    pub fn new(app_dir: &Path) -> Self {
        let keypair = identity::load_or_create_keypair(app_dir)
            .expect("failed to load or create Ed25519 keypair");

        let mut swarm = libp2p::SwarmBuilder::with_existing_identity(keypair)
            .with_tokio()
            .with_tcp(
                tcp::Config::default(),
                noise::Config::new,
                yamux::Config::default,
            )
            .expect("failed to build TCP transport")
            .with_behaviour(|key| {
                let gossipsub = {
                    let config = gossipsub::ConfigBuilder::default()
                        .heartbeat_interval(Duration::from_secs(10))
                        .validation_mode(gossipsub::ValidationMode::Strict)
                        .build()
                        .expect("valid gossipsub config");
                    gossipsub::Behaviour::new(
                        gossipsub::MessageAuthenticity::Signed(key.clone()),
                        config,
                    )
                    .expect("gossipsub init")
                };
                let mdns = mdns::tokio::Behaviour::new(
                    mdns::Config::default(),
                    key.public().to_peer_id(),
                )
                .expect("mDNS init");
                let identify = identify::Behaviour::new(identify::Config::new(
                    "/accord/1.0.0".into(),
                    key.public(),
                ));
                let ping = ping::Behaviour::new(ping::Config::default());
                AccordBehaviour {
                    gossipsub,
                    mdns,
                    identify,
                    ping,
                }
            })
            .expect("failed to build AccordBehaviour (gossipsub/mdns/identify/ping)")
            .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(60)))
            .build();

        // Listen on all IPv4 interfaces; the OS picks a free port.
        swarm
            .listen_on("/ip4/0.0.0.0/tcp/0".parse().expect("valid multiaddr"))
            .expect("listen failed");

        // Subscribe to the presence topic so we receive announcements from peers.
        let presence_topic = gossipsub::IdentTopic::new(PRESENCE_TOPIC);
        swarm
            .behaviour_mut()
            .gossipsub
            .subscribe(&presence_topic)
            .expect("subscribe to presence topic");

        // Subscribe to the server-invite topic.
        let invite_topic = gossipsub::IdentTopic::new(SERVER_INVITE_TOPIC);
        swarm
            .behaviour_mut()
            .gossipsub
            .subscribe(&invite_topic)
            .expect("subscribe to server-invite topic");

        let presence_topic_hash = presence_topic.hash();
        let invite_topic_hash = invite_topic.hash();

        let local_peer_id = swarm.local_peer_id().to_string();
        let local_peer_id_task = local_peer_id.clone();

        // Channel for sending commands to the swarm task (sync-compatible sender).
        let (command_tx, mut command_rx) = tokio::sync::mpsc::unbounded_channel::<SwarmCommand>();

        // Shared peer state updated by the event loop and read by Tauri commands.
        let peers: PeerMap = Arc::new(Mutex::new(HashMap::new()));
        let peers_task = Arc::clone(&peers);

        // Channel presence map shared between the event loop and command handlers.
        let channel_presence: PresenceMap = Arc::new(Mutex::new(HashMap::new()));
        let presence_task = Arc::clone(&channel_presence);

        // Outbound invites queued until the target peer connects.
        let pending_outbound_invites: PendingOutboundInvites =
            Arc::new(Mutex::new(Vec::new()));
        let pending_outbound_task = Arc::clone(&pending_outbound_invites);

        // Inbound invites received from remote peers, waiting to be consumed.
        let pending_received_invites: PendingReceivedInvites =
            Arc::new(Mutex::new(Vec::new()));
        let pending_received_task = Arc::clone(&pending_received_invites);

        // Spawn the swarm event loop on the Tokio runtime that Tauri already provides.
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    // Drive the swarm forward and handle network events.
                    event = swarm.next() => {
                        let Some(event) = event else { break };
                        match event {
                            SwarmEvent::NewListenAddr { address, .. } => {
                                log::info!("Listening on {address}");
                            }
                            SwarmEvent::ConnectionEstablished { peer_id, endpoint, .. } => {
                                let address = endpoint.get_remote_address().to_string();
                                log::info!("Connected to {peer_id} at {address}");
                                peers_task.lock().unwrap().insert(
                                    peer_id.to_string(),
                                    PeerInfo {
                                        peer_id: peer_id.to_string(),
                                        address: address.clone(),
                                        connected: true,
                                        channel_id: None,
                                    },
                                );
                                // Send any pending outbound invites destined for this address.
                                let to_send: Vec<Vec<u8>> = {
                                    let mut pending = pending_outbound_task.lock().unwrap();
                                    let mut remaining = Vec::new();
                                    let mut matched = Vec::new();
                                    for invite in pending.drain(..) {
                                        if invite.target_addr == address {
                                            matched.push(invite.data);
                                        } else {
                                            remaining.push(invite);
                                        }
                                    }
                                    *pending = remaining;
                                    matched
                                };
                                for data in to_send {
                                    let topic = gossipsub::IdentTopic::new(SERVER_INVITE_TOPIC);
                                    if let Err(e) = swarm
                                        .behaviour_mut()
                                        .gossipsub
                                        .publish(topic, data)
                                    {
                                        log::error!("Failed to publish server invite: {e}");
                                    }
                                }
                            }
                            SwarmEvent::ConnectionClosed { peer_id, .. } => {
                                log::info!("Disconnected from {peer_id}");
                                peers_task.lock().unwrap().remove(&peer_id.to_string());
                                presence_task.lock().unwrap().remove(&peer_id.to_string());
                            }
                            SwarmEvent::Behaviour(AccordBehaviourEvent::Mdns(
                                mdns::Event::Discovered(list),
                            )) => {
                                for (peer_id, multiaddr) in list {
                                    log::info!("mDNS discovered {peer_id} at {multiaddr}");
                                    swarm
                                        .behaviour_mut()
                                        .gossipsub
                                        .add_explicit_peer(&peer_id);
                                    if let Err(e) = swarm.dial(multiaddr) {
                                        log::warn!("Failed to dial mDNS peer {peer_id}: {e}");
                                    }
                                }
                            }
                            SwarmEvent::Behaviour(AccordBehaviourEvent::Mdns(
                                mdns::Event::Expired(list),
                            )) => {
                                for (peer_id, _) in list {
                                    log::info!("mDNS expired {peer_id}");
                                    swarm
                                        .behaviour_mut()
                                        .gossipsub
                                        .remove_explicit_peer(&peer_id);
                                }
                            }
                            SwarmEvent::Behaviour(AccordBehaviourEvent::Gossipsub(
                                gossipsub::Event::Message {
                                    propagation_source,
                                    message,
                                    ..
                                },
                            )) => {
                                if message.topic == presence_topic_hash {
                                    // Parse channel-presence announcement.
                                    if let Ok(pm) =
                                        serde_json::from_slice::<PresenceMessage>(&message.data)
                                    {
                                        log::debug!(
                                            "Presence from {}: channel={:?}",
                                            pm.peer_id,
                                            pm.channel_id
                                        );
                                        presence_task
                                            .lock()
                                            .unwrap()
                                            .insert(pm.peer_id.clone(), pm.channel_id.clone());
                                        // Mirror channel_id into the peer map.
                                        if let Some(info) = peers_task
                                            .lock()
                                            .unwrap()
                                            .get_mut(&pm.peer_id)
                                        {
                                            info.channel_id = pm.channel_id;
                                        }
                                    }
                                } else if message.topic == invite_topic_hash {
                                    // Parse a server-invite and store it for the command layer.
                                    if let Ok(invite) = serde_json::from_slice::<ServerInviteMessage>(&message.data) {
                                        log::info!(
                                            "Received server invite for '{}' from {}",
                                            invite.server_name,
                                            invite.from_peer_id,
                                        );
                                        // Only store if we are not the sender.
                                        if invite.from_peer_id != local_peer_id_task {
                                            pending_received_task.lock().unwrap().push(invite);
                                        }
                                    }
                                } else {
                                    log::debug!(
                                        "GossipSub message from {propagation_source} on {:?}: {} bytes",
                                        message.topic,
                                        message.data.len()
                                    );
                                }
                            }
                            SwarmEvent::Behaviour(AccordBehaviourEvent::Identify(
                                identify::Event::Received { peer_id, info, .. },
                            )) => {
                                log::debug!(
                                    "Identify from {peer_id}: agent={}",
                                    info.agent_version
                                );
                            }
                            _ => {}
                        }
                    },
                    // Handle commands from Tauri command handlers.
                    cmd = command_rx.recv() => {
                        let Some(cmd) = cmd else { break };
                        match cmd {
                            SwarmCommand::Dial(addr) => {
                                if let Err(e) = swarm.dial(addr) {
                                    log::error!("dial error: {e}");
                                }
                            }
                            SwarmCommand::Disconnect(peer_id) => {
                                let _ = swarm.disconnect_peer_id(peer_id);
                            }
                            SwarmCommand::Subscribe(topic_name) => {
                                let topic = gossipsub::IdentTopic::new(topic_name);
                                if let Err(e) =
                                    swarm.behaviour_mut().gossipsub.subscribe(&topic)
                                {
                                    log::error!("subscribe error: {e}");
                                }
                            }
                            SwarmCommand::Publish { topic, data } => {
                                let topic = gossipsub::IdentTopic::new(topic);
                                if let Err(e) =
                                    swarm.behaviour_mut().gossipsub.publish(topic, data)
                                {
                                    log::error!("publish error: {e}");
                                }
                            }
                        }
                    }
                }
            }
            log::info!("P2P swarm event loop terminated");
        });

        Self {
            local_peer_id,
            command_tx,
            peers,
            channel_presence,
            discovery_started: false,
            pending_outbound_invites,
            pending_received_invites,
        }
    }

    /// Return the local PeerId as a base58 string.
    pub fn local_peer_id(&self) -> String {
        self.local_peer_id.clone()
    }

    /// Dial a remote peer by multiaddr string.
    pub fn connect(&mut self, address: &str) -> Result<()> {
        let addr: Multiaddr = address.parse()?;
        log::info!("Dialling {address}");
        self.command_tx
            .send(SwarmCommand::Dial(addr))
            .map_err(|e| anyhow!("channel send error: {e}"))
    }

    /// Disconnect from a peer.
    pub fn disconnect(&mut self, peer_id: &str) -> Result<()> {
        let peer: PeerId = peer_id.parse()?;
        log::info!("Disconnecting from {peer_id}");
        self.command_tx
            .send(SwarmCommand::Disconnect(peer))
            .map_err(|e| anyhow!("channel send error: {e}"))
    }

    /// Return metadata for all connected peers.
    pub fn connected_peers(&self) -> Vec<PeerInfo> {
        self.peers
            .lock()
            .expect("peers lock poisoned")
            .values()
            .filter(|p| p.connected)
            .map(|p| PeerInfo {
                peer_id: p.peer_id.clone(),
                address: p.address.clone(),
                connected: p.connected,
                channel_id: p.channel_id.clone(),
            })
            .collect()
    }

    /// Announce that the local peer has joined or left a channel.
    /// Broadcasts a [`PresenceMessage`] on the [`PRESENCE_TOPIC`] gossipsub topic.
    pub fn announce_presence(&self, channel_id: Option<String>) -> Result<()> {
        log::info!("Announcing presence: channel={:?}", channel_id);
        let msg = PresenceMessage {
            peer_id: self.local_peer_id.clone(),
            channel_id,
        };
        let data = serde_json::to_vec(&msg).map_err(|e| anyhow!("JSON encode error: {e}"))?;
        self.command_tx
            .send(SwarmCommand::Publish {
                topic: PRESENCE_TOPIC.to_owned(),
                data,
            })
            .map_err(|e| anyhow!("channel send error: {e}"))
    }

    /// Return all connected peers currently known to be in `channel_id`.
    pub fn peers_in_channel(&self, channel_id: &str) -> Vec<PeerInfo> {
        self.peers
            .lock()
            .expect("peers lock poisoned")
            .values()
            .filter(|p| p.connected && p.channel_id.as_deref() == Some(channel_id))
            .map(|p| PeerInfo {
                peer_id: p.peer_id.clone(),
                address: p.address.clone(),
                connected: p.connected,
                channel_id: p.channel_id.clone(),
            })
            .collect()
    }

    /// mDNS discovery runs automatically as part of the swarm.
    /// This method guards against double-starts from the Tauri command layer.
    pub fn start_discovery(&mut self) -> Result<()> {
        if self.discovery_started {
            return Err(anyhow!("Discovery already running"));
        }
        log::info!("mDNS peer discovery is active");
        self.discovery_started = true;
        Ok(())
    }

    /// Queue a server invite to be sent to `target_addr` once connected, and
    /// dial the address if not already connected.
    pub fn queue_server_invite(&self, target_addr: &str, invite: &ServerInviteMessage) -> Result<()> {
        let data = serde_json::to_vec(invite).map_err(|e| anyhow!("JSON encode: {e}"))?;
        self.pending_outbound_invites.lock().unwrap().push(PendingOutboundInvite {
            target_addr: target_addr.to_string(),
            data,
        });
        // Dial the address so the connection is established.
        let addr: Multiaddr = target_addr.parse().map_err(|e| anyhow!("invalid multiaddr: {e}"))?;
        log::info!("Queueing server invite + dialling {target_addr}");
        self.command_tx
            .send(SwarmCommand::Dial(addr))
            .map_err(|e| anyhow!("channel send error: {e}"))
    }

    /// Drain and return all server invites received from remote peers.
    pub fn take_received_server_invites(&self) -> Vec<ServerInviteMessage> {
        self.pending_received_invites
            .lock()
            .unwrap()
            .drain(..)
            .collect()
    }

    /// Publish a message on a GossipSub topic (used for text channels and signalling).
    pub fn publish(&self, topic: &str, data: &[u8]) -> Result<()> {
        log::debug!("Publishing {} bytes on topic '{topic}'", data.len());
        self.command_tx
            .send(SwarmCommand::Publish {
                topic: topic.to_owned(),
                data: data.to_vec(),
            })
            .map_err(|e| anyhow!("channel send error: {e}"))
    }

    /// Subscribe to a GossipSub topic.
    pub fn subscribe(&mut self, topic: &str) -> Result<()> {
        log::info!("Subscribing to topic '{topic}'");
        self.command_tx
            .send(SwarmCommand::Subscribe(topic.to_owned()))
            .map_err(|e| anyhow!("channel send error: {e}"))
    }
}
