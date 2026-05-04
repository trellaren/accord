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

/// Accept a server invite received from a remote peer via GossipSub.
///
/// Creates the server record locally (using the canonical server id supplied by
/// the owner) if it does not already exist, then adds the local peer as a member.
#[tauri::command]
pub async fn accept_server_invite(
    server_id: String,
    server_name: String,
    invite_code: String,
    owner_peer_id: String,
    state: State<'_, AppState>,
) -> Result<ServerInfo, String> {
    log::info!(
        "Accepting server invite server_id={server_id} name={server_name:?}"
    );
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    state
        .db
        .join_server_from_invite(
            &server_id,
            &server_name,
            &invite_code,
            &owner_peer_id,
            &local_peer_id,
        )
        .await
        .map_err(|e| e.to_string())
}

/// Join a server from a *full join string* that encodes all metadata needed to
/// create the local server record **and** connect to the server owner.
///
/// # Full join string format
/// ```text
/// <invite_code>|<server_id>|<peer_multiaddr>|<server_name>
/// ```
/// * `invite_code`    – 8-character alphanumeric code (e.g. `AB12CD34`)
/// * `server_id`      – UUID that identifies the server across all peers
/// * `peer_multiaddr` – libp2p multiaddr of the owner, including `/p2p/<peer-id>` suffix
/// * `server_name`    – human-readable display name (may contain `|`)
///
/// The owner's peer id is derived from the `/p2p/<peer-id>` segment of the multiaddr.
#[tauri::command]
pub async fn join_server_by_address(
    join_string: String,
    state: State<'_, AppState>,
) -> Result<ServerInfo, String> {
    log::info!("Joining server by address join_string_len={}", join_string.len());

    // Split into at most 4 parts; the 4th captures the server name (which may
    // itself contain `|`).
    let parts: Vec<&str> = join_string.splitn(4, '|').collect();
    if parts.len() != 4 {
        return Err(
            "Invalid join string. Expected format: invite_code|server_id|peer_multiaddr|server_name"
                .to_string(),
        );
    }
    let invite_code = parts[0].trim().to_uppercase();
    let server_id = parts[1].trim().to_string();
    let peer_addr = parts[2].trim().to_string();
    // The server name is the last segment and may itself contain `|`; trim
    // whitespace but otherwise preserve it as-is.
    let server_name = parts[3].trim().to_string();

    // Extract the owner's peer id from the multiaddr `/p2p/<peer-id>` suffix.
    let owner_peer_id = peer_addr
        .rsplit("/p2p/")
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "Peer address must include a /p2p/<peer-id> suffix".to_string()
        })?
        .to_string();

    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };

    // Create the server record locally (idempotent if it already exists).
    let server = state
        .db
        .join_server_from_invite(
            &server_id,
            &server_name,
            &invite_code,
            &owner_peer_id,
            &local_peer_id,
        )
        .await
        .map_err(|e| e.to_string())?;

    // Dial the peer address so the P2P connection is established.
    {
        let mut node = state.p2p.lock().map_err(|e| e.to_string())?;
        if let Err(e) = node.connect(&peer_addr) {
            log::warn!("Could not dial peer {peer_addr}: {e}");
        }
    }

    log::info!(
        "Joined server id={} name={:?} via address {}",
        server.id,
        server.name,
        peer_addr,
    );
    Ok(server)
}

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
