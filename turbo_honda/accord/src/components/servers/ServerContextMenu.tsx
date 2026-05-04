import { useEffect, useRef } from "react";
import { LogOut, Trash2, Unplug } from "lucide-react";
import styles from "./ServerContextMenu.module.css";

interface Props {
  x: number;
  y: number;
  serverId: string;
  serverName: string;
  isOwner: boolean;
  onClose: () => void;
  onDisconnect: () => void;
  onLeave: () => void;
  onDelete: () => void;
}

export function ServerContextMenu({
  x,
  y,
  serverName,
  isOwner,
  onClose,
  onDisconnect,
  onLeave,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside
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
      aria-label={`${serverName} options`}
    >
      <div className={styles.header}>{serverName}</div>

      <button
        className={styles.item}
        onClick={() => { onDisconnect(); onClose(); }}
        role="menuitem"
      >
        <Unplug size={14} />
        Disconnect
      </button>

      {!isOwner && (
        <button
          className={`${styles.item} ${styles.danger}`}
          onClick={() => { onLeave(); onClose(); }}
          role="menuitem"
        >
          <LogOut size={14} />
          Leave Server
        </button>
      )}

      {isOwner && (
        <button
          className={`${styles.item} ${styles.danger}`}
          onClick={() => { onDelete(); onClose(); }}
          role="menuitem"
        >
          <Trash2 size={14} />
          Delete Server
        </button>
      )}
    </div>
  );
}
