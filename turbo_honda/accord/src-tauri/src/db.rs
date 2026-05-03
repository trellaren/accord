//! SQLite persistence layer for channels, messages, servers, and user profile.
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
use crate::commands::servers::ServerInfo;
use crate::commands::user::UserProfile;

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

        // ── Servers ───────────────────────────────────────────────────────────

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS servers (
                id             TEXT PRIMARY KEY,
                name           TEXT NOT NULL,
                invite_code    TEXT NOT NULL UNIQUE,
                owner_peer_id  TEXT NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS server_members (
                server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
                peer_id    TEXT NOT NULL,
                PRIMARY KEY (server_id, peer_id)
            )",
        )
        .execute(&self.pool)
        .await?;

        // ── User profile ──────────────────────────────────────────────────────

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS user_profile (
                peer_id      TEXT PRIMARY KEY,
                display_name TEXT NOT NULL DEFAULT '',
                email        TEXT NOT NULL DEFAULT '',
                timezone     TEXT NOT NULL DEFAULT 'UTC'
            )",
        )
        .execute(&self.pool)
        .await?;

        // ── Channels ──────────────────────────────────────────────────────────

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS channels (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                kind       TEXT NOT NULL,
                server_id  TEXT REFERENCES servers(id) ON DELETE CASCADE
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
    pub async fn create_channel(
        &self,
        name: String,
        kind: String,
        server_id: Option<String>,
    ) -> Result<ChannelInfo> {
        if !["text", "voice", "video"].contains(&kind.as_str()) {
            return Err(anyhow!(
                "Invalid channel kind '{kind}'. Use text, voice, or video."
            ));
        }
        // If a server_id is given, verify it exists.
        if let Some(ref sid) = server_id {
            let exists = sqlx::query("SELECT 1 FROM servers WHERE id = ?")
                .bind(sid)
                .fetch_optional(&self.pool)
                .await?
                .is_some();
            if !exists {
                return Err(anyhow!("Server '{sid}' not found"));
            }
        }
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO channels (id, name, kind, server_id) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(&name)
            .bind(&kind)
            .bind(&server_id)
            .execute(&self.pool)
            .await?;
        Ok(ChannelInfo { id, name, kind, server_id })
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

    /// Return the kind of a channel ("text", "voice", "video"), or an error
    /// if the channel does not exist.
    pub async fn get_channel_kind(&self, channel_id: &str) -> Result<String> {
        let row = sqlx::query("SELECT kind FROM channels WHERE id = ?")
            .bind(channel_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| anyhow!("Channel '{channel_id}' not found"))?;
        Ok(row.get("kind"))
    }

    /// Return all channels for the given server, ordered by name.
    /// If `server_id` is `None`, return all channels (for backwards compatibility).
    pub async fn list_channels(&self, server_id: Option<&str>) -> Result<Vec<ChannelInfo>> {
        let rows = if let Some(sid) = server_id {
            sqlx::query(
                "SELECT id, name, kind, server_id FROM channels WHERE server_id = ? ORDER BY name",
            )
            .bind(sid)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query("SELECT id, name, kind, server_id FROM channels ORDER BY name")
                .fetch_all(&self.pool)
                .await?
        };
        Ok(rows
            .into_iter()
            .map(|row| ChannelInfo {
                id: row.get("id"),
                name: row.get("name"),
                kind: row.get("kind"),
                server_id: row.get("server_id"),
            })
            .collect())
    }

    /// Insert the three default channels under `server_id` if no channels are present
    /// for that server yet.
    pub async fn bootstrap_defaults(&self, server_id: &str) -> Result<()> {
        for (name, kind) in [("general", "text"), ("voice", "voice"), ("video", "video")] {
            sqlx::query(
                "INSERT INTO channels (id, name, kind, server_id)
                 SELECT ?, ?, ?, ?
                 WHERE NOT EXISTS (
                     SELECT 1 FROM channels WHERE name = ? AND kind = ? AND server_id = ?
                 )",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(name)
            .bind(kind)
            .bind(server_id)
            .bind(name)
            .bind(kind)
            .bind(server_id)
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

    // ── Servers ───────────────────────────────────────────────────────────────

    /// Create a new server and return its `ServerInfo`.
    pub async fn create_server(
        &self,
        name: String,
        owner_peer_id: String,
    ) -> Result<ServerInfo> {
        let id = Uuid::new_v4().to_string();
        let invite_code = Uuid::new_v4()
            .to_string()
            .replace('-', "")
            .chars()
            .take(8)
            .collect::<String>()
            .to_uppercase();
        sqlx::query(
            "INSERT INTO servers (id, name, invite_code, owner_peer_id) VALUES (?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&name)
        .bind(&invite_code)
        .bind(&owner_peer_id)
        .execute(&self.pool)
        .await?;
        // Add the owner as the first member.
        sqlx::query("INSERT OR IGNORE INTO server_members (server_id, peer_id) VALUES (?, ?)")
            .bind(&id)
            .bind(&owner_peer_id)
            .execute(&self.pool)
            .await?;
        Ok(ServerInfo { id, name, invite_code, owner_peer_id })
    }

    /// Return all servers the local peer is a member of (or owns).
    pub async fn list_servers(&self) -> Result<Vec<ServerInfo>> {
        let rows = sqlx::query(
            "SELECT id, name, invite_code, owner_peer_id FROM servers ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| ServerInfo {
                id: row.get("id"),
                name: row.get("name"),
                invite_code: row.get("invite_code"),
                owner_peer_id: row.get("owner_peer_id"),
            })
            .collect())
    }

    /// Look up a server by its invite code and add `peer_id` as a member.
    pub async fn join_server(
        &self,
        invite_code: &str,
        peer_id: &str,
    ) -> Result<ServerInfo> {
        let row = sqlx::query(
            "SELECT id, name, invite_code, owner_peer_id FROM servers WHERE invite_code = ?",
        )
        .bind(invite_code)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| anyhow!("Invalid invite code '{invite_code}'"))?;

        let server = ServerInfo {
            id: row.get("id"),
            name: row.get("name"),
            invite_code: row.get("invite_code"),
            owner_peer_id: row.get("owner_peer_id"),
        };

        sqlx::query("INSERT OR IGNORE INTO server_members (server_id, peer_id) VALUES (?, ?)")
            .bind(&server.id)
            .bind(peer_id)
            .execute(&self.pool)
            .await?;
        Ok(server)
    }

    /// Return all peer ids that are members of the given server.
    pub async fn list_server_members(&self, server_id: &str) -> Result<Vec<String>> {
        let rows = sqlx::query("SELECT peer_id FROM server_members WHERE server_id = ?")
            .bind(server_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|row| row.get("peer_id")).collect())
    }

    /// Remove a peer from a server (owner-only action enforced at the command level).
    pub async fn remove_server_member(&self, server_id: &str, peer_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM server_members WHERE server_id = ? AND peer_id = ?")
            .bind(server_id)
            .bind(peer_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Bootstrap a default server if none exists yet; return the server id.
    pub async fn bootstrap_default_server(&self) -> Result<String> {
        // If at least one server already exists, return the first one.
        let existing = sqlx::query("SELECT id FROM servers LIMIT 1")
            .fetch_optional(&self.pool)
            .await?;
        if let Some(row) = existing {
            return Ok(row.get("id"));
        }
        let server = self
            .create_server("Accord".to_string(), "local".to_string())
            .await?;
        Ok(server.id)
    }

    // ── User profile ──────────────────────────────────────────────────────────

    /// Return the stored user profile for `peer_id`, or a default one.
    pub async fn get_user_profile(&self, peer_id: &str) -> Result<UserProfile> {
        let row = sqlx::query(
            "SELECT peer_id, display_name, email, timezone
             FROM user_profile WHERE peer_id = ?",
        )
        .bind(peer_id)
        .fetch_optional(&self.pool)
        .await?;
        if let Some(row) = row {
            Ok(UserProfile {
                peer_id: row.get("peer_id"),
                display_name: row.get("display_name"),
                email: row.get("email"),
                timezone: row.get("timezone"),
            })
        } else {
            Ok(UserProfile {
                peer_id: peer_id.to_string(),
                display_name: String::new(),
                email: String::new(),
                timezone: "UTC".to_string(),
            })
        }
    }

    /// Upsert the user profile for `peer_id`.
    pub async fn set_user_profile(
        &self,
        peer_id: String,
        display_name: String,
        email: String,
        timezone: String,
    ) -> Result<UserProfile> {
        sqlx::query(
            "INSERT INTO user_profile (peer_id, display_name, email, timezone)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(peer_id) DO UPDATE SET
               display_name = excluded.display_name,
               email        = excluded.email,
               timezone     = excluded.timezone",
        )
        .bind(&peer_id)
        .bind(&display_name)
        .bind(&email)
        .bind(&timezone)
        .execute(&self.pool)
        .await?;
        Ok(UserProfile { peer_id, display_name, email, timezone })
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    async fn in_memory_db() -> Db {
        Db::connect("sqlite::memory:").await.expect("in-memory DB")
    }

    // Helper: create a server and return its id.
    async fn make_server(db: &Db) -> String {
        db.create_server("Test Server".into(), "owner_peer".into())
            .await
            .expect("create server")
            .id
    }

    #[tokio::test]
    async fn test_create_and_list_channels() {
        let db = in_memory_db().await;
        let sid = make_server(&db).await;

        let ch = db
            .create_channel("general".into(), "text".into(), Some(sid.clone()))
            .await
            .unwrap();
        assert_eq!(ch.name, "general");
        assert_eq!(ch.kind, "text");

        let channels = db.list_channels(Some(&sid)).await.unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].id, ch.id);
    }

    #[tokio::test]
    async fn test_create_channel_invalid_kind() {
        let db = in_memory_db().await;
        let err = db
            .create_channel("bad".into(), "invalid".into(), None)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("Invalid channel kind"));
    }

    #[tokio::test]
    async fn test_delete_channel() {
        let db = in_memory_db().await;
        let sid = make_server(&db).await;
        let ch = db
            .create_channel("tmp".into(), "text".into(), Some(sid.clone()))
            .await
            .unwrap();
        db.delete_channel(&ch.id).await.unwrap();
        assert!(db.list_channels(Some(&sid)).await.unwrap().is_empty());
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
        let sid = make_server(&db).await;
        let ch = db
            .create_channel("general".into(), "text".into(), Some(sid))
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
        let sid = make_server(&db).await;
        let ch = db
            .create_channel("general".into(), "text".into(), Some(sid))
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
        let sid = make_server(&db).await;
        let ch = db
            .create_channel("general".into(), "text".into(), Some(sid))
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
        let sid = db.bootstrap_default_server().await.unwrap();
        db.bootstrap_defaults(&sid).await.unwrap();

        let channels = db.list_channels(Some(&sid)).await.unwrap();
        assert_eq!(channels.len(), 3);

        let names: Vec<&str> = channels.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"general"));
        assert!(names.contains(&"voice"));
        assert!(names.contains(&"video"));
    }

    #[tokio::test]
    async fn test_bootstrap_defaults_idempotent() {
        let db = in_memory_db().await;
        let sid = db.bootstrap_default_server().await.unwrap();
        db.bootstrap_defaults(&sid).await.unwrap();
        // Calling again must not create duplicate channels.
        db.bootstrap_defaults(&sid).await.unwrap();

        let channels = db.list_channels(Some(&sid)).await.unwrap();
        assert_eq!(channels.len(), 3);
    }

    // ── Server tests ──────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_create_and_list_servers() {
        let db = in_memory_db().await;
        let server = db
            .create_server("My Server".into(), "owner1".into())
            .await
            .unwrap();
        assert_eq!(server.name, "My Server");
        assert_eq!(server.owner_peer_id, "owner1");
        assert_eq!(server.invite_code.len(), 8);

        let servers = db.list_servers().await.unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].id, server.id);
    }

    #[tokio::test]
    async fn test_join_server_by_invite_code() {
        let db = in_memory_db().await;
        let server = db
            .create_server("Test".into(), "owner".into())
            .await
            .unwrap();

        let joined = db
            .join_server(&server.invite_code, "new_peer")
            .await
            .unwrap();
        assert_eq!(joined.id, server.id);

        let members = db.list_server_members(&server.id).await.unwrap();
        assert!(members.contains(&"owner".to_string()));
        assert!(members.contains(&"new_peer".to_string()));
    }

    #[tokio::test]
    async fn test_join_server_invalid_code() {
        let db = in_memory_db().await;
        let err = db.join_server("BADCODE1", "peer").await.unwrap_err();
        assert!(err.to_string().contains("Invalid invite code"));
    }

    #[tokio::test]
    async fn test_remove_server_member() {
        let db = in_memory_db().await;
        let server = db
            .create_server("Test".into(), "owner".into())
            .await
            .unwrap();
        db.join_server(&server.invite_code, "peer2")
            .await
            .unwrap();
        db.remove_server_member(&server.id, "peer2")
            .await
            .unwrap();
        let members = db.list_server_members(&server.id).await.unwrap();
        assert!(!members.contains(&"peer2".to_string()));
    }

    #[tokio::test]
    async fn test_bootstrap_default_server_idempotent() {
        let db = in_memory_db().await;
        let id1 = db.bootstrap_default_server().await.unwrap();
        let id2 = db.bootstrap_default_server().await.unwrap();
        assert_eq!(id1, id2);
    }

    // ── User profile tests ────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_user_profile_default() {
        let db = in_memory_db().await;
        let profile = db.get_user_profile("peer1").await.unwrap();
        assert_eq!(profile.peer_id, "peer1");
        assert_eq!(profile.display_name, "");
        assert_eq!(profile.timezone, "UTC");
    }

    #[tokio::test]
    async fn test_set_and_get_user_profile() {
        let db = in_memory_db().await;
        db.set_user_profile(
            "peer1".into(),
            "Alice".into(),
            "alice@example.com".into(),
            "America/New_York".into(),
        )
        .await
        .unwrap();

        let profile = db.get_user_profile("peer1").await.unwrap();
        assert_eq!(profile.display_name, "Alice");
        assert_eq!(profile.email, "alice@example.com");
        assert_eq!(profile.timezone, "America/New_York");
    }

    #[tokio::test]
    async fn test_get_channel_kind() {
        let db = in_memory_db().await;
        let sid = make_server(&db).await;
        let ch = db
            .create_channel("vc".into(), "voice".into(), Some(sid))
            .await
            .unwrap();
        let kind = db.get_channel_kind(&ch.id).await.unwrap();
        assert_eq!(kind, "voice");
    }
}
