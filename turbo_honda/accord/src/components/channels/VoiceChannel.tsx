import { useEffect } from "react";
import { useParams } from "react-router-dom";
import clsx from "clsx";
import { useAppStore } from "../../store/useAppStore";
import styles from "./VoiceChannel.module.css";

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
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
  } = useAppStore();

  const channel = channels.find((c) => c.id === channelId);

  // Members in this specific channel (remote peers that announced their presence)
  const membersHere = channelId ? (channelMembers[channelId] ?? []) : [];

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

  // Also show peers that haven't announced yet (legacy / offline presence).
  const allVisiblePeers = [
    ...membersHere,
    ...peers.filter(
      (p) => p.channel_id === channelId && !membersHere.some((m) => m.peer_id === p.peer_id),
    ),
  ];

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.icon}>🔊</span>
        <span className={styles.name}>{channel?.name ?? "unknown"}</span>
        {inVoiceChannel && <span className={styles.badge}>LIVE</span>}
      </header>

      {/* Connected peers grid */}
      <div className={styles.peerGrid}>
        {allVisiblePeers.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No peers in this channel yet.</p>
            <p className={styles.hint}>Invite someone by sharing your Peer ID.</p>
          </div>
        ) : (
          allVisiblePeers.map((p) => (
            <div key={p.peer_id} className={styles.peerCard}>
              <div className={styles.avatar}>{p.peer_id.slice(0, 2).toUpperCase()}</div>
              <p className={styles.peerName} title={p.peer_id}>
                {p.peer_id.slice(0, 12)}…
              </p>
            </div>
          ))
        )}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
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
    </div>
  );
}
