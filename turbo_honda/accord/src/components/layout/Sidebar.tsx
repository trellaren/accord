import { useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Hash, Volume2, Link, Users, Plus, RefreshCw, Signal, MapPin, Lock } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ChannelInfo } from "../../lib/tauri";
import { InviteCodeModal } from "../servers/InviteCodeModal";
import { ServerMembersModal } from "../servers/ServerMembersModal";
import { ChannelPermissionsModal } from "../servers/ChannelPermissionsModal";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const {
    channels,
    activeChannelId,
    activeServerId,
    servers,
    selectChannel,
    addChannel,
    peers,
    discoverPeers,
    loadChannels,
    inVoiceChannel,
    voiceChannelId,
    videoActive,
    screenShareActive,
    startVideo,
    stopVideo,
    beginScreenShare,
    endScreenShare,
    localPeerId,
    userProfile,
    channelMembers,
  } = useAppStore();
  const navigate = useNavigate();
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelKind, setNewChannelKind] = useState<"text" | "voice">("text");
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [channelPermsTarget, setChannelPermsTarget] = useState<ChannelInfo | null>(null);

  // Channels to display: filter by active server if one is selected.
  const visibleChannels = activeServerId
    ? channels.filter((c) => c.server_id === activeServerId)
    : channels;

  const textChannels = visibleChannels.filter((c) => c.kind === "text");
  const voiceChannels = visibleChannels.filter((c) => c.kind === "voice");

  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.owner_peer_id === localPeerId;

  function handleSelect(channel: ChannelInfo) {
    selectChannel(channel.id);
    navigate(`/channels/${channel.id}/${channel.kind}`);
  }

  async function handleAddChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    await addChannel(newChannelName.trim(), newChannelKind, activeServerId);
    setNewChannelName("");
    setShowAddChannel(false);
    // Refresh channels for the current server.
    await loadChannels(activeServerId);
  }

  async function handleToggleScreenShare() {
    if (screenShareActive) {
      await endScreenShare();
    } else if (voiceChannelId) {
      await beginScreenShare(voiceChannelId);
    }
  }

  async function handleToggleVideo() {
    if (videoActive) {
      await stopVideo();
    } else if (voiceChannelId) {
      await startVideo(voiceChannelId);
    }
  }

  return (
    <>
      <aside className={styles.sidebar}>
        {/* Server / app header */}
        <div className={styles.header}>
          <span className={styles.serverName}>
            {activeServer?.name ?? "Accord"}
          </span>
          {activeServerId && (
            <div className={styles.headerActions}>
              <button
                className={styles.headerBtn}
                onClick={() => setShowInvite(true)}
                title="Get invite code"
              >
                <Link size={14} />
              </button>
              <button
                className={styles.headerBtn}
                onClick={() => setShowMembers(true)}
                title="Manage members"
              >
                <Users size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Channel sections */}
        <nav className={styles.channels}>
          <ChannelSection
            title="Text Channels"
            channels={textChannels}
            activeId={activeChannelId}
            peers={peers}
            voiceChannelId={null}
            localPeerId={null}
            localDisplayName={null}
            localAvatarUrl={null}
            isOwner={isOwner}
            onSelect={handleSelect}
            onOpenPerms={(c) => setChannelPermsTarget(c)}
          />
          <ChannelSection
            title="Voice Channels"
            channels={voiceChannels}
            activeId={activeChannelId}
            peers={peers}
            channelMembers={channelMembers}
            voiceChannelId={voiceChannelId}
            localPeerId={localPeerId}
            localDisplayName={userProfile?.display_name ?? null}
            localAvatarUrl={userProfile?.avatar_url ?? null}
            isOwner={isOwner}
            onSelect={handleSelect}
            onOpenPerms={(c) => setChannelPermsTarget(c)}
          />

          {/* Add channel */}
          <div className={styles.sectionHeader}>
            <span>Add Channel</span>
            <button
              className={styles.addBtn}
              onClick={() => setShowAddChannel((v) => !v)}
              aria-label="Add channel"
            >
              {showAddChannel ? <span className={styles.collapseBtnIcon}>−</span> : <Plus size={14} />}
            </button>
          </div>
          {showAddChannel && (
            <form className={styles.addForm} onSubmit={handleAddChannel}>
              <input
                className={styles.input}
                placeholder="Channel name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                autoFocus
              />
              <select
                className={styles.select}
                value={newChannelKind}
                onChange={(e) =>
                  setNewChannelKind(e.target.value as "text" | "voice")
                }
              >
                <option value="text">Text</option>
                <option value="voice">Voice</option>
              </select>
              <button className={styles.submitBtn} type="submit">
                Create
              </button>
            </form>
          )}
        </nav>

        {/* Media streaming actions — visible while connected to a voice channel */}
        {inVoiceChannel && (
          <div className={styles.mediaSection}>
            <div className={styles.sectionHeader}>
              <span>Streaming</span>
            </div>
            <div className={styles.mediaButtons}>
              <button
                className={clsx(styles.mediaBtn, videoActive && styles.mediaBtnActive)}
                onClick={handleToggleVideo}
                title={videoActive ? "Stop Video" : "Start Video"}
              >
                <span className={styles.mediaBtnIcon}>{videoActive ? "📹" : "📷"}</span>
                <span>{videoActive ? "Stop Video" : "Start Video"}</span>
              </button>
              <button
                className={clsx(styles.mediaBtn, screenShareActive && styles.mediaBtnActive)}
                onClick={handleToggleScreenShare}
                title={screenShareActive ? "Stop Screen Share" : "Share Screen"}
              >
                <span className={styles.mediaBtnIcon}>{screenShareActive ? "🖥️" : "🖥"}</span>
                <span>{screenShareActive ? "Stop Sharing" : "Share Screen"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Peer list */}
        <div className={styles.peerSection}>
          <div className={styles.sectionHeader}>
            <span>Peers ({peers.length})</span>
            <button
              className={styles.addBtn}
              onClick={discoverPeers}
              title="Discover peers on local network"
            >
              <RefreshCw size={12} />
            </button>
          </div>
          {peers.map((p) => (
            <div key={p.peer_id} className={styles.peer}>
              <span className={clsx(styles.peerDot, p.connected && styles.peerDotOnline)} />
              <span className={styles.peerName} title={p.peer_id}>
                {p.peer_id.slice(0, 10)}…
              </span>
              {p.connected && (
                <span className={styles.peerPingIcon} aria-label="Connected"><Signal size={12} /></span>
              )}
              {p.channel_id && (
                <span className={styles.peerChannel} aria-label={`In channel ${p.channel_id}`}><MapPin size={11} /></span>
              )}
            </div>
          ))}
          {peers.length === 0 && (
            <p className={styles.noPeers}>No peers yet. Click ↺ to discover.</p>
          )}
        </div>
      </aside>

      {showInvite && activeServerId && (
        <InviteCodeModal
          serverId={activeServerId}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showMembers && activeServerId && (
        <ServerMembersModal
          serverId={activeServerId}
          onClose={() => setShowMembers(false)}
        />
      )}
      {channelPermsTarget && activeServerId && (
        <ChannelPermissionsModal
          channelId={channelPermsTarget.id}
          channelName={channelPermsTarget.name}
          serverId={activeServerId}
          onClose={() => setChannelPermsTarget(null)}
        />
      )}
    </>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────

import { PeerInfo } from "../../lib/tauri";

interface ChannelSectionProps {
  title: string;
  channels: ChannelInfo[];
  activeId: string | null;
  peers: PeerInfo[];
  /** Channel-id → peer list from the presence announcements. Voice channels only. */
  channelMembers?: Record<string, PeerInfo[]>;
  /** Channel id the local user is currently in (voice only). */
  voiceChannelId: string | null;
  /** Local user's peer id. */
  localPeerId: string | null;
  /** Local user's display name (from profile). */
  localDisplayName: string | null;
  /** Local user's avatar URL (from profile). */
  localAvatarUrl: string | null;
  /** Whether the current user is the server owner (shows permissions button). */
  isOwner: boolean;
  onSelect: (c: ChannelInfo) => void;
  onOpenPerms: (c: ChannelInfo) => void;
}

/** Small circular avatar that shows an image or falls back to initials. */
function MemberAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

  if (avatarUrl && !imgFailed) {
    return (
      <img
        className={styles.memberAvatarImg}
        src={avatarUrl}
        alt={name}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return <span className={styles.memberAvatar}>{initials}</span>;
}

function ChannelSection({
  title,
  channels,
  activeId,
  peers,
  channelMembers = {},
  voiceChannelId,
  localPeerId,
  localDisplayName,
  localAvatarUrl,
  isOwner,
  onSelect,
  onOpenPerms,
}: ChannelSectionProps) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{title}</p>
      {channels.map((c) => {
        // For voice channels, gather members from presence announcements and
        // legacy peer objects, then inject the local user if they are active.
        const announced = channelMembers[c.id] ?? [];
        const legacyPeers = peers.filter(
          (p) => p.channel_id === c.id && !announced.some((m) => m.peer_id === p.peer_id),
        );
        const remotePeers = [...announced, ...legacyPeers];

        const localInThisChannel = voiceChannelId === c.id && !!localPeerId;

        return (
          <div key={c.id}>
            <div className={styles.channelRow}>
              <button
                className={clsx(styles.channelBtn, c.id === activeId && styles.channelBtnActive)}
                onClick={() => onSelect(c)}
              >
                <span className={styles.channelIcon}>
                  {c.kind === "voice" ? <Volume2 size={14} /> : <Hash size={14} />}
                </span>
                <span>{c.name}</span>
              </button>
              {isOwner && (
                <button
                  className={styles.channelPermsBtn}
                  onClick={() => onOpenPerms(c)}
                  title="Channel Permissions"
                >
                  <Lock size={11} />
                </button>
              )}
            </div>

            {/* Local user below the channel they joined */}
            {localInThisChannel && (
              <div className={styles.channelMember} title="You">
                <MemberAvatar
                  name={localDisplayName || localPeerId!}
                  avatarUrl={localAvatarUrl}
                />
                <span className={styles.memberName}>
                  {localDisplayName && localDisplayName.trim()
                    ? localDisplayName
                    : localPeerId!.slice(0, 10) + "…"}
                  <span className={styles.memberSelfBadge}>you</span>
                </span>
              </div>
            )}

            {/* Remote peers in this channel */}
            {remotePeers.map((p) => (
              <div key={p.peer_id} className={styles.channelMember} title={p.peer_id}>
                <MemberAvatar name={p.peer_id} />
                <span className={styles.memberName}>
                  {p.peer_id.slice(0, 10)}…
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
