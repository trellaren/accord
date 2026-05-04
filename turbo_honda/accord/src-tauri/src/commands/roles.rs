use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Permission bit-flags stored as an integer in `server_roles.permissions`.
pub mod perms {
    pub const VIEW_CHANNEL: i64 = 1;
    pub const SEND_MESSAGES: i64 = 2;
    pub const JOIN_VOICE: i64 = 4;
    pub const INVITE_USERS: i64 = 8;
    pub const MANAGE_CHANNELS: i64 = 16;
    pub const MANAGE_ROLES: i64 = 32;
    pub const DELETE_MESSAGES: i64 = 64;
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerRole {
    pub id: String,
    pub server_id: String,
    pub name: String,
    /// CSS-compatible hex colour string, e.g. `"#99aab5"`.
    pub color: String,
    /// Bitmask of allowed permissions (see [`perms`]).
    pub permissions: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChannelPermission {
    pub id: String,
    pub channel_id: String,
    pub role_id: String,
    /// Bitmask of explicitly allowed permissions for this channel + role.
    pub allow: i64,
    /// Bitmask of explicitly denied permissions for this channel + role.
    pub deny: i64,
}

// ── Role CRUD ─────────────────────────────────────────────────────────────────

/// Create a new role for a server.  Only the server owner may do this.
#[tauri::command]
pub async fn create_role(
    server_id: String,
    name: String,
    color: String,
    permissions: i64,
    state: State<'_, AppState>,
) -> Result<ServerRole, String> {
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
        return Err("Only the server owner can manage roles".to_string());
    }
    state
        .db
        .create_role(server_id, name, color, permissions)
        .await
        .map_err(|e| e.to_string())
}

/// Return all roles for a server.
#[tauri::command]
pub async fn list_roles(
    server_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ServerRole>, String> {
    state
        .db
        .list_roles(&server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Update a role's name, colour and permissions.  Only the server owner may do this.
#[tauri::command]
pub async fn update_role(
    role_id: String,
    name: String,
    color: String,
    permissions: i64,
    state: State<'_, AppState>,
) -> Result<ServerRole, String> {
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    // Verify the caller owns the server this role belongs to.
    let role = state
        .db
        .get_role(&role_id)
        .await
        .map_err(|e| e.to_string())?;
    let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
    let server = servers
        .into_iter()
        .find(|s| s.id == role.server_id)
        .ok_or_else(|| "Associated server not found".to_string())?;
    if server.owner_peer_id != local_peer_id {
        return Err("Only the server owner can manage roles".to_string());
    }
    state
        .db
        .update_role(&role_id, &name, &color, permissions)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a role.  Only the server owner may do this.
#[tauri::command]
pub async fn delete_role(
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    let role = state
        .db
        .get_role(&role_id)
        .await
        .map_err(|e| e.to_string())?;
    let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
    let server = servers
        .into_iter()
        .find(|s| s.id == role.server_id)
        .ok_or_else(|| "Associated server not found".to_string())?;
    if server.owner_peer_id != local_peer_id {
        return Err("Only the server owner can manage roles".to_string());
    }
    state
        .db
        .delete_role(&role_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Member role assignment ────────────────────────────────────────────────────

/// Assign a role to a server member.  Only the server owner may do this.
#[tauri::command]
pub async fn assign_member_role(
    server_id: String,
    peer_id: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
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
        return Err("Only the server owner can assign roles".to_string());
    }
    state
        .db
        .assign_member_role(&server_id, &peer_id, &role_id)
        .await
        .map_err(|e| e.to_string())
}

/// Remove a role from a server member.  Only the server owner may do this.
#[tauri::command]
pub async fn remove_member_role(
    server_id: String,
    peer_id: String,
    role_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
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
        return Err("Only the server owner can manage roles".to_string());
    }
    state
        .db
        .remove_member_role(&server_id, &peer_id, &role_id)
        .await
        .map_err(|e| e.to_string())
}

/// Return all roles assigned to a member in a server.
#[tauri::command]
pub async fn get_member_roles(
    server_id: String,
    peer_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ServerRole>, String> {
    state
        .db
        .get_member_roles(&server_id, &peer_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Channel permissions ───────────────────────────────────────────────────────

/// Set (upsert) the allow/deny permissions for a role in a specific channel.
/// Only the server owner may do this.
#[tauri::command]
pub async fn set_channel_permission(
    channel_id: String,
    role_id: String,
    allow: i64,
    deny: i64,
    state: State<'_, AppState>,
) -> Result<ChannelPermission, String> {
    let local_peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    // Verify ownership via the channel → server chain.
    let channels = state
        .db
        .list_channels(None)
        .await
        .map_err(|e| e.to_string())?;
    let channel = channels
        .into_iter()
        .find(|c| c.id == channel_id)
        .ok_or_else(|| format!("Channel '{channel_id}' not found"))?;
    if let Some(server_id) = &channel.server_id {
        let servers = state.db.list_servers().await.map_err(|e| e.to_string())?;
        let server = servers
            .into_iter()
            .find(|s| &s.id == server_id)
            .ok_or_else(|| "Associated server not found".to_string())?;
        if server.owner_peer_id != local_peer_id {
            return Err("Only the server owner can configure channel permissions".to_string());
        }
    }
    state
        .db
        .set_channel_permission(&channel_id, &role_id, allow, deny)
        .await
        .map_err(|e| e.to_string())
}

/// Return all permission overrides for a channel.
#[tauri::command]
pub async fn get_channel_permissions(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ChannelPermission>, String> {
    state
        .db
        .get_channel_permissions(&channel_id)
        .await
        .map_err(|e| e.to_string())
}
