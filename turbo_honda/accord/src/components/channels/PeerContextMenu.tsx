import { useEffect, useRef } from "react";
import { Shield, UserX, MicOff, VideoOff, Ban } from "lucide-react";
import styles from "./PeerContextMenu.module.css";

interface Props {
  x: number;
  y: number;
  peerId: string;
  displayName: string;
  /** Whether the local user is the server owner (shows admin actions). */
  isOwner: boolean;
  /** Whether this peer is currently locally muted. */
  isMuted: boolean;
  /** Whether this peer's video is locally disabled. */
  isVideoDisabled: boolean;
  onClose: () => void;
  onManageRoles: () => void;
  onKick: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onBlock: () => void;
}

export function PeerContextMenu({
  x,
  y,
  displayName,
  isOwner,
  isMuted,
  isVideoDisabled,
  onClose,
  onManageRoles,
  onKick,
  onToggleMute,
  onToggleVideo,
  onBlock,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ top: y, left: x }}
      role="menu"
      aria-label={`${displayName} options`}
    >
      <div className={styles.header}>{displayName}</div>

      {isOwner && (
        <button
          className={styles.item}
          onClick={() => { onManageRoles(); onClose(); }}
          role="menuitem"
        >
          <Shield size={14} />
          Manage Roles
        </button>
      )}

      <button
        className={styles.item}
        onClick={() => { onToggleMute(); onClose(); }}
        role="menuitem"
      >
        <MicOff size={14} />
        {isMuted ? "Unmute" : "Mute"}
      </button>

      <button
        className={styles.item}
        onClick={() => { onToggleVideo(); onClose(); }}
        role="menuitem"
      >
        <VideoOff size={14} />
        {isVideoDisabled ? "Enable Video" : "Disable Video"}
      </button>

      {isOwner && (
        <button
          className={`${styles.item} ${styles.danger}`}
          onClick={() => { onKick(); onClose(); }}
          role="menuitem"
        >
          <UserX size={14} />
          Kick from Server
        </button>
      )}

      <button
        className={`${styles.item} ${styles.danger}`}
        onClick={() => { onBlock(); onClose(); }}
        role="menuitem"
      >
        <Ban size={14} />
        Block
      </button>
    </div>
  );
}
