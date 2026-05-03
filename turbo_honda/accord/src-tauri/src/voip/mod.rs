//! VoIP and Video streaming module.
//!
//! Audio path:
//!   cpal (capture) → Opus encoder → libp2p stream → Opus decoder → cpal (playback)
//!
//! Video path (feature = "video"):
//!   camera (v4l2/DirectShow/AVFoundation) → VP8/H.264 encoder
//!     → WebRTC data channel → decoder → render in WebView

use anyhow::{anyhow, Result};

use crate::commands::video::{ScreenSource, VideoDevice};
use crate::commands::voip::AudioDevice;

pub mod codec;

/// Active VoIP + video session state.
pub struct VoipSession {
    active_channel: Option<String>,
    muted: bool,
    deafened: bool,
    video_active: bool,
    screen_share_active: bool,
    /// Opus encoder – present while a voice channel is active.
    encoder: Option<codec::Encoder>,
    /// Opus decoder – present while a voice channel is active.
    decoder: Option<codec::Decoder>,
}

impl VoipSession {
    pub fn new() -> Self {
        Self {
            active_channel: None,
            muted: false,
            deafened: false,
            video_active: false,
            screen_share_active: false,
            encoder: None,
            decoder: None,
        }
    }

    // ── Voice ─────────────────────────────────────────────────────────────

    /// Join a voice channel.  Opens the audio stream and starts encoding.
    pub fn join(&mut self, channel_id: &str) -> Result<()> {
        if self.active_channel.is_some() {
            return Err(anyhow!("Already in a voice channel"));
        }
        // Initialise the Opus encoder and decoder for this session.
        let encoder = codec::Encoder::new()?;
        let decoder = codec::Decoder::new()?;
        self.encoder = Some(encoder);
        self.decoder = Some(decoder);
        // TODO:
        //   1. Open cpal input stream for the default (or selected) microphone.
        //   2. Feed 20 ms PCM frames to `self.encoder` and transmit the encoded
        //      bytes over the libp2p stream to all channel peers.
        //   3. Receive encoded frames from peers, pass them to `self.decoder`,
        //      and write the PCM output to the cpal playback stream.
        log::info!("Joining voice channel {channel_id}");
        self.active_channel = Some(channel_id.to_string());
        Ok(())
    }

    /// Leave the current voice channel and release audio resources.
    pub fn leave(&mut self) -> Result<()> {
        if self.active_channel.is_none() {
            return Err(anyhow!("Not in a voice channel"));
        }
        // Release the codec instances.
        self.encoder = None;
        self.decoder = None;
        // TODO: stop cpal streams and close libp2p audio sub-stream.
        log::info!("Leaving voice channel");
        self.active_channel = None;
        Ok(())
    }

    /// Mute or unmute the local microphone.
    pub fn set_mute(&mut self, muted: bool) -> Result<()> {
        log::debug!("set_mute = {muted}");
        self.muted = muted;
        // TODO: pause/resume the cpal input stream or zero-fill the encoder.
        Ok(())
    }

    /// Deafen or undeafen (silence all incoming audio).
    pub fn set_deafen(&mut self, deafened: bool) -> Result<()> {
        log::debug!("set_deafen = {deafened}");
        self.deafened = deafened;
        // TODO: pause/resume the cpal output stream.
        Ok(())
    }

    /// Enumerate host audio devices using cpal.
    pub fn enumerate_devices() -> Result<Vec<AudioDevice>> {
        // TODO: use cpal::available_hosts() + host.devices() to build this list.
        Ok(vec![
            AudioDevice {
                id: "default_input".to_string(),
                name: "Default Input".to_string(),
                is_input: true,
            },
            AudioDevice {
                id: "default_output".to_string(),
                name: "Default Output".to_string(),
                is_input: false,
            },
        ])
    }

    // ── Video ─────────────────────────────────────────────────────────────

    /// Start capturing video and streaming it to the channel peers.
    pub fn start_video(&mut self, channel_id: &str, device_id: Option<&str>) -> Result<()> {
        if self.video_active {
            return Err(anyhow!("Video stream already active"));
        }
        // TODO (feature = "video"):
        //   1. Open the selected camera via nokhwa (cross-platform capture).
        //   2. Encode frames with the WebRTC crate or a software VP8 encoder.
        //   3. Negotiate an SDP offer/answer with peers via the GossipSub signalling channel.
        //   4. Stream encoded video over the established WebRTC data channel.
        log::info!(
            "Starting video stream on channel {channel_id} (device={:?})",
            device_id
        );
        self.video_active = true;
        Ok(())
    }

    /// Stop the outbound video stream.
    pub fn stop_video(&mut self) -> Result<()> {
        if !self.video_active {
            return Err(anyhow!("No active video stream"));
        }
        // TODO: close WebRTC peer connection and release camera handle.
        log::info!("Stopping video stream");
        self.video_active = false;
        Ok(())
    }

    /// List available video capture devices.
    pub fn enumerate_video_devices() -> Result<Vec<VideoDevice>> {
        // TODO: use nokhwa::query_devices() to enumerate real cameras.
        Ok(vec![VideoDevice {
            id: "default_camera".to_string(),
            name: "Default Camera".to_string(),
        }])
    }

    /// List capturable screen / window sources.
    pub fn enumerate_screen_sources() -> Result<Vec<ScreenSource>> {
        // TODO: use a platform screen-capture library (e.g. xcap, screenshots,
        //   or the Tauri screen-capture plugin) to enumerate real displays and
        //   application windows.
        Ok(vec![
            ScreenSource {
                id: "screen:0".to_string(),
                name: "Entire Screen".to_string(),
                kind: "screen".to_string(),
            },
            ScreenSource {
                id: "screen:1".to_string(),
                name: "Display 2".to_string(),
                kind: "screen".to_string(),
            },
        ])
    }

    // ── Screen share ──────────────────────────────────────────────────────

    /// Record that the user has started sharing their screen / a window into
    /// the given channel.  The actual capture is driven by the frontend via
    /// `getDisplayMedia()`; the backend registers the active state and will
    /// eventually signal peers via GossipSub / WebRTC.
    pub fn start_screen_share(&mut self, channel_id: &str, source_id: Option<&str>) -> Result<()> {
        if self.screen_share_active {
            return Err(anyhow!("Screen share already active"));
        }
        // TODO (feature = "video"):
        //   1. Accept the source_id selected by the frontend picker.
        //   2. Broadcast a "screen-share-started" event to peers via GossipSub.
        //   3. Begin forwarding the encoded frame data received from the frontend
        //      WebView over a WebRTC data channel to each peer.
        log::info!(
            "Screen share started on channel {channel_id} (source={:?})",
            source_id
        );
        self.screen_share_active = true;
        Ok(())
    }

    /// Stop the current screen share session and release resources.
    pub fn stop_screen_share(&mut self) -> Result<()> {
        if !self.screen_share_active {
            return Err(anyhow!("No active screen share"));
        }
        // TODO: broadcast "screen-share-stopped" to peers and close WebRTC channel.
        log::info!("Screen share stopped");
        self.screen_share_active = false;
        Ok(())
    }
}

impl Default for VoipSession {
    fn default() -> Self {
        Self::new()
    }
}
