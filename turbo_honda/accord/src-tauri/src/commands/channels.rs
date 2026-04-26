use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChannelInfo {
    pub id: String,
    pub name: String,
    pub kind: String, // "text" | "voice" | "video"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessagePayload {
    pub id: String,
    pub channel_id: String,
    pub author_peer_id: String,
    pub content: String,
    pub timestamp: String,
}

/// Create a new channel (text, voice, or video).
#[tauri::command]
pub async fn create_channel(
    name: String,
    kind: String,
    state: State<'_, AppState>,
) -> Result<ChannelInfo, String> {
    let mut store = state.channels.lock().map_err(|e| e.to_string())?;
    store.create_channel(name, kind).map_err(|e| e.to_string())
}

/// Delete a channel by id.
#[tauri::command]
pub async fn delete_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut store = state.channels.lock().map_err(|e| e.to_string())?;
    store.delete_channel(&channel_id).map_err(|e| e.to_string())
}

/// List all channels.
#[tauri::command]
pub async fn list_channels(state: State<'_, AppState>) -> Result<Vec<ChannelInfo>, String> {
    let store = state.channels.lock().map_err(|e| e.to_string())?;
    Ok(store.list_channels())
}

/// Send a text message to a channel. The message is gossiped to all peers.
#[tauri::command]
pub async fn send_message(
    channel_id: String,
    content: String,
    author_peer_id: String,
    state: State<'_, AppState>,
) -> Result<MessagePayload, String> {
    let mut store = state.channels.lock().map_err(|e| e.to_string())?;
    store
        .send_message(channel_id, content, author_peer_id)
        .map_err(|e| e.to_string())
}

/// Retrieve the most recent messages for a channel (newest first).
#[tauri::command]
pub async fn get_messages(
    channel_id: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<MessagePayload>, String> {
    let store = state.channels.lock().map_err(|e| e.to_string())?;
    Ok(store.get_messages(&channel_id, limit.unwrap_or(50)))
}
