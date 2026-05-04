import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChannelInfo {
  id: string;
  name: string;
  kind: "text" | "voice";
  /** The server this channel belongs to, if any. */
  server_id: string | null;
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

export interface ServerInfo {
  id: string;
  name: string;
  invite_code: string;
  owner_peer_id: string;
  /** Optional avatar stored as a data-URI or URL. */
  avatar_url: string;
}

/** A role that can be assigned to server members. */
export interface ServerRole {
  id: string;
  server_id: string;
  name: string;
  /** CSS hex colour string, e.g. `"#99aab5"`. */
  color: string;
  /** Bitmask of allowed permissions. */
  permissions: number;
}

/** Permission flag constants for use with {@link ServerRole.permissions}. */
export const Permission = {
  VIEW_CHANNEL: 1,
  SEND_MESSAGES: 2,
  JOIN_VOICE: 4,
  INVITE_USERS: 8,
  MANAGE_CHANNELS: 16,
  MANAGE_ROLES: 32,
  DELETE_MESSAGES: 64,
} as const;

/** Per-channel permission override for a role. */
export interface ChannelPermission {
  id: string;
  channel_id: string;
  role_id: string;
  /** Bitmask of explicitly allowed permissions. */
  allow: number;
  /** Bitmask of explicitly denied permissions. */
  deny: number;
}

export interface UserProfile {
  peer_id: string;
  display_name: string;
  email: string;
  timezone: string;
  /** URL or data-URI for the user's avatar image. */
  avatar_url: string;
  /** ID of the preferred audio input device. */
  input_device_id: string;
  /** ID of the preferred audio output device. */
  output_device_id: string;
  /** ID of the preferred video (webcam) device. */
  video_device_id: string;
}

// ── P2P commands ──────────────────────────────────────────────────────────────

/** Payload returned by the backend for a received server invite. */
export interface ServerInvitePayload {
  invite_code: string;
  server_name: string;
  from_peer_id: string;
}

export function getLocalPeerId(): Promise<string> {
  return invoke("get_local_peer_id");
}

/**
 * Return all multiaddresses the local libp2p node is listening on.
 * These are shareable connection strings that other users can paste into the
 * "Invite by peer address" field so you can be directly invited to a server.
 */
export function getLocalPeerAddress(): Promise<string[]> {
  return invoke("get_local_peer_address");
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

/**
 * Queue a server invite to be sent to the peer at `peerAddress` once the
 * libp2p connection is established, and dial the address.
 */
export function invitePeerToServer(
  peerAddress: string,
  serverId: string,
): Promise<void> {
  return invoke("invite_peer_to_server", { peerAddress, serverId });
}

/**
 * Return (and clear) all server invites received from remote peers.
 * Should be polled periodically by the frontend.
 */
export function getPendingServerInvites(): Promise<ServerInvitePayload[]> {
  return invoke("get_pending_server_invites");
}

// ── Channel commands ──────────────────────────────────────────────────────────

export function listChannels(serverId?: string | null): Promise<ChannelInfo[]> {
  return invoke("list_channels", { serverId: serverId ?? null });
}

export function createChannel(
  name: string,
  kind: string,
  serverId?: string | null,
): Promise<ChannelInfo> {
  return invoke("create_channel", { name, kind, serverId: serverId ?? null });
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

// ── Server commands ───────────────────────────────────────────────────────────

export function createServer(name: string): Promise<ServerInfo> {
  return invoke("create_server", { name });
}

export function listServers(): Promise<ServerInfo[]> {
  return invoke("list_servers");
}

export function joinServer(inviteCode: string): Promise<ServerInfo> {
  return invoke("join_server", { inviteCode });
}

export function getServerInvite(serverId: string): Promise<string> {
  return invoke("get_server_invite", { serverId });
}

export function listServerMembers(serverId: string): Promise<string[]> {
  return invoke("list_server_members", { serverId });
}

export function removeServerMember(
  serverId: string,
  peerId: string,
): Promise<void> {
  return invoke("remove_server_member", { serverId, peerId });
}

export function leaveServer(serverId: string): Promise<void> {
  return invoke("leave_server", { serverId });
}

export function deleteServer(serverId: string): Promise<void> {
  return invoke("delete_server", { serverId });
}

export function updateServer(
  serverId: string,
  name: string,
  avatarUrl: string,
): Promise<ServerInfo> {
  return invoke("update_server", { serverId, name, avatarUrl });
}

// ── Role commands ─────────────────────────────────────────────────────────────

export function createRole(
  serverId: string,
  name: string,
  color: string,
  permissions: number,
): Promise<ServerRole> {
  return invoke("create_role", { serverId, name, color, permissions });
}

export function listRoles(serverId: string): Promise<ServerRole[]> {
  return invoke("list_roles", { serverId });
}

export function updateRole(
  roleId: string,
  name: string,
  color: string,
  permissions: number,
): Promise<ServerRole> {
  return invoke("update_role", { roleId, name, color, permissions });
}

export function deleteRole(roleId: string): Promise<void> {
  return invoke("delete_role", { roleId });
}

export function assignMemberRole(
  serverId: string,
  peerId: string,
  roleId: string,
): Promise<void> {
  return invoke("assign_member_role", { serverId, peerId, roleId });
}

export function removeMemberRole(
  serverId: string,
  peerId: string,
  roleId: string,
): Promise<void> {
  return invoke("remove_member_role", { serverId, peerId, roleId });
}

export function getMemberRoles(serverId: string, peerId: string): Promise<ServerRole[]> {
  return invoke("get_member_roles", { serverId, peerId });
}

// ── Channel permission commands ───────────────────────────────────────────────

export function setChannelPermission(
  channelId: string,
  roleId: string,
  allow: number,
  deny: number,
): Promise<ChannelPermission> {
  return invoke("set_channel_permission", { channelId, roleId, allow, deny });
}

export function getChannelPermissions(channelId: string): Promise<ChannelPermission[]> {
  return invoke("get_channel_permissions", { channelId });
}

// ── User profile commands ─────────────────────────────────────────────────────

export function getUserProfile(): Promise<UserProfile> {
  return invoke("get_user_profile");
}

export function setUserProfile(
  displayName: string,
  email: string,
  timezone: string,
  avatarUrl: string,
  inputDeviceId: string,
  outputDeviceId: string,
  videoDeviceId: string,
): Promise<UserProfile> {
  return invoke("set_user_profile", {
    displayName,
    email,
    timezone,
    avatarUrl,
    inputDeviceId,
    outputDeviceId,
    videoDeviceId,
  });
}

// ── VoIP commands ─────────────────────────────────────────────────────────────

export interface AudioDevice {
  id: string;
  name: string;
  is_input: boolean;
}

export function listAudioDevices(): Promise<AudioDevice[]> {
  return invoke("list_audio_devices");
}

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

// ── Auto-updater ──────────────────────────────────────────────────────────────

export interface UpdateInfo {
  version: string;
  body: string | null;
}

/**
 * Check for an available application update.
 *
 * Returns the new version info if an update is available, or `null` if the
 * app is already up-to-date.  When running outside of a Tauri context (e.g.
 * in a browser dev server) this always returns `null`.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update?.available) return null;
    return { version: update.version, body: update.body ?? null };
  } catch {
    // Running in a browser dev server or updater not configured – skip silently.
    return null;
  }
}

/**
 * Download and install the pending update, then restart the app.
 *
 * Should only be called after `checkForUpdate()` has confirmed an update is
 * available.
 */
export async function installUpdate(): Promise<void> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update?.available) return;
  await update.downloadAndInstall();
  await relaunch();
}
