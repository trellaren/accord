import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./Modal.module.css";

interface Props {
  serverId: string;
  onClose: () => void;
}

export function InviteCodeModal({ serverId, onClose }: Props) {
  const { getInviteCode } = useAppStore();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getInviteCode(serverId).then(setCode).catch(() => setCode(null));
  }, [serverId, getInviteCode]);

  async function handleCopy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Invite Code</h2>
        <p className={styles.subtitle}>
          Share this code with people you want to invite to your server.
        </p>
        <div className={styles.codeBox}>
          <code className={styles.code}>{code ?? "…"}</code>
          <button
            className={styles.btnSecondary}
            onClick={handleCopy}
            disabled={!code}
          >
            {copied ? "✓ Copied!" : "Copy"}
          </button>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
