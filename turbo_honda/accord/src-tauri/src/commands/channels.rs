use crate::crypto;
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
    log::info!("Creating channel name={name:?} kind={kind:?} server_id={server_id:?}");
    let result = state
        .db
        .create_channel(name.clone(), kind.clone(), server_id.clone())
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(ch) => log::debug!("Channel created id={}", ch.id),
        Err(e) => log::error!("Failed to create channel name={name:?}: {e}"),
    }
    result
}

/// Delete a channel by id.
#[tauri::command]
pub async fn delete_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Deleting channel id={channel_id}");
    let result = state
        .db
        .delete_channel(&channel_id)
        .await
        .map_err(|e| e.to_string());
    if let Err(e) = &result {
        log::error!("Failed to delete channel id={channel_id}: {e}");
    }
    result
}

/// List all channels, optionally filtered by server id.
#[tauri::command]
pub async fn list_channels(
    server_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ChannelInfo>, String> {
    log::debug!("Listing channels server_id={server_id:?}");
    state
        .db
        .list_channels(server_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Send a text message to a channel.
///
/// The message content is encrypted with a per-channel key derived from the
/// local node's identity before being persisted.  The plaintext is returned
/// to the caller so the UI can display it immediately without a round-trip.
#[tauri::command]
pub async fn send_message(
    channel_id: String,
    content: String,
    author_peer_id: String,
    state: State<'_, AppState>,
) -> Result<MessagePayload, String> {
    log::debug!(
        "Sending message channel_id={channel_id} author={author_peer_id} len={}",
        content.len()
    );
    let passphrase =
        crypto::derive_channel_passphrase(&state.message_key, &channel_id);
    let encrypted = crypto::encrypt_message(&passphrase, &content)
        .map_err(|e| format!("encrypt: {e}"))?;

    let mut msg = state
        .db
        .send_message(channel_id.clone(), encrypted, author_peer_id)
        .await
        .map_err(|e| e.to_string())?;

    log::debug!("Message stored id={} channel={channel_id}", msg.id);
    // Return plaintext to the UI.
    msg.content = content;
    Ok(msg)
}

/// Retrieve the most recent messages for a channel (oldest first).
///
/// Stored ciphertexts are decrypted before being returned to the UI.
/// Messages that cannot be decrypted (e.g. from before encryption was enabled)
/// are returned with their raw content so they remain visible.
#[tauri::command]
pub async fn get_messages(
    channel_id: String,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<MessagePayload>, String> {
    log::debug!("Fetching messages channel_id={channel_id} limit={limit:?}");
    let passphrase =
        crypto::derive_channel_passphrase(&state.message_key, &channel_id);

    let mut messages = state
        .db
        .get_messages(&channel_id, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())?;

    log::debug!(
        "Fetched {} messages for channel {channel_id}",
        messages.len()
    );

    for msg in &mut messages {
        if let Ok(plaintext) = crypto::decrypt_message(&passphrase, &msg.content) {
            msg.content = plaintext;
        } else {
            // Log a debug warning; the content may be a legacy plaintext message
            // stored before encryption was enabled, so we leave it as-is.
            log::debug!(
                "message {} in channel {} could not be decrypted (may be legacy plaintext)",
                msg.id,
                channel_id
            );
        }
    }

    Ok(messages)
}
