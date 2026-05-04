import { useEffect, useRef, useState, useCallback } from "react";
import { X, Trash2 } from "lucide-react";
import { LogEntry, getLogs } from "../../lib/tauri";
import styles from "./DebugWindow.module.css";

const POLL_INTERVAL_MS = 2_000;

const ALL_LEVELS = ["ERROR", "WARN", "INFO", "DEBUG", "TRACE"] as const;
type LogLevel = (typeof ALL_LEVELS)[number];

/** Map a level string to a CSS class for colouring. */
function levelClass(level: string): string {
  switch (level) {
    case "ERROR": return styles.levelERROR;
    case "WARN":  return styles.levelWARN;
    case "INFO":  return styles.levelINFO;
    case "DEBUG": return styles.levelDEBUG;
    default:      return styles.levelTRACE;
  }
}

/** Format an ISO-8601 timestamp as HH:MM:SS. */
function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

interface Props {
  onClose: () => void;
}

export function DebugWindow({ onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel>("DEBUG");
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch logs from the backend.
  const refresh = useCallback(async () => {
    try {
      const logs = await getLogs();
      setEntries(logs);
    } catch {
      // Backend unavailable (e.g. browser dev-server) – ignore silently.
    }
  }, []);

  // Initial fetch + periodic poll.
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Auto-scroll to bottom when new entries arrive.
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Determine the minimum numeric level index to show.
  const minIdx = ALL_LEVELS.indexOf(filter);
  const visible = entries.filter((e) => {
    const idx = ALL_LEVELS.indexOf(e.level as LogLevel);
    return idx !== -1 && idx <= minIdx;
  });

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.window} role="dialog" aria-label="Debug Log Viewer">
        {/* Title bar */}
        <div className={styles.titleBar}>
          <span className={styles.title}>Debug Logs</span>
          <div className={styles.controls}>
            <select
              className={styles.levelSelect}
              value={filter}
              onChange={(e) => setFilter(e.target.value as LogLevel)}
              title="Minimum log level"
            >
              {ALL_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button
              className={styles.clearBtn}
              onClick={() => setEntries([])}
              title="Clear log view"
            >
              <Trash2 size={13} />
            </button>
            <button
              className={styles.closeBtn}
              onClick={onClose}
              title="Close debug window"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Log entries */}
        <div className={styles.logList} ref={listRef}>
          {visible.length === 0 ? (
            <div style={{ padding: "16px", color: "var(--text-muted)", fontSize: 12 }}>
              No log entries yet.
            </div>
          ) : (
            visible.map((e, i) => (
              <div key={`${e.timestamp}-${i}`} className={styles.logEntry}>
                <span className={styles.ts}>{fmtTime(e.timestamp)}</span>
                <span className={`${styles.level} ${levelClass(e.level)}`}>{e.level}</span>
                <span className={styles.msg}>{e.message}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <label className={styles.autoScrollLabel}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <span className={styles.count}>{visible.length} / {entries.length} entries</span>
        </div>
      </div>
    </div>
  );
}
