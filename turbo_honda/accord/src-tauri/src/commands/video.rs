use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct VideoDevice {
    pub id: String,
    pub name: String,
}

/// A capturable screen or application window source.
#[derive(Debug, Serialize)]
pub struct ScreenSource {
    pub id: String,
    pub name: String,
    /// "screen" for a full display, "window" for an individual application window.
    pub kind: String,
}

/// Begin capturing and broadcasting the local video stream into a channel.
/// Only allowed in "voice" or "video" channels.
#[tauri::command]
pub async fn start_video_stream(
    channel_id: String,
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let kind = state
        .db
        .get_channel_kind(&channel_id)
        .await
        .map_err(|e| e.to_string())?;
    if kind == "text" {
        return Err(
            "Video streaming is not allowed in text channels. Use a voice channel."
                .to_string(),
        );
    }
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session
        .start_video(&channel_id, device_id.as_deref())
        .map_err(|e| e.to_string())
}

/// Stop the outbound video stream.
#[tauri::command]
pub async fn stop_video_stream(state: State<'_, AppState>) -> Result<(), String> {
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session.stop_video().map_err(|e| e.to_string())
}

/// List available video capture devices (webcams / virtual cameras).
#[tauri::command]
pub async fn list_video_devices() -> Result<Vec<VideoDevice>, String> {
    crate::voip::VoipSession::enumerate_video_devices().map_err(|e| e.to_string())
}

/// List available screen / window capture sources.
///
/// The frontend uses the browser's `getDisplayMedia()` picker for the actual
/// capture; this command provides supplemental metadata (e.g. thumbnails or
/// window titles) that a custom picker could display.
#[tauri::command]
pub async fn list_screen_sources() -> Result<Vec<ScreenSource>, String> {
    crate::voip::VoipSession::enumerate_screen_sources().map_err(|e| e.to_string())
}

/// Notify the backend that the user has started screen-sharing into a channel.
/// Only allowed in "voice" or "video" channels.
///
/// The actual capture stream is managed by the frontend via `getDisplayMedia()`.
/// The backend records the active state so it can signal peers via P2P.
#[tauri::command]
pub async fn start_screen_share(
    channel_id: String,
    source_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let kind = state
        .db
        .get_channel_kind(&channel_id)
        .await
        .map_err(|e| e.to_string())?;
    if kind == "text" {
        return Err(
            "Screen sharing is not allowed in text channels. Use a voice channel."
                .to_string(),
        );
    }
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session
        .start_screen_share(&channel_id, source_id.as_deref())
        .map_err(|e| e.to_string())
}

/// Notify the backend that screen-sharing has stopped.
#[tauri::command]
pub async fn stop_screen_share(state: State<'_, AppState>) -> Result<(), String> {
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session.stop_screen_share().map_err(|e| e.to_string())
}
