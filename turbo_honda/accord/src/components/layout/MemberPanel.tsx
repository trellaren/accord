import { Wifi, WifiOff, MapPin } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./MemberPanel.module.css";

export function MemberPanel() {
  const { peers, servers, activeServerId } = useAppStore();

  const activeServer = servers.find((s) => s.id === activeServerId);
  const connected = peers.filter((p) => p.connected);
  const offline = peers.filter((p) => !p.connected);

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>
          {activeServer ? `${activeServer.name} — Members` : "Members"}
        </span>
      </div>

      <div className={styles.list}>
        {connected.length > 0 && (
          <div className={styles.group}>
            <p className={styles.groupLabel}>Online — {connected.length}</p>
            {connected.map((p) => (
              <div key={p.peer_id} className={styles.member}>
                <div className={styles.avatar}>{p.peer_id.slice(0, 2).toUpperCase()}</div>
                <div className={styles.info}>
                  <span className={styles.name} title={p.peer_id}>
                    {p.peer_id.slice(0, 10)}…
                  </span>
                  {p.channel_id && (
                    <span className={styles.channelTag}>
                      <MapPin size={10} />
                      In channel
                    </span>
                  )}
                </div>
                <span className={styles.statusOnline} aria-label="Connected"><Wifi size={14} /></span>
              </div>
            ))}
          </div>
        )}

        {offline.length > 0 && (
          <div className={styles.group}>
            <p className={styles.groupLabel}>Offline — {offline.length}</p>
            {offline.map((p) => (
              <div key={p.peer_id} className={`${styles.member} ${styles.memberOffline}`}>
                <div className={`${styles.avatar} ${styles.avatarOffline}`}>
                  {p.peer_id.slice(0, 2).toUpperCase()}
                </div>
                <div className={styles.info}>
                  <span className={styles.name} title={p.peer_id}>
                    {p.peer_id.slice(0, 10)}…
                  </span>
                </div>
                <span className={styles.statusOffline} aria-label="Disconnected"><WifiOff size={14} /></span>
              </div>
            ))}
          </div>
        )}

        {peers.length === 0 && (
          <p className={styles.empty}>No peers discovered yet.</p>
        )}
      </div>
    </aside>
  );
}
