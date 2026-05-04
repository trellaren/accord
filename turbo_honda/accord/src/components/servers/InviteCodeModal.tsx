import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { getLocalPeerAddress } from "../../lib/tauri";
import styles from "./Modal.module.css";

interface Props {
  serverId: string;
  onClose: () => void;
}

export function InviteCodeModal({ serverId, onClose }: Props) {
  const { getInviteCode, servers } = useAppStore();
  const [code, setCode] = useState<string | null>(null);
  const [peerAddresses, setPeerAddresses] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const activeServer = servers.find((s) => s.id === serverId);

  useEffect(() => {
    getInviteCode(serverId).then(setCode).catch(() => setCode(null));
    getLocalPeerAddress().then(setPeerAddresses).catch(() => setPeerAddresses([]));
  }, [serverId, getInviteCode]);

  async function handleCopy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  /** Build a full join string for the given peer address. */
  function buildFullJoinString(peerAddr: string): string {
    return `${code}|${serverId}|${peerAddr}|${activeServer?.name ?? ""}`;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Invite Code</h2>
        <p className={styles.subtitle}>
          Share this code with people you want to invite to your server.
        </p>

        {/* Short invite code */}
        <div className={styles.codeBox}>
          <code className={styles.code}>{code ?? "…"}</code>
          <button
            className={styles.btnSecondary}
            onClick={() => code && handleCopy(code, "code")}
            disabled={!code}
          >
            {copied === "code" ? "✓ Copied!" : "Copy"}
          </button>
        </div>

        {/* Full join strings (one per listen address) */}
        {peerAddresses.length > 0 && code && (
          <>
            <p className={styles.label} style={{ marginTop: 8 }}>
              Full Join Strings (include server address)
            </p>
            <p className={styles.subtitle} style={{ marginTop: -8, fontSize: 12 }}>
              Share one of these so the recipient can connect directly without needing
              to be on the same network.
            </p>
            {peerAddresses.map((addr) => {
              const joinStr = buildFullJoinString(addr);
              const key = `addr-${addr}`;
              return (
                <div key={addr} className={styles.codeBox} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <code
                    className={styles.code}
                    style={{ fontSize: 11, wordBreak: "break-all", letterSpacing: 0 }}
                  >
                    {joinStr}
                  </code>
                  <button
                    className={styles.btnSecondary}
                    style={{ alignSelf: "flex-end" }}
                    onClick={() => handleCopy(joinStr, key)}
                  >
                    {copied === key ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
              );
            })}
          </>
        )}

        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
