import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { ChannelPermission, Permission } from "../../lib/tauri";
import styles from "./ChannelPermissionsModal.module.css";
import modalStyles from "./Modal.module.css";

interface Props {
  channelId: string;
  channelName: string;
  serverId: string;
  onClose: () => void;
}

const PERMISSION_FLAGS = [
  { flag: Permission.VIEW_CHANNEL, label: "View Channel" },
  { flag: Permission.SEND_MESSAGES, label: "Send Messages" },
  { flag: Permission.JOIN_VOICE, label: "Join Voice" },
  { flag: Permission.INVITE_USERS, label: "Invite Users" },
  { flag: Permission.DELETE_MESSAGES, label: "Delete Messages" },
] as const;

type PermState = "inherit" | "allow" | "deny";

/** Convert allow/deny bitmasks to per-flag PermState records. */
function toPermStates(allow: number, deny: number): Record<number, PermState> {
  const result: Record<number, PermState> = {};
  for (const { flag } of PERMISSION_FLAGS) {
    if (allow & flag) result[flag] = "allow";
    else if (deny & flag) result[flag] = "deny";
    else result[flag] = "inherit";
  }
  return result;
}

/** Convert per-flag PermState records back to allow/deny bitmasks. */
function fromPermStates(states: Record<number, PermState>): { allow: number; deny: number } {
  let allow = 0;
  let deny = 0;
  for (const { flag } of PERMISSION_FLAGS) {
    if (states[flag] === "allow") allow |= flag;
    else if (states[flag] === "deny") deny |= flag;
  }
  return { allow, deny };
}

export function ChannelPermissionsModal({
  channelId,
  channelName,
  serverId,
  onClose,
}: Props) {
  const { serverRoles, channelPermissions, loadRoles, loadChannelPermissions, saveChannelPermission } =
    useAppStore();

  const roles = serverRoles[serverId] ?? [];
  const perms = channelPermissions[channelId] ?? [];

  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [permStates, setPermStates] = useState<Record<number, PermState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadRoles(serverId).catch(() => {});
    loadChannelPermissions(channelId).catch(() => {});
  }, [serverId, channelId, loadRoles, loadChannelPermissions]);

  // Populate form when a role is selected.
  useEffect(() => {
    if (!selectedRoleId) {
      setPermStates({});
      return;
    }
    const existing: ChannelPermission | undefined = perms.find(
      (p) => p.role_id === selectedRoleId,
    );
    setPermStates(toPermStates(existing?.allow ?? 0, existing?.deny ?? 0));
  }, [selectedRoleId, perms]);

  function cycleState(flag: number) {
    setPermStates((prev) => {
      const current: PermState = prev[flag] ?? "inherit";
      const next: PermState =
        current === "inherit" ? "allow" : current === "allow" ? "deny" : "inherit";
      return { ...prev, [flag]: next };
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoleId) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    const { allow, deny } = fromPermStates(permStates);
    try {
      await saveChannelPermission(channelId, selectedRoleId, allow, deny);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const stateIcon: Record<PermState, string> = {
    inherit: "—",
    allow: "✓",
    deny: "✕",
  };

  const stateColor: Record<PermState, string> = {
    inherit: "var(--text-muted)",
    allow: "var(--success)",
    deny: "var(--danger)",
  };

  return (
    <div className={modalStyles.overlay} onClick={onClose}>
      <div className={`${modalStyles.modal} ${styles.wide}`} onClick={(e) => e.stopPropagation()}>
        <h2 className={modalStyles.title}>Channel Permissions</h2>
        <p className={modalStyles.subtitle}>#{channelName}</p>

        {roles.length === 0 ? (
          <p className={modalStyles.subtitle}>
            No roles defined for this server yet. Create roles in Server Settings → Roles.
          </p>
        ) : (
          <form onSubmit={handleSave} className={styles.form}>
            <div className={styles.field}>
              <label className={modalStyles.label}>Role</label>
              <select
                className={modalStyles.input}
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                disabled={loading}
              >
                <option value="">— Select a role —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedRoleId && (
              <>
                <p className={styles.hint}>
                  Click to cycle: <strong>— inherit</strong> → <strong style={{ color: "var(--success)" }}>✓ allow</strong> → <strong style={{ color: "var(--danger)" }}>✕ deny</strong>
                </p>
                <div className={styles.permList}>
                  {PERMISSION_FLAGS.map(({ flag, label }) => {
                    const state: PermState = permStates[flag] ?? "inherit";
                    return (
                      <button
                        key={flag}
                        type="button"
                        className={styles.permRow}
                        onClick={() => cycleState(flag)}
                        disabled={loading}
                      >
                        <span
                          className={styles.permIcon}
                          style={{ color: stateColor[state] }}
                        >
                          {stateIcon[state]}
                        </span>
                        <span className={styles.permLabel}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {error && <p className={modalStyles.error}>{error}</p>}
            {saved && <p className={styles.success}>✓ Saved!</p>}

            <div className={modalStyles.actions}>
              <button
                type="button"
                className={modalStyles.btnSecondary}
                onClick={onClose}
                disabled={loading}
              >
                Close
              </button>
              {selectedRoleId && (
                <button
                  type="submit"
                  className={modalStyles.btnPrimary}
                  disabled={loading || !selectedRoleId}
                >
                  {loading ? "Saving…" : "Save Permissions"}
                </button>
              )}
            </div>
          </form>
        )}

        {roles.length > 0 && !selectedRoleId && (
          <div className={modalStyles.actions}>
            <button className={modalStyles.btnSecondary} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
