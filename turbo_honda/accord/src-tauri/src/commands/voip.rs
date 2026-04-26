use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_input: bool,
}

/// Join a voice channel identified by `channel_id`.
#[tauri::command]
pub async fn join_voice_channel(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session.join(&channel_id).map_err(|e| e.to_string())
}

/// Leave the currently active voice channel.
#[tauri::command]
pub async fn leave_voice_channel(state: State<'_, AppState>) -> Result<(), String> {
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session.leave().map_err(|e| e.to_string())
}

/// Mute or unmute the local microphone.
#[tauri::command]
pub async fn set_mute(muted: bool, state: State<'_, AppState>) -> Result<(), String> {
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session.set_mute(muted).map_err(|e| e.to_string())
}

/// Deafen or undeafen (mute all incoming audio).
#[tauri::command]
pub async fn set_deafen(deafened: bool, state: State<'_, AppState>) -> Result<(), String> {
    let mut session = state.voip.lock().map_err(|e| e.to_string())?;
    session.set_deafen(deafened).map_err(|e| e.to_string())
}

/// Enumerate available audio input and output devices.
#[tauri::command]
pub async fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    crate::voip::VoipSession::enumerate_devices().map_err(|e| e.to_string())
}
