import { useState } from "react";
import styles from "./Modal.module.css";

interface Props {
  serverName: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DeleteServerModal({ serverName, onConfirm, onClose }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = input === serverName;

  async function handleDelete() {
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
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
        <h2 className={styles.title}>Delete Server</h2>
        <p className={styles.subtitle}>
          This action is permanent. All channels and messages in{" "}
          <strong>{serverName}</strong> will be deleted.
        </p>
        <div className={styles.form}>
          <label className={styles.label}>
            Type <strong>{serverName}</strong> to confirm
          </label>
          <input
            className={styles.input}
            placeholder={serverName}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            disabled={loading}
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>
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
            type="button"
            className={styles.btnDanger}
            onClick={handleDelete}
            disabled={!confirmed || loading}
          >
            {loading ? "Deleting…" : "Delete Server"}
          </button>
        </div>
      </div>
    </div>
  );
}
