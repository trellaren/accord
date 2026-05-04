use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserProfile {
    pub peer_id: String,
    pub display_name: String,
    pub email: String,
    pub timezone: String,
    /// URL or data-URI for the user's avatar image.
    pub avatar_url: String,
    /// ID of the preferred audio input device.
    pub input_device_id: String,
    /// ID of the preferred audio output device.
    pub output_device_id: String,
    /// ID of the preferred video (webcam) device.
    pub video_device_id: String,
}

/// Return the stored profile for the local peer.  Falls back to empty defaults
/// if no profile has been saved yet.
#[tauri::command]
pub async fn get_user_profile(state: State<'_, AppState>) -> Result<UserProfile, String> {
    let peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    state
        .db
        .get_user_profile(&peer_id)
        .await
        .map_err(|e| e.to_string())
}

/// Persist a user profile for the local peer.
#[tauri::command]
pub async fn set_user_profile(
    display_name: String,
    email: String,
    timezone: String,
    avatar_url: String,
    input_device_id: String,
    output_device_id: String,
    video_device_id: String,
    state: State<'_, AppState>,
) -> Result<UserProfile, String> {
    let peer_id = {
        let node = state.p2p.lock().map_err(|e| e.to_string())?;
        node.local_peer_id()
    };
    state
        .db
        .set_user_profile(peer_id, display_name, email, timezone, avatar_url, input_device_id, output_device_id, video_device_id)
        .await
        .map_err(|e| e.to_string())
}
