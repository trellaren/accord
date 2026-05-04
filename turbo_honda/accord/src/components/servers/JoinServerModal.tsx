import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./Modal.module.css";

interface Props {
  onClose: () => void;
}

/** Detect whether the user has pasted a full join string (invite_code|server_id|peer_addr|name). */
function isFullJoinString(value: string): boolean {
  return value.includes("|");
}

export function JoinServerModal({ onClose }: Props) {
  const { joinExistingServer, loadChannels } = useAppStore();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const full = isFullJoinString(code);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Full join strings are case-sensitive; plain invite codes are uppercased.
    const value = full ? code.trim() : code.trim().toUpperCase();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      await joinExistingServer(value);
      const { activeServerId } = useAppStore.getState();
      if (activeServerId) await loadChannels(activeServerId);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Join a Server</h2>
        <p className={styles.subtitle}>
          Enter an 8-character invite code, or paste a full join string (from
          the server owner's invite modal) which includes the server address.
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            {full ? "Full Join String" : "Invite Code"}
          </label>
          <input
            className={styles.input}
            placeholder="E.g. AB12CD34  or  AB12CD34|server-id|/ip4/…|Server Name"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            disabled={loading}
            style={full ? undefined : { textTransform: "uppercase", letterSpacing: "0.1em" }}
          />
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={loading || !code.trim()}
            >
              {loading ? "Joining…" : "Join"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
