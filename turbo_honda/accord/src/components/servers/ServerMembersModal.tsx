import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./Modal.module.css";
import memberStyles from "./ServerMembersModal.module.css";

interface Props {
  serverId: string;
  onClose: () => void;
}

export function ServerMembersModal({ serverId, onClose }: Props) {
  const { loadServerMembers, kickServerMember, localPeerId, servers, invitePeer } = useAppStore();
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [peerAddress, setPeerAddress] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const addr = peerAddress.trim();
    if (!addr) return;
    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      await invitePeer(addr, serverId);
      setInviteSuccess(true);
      setPeerAddress("");
    } catch (err) {
      setInviteError(String(err));
    } finally {
      setInviteLoading(false);
    }
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

        {isOwner && (
          <form onSubmit={handleInvite} className={styles.form}>
            <label className={styles.label}>Invite by peer address</label>
            <input
              className={styles.input}
              placeholder="/ip4/192.168.1.5/tcp/4001"
              value={peerAddress}
              onChange={(e) => setPeerAddress(e.target.value)}
              disabled={inviteLoading}
            />
            {inviteError && <p className={styles.error}>{inviteError}</p>}
            {inviteSuccess && (
              <p className={memberStyles.inviteSuccess}>
                Invite sent! They will join automatically once connected.
              </p>
            )}
            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={inviteLoading || !peerAddress.trim()}
              >
                {inviteLoading ? "Inviting…" : "Invite"}
              </button>
            </div>
          </form>
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
