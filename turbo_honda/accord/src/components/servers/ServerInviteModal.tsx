import { useState } from "react";
import { ServerInvitePayload } from "../../lib/tauri";
import { useAppStore } from "../../store/useAppStore";
import styles from "./Modal.module.css";
import notifStyles from "./ServerInviteModal.module.css";

interface Props {
  invites: ServerInvitePayload[];
}

export function ServerInviteModal({ invites }: Props) {
  const { acceptInvite, dismissInvite } = useAppStore();
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (invites.length === 0) return null;

  // Show the first queued invite; the rest will follow once this one is handled.
  const invite = invites[0];

  async function handleAccept() {
    setLoadingCode(invite.invite_code);
    setErrors((prev) => ({ ...prev, [invite.invite_code]: "" }));
    try {
      await acceptInvite(invite);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [invite.invite_code]: String(err),
      }));
    } finally {
      setLoadingCode(null);
    }
  }

  function handleDecline() {
    dismissInvite(invite.invite_code);
  }

  const isLoading = loadingCode === invite.invite_code;
  const error = errors[invite.invite_code];

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Server Invitation</h2>
        <p className={styles.subtitle}>
          You have been invited to join a server.
        </p>

        <div className={notifStyles.inviteCard}>
          <div className={notifStyles.serverName}>{invite.server_name}</div>
          <div className={notifStyles.fromPeer}>
            Invited by:{" "}
            <span className={notifStyles.peerId}>
              {invite.from_peer_id.slice(0, 16)}…
            </span>
          </div>
          {invites.length > 1 && (
            <div className={notifStyles.queueNote}>
              +{invites.length - 1} more invitation{invites.length > 2 ? "s" : ""} waiting
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleDecline}
            disabled={isLoading}
          >
            Decline
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleAccept}
            disabled={isLoading}
          >
            {isLoading ? "Joining…" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}
