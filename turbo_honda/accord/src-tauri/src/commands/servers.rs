use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerInfo {
    pub id: String,
    pub name: String,
    /// Short alphanumeric invite code that other peers can use to join.
    pub invite_code: String,
    pub owner_peer_id: String,
    /// Optional avatar stored as a data-URI or URL.
    pub avatar_url: String,
}

/// Create a new server owned by the local peer.
#[tauri::command]
pub async fn create_server(
    name: String,
    state: State<'_, AppState>,
) -> Result<ServerInfo, String> {
    log::info!("Creating server name={name:?}");
    let owner_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    let result = state
        .db
        .create_server(name, owner_peer_id)
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(s) => log::debug!("Server created id={}", s.id),
        Err(e) => log::error!("Failed to create server: {e}"),
    }
    result
}

/// Return all servers stored locally.
#[tauri::command]
pub async fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerInfo>, String> {
    log::debug!("Listing servers");
    state.db.list_servers().await.map_err(|e| e.to_string())
}

/// Join an existing server by its invite code.
#[tauri::command]
pub async fn join_server(
    invite_code: String,
    state: State<'_, AppState>,
) -> Result<ServerInfo, String> {
    log::info!("Joining server invite_code={invite_code:?}");
    let peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    let result = state
        .db
        .join_server(&invite_code, &peer_id)
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(s) => log::info!("Joined server id={} name={:?}", s.id, s.name),
        Err(e) => log::error!("Failed to join server invite={invite_code:?}: {e}"),
    }
    result
}

/// Return the invite code of a server (only works if we own the server or are a member).
#[tauri::command]
pub async fn get_server_invite(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::debug!("Getting invite code for server_id={server_id}");
    let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
    servers
        .into_iter()
        .find(|s| s.id == server_id)
        .map(|s| s.invite_code)
        .ok_or_else(|| format!("Server '{server_id}' not found"))
}

/// Return the list of peer ids that are members of the given server.
#[tauri::command]
pub async fn list_server_members(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    log::debug!("Listing members for server_id={server_id}");
    state
        .db
        .list_server_members(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Remove a peer from a server.  Only the server owner may do this.
#[tauri::command]
pub async fn remove_server_member(
    server_id: String,
    peer_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Removing member peer_id={peer_id} from server_id={server_id}");
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    // Verify ownership.
    let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
    let server = servers
        .into_iter()
        .find(|s| s.id == server_id)
        .ok_or_else(|| format!("Server '{server_id}' not found"))?;
    if server.owner_peer_id != local_peer_id {
        log::warn!("Unauthorized remove_server_member attempt on server_id={server_id}");
        return Err("Only the server owner can remove members".to_string());
    }
    state
        .db
        .remove_server_member(&server_id, &peer_id)
        .await
        .map_err(|e| e.to_string())
}

/// Leave a server (remove the local peer from the member list).
/// The server owner cannot leave – they must delete the server instead.
#[tauri::command]
pub async fn leave_server(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Leaving server server_id={server_id}");
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
    let server = servers
        .into_iter()
        .find(|s| s.id == server_id)
        .ok_or_else(|| format!("Server '{server_id}' not found"))?;
    if server.owner_peer_id == local_peer_id {
        return Err("Server owner cannot leave — delete the server instead".to_string());
    }
    state
        .db
        .leave_server(&server_id, &local_peer_id)
        .await
        .map_err(|e| e.to_string())
}

/// Update a server's name and/or avatar.  Only the server owner may do this.
#[tauri::command]
pub async fn update_server(
    server_id: String,
    name: String,
    avatar_url: String,
    state: State<'_, AppState>,
) -> Result<ServerInfo, String> {
    log::info!("Updating server server_id={server_id} name={name:?}");
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
    let server = servers
        .into_iter()
        .find(|s| s.id == server_id)
        .ok_or_else(|| format!("Server '{server_id}' not found"))?;
    if server.owner_peer_id != local_peer_id {
        log::warn!("Unauthorized update_server attempt on server_id={server_id}");
        return Err("Only the server owner can update it".to_string());
    }
    state
        .db
        .update_server(&server_id, &name, &avatar_url)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a server entirely.  Only the server owner may do this.
#[tauri::command]
pub async fn delete_server(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Deleting server server_id={server_id}");
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
    let server = servers
        .into_iter()
        .find(|s| s.id == server_id)
        .ok_or_else(|| format!("Server '{server_id}' not found"))?;
    if server.owner_peer_id != local_peer_id {
        log::warn!("Unauthorized delete_server attempt on server_id={server_id}");
        return Err("Only the server owner can delete it".to_string());
    }
    state
        .db
        .delete_server(&server_id)
        .await
        .map_err(|e| e.to_string())
}
