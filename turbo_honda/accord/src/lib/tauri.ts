import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChannelInfo {
  id: string;
  name: string;
  kind: "text" | "voice" | "video";
}

export interface MessagePayload {
  id: string;
  channel_id: string;
  author_peer_id: string;
  content: string;
  timestamp: string;
}

export interface PeerInfo {
  peer_id: string;
  address: string;
  connected: boolean;
  /** The channel id this peer is currently active in, if any. */
  channel_id: string | null;
}

// ── P2P commands ──────────────────────────────────────────────────────────────

export function getLocalPeerId(): Promise<string> {
  return invoke("get_local_peer_id");
}

export function listPeers(): Promise<PeerInfo[]> {
  return invoke("list_peers");
}

export function startDiscovery(): Promise<void> {
  return invoke("start_discovery");
}

/**
 * Announce that the local peer has joined (or left) a channel.
 * Pass `null` to indicate the peer has left all channels.
 */
export function announceChannelPresence(channelId: string | null): Promise<void> {
  return invoke("announce_channel_presence", { channelId });
}

/** Return all peers currently known to be in the given channel. */
export function getPeersInChannel(channelId: string): Promise<PeerInfo[]> {
  return invoke("get_peers_in_channel", { channelId });
}

// ── Channel commands ──────────────────────────────────────────────────────────

export function listChannels(): Promise<ChannelInfo[]> {
  return invoke("list_channels");
}

export function createChannel(name: string, kind: string): Promise<ChannelInfo> {
  return invoke("create_channel", { name, kind });
}

export function deleteChannel(channelId: string): Promise<void> {
  return invoke("delete_channel", { channelId });
}

export function sendMessage(
  channelId: string,
  content: string,
  authorPeerId: string,
): Promise<MessagePayload> {
  return invoke("send_message", { channelId, content, authorPeerId });
}

export function getMessages(
  channelId: string,
  limit?: number,
): Promise<MessagePayload[]> {
  return invoke("get_messages", { channelId, limit });
}

// ── VoIP commands ─────────────────────────────────────────────────────────────

export function joinVoiceChannel(channelId: string): Promise<void> {
  return invoke("join_voice_channel", { channelId });
}

export function leaveVoiceChannel(): Promise<void> {
  return invoke("leave_voice_channel");
}

export function setMute(muted: boolean): Promise<void> {
  return invoke("set_mute", { muted });
}

export function setDeafen(deafened: boolean): Promise<void> {
  return invoke("set_deafen", { deafened });
}

// ── Video commands ────────────────────────────────────────────────────────────

export interface VideoDevice {
  id: string;
  name: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  /** "screen" for a full display, "window" for an application window. */
  kind: "screen" | "window";
}

export function startVideoStream(
  channelId: string,
  deviceId?: string,
): Promise<void> {
  return invoke("start_video_stream", { channelId, deviceId });
}

export function stopVideoStream(): Promise<void> {
  return invoke("stop_video_stream");
}

export function listVideoDevices(): Promise<VideoDevice[]> {
  return invoke("list_video_devices");
}

export function listScreenSources(): Promise<ScreenSource[]> {
  return invoke("list_screen_sources");
}

export function startScreenShare(
  channelId: string,
  sourceId?: string,
): Promise<void> {
  return invoke("start_screen_share", { channelId, sourceId });
}

export function stopScreenShare(): Promise<void> {
  return invoke("stop_screen_share");
}
