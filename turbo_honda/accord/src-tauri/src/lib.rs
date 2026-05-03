use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

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
            let voip_session = voip::VoipSession::new();

            let app_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data directory");

            let (p2p_node, db) = tauri::async_runtime::block_on(async {
                let p2p_node = p2p::P2PNode::new(&app_dir);
                let db = db::Db::new(&app_dir).await?;
                // Bootstrap a default server, then seed its default channels.
                let server_id = db.bootstrap_default_server().await?;
                db.bootstrap_defaults(&server_id).await?;
                anyhow::Ok((p2p_node, db))
            })
            .expect("failed to initialise P2P node and SQLite database");

            app.manage(AppState {
                p2p: std::sync::Mutex::new(p2p_node),
                voip: std::sync::Mutex::new(voip_session),
                db,
            });

            // ── System tray ────────────────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Hide Window").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Accord").build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .tooltip("Accord")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide to tray instead of closing the window.
                // The user can quit via the tray menu "Quit Accord" item.
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // P2P
            commands::p2p::get_local_peer_id,
            commands::p2p::connect_to_peer,
            commands::p2p::disconnect_peer,
            commands::p2p::list_peers,
            commands::p2p::start_discovery,
            commands::p2p::announce_channel_presence,
            commands::p2p::get_peers_in_channel,
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
            commands::video::list_screen_sources,
            commands::video::start_screen_share,
            commands::video::stop_screen_share,
            // Text channels
            commands::channels::create_channel,
            commands::channels::delete_channel,
            commands::channels::list_channels,
            commands::channels::send_message,
            commands::channels::get_messages,
            // Servers
            commands::servers::create_server,
            commands::servers::list_servers,
            commands::servers::join_server,
            commands::servers::get_server_invite,
            commands::servers::list_server_members,
            commands::servers::remove_server_member,
            // User profile
            commands::user::get_user_profile,
            commands::user::set_user_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running accord");
}
