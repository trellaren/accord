use crate::AppState;
use tauri::State;

/// Return recent log entries captured by the in-memory log store.
///
/// The frontend polls this command to populate the debug window.
#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>) -> Result<Vec<crate::logger::LogEntry>, String> {
    Ok(state.log_store.entries())
}
