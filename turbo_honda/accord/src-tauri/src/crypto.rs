//! End-to-end encryption helpers for text messages.
//!
//! Messages are encrypted using the [`age`] crate with a passphrase derived
//! from the local node's Ed25519 private key and the target channel ID.  This
//! keeps message content opaque at rest (in the SQLite database) so that an
//! attacker with access to the database file cannot read the plaintext.
//!
//! Key derivation:
//!   1. `master_key` = SHA-256(ed25519_raw_private_key_bytes)
//!   2. `channel_passphrase` = hex(SHA-256(master_key || channel_id_bytes))
//!
//! The resulting passphrase is fed to `age` passphrase-based encryption.
//! Ciphertext is stored as standard Base64 in the database.

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};

/// Derive a per-channel passphrase from the node's 32-byte master key.
///
/// `master_key` must be exactly 32 bytes (SHA-256 output of the raw Ed25519
/// secret).  Returns a hex-encoded string suitable for use as an `age`
/// passphrase.
pub fn derive_channel_passphrase(master_key: &[u8; 32], channel_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(master_key);
    hasher.update(channel_id.as_bytes());
    hex::encode(hasher.finalize())
}

/// Encrypt `plaintext` with the given passphrase.
///
/// Returns a Base64-encoded string ready for storage in the database.
pub fn encrypt_message(passphrase: &str, plaintext: &str) -> Result<String> {
    use age::secrecy::Secret;

    let encryptor =
        age::Encryptor::with_user_passphrase(Secret::new(passphrase.to_string()));

    let mut ciphertext = Vec::new();
    let mut writer = encryptor
        .wrap_output(&mut ciphertext)
        .context("age: initialise encryption writer")?;
    writer
        .write_all(plaintext.as_bytes())
        .context("age: write plaintext")?;
    writer.finish().context("age: finalise encryption")?;

    Ok(BASE64.encode(&ciphertext))
}

/// Decrypt a Base64-encoded ciphertext produced by [`encrypt_message`].
pub fn decrypt_message(passphrase: &str, ciphertext_b64: &str) -> Result<String> {
    use age::secrecy::Secret;

    let ciphertext = BASE64
        .decode(ciphertext_b64)
        .context("age: base64-decode ciphertext")?;

    let decryptor = age::Decryptor::new(&ciphertext[..]).context("age: parse ciphertext")?;

    let mut reader = match decryptor {
        age::Decryptor::Passphrase(d) => d
            .decrypt(&Secret::new(passphrase.to_string()), None)
            .context("age: decrypt (wrong passphrase?)")?,
        _ => return Err(anyhow!("unexpected age encryptor type")),
    };

    let mut plaintext = Vec::new();
    reader
        .read_to_end(&mut plaintext)
        .context("age: read decrypted plaintext")?;

    String::from_utf8(plaintext).context("age: plaintext is not valid UTF-8")
}

/// Derive the 32-byte master key from raw Ed25519 secret key bytes.
///
/// The raw secret bytes are hashed with SHA-256 to obtain a fixed-size key
/// that is safe to use as key material without exposing the raw secret.
pub fn master_key_from_ed25519(raw_secret: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(raw_secret);
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let master: [u8; 32] = [42u8; 32];
        let passphrase = derive_channel_passphrase(&master, "channel-abc");
        let ciphertext = encrypt_message(&passphrase, "hello, accord!").unwrap();
        let plaintext = decrypt_message(&passphrase, &ciphertext).unwrap();
        assert_eq!(plaintext, "hello, accord!");
    }

    #[test]
    fn wrong_passphrase_fails() {
        let master: [u8; 32] = [1u8; 32];
        let passphrase = derive_channel_passphrase(&master, "channel-xyz");
        let ciphertext = encrypt_message(&passphrase, "secret").unwrap();
        // Tamper with the passphrase.
        let bad = derive_channel_passphrase(&master, "channel-WRONG");
        assert!(decrypt_message(&bad, &ciphertext).is_err());
    }

    #[test]
    fn different_channels_get_different_passphrases() {
        let master: [u8; 32] = [7u8; 32];
        let p1 = derive_channel_passphrase(&master, "chan-1");
        let p2 = derive_channel_passphrase(&master, "chan-2");
        assert_ne!(p1, p2);
    }
}
