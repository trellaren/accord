//! P2P networking module.
//!
//! Uses libp2p with:
//!   - TCP transport + Noise encryption + Yamux multiplexing
//!   - mDNS for local-network peer discovery
//!   - GossipSub for pub/sub messaging (text channels, signalling)
//!   - Identify for exchanging peer metadata
//!   - Ping for keepalive

use anyhow::{anyhow, Result};
use futures::StreamExt;
use libp2p::{
    gossipsub, identify, mdns, noise, ping,
    swarm::{NetworkBehaviour, SwarmEvent},
    tcp, yamux, Multiaddr, PeerId,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

use crate::commands::p2p::PeerInfo;

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

/// Handle to the local libp2p node.
///
/// Internally this owns a command-sender channel; the actual `Swarm<AccordBehaviour>` runs
/// inside a dedicated Tokio task spawned by [`P2PNode::new`].
pub struct P2PNode {
    local_peer_id: String,
    command_tx: UnboundedSender<SwarmCommand>,
    peers: PeerMap,
    discovery_started: bool,
}

impl P2PNode {
    /// Build a real libp2p swarm and spawn its Tokio-driven event-loop task.
    pub fn new() -> Self {
        let mut swarm = libp2p::SwarmBuilder::with_new_identity()
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
            .with_swarm_config(|c| c.with_idle_connection_timeout(Duration::from_secs(60)))
            .build();

        // Listen on all IPv4 interfaces; the OS picks a free port.
        swarm
            .listen_on("/ip4/0.0.0.0/tcp/0".parse().expect("valid multiaddr"))
            .expect("listen failed");

        let local_peer_id = swarm.local_peer_id().to_string();

        // Channel for sending commands to the swarm task (sync-compatible sender).
        let (command_tx, mut command_rx) = tokio::sync::mpsc::unbounded_channel::<SwarmCommand>();

        // Shared peer state updated by the event loop and read by Tauri commands.
        let peers: PeerMap = Arc::new(Mutex::new(HashMap::new()));
        let peers_task = Arc::clone(&peers);

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
                                        address,
                                        connected: true,
                                    },
                                );
                            }
                            SwarmEvent::ConnectionClosed { peer_id, .. } => {
                                log::info!("Disconnected from {peer_id}");
                                peers_task.lock().unwrap().remove(&peer_id.to_string());
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
                                log::debug!(
                                    "GossipSub message from {propagation_source} on {:?}: {} bytes",
                                    message.topic,
                                    message.data.len()
                                );
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
            discovery_started: false,
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

impl Default for P2PNode {
    fn default() -> Self {
        Self::new()
    }
}
