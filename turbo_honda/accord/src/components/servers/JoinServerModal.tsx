import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./Modal.module.css";

interface Props {
  onClose: () => void;
}

export function JoinServerModal({ onClose }: Props) {
  const { joinExistingServer, loadChannels } = useAppStore();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await joinExistingServer(trimmed);
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
        <p className={styles.subtitle}>Enter the invite code shared by the server owner.</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Invite Code</label>
          <input
            className={styles.input}
            placeholder="E.g. AB12CD34"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            disabled={loading}
            maxLength={8}
            style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
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
