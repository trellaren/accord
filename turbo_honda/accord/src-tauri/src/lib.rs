use tauri::Manager;

mod commands;
mod db;
mod p2p;
mod voip;

pub use commands::*;

/// Application state shared across Tauri commands.
pub struct AppState {
    /// Active P2P node handle.
    pub p2p: std::sync::Mutex<p2p::P2PNode>,
    /// VoIP session handle.
    pub voip: std::sync::Mutex<voip::VoipSession>,
    /// SQLite-backed channel / message store.
    pub db: db::Db,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let p2p_node = p2p::P2PNode::new();
            let voip_session = voip::VoipSession::new();

            let app_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data directory");
            let db = tauri::async_runtime::block_on(async {
                let db = db::Db::new(&app_dir).await?;
                db.bootstrap_defaults().await?;
                anyhow::Ok(db)
            })
            .expect("failed to initialise SQLite database");

            app.manage(AppState {
                p2p: std::sync::Mutex::new(p2p_node),
                voip: std::sync::Mutex::new(voip_session),
                db,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // P2P
            commands::p2p::get_local_peer_id,
            commands::p2p::connect_to_peer,
            commands::p2p::disconnect_peer,
            commands::p2p::list_peers,
            commands::p2p::start_discovery,
            // VoIP / Voice
            commands::voip::join_voice_channel,
            commands::voip::leave_voice_channel,
            commands::voip::set_mute,
            commands::voip::set_deafen,
            commands::voip::list_audio_devices,
            // Video
            commands::video::start_video_stream,
            commands::video::stop_video_stream,
            commands::video::list_video_devices,
            // Text channels
            commands::channels::create_channel,
            commands::channels::delete_channel,
            commands::channels::list_channels,
            commands::channels::send_message,
            commands::channels::get_messages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running accord");
}
