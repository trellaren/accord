import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./Modal.module.css";
import memberStyles from "./ServerMembersModal.module.css";

interface Props {
  serverId: string;
  onClose: () => void;
}

export function ServerMembersModal({ serverId, onClose }: Props) {
  const { loadServerMembers, kickServerMember, localPeerId, servers } = useAppStore();
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const server = servers.find((s) => s.id === serverId);
  const isOwner = server?.owner_peer_id === localPeerId;

  useEffect(() => {
    loadServerMembers(serverId)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [serverId, loadServerMembers]);

  async function handleKick(peerId: string) {
    if (!window.confirm(`Remove peer ${peerId.slice(0, 12)}…?`)) return;
    await kickServerMember(serverId, peerId);
    setMembers((prev) => prev.filter((p) => p !== peerId));
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Server Members</h2>
        {loading ? (
          <p className={styles.subtitle}>Loading…</p>
        ) : (
          <ul className={memberStyles.list}>
            {members.map((peerId) => (
              <li key={peerId} className={memberStyles.item}>
                <span className={memberStyles.avatar}>
                  {peerId.slice(0, 2).toUpperCase()}
                </span>
                <span className={memberStyles.peerId} title={peerId}>
                  {peerId === localPeerId ? "You" : peerId.slice(0, 20) + "…"}
                </span>
                {peerId === server?.owner_peer_id && (
                  <span className={memberStyles.ownerBadge}>Owner</span>
                )}
                {isOwner && peerId !== localPeerId && (
                  <button
                    className={memberStyles.kickBtn}
                    onClick={() => handleKick(peerId)}
                    title="Remove from server"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
            {members.length === 0 && (
              <p className={styles.subtitle}>No members yet.</p>
            )}
          </ul>
        )}
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
