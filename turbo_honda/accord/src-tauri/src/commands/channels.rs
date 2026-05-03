use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub kind: String, // "text" | "voice" | "video"
    /// The server this channel belongs to (None for legacy / unscoped channels).
    pub server_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessagePayload {
    pub id: String,
    pub channel_id: String,
    pub author_peer_id: String,
    pub content: String,
    pub timestamp: String,
}

/// Create a new channel (text, voice, or video) optionally scoped to a server.
#[tauri::command]
pub async fn create_channel(
    name: String,
    kind: String,
    server_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<ChannelInfo, String> {
    state
        .db
        .create_channel(name, kind, server_id)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a channel by id.
#[tauri::command]
pub async fn delete_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .delete_channel(&channel_id)
        .await
        .map_err(|e| e.to_string())
}

/// List all channels, optionally filtered by server id.
#[tauri::command]
pub async fn list_channels(
    server_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ChannelInfo>, String> {
    state
        .db
        .list_channels(server_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Send a text message to a channel. The message is gossiped to all peers.
#[tauri::command]
pub async fn send_message(
    channel_id: String,
    content: String,
    author_peer_id: String,
    state: State<'_, AppState>,
) -> Result<MessagePayload, String> {
    state
        .db
        .send_message(channel_id, content, author_peer_id)
        .await
        .map_err(|e| e.to_string())
}

/// Retrieve the most recent messages for a channel (oldest first).
#[tauri::command]
pub async fn get_messages(
    channel_id: String,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<MessagePayload>, String> {
    state
        .db
        .get_messages(&channel_id, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}
