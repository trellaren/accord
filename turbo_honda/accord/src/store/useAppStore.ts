import { create } from "zustand";
import {
  ChannelInfo,
  MessagePayload,
  PeerInfo,
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
  startVideoStream,
  stopVideoStream,
  startScreenShare,
  stopScreenShare,
  announceChannelPresence,
  getPeersInChannel,
} from "../lib/tauri";

interface AppState {
  // Identity
  localPeerId: string;

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
  muted: boolean;
  deafened: boolean;

  // Video state
  videoActive: boolean;
  screenShareActive: boolean;

  // Actions
  initNode: () => Promise<void>;
  loadChannels: () => Promise<void>;
  selectChannel: (id: string) => void;
  loadMessages: (channelId: string) => Promise<void>;
  postMessage: (channelId: string, content: string) => Promise<void>;
  addChannel: (name: string, kind: string) => Promise<void>;
  removeChannel: (channelId: string) => Promise<void>;
  refreshPeers: () => Promise<void>;
  discoverPeers: () => Promise<void>;
  /** Announce which channel the local peer is in. Pass null to mark as idle. */
  announcePresence: (channelId: string | null) => Promise<void>;
  /** Refresh the member list for a specific channel from the backend. */
  loadChannelMembers: (channelId: string) => Promise<void>;
  joinVoice: (channelId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  startVideo: (channelId: string, deviceId?: string) => Promise<void>;
  stopVideo: () => Promise<void>;
  beginScreenShare: (channelId: string, sourceId?: string) => Promise<void>;
  endScreenShare: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  localPeerId: "",
  channels: [],
  activeChannelId: null,
  messages: {},
  peers: [],
  channelMembers: {},
  inVoiceChannel: false,
  muted: false,
  deafened: false,
  videoActive: false,
  screenShareActive: false,

  initNode: async () => {
    const peerId = await getLocalPeerId();
    set({ localPeerId: peerId });
  },

  loadChannels: async () => {
    const channels = await listChannels();
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

  addChannel: async (name, kind) => {
    const channel = await createChannel(name, kind);
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

  joinVoice: async (channelId) => {
    await joinVoiceChannel(channelId);
    set({ inVoiceChannel: true });
    // Announce that we've joined this channel so remote peers can update.
    await announceChannelPresence(channelId).catch((e) => console.error("announce presence failed:", e));
  },

  leaveVoice: async () => {
    await leaveVoiceChannel();
    set({ inVoiceChannel: false, muted: false, deafened: false });
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
}));
