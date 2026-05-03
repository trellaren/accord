//! Persistent Ed25519 identity for the local node.
//!
//! On first run a new Ed25519 keypair is generated and written to
//! `<app_data>/identity.key` as raw protobuf-encoded bytes.  Subsequent runs
//! load the existing file so that the `PeerId` remains stable across restarts.

use anyhow::{Context, Result};
use libp2p::identity::Keypair;
use std::path::Path;

const KEY_FILE: &str = "identity.key";

/// Load the keypair from `<app_dir>/identity.key`, or create and persist a
/// fresh Ed25519 keypair if the file does not yet exist.
pub fn load_or_create_keypair(app_dir: &Path) -> Result<Keypair> {
    let key_path = app_dir.join(KEY_FILE);

    if key_path.exists() {
        let bytes = std::fs::read(&key_path)
            .with_context(|| format!("reading keypair from {}", key_path.display()))?;
        let keypair = Keypair::from_protobuf_encoding(&bytes)
            .with_context(|| format!("decoding keypair from {}", key_path.display()))?;
        log::info!(
            "Loaded existing identity {} from {}",
            keypair.public().to_peer_id(),
            key_path.display()
        );
        Ok(keypair)
    } else {
        std::fs::create_dir_all(app_dir)
            .with_context(|| format!("creating app dir {}", app_dir.display()))?;
        let keypair = Keypair::generate_ed25519();
        let bytes = keypair
            .to_protobuf_encoding()
            .context("encoding keypair to protobuf")?;
        std::fs::write(&key_path, &bytes)
            .with_context(|| format!("writing keypair to {}", key_path.display()))?;
        log::info!(
            "Generated new identity {} and saved to {}",
            keypair.public().to_peer_id(),
            key_path.display()
        );
        Ok(keypair)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn tmp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("accord_identity_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_creates_new_keypair() {
        let dir = tmp_dir();
        let kp = load_or_create_keypair(&dir).unwrap();
        assert!(dir.join("identity.key").exists());
        // PeerId is non-empty
        assert!(!kp.public().to_peer_id().to_string().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_loads_same_keypair() {
        let dir = tmp_dir();
        let kp1 = load_or_create_keypair(&dir).unwrap();
        let kp2 = load_or_create_keypair(&dir).unwrap();
        assert_eq!(
            kp1.public().to_peer_id(),
            kp2.public().to_peer_id(),
            "PeerId must be stable across restarts"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
