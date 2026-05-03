//! Opus codec wrappers for VoIP audio encoding and decoding.
//!
//! Configuration used throughout:
//!   - Sample rate : 48 000 Hz  (required by the Opus spec for best quality)
//!   - Channels    : Stereo (2)
//!   - Frame size  : 960 samples per channel (20 ms @ 48 kHz) — standard VoIP packet
//!   - Application : VOIP  (optimises for speech / low latency)
//!   - Bitrate     : 64 kbps

use anyhow::{Context, Result};
use audiopus::{
    coder::{Decoder as OpusDecoderInner, Encoder as OpusEncoderInner},
    Application, Bitrate, Channels, SampleRate,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Opus-mandated sample rate for best quality.
pub const SAMPLE_RATE: u32 = 48_000;

/// Number of interleaved channels (stereo).
pub const CHANNELS: usize = 2;

/// Samples *per channel* in one 20 ms frame ((48 000 / 1 000) * 20 = 960).
pub const FRAME_SIZE: usize = 960;

/// Total interleaved samples in one frame (`FRAME_SIZE * CHANNELS`).
pub const FRAME_SAMPLES: usize = FRAME_SIZE * CHANNELS;

/// Target encode bitrate in bits-per-second.
const ENCODE_BITRATE_BPS: i32 = 64_000;

// ── Encoder ───────────────────────────────────────────────────────────────────

/// Wraps an Opus encoder configured for VoIP at 48 kHz / stereo.
pub struct Encoder {
    inner: OpusEncoderInner,
}

impl Encoder {
    /// Create a new [`Encoder`].
    pub fn new() -> Result<Self> {
        let mut inner =
            OpusEncoderInner::new(SampleRate::Hz48000, Channels::Stereo, Application::Voip)
                .context("failed to create Opus encoder")?;
        inner
            .set_bitrate(Bitrate::BitsPerSecond(ENCODE_BITRATE_BPS))
            .context("failed to set Opus encoder bitrate")?;
        Ok(Self { inner })
    }

    /// Encode one frame of interleaved 16-bit PCM samples into Opus.
    ///
    /// `pcm` must contain exactly [`FRAME_SAMPLES`] (`= 1920`) elements.
    /// Returns the encoded bytes (sub-slice of `output`).
    pub fn encode<'out>(&mut self, pcm: &[i16], output: &'out mut [u8]) -> Result<&'out [u8]> {
        anyhow::ensure!(
            pcm.len() == FRAME_SAMPLES,
            "encoder expected {} interleaved PCM samples, got {}",
            FRAME_SAMPLES,
            pcm.len()
        );
        let n = self
            .inner
            .encode(pcm, output)
            .context("Opus encode failed")?;
        Ok(&output[..n])
    }
}

// ── Decoder ───────────────────────────────────────────────────────────────────

/// Wraps an Opus decoder configured for 48 kHz / stereo output.
pub struct Decoder {
    inner: OpusDecoderInner,
}

impl Decoder {
    /// Create a new [`Decoder`].
    pub fn new() -> Result<Self> {
        let inner = OpusDecoderInner::new(SampleRate::Hz48000, Channels::Stereo)
            .context("failed to create Opus decoder")?;
        Ok(Self { inner })
    }

    /// Decode an Opus packet into interleaved 16-bit PCM samples.
    ///
    /// `output` must be at least [`FRAME_SAMPLES`] (`= 1920`) elements long.
    /// Returns the number of decoded samples per channel.
    pub fn decode(&mut self, packet: &[u8], output: &mut [i16]) -> Result<usize> {
        anyhow::ensure!(
            output.len() >= FRAME_SAMPLES,
            "decoder output buffer too small: need at least {} samples, got {}",
            FRAME_SAMPLES,
            output.len()
        );
        let n = self
            .inner
            .decode(Some(packet), output, false)
            .context("Opus decode failed")?;
        Ok(n)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a simple 440 Hz sine wave in stereo as a VoIP frame.
    fn sine_frame() -> Vec<i16> {
        let mut buf = Vec::with_capacity(FRAME_SAMPLES);
        for i in 0..FRAME_SIZE {
            let t = i as f64 / SAMPLE_RATE as f64;
            let sample = (t * 440.0 * std::f64::consts::TAU).sin();
            let s = (sample * i16::MAX as f64) as i16;
            buf.push(s); // left
            buf.push(s); // right
        }
        buf
    }

    #[test]
    fn encoder_produces_non_empty_output() {
        let mut enc = Encoder::new().unwrap();
        let pcm = sine_frame();
        let mut out = vec![0u8; 4000];
        let encoded = enc.encode(&pcm, &mut out).unwrap();
        assert!(!encoded.is_empty(), "Opus output must not be empty");
    }

    #[test]
    fn encode_decode_roundtrip() {
        let mut enc = Encoder::new().unwrap();
        let mut dec = Decoder::new().unwrap();

        let pcm_in = sine_frame();
        let mut packet_buf = vec![0u8; 4000];
        let encoded = enc.encode(&pcm_in, &mut packet_buf).unwrap().to_vec();

        let mut pcm_out = vec![0i16; FRAME_SAMPLES];
        let samples_per_ch = dec.decode(&encoded, &mut pcm_out).unwrap();
        assert_eq!(samples_per_ch, FRAME_SIZE, "expected {FRAME_SIZE} samples per channel");

        // The decoded signal must have non-trivial energy – Opus in VOIP mode is
        // lossy and speech-optimised so we cannot demand close fidelity for a
        // pure sine, but the output must not be silence.
        let energy: f64 = pcm_out.iter().map(|&s| (s as f64).powi(2)).sum();
        assert!(
            energy > 0.0,
            "decoded output is silent; Opus codec produced no audio"
        );
    }

    #[test]
    fn encoder_rejects_wrong_frame_size() {
        let mut enc = Encoder::new().unwrap();
        let mut out = vec![0u8; 4000];
        // Pass only 100 samples instead of FRAME_SAMPLES
        let err = enc.encode(&vec![0i16; 100], &mut out).unwrap_err();
        assert!(err.to_string().contains("interleaved PCM samples"));
    }

    #[test]
    fn decoder_rejects_small_output_buffer() {
        let mut dec = Decoder::new().unwrap();
        let dummy_packet = vec![0u8; 4]; // buffer-size validation fires before decoding
        let mut small = vec![0i16; 10];
        let err = dec.decode(&dummy_packet, &mut small).unwrap_err();
        assert!(err.to_string().contains("output buffer too small"));
    }
}
