//! P2P networking module.
//!
//! Uses libp2p with:
//!   - TCP transport + Noise encryption + Yamux multiplexing
//!   - mDNS for local-network peer discovery
//!   - GossipSub for pub/sub messaging (text channels, signalling)
//!   - Identify for exchanging peer metadata

use anyhow::{anyhow, Result};
use std::collections::HashMap;

use crate::commands::p2p::PeerInfo;

/// Represents the local libp2p node.
///
/// In a full implementation this would hold a `Swarm<AccordBehaviour>` and
/// run the event loop on a Tokio task.  For the scaffold the fields are stubs
/// that keep the public API stable while the real networking code is wired up.
pub struct P2PNode {
    local_peer_id: String,
    peers: HashMap<String, PeerInfo>,
    discovery_started: bool,
}

impl P2PNode {
    pub fn new() -> Self {
        // Generate a random Ed25519 keypair and derive the PeerId.
        // TODO: persist the keypair to disk so the identity is stable across restarts.
        let peer_id = format!("12D3KooW{}", uuid::Uuid::new_v4().as_simple());
        Self {
            local_peer_id: peer_id,
            peers: HashMap::new(),
            discovery_started: false,
        }
    }

    /// Return the local PeerId as a base58 string.
    pub fn local_peer_id(&self) -> String {
        self.local_peer_id.clone()
    }

    /// Dial a remote peer by multiaddr string.
    pub fn connect(&mut self, address: &str) -> Result<()> {
        // TODO: call swarm.dial(address.parse::<Multiaddr>()?)
        log::info!("Connecting to peer at {address}");
        let peer_id = format!("peer_{}", uuid::Uuid::new_v4().as_simple());
        self.peers.insert(
            peer_id.clone(),
            PeerInfo {
                peer_id,
                address: address.to_string(),
                connected: true,
            },
        );
        Ok(())
    }

    /// Disconnect from a peer.
    pub fn disconnect(&mut self, peer_id: &str) -> Result<()> {
        // TODO: call swarm.disconnect_peer_id(peer_id.parse()?)
        log::info!("Disconnecting from peer {peer_id}");
        self.peers.remove(peer_id);
        Ok(())
    }

    /// Return metadata for all connected peers.
    pub fn connected_peers(&self) -> Vec<PeerInfo> {
        self.peers
            .values()
            .filter(|p| p.connected)
            .map(|p| PeerInfo {
                peer_id: p.peer_id.clone(),
                address: p.address.clone(),
                connected: p.connected,
            })
            .collect()
    }

    /// Start mDNS discovery so peers on the LAN find each other automatically.
    pub fn start_discovery(&mut self) -> Result<()> {
        if self.discovery_started {
            return Err(anyhow!("Discovery already running"));
        }
        // TODO: enable the mDNS behaviour in the swarm and spawn the event loop task.
        log::info!("Starting mDNS peer discovery");
        self.discovery_started = true;
        Ok(())
    }

    /// Publish a message on a GossipSub topic (used for text channels and signalling).
    pub fn publish(&self, topic: &str, data: &[u8]) -> Result<()> {
        // TODO: swarm.behaviour_mut().gossipsub.publish(topic_hash, data)
        log::debug!("Publishing {} bytes on topic '{topic}'", data.len());
        Ok(())
    }

    /// Subscribe to a GossipSub topic.
    pub fn subscribe(&mut self, topic: &str) -> Result<()> {
        // TODO: swarm.behaviour_mut().gossipsub.subscribe(&IdentTopic::new(topic))
        log::info!("Subscribing to topic '{topic}'");
        Ok(())
    }
}

impl Default for P2PNode {
    fn default() -> Self {
        Self::new()
    }
}
