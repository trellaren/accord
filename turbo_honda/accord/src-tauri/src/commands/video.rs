use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct VideoDevice {
    pub id: String,
    pub name: String,
}

/// Begin capturing and broadcasting the local video stream into a channel.
#[tauri::command]
pub async fn start_video_stream(
    channel_id: String,
    device_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
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
