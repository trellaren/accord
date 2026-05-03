import { useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAppStore } from "../../store/useAppStore";
import { ChannelInfo } from "../../lib/tauri";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const { channels, activeChannelId, selectChannel, addChannel, peers, discoverPeers } =
    useAppStore();
  const navigate = useNavigate();
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelKind, setNewChannelKind] = useState<"text" | "voice" | "video">("text");

  const textChannels = channels.filter((c) => c.kind === "text");
  const voiceChannels = channels.filter((c) => c.kind === "voice");
  const videoChannels = channels.filter((c) => c.kind === "video");

  function handleSelect(channel: ChannelInfo) {
    selectChannel(channel.id);
    navigate(`/channels/${channel.id}/${channel.kind}`);
  }

  async function handleAddChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    await addChannel(newChannelName.trim(), newChannelKind);
    setNewChannelName("");
    setShowAddChannel(false);
  }

  return (
    <aside className={styles.sidebar}>
      {/* Server / app header */}
      <div className={styles.header}>
        <span className={styles.logo}>⚡</span>
        <span className={styles.serverName}>Accord</span>
      </div>

      {/* Channel sections */}
      <nav className={styles.channels}>
        <ChannelSection
          title="Text Channels"
          channels={textChannels}
          activeId={activeChannelId}
          peers={peers}
          onSelect={handleSelect}
        />
        <ChannelSection
          title="Voice Channels"
          channels={voiceChannels}
          activeId={activeChannelId}
          peers={peers}
          onSelect={handleSelect}
        />
        <ChannelSection
          title="Video Channels"
          channels={videoChannels}
          activeId={activeChannelId}
          peers={peers}
          onSelect={handleSelect}
        />

        {/* Add channel */}
        <div className={styles.sectionHeader}>
          <span>Add Channel</span>
          <button
            className={styles.addBtn}
            onClick={() => setShowAddChannel((v) => !v)}
            aria-label="Add channel"
          >
            {showAddChannel ? "−" : "+"}
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
                setNewChannelKind(e.target.value as "text" | "voice" | "video")
              }
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
              <option value="video">Video</option>
            </select>
            <button className={styles.submitBtn} type="submit">
              Create
            </button>
          </form>
        )}
      </nav>

      {/* Peer list (peers not in any channel) */}
      <div className={styles.peerSection}>
        <div className={styles.sectionHeader}>
          <span>Peers ({peers.length})</span>
          <button
            className={styles.addBtn}
            onClick={discoverPeers}
            title="Discover peers on local network"
          >
            ↺
          </button>
        </div>
        {peers.map((p) => (
          <div key={p.peer_id} className={styles.peer}>
            <span className={clsx(styles.peerDot, p.connected && styles.peerDotOnline)} />
            <span className={styles.peerName} title={p.peer_id}>
              {p.peer_id.slice(0, 10)}…
            </span>
            {p.channel_id && (
              <span className={styles.peerChannel} title={`In channel ${p.channel_id}`}>
                📍
              </span>
            )}
          </div>
        ))}
        {peers.length === 0 && (
          <p className={styles.noPeers}>No peers yet. Click ↺ to discover.</p>
        )}
      </div>
    </aside>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────

import { PeerInfo } from "../../lib/tauri";

interface ChannelSectionProps {
  title: string;
  channels: ChannelInfo[];
  activeId: string | null;
  peers: PeerInfo[];
  onSelect: (c: ChannelInfo) => void;
}

function ChannelSection({ title, channels, activeId, peers, onSelect }: ChannelSectionProps) {
  const icon: Record<string, string> = { text: "#", voice: "🔊", video: "📹" };
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{title}</p>
      {channels.map((c) => {
        const membersHere = peers.filter((p) => p.channel_id === c.id);
        return (
          <div key={c.id}>
            <button
              className={clsx(styles.channelBtn, c.id === activeId && styles.channelBtnActive)}
              onClick={() => onSelect(c)}
            >
              <span className={styles.channelIcon}>{icon[c.kind] ?? "#"}</span>
              <span>{c.name}</span>
            </button>
            {/* Show peers currently active in this channel */}
            {membersHere.map((p) => (
              <div key={p.peer_id} className={styles.channelMember}>
                <span className={styles.memberDot} />
                <span className={styles.memberName} title={p.peer_id}>
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
