import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import clsx from "clsx";
import { Signal, Crown, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ServerRole } from "../../lib/tauri";
import { ScreenSharePanel } from "./ScreenSharePanel";
import { PeerContextMenu } from "./PeerContextMenu";
import styles from "./VoiceChannel.module.css";

// localStorage key for the local blocklist (peer IDs blocked by this user).
const BLOCKED_PEERS_KEY = "accord_blocked_peers";

function getBlockedPeers(): Set<string> {
  try {
    const stored = localStorage.getItem(BLOCKED_PEERS_KEY);
    return stored ? new Set<string>(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

// ── Inline role panel ────────────────────────────────────────────────────────

interface RolePanelProps {
  serverId: string;
  peerId: string;
  roles: ServerRole[];
  onClose: () => void;
}

function RolePanel({ serverId, peerId, roles, onClose }: RolePanelProps) {
  const { fetchMemberRoles, assignRole, revokeRole } = useAppStore();
  const [memberRoles, setMemberRoles] = useState<ServerRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMemberRoles(serverId, peerId)
      .then(setMemberRoles)
      .catch(() => setMemberRoles([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, peerId]);

  const assignedIds = new Set(memberRoles.map((r) => r.id));

  async function handleToggleRole(roleId: string) {
    if (assignedIds.has(roleId)) {
      await revokeRole(serverId, peerId, roleId);
      setMemberRoles((prev) => prev.filter((r) => r.id !== roleId));
    } else {
      await assignRole(serverId, peerId, roleId);
      const updated = await fetchMemberRoles(serverId, peerId);
      setMemberRoles(updated);
    }
  }

  return (
    <div className={styles.roleOverlay} onClick={onClose}>
      <div className={styles.rolePanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.rolePanelHeader}>
          <span>Manage Roles — {peerId.slice(0, 12)}…</span>
          <button className={styles.rolePanelClose} onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
        {loading ? (
          <p className={styles.rolePanelHint}>Loading…</p>
        ) : roles.length === 0 ? (
          <p className={styles.rolePanelHint}>No roles defined for this server.</p>
        ) : (
          <div className={styles.roleChips}>
            {roles.map((role) => {
              const assigned = assignedIds.has(role.id);
              return (
                <button
                  key={role.id}
                  className={clsx(styles.roleChip, assigned && styles.roleChipActive)}
                  style={assigned ? { background: role.color + "33", borderColor: role.color, color: role.color } : {}}
                  onClick={() => handleToggleRole(role.id)}
                >
                  {assigned ? "✓ " : ""}{role.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function blockPeer(peerId: string): void {
  const blocked = getBlockedPeers();
  blocked.add(peerId);
  localStorage.setItem(BLOCKED_PEERS_KEY, JSON.stringify([...blocked]));
}

interface ContextMenuState {
  x: number;
  y: number;
  peerId: string;
  displayName: string;
}

export function VoiceChannel() {
  const { channelId } = useParams<{ channelId: string }>();
  const {
    channels,
    peers,
    channelMembers,
    loadChannelMembers,
    inVoiceChannel,
    muted,
    deafened,
    videoActive,
    screenShareActive,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    startVideo,
    stopVideo,
    beginScreenShare,
    endScreenShare,
    localPeerId,
    servers,
    activeServerId,
    kickServerMember,
    loadRoles,
    serverRoles,
    userProfile,
  } = useAppStore();

  const channel = channels.find((c) => c.id === channelId);

  // Local screen-share MediaStream (captured in the browser).
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Per-peer local state: muted and video-disabled flags (client-side only).
  const [localMutedPeers, setLocalMutedPeers] = useState<Set<string>>(new Set());
  const [localVideoDisabledPeers, setLocalVideoDisabledPeers] = useState<Set<string>>(new Set());

  // Context menu state.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Role management: show role panel for a peer (reuse ServerMembersModal logic inline).
  const [rolesTarget, setRolesTarget] = useState<string | null>(null);

  // Members in this specific channel (remote peers that announced their presence)
  const membersHere = channelId ? (channelMembers[channelId] ?? []) : [];

  // Filter out blocked peers (client-side only).
  const [blockedPeers, setBlockedPeers] = useState<Set<string>>(() => getBlockedPeers());

  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.owner_peer_id === localPeerId;

  // Auto-join when the component mounts
  useEffect(() => {
    if (channelId && !inVoiceChannel) {
      joinVoice(channelId);
    }
    return () => {
      if (inVoiceChannel) leaveVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Periodically refresh the member list for this channel.
  useEffect(() => {
    if (!channelId) return;
    loadChannelMembers(channelId);
    const id = window.setInterval(() => loadChannelMembers(channelId), 5_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Load roles when the active server changes (needed for role management).
  useEffect(() => {
    if (activeServerId) loadRoles(activeServerId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId]);

  // Also show peers that haven't announced yet (legacy / offline presence),
  // excluding locally blocked peers.
  const allVisiblePeers = [
    ...membersHere,
    ...peers.filter(
      (p) => p.channel_id === channelId && !membersHere.some((m) => m.peer_id === p.peer_id),
    ),
  ].filter((p) => !blockedPeers.has(p.peer_id));

  const handleStopScreenShare = useCallback(async () => {
    screenStream?.getTracks().forEach((t) => t.stop());
    setScreenStream(null);
    if (screenShareActive) await endScreenShare();
  }, [screenStream, screenShareActive, endScreenShare]);

  async function handleToggleScreenShare() {
    if (screenShareActive || screenStream) {
      await handleStopScreenShare();
    } else if (channelId) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        await beginScreenShare(channelId);
      } catch {
        // User cancelled or permission denied — no error shown.
      }
    }
  }

  async function handleToggleVideo() {
    if (videoActive) {
      await stopVideo();
    } else if (channelId) {
      await startVideo(channelId);
    }
  }

  function handlePeerContextMenu(e: { preventDefault: () => void; clientX: number; clientY: number }, peerId: string) {
    e.preventDefault();
    const displayName =
      peerId === localPeerId
        ? (userProfile?.display_name?.trim() || peerId.slice(0, 12) + "…")
        : peerId.slice(0, 12) + "…";
    setContextMenu({ x: e.clientX, y: e.clientY, peerId, displayName });
  }

  function handleToggleLocalMute(peerId: string) {
    setLocalMutedPeers((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  }

  function handleToggleLocalVideo(peerId: string) {
    setLocalVideoDisabledPeers((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  }

  async function handleKick(peerId: string) {
    if (!activeServerId) return;
    if (!window.confirm(`Remove peer ${peerId.slice(0, 12)}… from the server?`)) return;
    await kickServerMember(activeServerId, peerId);
  }

  function handleBlock(peerId: string) {
    if (!window.confirm(`Block ${peerId.slice(0, 12)}…? They will no longer be visible to you.`)) return;
    blockPeer(peerId);
    setBlockedPeers((prev) => new Set([...prev, peerId]));
  }

  // Build the local user's display name.
  const localDisplayName = userProfile?.display_name?.trim() || (localPeerId ? localPeerId.slice(0, 12) + "…" : "You");

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.icon}>🔊</span>
        <span className={styles.name}>{channel?.name ?? "unknown"}</span>
        {inVoiceChannel && <span className={styles.badge}>LIVE</span>}
      </header>

      {/* Active screen share panel */}
      {screenStream && (
        <ScreenSharePanel stream={screenStream} onStop={handleStopScreenShare} />
      )}

      {/* Connected peers grid */}
      <div className={styles.peerGrid}>
        {/* Local user card — always shown when connected */}
        {inVoiceChannel && (
          <div
            className={`${styles.peerCard} ${styles.peerCardSelf}`}
            onContextMenu={(e) => handlePeerContextMenu(e, localPeerId)}
            title={localPeerId}
          >
            <div className={styles.peerCardTop}>
              <div className={styles.pingIndicator} title={isOwner ? "You are the host" : "Connected"}>
                {isOwner
                  ? <Crown size={12} className={styles.hostIcon} />
                  : <Signal size={12} className={styles.signalIcon} />
                }
              </div>
            </div>
            <div className={clsx(styles.avatar, muted && styles.avatarMuted)}>
              {localDisplayName.slice(0, 2).toUpperCase()}
            </div>
            <p className={styles.peerName}>{localDisplayName}</p>
            <div className={styles.peerBadges}>
              <span className={styles.youBadge}>You</span>
              {isOwner && <span className={styles.hostBadge}>Host</span>}
              {muted && <span className={styles.mutedBadge}>Muted</span>}
              {deafened && <span className={styles.deafenedBadge}>Deafened</span>}
            </div>
          </div>
        )}

        {allVisiblePeers.length === 0 && !inVoiceChannel ? (
          <div className={styles.emptyState}>
            <p>No peers in this channel yet.</p>
            <p className={styles.hint}>Invite someone by sharing your Peer ID.</p>
          </div>
        ) : (
          allVisiblePeers.map((p) => {
            const isLocalMuted = localMutedPeers.has(p.peer_id);
            const isVideoOff = localVideoDisabledPeers.has(p.peer_id);
            return (
              <div
                key={p.peer_id}
                className={clsx(styles.peerCard, isLocalMuted && styles.peerCardMuted)}
                onContextMenu={(e) => handlePeerContextMenu(e, p.peer_id)}
                title={p.peer_id}
              >
                <div className={styles.peerCardTop}>
                  <div className={styles.pingIndicator} title="Connected">
                    <Signal size={12} className={styles.signalIcon} />
                  </div>
                </div>
                <div className={clsx(styles.avatar, isLocalMuted && styles.avatarMuted)}>
                  {p.peer_id.slice(0, 2).toUpperCase()}
                </div>
                <p className={styles.peerName} title={p.peer_id}>
                  {p.peer_id.slice(0, 12)}…
                </p>
                <div className={styles.peerBadges}>
                  {isLocalMuted && <span className={styles.mutedBadge}>Muted</span>}
                  {isVideoOff && <span className={styles.videoOffBadge}>No Video</span>}
                </div>
              </div>
            );
          })
        )}

        {allVisiblePeers.length === 0 && inVoiceChannel && (
          <div className={styles.emptyState}>
            <p>No other peers in this channel yet.</p>
            <p className={styles.hint}>Invite someone by sharing your Peer ID.</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button
          className={clsx(styles.controlBtn, videoActive && styles.controlBtnActive)}
          onClick={handleToggleVideo}
          title={videoActive ? "Stop Video" : "Start Video"}
        >
          {videoActive ? "📹" : "📷"}
        </button>
        <button
          className={clsx(styles.controlBtn, (screenShareActive || !!screenStream) && styles.controlBtnActive)}
          onClick={handleToggleScreenShare}
          title={(screenShareActive || !!screenStream) ? "Stop Screen Share" : "Share Screen"}
        >
          🖥
        </button>
        <button
          className={clsx(styles.controlBtn, muted && styles.controlBtnActive)}
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🎙️"}
        </button>
        <button
          className={clsx(styles.controlBtn, deafened && styles.controlBtnActive)}
          onClick={toggleDeafen}
          title={deafened ? "Undeafen" : "Deafen"}
        >
          {deafened ? "🔕" : "🔔"}
        </button>
        <button
          className={clsx(styles.controlBtn, styles.controlBtnDanger)}
          onClick={leaveVoice}
          title="Disconnect"
        >
          📵
        </button>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <PeerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          peerId={contextMenu.peerId}
          displayName={contextMenu.displayName}
          isOwner={isOwner && contextMenu.peerId !== localPeerId}
          isMuted={localMutedPeers.has(contextMenu.peerId)}
          isVideoDisabled={localVideoDisabledPeers.has(contextMenu.peerId)}
          onClose={() => setContextMenu(null)}
          onManageRoles={() => setRolesTarget(contextMenu.peerId)}
          onKick={() => handleKick(contextMenu.peerId)}
          onToggleMute={() => handleToggleLocalMute(contextMenu.peerId)}
          onToggleVideo={() => handleToggleLocalVideo(contextMenu.peerId)}
          onBlock={() => handleBlock(contextMenu.peerId)}
        />
      )}

      {/* Inline role management panel */}
      {rolesTarget && activeServerId && (
        <RolePanel
          serverId={activeServerId}
          peerId={rolesTarget}
          roles={serverRoles[activeServerId] ?? []}
          onClose={() => setRolesTarget(null)}
        />
      )}
    </div>
  );
}
