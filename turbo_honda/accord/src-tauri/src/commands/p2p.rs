use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct PeerInfo {
    pub peer_id: String,
    pub address: String,
    pub connected: bool,
    /// The channel id this peer is currently active in, if any.
    pub channel_id: Option<String>,
}

/// Returns the local libp2p PeerId as a string.
#[tauri::command]
pub async fn get_local_peer_id(state: State<'_, AppState>) -> Result<String, String> {
    let node = state.p2p.lock().map_err(|e| e.to_string())?;
    Ok(node.local_peer_id())
}

/// Initiate an outbound connection to a peer multiaddr (e.g. "/ip4/1.2.3.4/tcp/4001").
#[tauri::command]
pub async fn connect_to_peer(
    address: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut node = state.p2p.lock().map_err(|e| e.to_string())?;
    node.connect(&address).map_err(|e| e.to_string())
}

/// Disconnect from a peer by PeerId string.
#[tauri::command]
pub async fn disconnect_peer(
    peer_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut node = state.p2p.lock().map_err(|e| e.to_string())?;
    node.disconnect(&peer_id).map_err(|e| e.to_string())
}

/// Return all currently connected peers.
#[tauri::command]
pub async fn list_peers(state: State<'_, AppState>) -> Result<Vec<PeerInfo>, String> {
    let node = state.p2p.lock().map_err(|e| e.to_string())?;
    Ok(node.connected_peers())
}

/// Start mDNS peer discovery on the local network.
#[tauri::command]
pub async fn start_discovery(state: State<'_, AppState>) -> Result<(), String> {
    let mut node = state.p2p.lock().map_err(|e| e.to_string())?;
    node.start_discovery().map_err(|e| e.to_string())
}

/// Announce that the local peer has joined (or left) a channel.
/// Pass `None` / `null` from the frontend to indicate the peer has left all channels.
#[tauri::command]
pub async fn announce_channel_presence(
    channel_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let node = state.p2p.lock().map_err(|e| e.to_string())?;
    node.announce_presence(channel_id).map_err(|e| e.to_string())
}

/// Return all peers currently known to be in the given channel.
#[tauri::command]
pub async fn get_peers_in_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<PeerInfo>, String> {
    let node = state.p2p.lock().map_err(|e| e.to_string())?;
    Ok(node.peers_in_channel(&channel_id))
}
