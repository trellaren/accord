use tauri::Manager;

mod channels;
mod commands;
mod p2p;
mod voip;

pub use commands::*;

/// Application state shared across Tauri commands.
pub struct AppState {
    /// Active P2P node handle.
    pub p2p: std::sync::Mutex<p2p::P2PNode>,
    /// VoIP session handle.
    pub voip: std::sync::Mutex<voip::VoipSession>,
    /// In-memory channel / message store.
    pub channels: std::sync::Mutex<channels::ChannelStore>,
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
            let channel_store = channels::ChannelStore::new();

            app.manage(AppState {
                p2p: std::sync::Mutex::new(p2p_node),
                voip: std::sync::Mutex::new(voip_session),
                channels: std::sync::Mutex::new(channel_store),
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
