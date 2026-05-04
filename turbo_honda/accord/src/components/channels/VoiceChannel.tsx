import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import clsx from "clsx";
import { useAppStore } from "../../store/useAppStore";
import { ScreenSharePanel } from "./ScreenSharePanel";
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
  } = useAppStore();

  const channel = channels.find((c) => c.id === channelId);

  // Local screen-share MediaStream (captured in the browser).
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

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
    </div>
  );
}
