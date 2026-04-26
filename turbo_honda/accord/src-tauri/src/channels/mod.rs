//! In-memory text-channel and message store.
//!
//! In a full implementation messages would be:
//!   - Gossiped to connected peers via libp2p GossipSub.
//!   - Persisted locally with SQLite (via sqlx or rusqlite).

use anyhow::{anyhow, Result};
use chrono::Utc;
use std::collections::HashMap;
use uuid::Uuid;

use crate::commands::channels::{ChannelInfo, MessagePayload};

pub struct ChannelStore {
    channels: HashMap<String, ChannelInfo>,
    messages: HashMap<String, Vec<MessagePayload>>,
}

impl ChannelStore {
    pub fn new() -> Self {
        let mut store = Self {
            channels: HashMap::new(),
            messages: HashMap::new(),
        };
        // Bootstrap with sensible default channels.
        let _ = store.create_channel("general".to_string(), "text".to_string());
        let _ = store.create_channel("voice".to_string(), "voice".to_string());
        let _ = store.create_channel("video".to_string(), "video".to_string());
        store
    }

    /// Create a channel with the given name and kind ("text", "voice", "video").
    pub fn create_channel(&mut self, name: String, kind: String) -> Result<ChannelInfo> {
        if !["text", "voice", "video"].contains(&kind.as_str()) {
            return Err(anyhow!("Invalid channel kind '{kind}'. Use text, voice, or video."));
        }
        let id = Uuid::new_v4().to_string();
        let channel = ChannelInfo {
            id: id.clone(),
            name,
            kind,
        };
        self.channels.insert(id.clone(), channel.clone());
        self.messages.insert(id, Vec::new());
        Ok(channel)
    }

    /// Remove a channel and all its messages.
    pub fn delete_channel(&mut self, channel_id: &str) -> Result<()> {
        self.channels
            .remove(channel_id)
            .ok_or_else(|| anyhow!("Channel '{channel_id}' not found"))?;
        self.messages.remove(channel_id);
        Ok(())
    }

    /// Return all channels sorted by name.
    pub fn list_channels(&self) -> Vec<ChannelInfo> {
        let mut channels: Vec<ChannelInfo> = self.channels.values().cloned().collect();
        channels.sort_by(|a, b| a.name.cmp(&b.name));
        channels
    }

    /// Append a new message to a text channel.
    pub fn send_message(
        &mut self,
        channel_id: String,
        content: String,
        author_peer_id: String,
    ) -> Result<MessagePayload> {
        if !self.channels.contains_key(&channel_id) {
            return Err(anyhow!("Channel '{channel_id}' not found"));
        }
        let msg = MessagePayload {
            id: Uuid::new_v4().to_string(),
            channel_id: channel_id.clone(),
            author_peer_id,
            content,
            timestamp: Utc::now().to_rfc3339(),
        };
        self.messages
            .entry(channel_id)
            .or_default()
            .push(msg.clone());
        // TODO: publish message to GossipSub so peers receive it.
        Ok(msg)
    }

    /// Return the `limit` most recent messages for a channel (newest last).
    pub fn get_messages(&self, channel_id: &str, limit: usize) -> Vec<MessagePayload> {
        match self.messages.get(channel_id) {
            None => Vec::new(),
            Some(msgs) => {
                let start = msgs.len().saturating_sub(limit);
                msgs[start..].to_vec()
            }
        }
    }
}

impl Default for ChannelStore {
    fn default() -> Self {
        Self::new()
    }
}
