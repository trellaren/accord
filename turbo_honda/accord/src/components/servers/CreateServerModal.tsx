import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./Modal.module.css";

interface Props {
  onClose: () => void;
}

export function CreateServerModal({ onClose }: Props) {
  const { createNewServer, loadChannels } = useAppStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      await createNewServer(trimmed);
      // Reload channels for the new (now active) server.
      const { activeServerId: newId } = useAppStore.getState();
      if (newId) await loadChannels(newId);
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
        <h2 className={styles.title}>Create a Server</h2>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Server Name</label>
          <input
            className={styles.input}
            placeholder="My awesome server"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            disabled={loading}
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
              disabled={loading || !name.trim()}
            >
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
