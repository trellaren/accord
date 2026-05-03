import { useEffect } from "react";
import { useParams } from "react-router-dom";
import clsx from "clsx";
import { useAppStore } from "../../store/useAppStore";
import styles from "./VideoChannel.module.css";

export function VideoChannel() {
  const { channelId } = useParams<{ channelId: string }>();
  const {
    channels,
    peers,
    channelMembers,
    loadChannelMembers,
    videoActive,
    muted,
    deafened,
    startVideo,
    stopVideo,
    toggleMute,
    toggleDeafen,
  } = useAppStore();

  const channel = channels.find((c) => c.id === channelId);

  // Members in this specific channel (remote peers that announced their presence).
  const membersHere = channelId ? (channelMembers[channelId] ?? []) : [];

  // Also include peers whose channel_id matches (legacy / pre-announcement fallback).
  const allVisiblePeers = [
    ...membersHere,
    ...peers.filter(
      (p) => p.channel_id === channelId && !membersHere.some((m) => m.peer_id === p.peer_id),
    ),
  ];

  // Periodically refresh the member list for this channel.
  useEffect(() => {
    if (!channelId) return;
    loadChannelMembers(channelId);
    const id = window.setInterval(() => loadChannelMembers(channelId), 5_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    return () => {
      if (videoActive) stopVideo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleVideo() {
    if (videoActive) {
      await stopVideo();
    } else if (channelId) {
      await startVideo(channelId);
    }
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.icon}>📹</span>
        <span className={styles.name}>{channel?.name ?? "unknown"}</span>
        {videoActive && <span className={styles.badge}>STREAMING</span>}
      </header>

      {/* Video grid – each peer gets a tile */}
      <div className={styles.videoGrid}>
        {/* Local preview tile */}
        <div className={clsx(styles.videoTile, styles.localTile)}>
          <div className={styles.videoPlaceholder}>
            {videoActive ? (
              <span className={styles.placeholderIcon}>📹</span>
            ) : (
              <span className={styles.placeholderIcon}>🚫</span>
            )}
          </div>
          <p className={styles.tileLabel}>You</p>
        </div>

        {/* Remote peer tiles */}
        {allVisiblePeers.map((p) => (
          <div key={p.peer_id} className={styles.videoTile}>
            <div className={styles.videoPlaceholder}>
              {/* TODO: render actual remote stream in a <video> element */}
              <span className={styles.placeholderIcon}>👤</span>
            </div>
            <p className={styles.tileLabel} title={p.peer_id}>
              {p.peer_id.slice(0, 12)}…
            </p>
          </div>
        ))}

        {allVisiblePeers.length === 0 && (
          <div className={styles.emptyState}>
            <p>No peers in this channel yet.</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button
          className={clsx(
            styles.controlBtn,
            videoActive && styles.controlBtnActive
          )}
          onClick={handleToggleVideo}
          title={videoActive ? "Stop Video" : "Start Video"}
        >
          {videoActive ? "📹" : "📷"}
        </button>
        <button
          className={clsx(styles.controlBtn, muted && styles.controlBtnWarn)}
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🎙️"}
        </button>
        <button
          className={clsx(styles.controlBtn, deafened && styles.controlBtnWarn)}
          onClick={toggleDeafen}
          title={deafened ? "Undeafen" : "Deafen"}
        >
          {deafened ? "🔕" : "🔔"}
        </button>
        <button
          className={clsx(styles.controlBtn, styles.controlBtnDanger)}
          onClick={stopVideo}
          title="Leave"
        >
          📵
        </button>
      </div>
    </div>
  );
}
