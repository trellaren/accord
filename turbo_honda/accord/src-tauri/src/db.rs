//! SQLite persistence layer for channels and messages.
//!
//! Uses [`sqlx`] with the SQLite backend.  The database file is stored under
//! the Tauri application-data directory (`<app_data>/accord.db`).
//!
//! An in-memory URL (`sqlite::memory:`) is also accepted so unit-tests can run
//! without touching the filesystem.

use anyhow::{anyhow, Result};
use chrono::Utc;
use sqlx::{sqlite::SqlitePool, Row};
use uuid::Uuid;

use crate::commands::channels::{ChannelInfo, MessagePayload};

// ── Db ────────────────────────────────────────────────────────────────────────

/// Owns the SQLite connection pool and exposes all persistence operations.
///
/// `SqlitePool` is internally reference-counted (`Arc`), so `Db` is cheap to
/// clone and is `Send + Sync`.
#[derive(Clone)]
pub struct Db {
    pool: SqlitePool,
}

impl Db {
    /// Open (or create) the SQLite database at `<app_dir>/accord.db` and run
    /// the schema migration.
    pub async fn new(app_dir: &std::path::Path) -> Result<Self> {
        std::fs::create_dir_all(app_dir)?;
        let db_path = app_dir.join("accord.db");
        let url = format!("sqlite://{}?mode=rwc", db_path.display());
        Self::connect(&url).await
    }

    /// Connect to an arbitrary SQLite URL.  Primarily useful for tests
    /// (`sqlite::memory:`).
    pub async fn connect(url: &str) -> Result<Self> {
        let pool = SqlitePool::connect(url).await?;
        let db = Self { pool };
        db.migrate().await?;
        Ok(db)
    }

    // ── Schema ────────────────────────────────────────────────────────────────

    /// Create tables if they do not already exist.
    async fn migrate(&self) -> Result<()> {
        // Enable WAL mode for better concurrent read performance.
        sqlx::query("PRAGMA journal_mode = WAL")
            .execute(&self.pool)
            .await?;

        // Enable foreign-key enforcement (off by default in SQLite).
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&self.pool)
            .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS channels (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                kind TEXT NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS messages (
                id              TEXT PRIMARY KEY,
                channel_id      TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
                author_peer_id  TEXT NOT NULL,
                content         TEXT NOT NULL,
                timestamp       TEXT NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_messages_channel_ts
             ON messages (channel_id, timestamp)",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Channels ──────────────────────────────────────────────────────────────

    /// Insert a new channel and return its `ChannelInfo`.
    pub async fn create_channel(&self, name: String, kind: String) -> Result<ChannelInfo> {
        if !["text", "voice", "video"].contains(&kind.as_str()) {
            return Err(anyhow!(
                "Invalid channel kind '{kind}'. Use text, voice, or video."
            ));
        }
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO channels (id, name, kind) VALUES (?, ?, ?)")
            .bind(&id)
            .bind(&name)
            .bind(&kind)
            .execute(&self.pool)
            .await?;
        Ok(ChannelInfo { id, name, kind })
    }

    /// Delete a channel (and its messages, via ON DELETE CASCADE).
    pub async fn delete_channel(&self, channel_id: &str) -> Result<()> {
        let rows = sqlx::query("DELETE FROM channels WHERE id = ?")
            .bind(channel_id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(anyhow!("Channel '{channel_id}' not found"));
        }
        Ok(())
    }

    /// Return all channels ordered by name.
    pub async fn list_channels(&self) -> Result<Vec<ChannelInfo>> {
        let rows =
            sqlx::query("SELECT id, name, kind FROM channels ORDER BY name")
                .fetch_all(&self.pool)
                .await?;
        Ok(rows
            .into_iter()
            .map(|row| ChannelInfo {
                id: row.get("id"),
                name: row.get("name"),
                kind: row.get("kind"),
            })
            .collect())
    }

    /// Insert the three default channels if no channels are present yet.
    pub async fn bootstrap_defaults(&self) -> Result<()> {
        for (name, kind) in [("general", "text"), ("voice", "voice"), ("video", "video")] {
            sqlx::query(
                "INSERT INTO channels (id, name, kind)
                 SELECT ?, ?, ?
                 WHERE NOT EXISTS (
                     SELECT 1 FROM channels WHERE name = ? AND kind = ?
                 )",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(name)
            .bind(kind)
            .bind(name)
            .bind(kind)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    // ── Messages ──────────────────────────────────────────────────────────────

    /// Persist a new message and return its full `MessagePayload`.
    pub async fn send_message(
        &self,
        channel_id: String,
        content: String,
        author_peer_id: String,
    ) -> Result<MessagePayload> {
        // Verify the channel exists first.
        let exists = sqlx::query("SELECT 1 FROM channels WHERE id = ?")
            .bind(&channel_id)
            .fetch_optional(&self.pool)
            .await?
            .is_some();
        if !exists {
            return Err(anyhow!("Channel '{channel_id}' not found"));
        }

        let msg = MessagePayload {
            id: Uuid::new_v4().to_string(),
            channel_id: channel_id.clone(),
            author_peer_id,
            content,
            timestamp: Utc::now().to_rfc3339(),
        };

        sqlx::query(
            "INSERT INTO messages (id, channel_id, author_peer_id, content, timestamp)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&msg.id)
        .bind(&msg.channel_id)
        .bind(&msg.author_peer_id)
        .bind(&msg.content)
        .bind(&msg.timestamp)
        .execute(&self.pool)
        .await?;

        Ok(msg)
    }

    /// Return up to `limit` most-recent messages for `channel_id` (oldest first).
    pub async fn get_messages(&self, channel_id: &str, limit: u32) -> Result<Vec<MessagePayload>> {
        // Fetch the newest `limit` rows, then reverse so oldest comes first.
        let rows = sqlx::query(
            "SELECT id, channel_id, author_peer_id, content, timestamp
             FROM (
                 SELECT id, channel_id, author_peer_id, content, timestamp
                 FROM messages
                 WHERE channel_id = ?
                 ORDER BY timestamp DESC
                 LIMIT ?
             )
             ORDER BY timestamp ASC",
        )
        .bind(channel_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| MessagePayload {
                id: row.get("id"),
                channel_id: row.get("channel_id"),
                author_peer_id: row.get("author_peer_id"),
                content: row.get("content"),
                timestamp: row.get("timestamp"),
            })
            .collect())
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    async fn in_memory_db() -> Db {
        Db::connect("sqlite::memory:").await.expect("in-memory DB")
    }

    #[tokio::test]
    async fn test_create_and_list_channels() {
        let db = in_memory_db().await;

        let ch = db
            .create_channel("general".into(), "text".into())
            .await
            .unwrap();
        assert_eq!(ch.name, "general");
        assert_eq!(ch.kind, "text");

        let channels = db.list_channels().await.unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].id, ch.id);
    }

    #[tokio::test]
    async fn test_create_channel_invalid_kind() {
        let db = in_memory_db().await;
        let err = db
            .create_channel("bad".into(), "invalid".into())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("Invalid channel kind"));
    }

    #[tokio::test]
    async fn test_delete_channel() {
        let db = in_memory_db().await;
        let ch = db
            .create_channel("tmp".into(), "text".into())
            .await
            .unwrap();
        db.delete_channel(&ch.id).await.unwrap();
        assert!(db.list_channels().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_delete_nonexistent_channel() {
        let db = in_memory_db().await;
        let err = db.delete_channel("no-such-id").await.unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_send_and_get_messages() {
        let db = in_memory_db().await;
        let ch = db
            .create_channel("general".into(), "text".into())
            .await
            .unwrap();

        let msg = db
            .send_message(ch.id.clone(), "hello".into(), "peer1".into())
            .await
            .unwrap();
        assert_eq!(msg.content, "hello");
        assert_eq!(msg.channel_id, ch.id);

        let msgs = db.get_messages(&ch.id, 50).await.unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].id, msg.id);
    }

    #[tokio::test]
    async fn test_get_messages_limit() {
        let db = in_memory_db().await;
        let ch = db
            .create_channel("general".into(), "text".into())
            .await
            .unwrap();

        for i in 0..10 {
            db.send_message(ch.id.clone(), format!("msg {i}"), "peer1".into())
                .await
                .unwrap();
        }

        let msgs = db.get_messages(&ch.id, 5).await.unwrap();
        assert_eq!(msgs.len(), 5);
    }

    #[tokio::test]
    async fn test_send_message_unknown_channel() {
        let db = in_memory_db().await;
        let err = db
            .send_message("no-such-channel".into(), "hi".into(), "peer1".into())
            .await
            .unwrap_err();
        assert!(err.to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_delete_channel_cascades_messages() {
        let db = in_memory_db().await;
        let ch = db
            .create_channel("general".into(), "text".into())
            .await
            .unwrap();

        db.send_message(ch.id.clone(), "hi".into(), "peer1".into())
            .await
            .unwrap();

        db.delete_channel(&ch.id).await.unwrap();

        // Messages table should be empty after cascade delete.
        let msgs = db.get_messages(&ch.id, 50).await.unwrap();
        assert!(msgs.is_empty());
    }

    #[tokio::test]
    async fn test_bootstrap_defaults() {
        let db = in_memory_db().await;
        db.bootstrap_defaults().await.unwrap();

        let channels = db.list_channels().await.unwrap();
        assert_eq!(channels.len(), 3);

        let names: Vec<&str> = channels.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"general"));
        assert!(names.contains(&"voice"));
        assert!(names.contains(&"video"));
    }

    #[tokio::test]
    async fn test_bootstrap_defaults_idempotent() {
        let db = in_memory_db().await;
        db.bootstrap_defaults().await.unwrap();
        // Calling again must not create duplicate channels.
        db.bootstrap_defaults().await.unwrap();

        let channels = db.list_channels().await.unwrap();
        assert_eq!(channels.len(), 3);
    }
}
