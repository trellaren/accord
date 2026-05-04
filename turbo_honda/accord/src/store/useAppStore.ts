import { create } from "zustand";
import {
  ChannelInfo,
  MessagePayload,
  PeerInfo,
  ServerInfo,
  ServerInvitePayload,
  UserProfile,
  AudioDevice,
  VideoDevice,
  getLocalPeerId,
  listChannels,
  listPeers,
  sendMessage,
  getMessages,
  createChannel,
  deleteChannel,
  startDiscovery,
  joinVoiceChannel,
  leaveVoiceChannel,
  setMute,
  setDeafen,
  listAudioDevices,
  startVideoStream,
  stopVideoStream,
  listVideoDevices,
  startScreenShare,
  stopScreenShare,
  announceChannelPresence,
  getPeersInChannel,
  createServer,
  listServers,
  joinServer,
  getServerInvite,
  listServerMembers,
  removeServerMember,
  leaveServer,
  deleteServer,
  getUserProfile,
  setUserProfile,
  updateServer,
  invitePeerToServer,
  getPendingServerInvites,
} from "../lib/tauri";

interface AppState {
  // Identity
  localPeerId: string;

  // Servers
  servers: ServerInfo[];
  activeServerId: string | null;

  // Channels
  channels: ChannelInfo[];
  activeChannelId: string | null;

  // Messages keyed by channel id
  messages: Record<string, MessagePayload[]>;

  // Peers
  peers: PeerInfo[];

  // Active members per channel (channel_id → peer list)
  channelMembers: Record<string, PeerInfo[]>;

  // VoIP state
  inVoiceChannel: boolean;
  voiceChannelId: string | null;
  muted: boolean;
  deafened: boolean;

  // Video state
  videoActive: boolean;
  screenShareActive: boolean;

  // Available devices
  audioDevices: AudioDevice[];
  videoDevices: VideoDevice[];

  // User profile
  userProfile: UserProfile | null;

  // Actions
  initNode: () => Promise<void>;

  // Server actions
  loadServers: () => Promise<void>;
  selectServer: (id: string | null) => void;
  createNewServer: (name: string) => Promise<void>;
  joinExistingServer: (inviteCode: string) => Promise<void>;
  getInviteCode: (serverId: string) => Promise<string>;
  loadServerMembers: (serverId: string) => Promise<string[]>;
  kickServerMember: (serverId: string, peerId: string) => Promise<void>;
  leaveExistingServer: (serverId: string) => Promise<void>;
  deleteExistingServer: (serverId: string) => Promise<void>;
  updateExistingServer: (serverId: string, name: string, avatarUrl: string) => Promise<void>;

  // Channel actions
  loadChannels: (serverId?: string | null) => Promise<void>;
  selectChannel: (id: string) => void;
  loadMessages: (channelId: string) => Promise<void>;
  postMessage: (channelId: string, content: string) => Promise<void>;
  addChannel: (name: string, kind: string, serverId?: string | null) => Promise<void>;
  removeChannel: (channelId: string) => Promise<void>;

  // Peer actions
  refreshPeers: () => Promise<void>;
  discoverPeers: () => Promise<void>;
  /** Announce which channel the local peer is in. Pass null to mark as idle. */
  announcePresence: (channelId: string | null) => Promise<void>;
  /** Refresh the member list for a specific channel from the backend. */
  loadChannelMembers: (channelId: string) => Promise<void>;
  /** Queue a server invite to be sent to the peer at peerAddress once connected. */
  invitePeer: (peerAddress: string, serverId: string) => Promise<void>;
  /** Poll for received server invites and auto-join them. */
  processPendingServerInvites: () => Promise<void>;

  // VoIP / video actions
  joinVoice: (channelId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  startVideo: (channelId: string, deviceId?: string) => Promise<void>;
  stopVideo: () => Promise<void>;
  beginScreenShare: (channelId: string, sourceId?: string) => Promise<void>;
  endScreenShare: () => Promise<void>;

  // Device enumeration
  loadAudioDevices: () => Promise<void>;
  loadVideoDevices: () => Promise<void>;

  // User profile actions
  loadUserProfile: () => Promise<void>;
  saveUserProfile: (
    displayName: string,
    email: string,
    timezone: string,
    avatarUrl: string,
    inputDeviceId: string,
    outputDeviceId: string,
    videoDeviceId: string,
  ) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  localPeerId: "",
  servers: [],
  activeServerId: null,
  channels: [],
  activeChannelId: null,
  messages: {},
  peers: [],
  channelMembers: {},
  inVoiceChannel: false,
  voiceChannelId: null,
  muted: false,
  deafened: false,
  videoActive: false,
  screenShareActive: false,
  audioDevices: [],
  videoDevices: [],
  userProfile: null,

  initNode: async () => {
    const peerId = await getLocalPeerId();
    set({ localPeerId: peerId });
  },

  // ── Servers ───────────────────────────────────────────────────────────────

  loadServers: async () => {
    const servers = await listServers();
    set({ servers });
  },

  selectServer: (id) => {
    set({ activeServerId: id, activeChannelId: null });
  },

  createNewServer: async (name) => {
    const server = await createServer(name);
    set((s) => ({ servers: [...s.servers, server], activeServerId: server.id }));
  },

  joinExistingServer: async (inviteCode) => {
    const server = await joinServer(inviteCode);
    set((s) => {
      const exists = s.servers.some((sv) => sv.id === server.id);
      return {
        servers: exists ? s.servers : [...s.servers, server],
        activeServerId: server.id,
      };
    });
  },

  getInviteCode: async (serverId) => {
    return getServerInvite(serverId);
  },

  loadServerMembers: async (serverId) => {
    return listServerMembers(serverId);
  },

  kickServerMember: async (serverId, peerId) => {
    await removeServerMember(serverId, peerId);
  },

  leaveExistingServer: async (serverId) => {
    await leaveServer(serverId);
    set((s) => ({
      servers: s.servers.filter((sv) => sv.id !== serverId),
      activeServerId: s.activeServerId === serverId ? null : s.activeServerId,
      activeChannelId: s.activeServerId === serverId ? null : s.activeChannelId,
    }));
  },

  deleteExistingServer: async (serverId) => {
    await deleteServer(serverId);
    set((s) => ({
      servers: s.servers.filter((sv) => sv.id !== serverId),
      activeServerId: s.activeServerId === serverId ? null : s.activeServerId,
      activeChannelId: s.activeServerId === serverId ? null : s.activeChannelId,
    }));
  },

  updateExistingServer: async (serverId, name, avatarUrl) => {
    const server = await updateServer(serverId, name, avatarUrl);
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === serverId ? server : sv)),
    }));
  },

  // ── Channels ──────────────────────────────────────────────────────────────

  loadChannels: async (serverId) => {
    const channels = await listChannels(serverId);
    set({ channels });
  },

  selectChannel: (id) => {
    set({ activeChannelId: id });
  },

  loadMessages: async (channelId) => {
    const msgs = await getMessages(channelId, 50);
    set((s) => ({ messages: { ...s.messages, [channelId]: msgs } }));
  },

  postMessage: async (channelId, content) => {
    const { localPeerId } = get();
    const msg = await sendMessage(channelId, content, localPeerId);
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: [...(s.messages[channelId] ?? []), msg],
      },
    }));
  },

  addChannel: async (name, kind, serverId) => {
    const channel = await createChannel(name, kind, serverId);
    set((s) => ({ channels: [...s.channels, channel] }));
  },

  removeChannel: async (channelId) => {
    await deleteChannel(channelId);
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== channelId),
      activeChannelId:
        s.activeChannelId === channelId ? null : s.activeChannelId,
    }));
  },

  // ── Peers ─────────────────────────────────────────────────────────────────

  refreshPeers: async () => {
    const peers = await listPeers();
    set({ peers });
  },

  discoverPeers: async () => {
    await startDiscovery();
  },

  announcePresence: async (channelId) => {
    await announceChannelPresence(channelId);
  },

  loadChannelMembers: async (channelId) => {
    const members = await getPeersInChannel(channelId);
    set((s) => ({
      channelMembers: { ...s.channelMembers, [channelId]: members },
    }));
  },

  invitePeer: async (peerAddress, serverId) => {
    await invitePeerToServer(peerAddress, serverId);
  },

  processPendingServerInvites: async () => {
    const invites = await getPendingServerInvites();
    if (invites.length === 0) return;
    for (const invite of invites) {
      try {
        const server = await joinServer(invite.invite_code);
        set((s) => {
          const exists = s.servers.some((sv) => sv.id === server.id);
          return {
            servers: exists ? s.servers : [...s.servers, server],
          };
        });
      } catch (err) {
        console.error("Failed to auto-join server from invite:", err);
      }
    }
  },

  // ── VoIP / video ──────────────────────────────────────────────────────────

  joinVoice: async (channelId) => {
    await joinVoiceChannel(channelId);
    set({ inVoiceChannel: true, voiceChannelId: channelId });
    // Announce that we've joined this channel so remote peers can update.
    await announceChannelPresence(channelId).catch((e) => console.error("announce presence failed:", e));
  },

  leaveVoice: async () => {
    await leaveVoiceChannel();
    set({ inVoiceChannel: false, voiceChannelId: null, muted: false, deafened: false });
    await announceChannelPresence(null).catch((e) => console.error("announce presence (leave) failed:", e));
  },

  toggleMute: async () => {
    const muted = !get().muted;
    await setMute(muted);
    set({ muted });
  },

  toggleDeafen: async () => {
    const deafened = !get().deafened;
    await setDeafen(deafened);
    set({ deafened });
  },

  startVideo: async (channelId, deviceId) => {
    await startVideoStream(channelId, deviceId);
    set({ videoActive: true });
    await announceChannelPresence(channelId).catch((e) => console.error("announce presence (video start) failed:", e));
  },

  stopVideo: async () => {
    await stopVideoStream();
    set({ videoActive: false });
    await announceChannelPresence(null).catch((e) => console.error("announce presence (video stop) failed:", e));
  },

  beginScreenShare: async (channelId, sourceId) => {
    await startScreenShare(channelId, sourceId);
    set({ screenShareActive: true });
  },

  endScreenShare: async () => {
    await stopScreenShare();
    set({ screenShareActive: false });
  },

  // ── User profile ──────────────────────────────────────────────────────────

  loadUserProfile: async () => {
    const userProfile = await getUserProfile();
    set({ userProfile });
  },

  saveUserProfile: async (displayName, email, timezone, avatarUrl, inputDeviceId, outputDeviceId, videoDeviceId) => {
    const userProfile = await setUserProfile(displayName, email, timezone, avatarUrl, inputDeviceId, outputDeviceId, videoDeviceId);
    set({ userProfile });
  },

  // ── Device enumeration ────────────────────────────────────────────────────

  loadAudioDevices: async () => {
    const audioDevices = await listAudioDevices();
    set({ audioDevices });
  },

  loadVideoDevices: async () => {
    const videoDevices = await listVideoDevices();
    set({ videoDevices });
  },
}));
