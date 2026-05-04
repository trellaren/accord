import { useAppStore } from "../../store/useAppStore";
import styles from "./VoiceStatusBar.module.css";

/**
 * Persistent bar shown at the bottom of the layout while the local user is
 * connected to a voice channel.  Displays the channel name, connected peers,
 * and a quick-disconnect button.
 */
export function VoiceStatusBar() {
  const {
    inVoiceChannel,
    voiceChannelId,
    channels,
    channelMembers,
    peers,
    localPeerId,
    leaveVoice,
    muted,
    deafened,
    toggleMute,
    toggleDeafen,
  } = useAppStore();

  if (!inVoiceChannel || !voiceChannelId) return null;

  const channel = channels.find((c) => c.id === voiceChannelId);
  const membersHere = channelMembers[voiceChannelId] ?? [];
  const allPeers = [
    ...membersHere,
    ...peers.filter(
      (p) => p.channel_id === voiceChannelId && !membersHere.some((m) => m.peer_id === p.peer_id),
    ),
  ];

  return (
    <div className={styles.bar}>
      <div className={styles.channelInfo}>
        <span className={styles.icon}>🔊</span>
        <span className={styles.channelName}>{channel?.name ?? "Voice"}</span>
        <span className={styles.liveBadge}>LIVE</span>
      </div>

      <div className={styles.peerList}>
        {/* Always show the local user first */}
        <div className={styles.peerChip} title={localPeerId}>
          <div className={styles.peerAvatar}>
            {localPeerId.slice(0, 2).toUpperCase()}
          </div>
          <span className={styles.peerLabel}>You</span>
        </div>

        {allPeers.map((p) => (
          <div key={p.peer_id} className={styles.peerChip} title={p.peer_id}>
            <div className={styles.peerAvatar}>
              {p.peer_id.slice(0, 2).toUpperCase()}
            </div>
            <span className={styles.peerLabel}>{p.peer_id.slice(0, 8)}…</span>
          </div>
        ))}
      </div>

      <div className={styles.controls}>
        <button
          className={`${styles.controlBtn} ${muted ? styles.controlBtnActive : ""}`}
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? "🔇" : "🎙️"}
        </button>
        <button
          className={`${styles.controlBtn} ${deafened ? styles.controlBtnActive : ""}`}
          onClick={toggleDeafen}
          title={deafened ? "Undeafen" : "Deafen"}
        >
          {deafened ? "🔕" : "🔔"}
        </button>
        <button
          className={`${styles.controlBtn} ${styles.controlBtnDanger}`}
          onClick={leaveVoice}
          title="Disconnect from voice"
        >
          📵
        </button>
      </div>
    </div>
  );
}
