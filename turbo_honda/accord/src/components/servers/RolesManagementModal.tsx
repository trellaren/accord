import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ServerRole, Permission } from "../../lib/tauri";
import styles from "./RolesManagementModal.module.css";
import modalStyles from "./Modal.module.css";

interface Props {
  serverId: string;
  onClose: () => void;
  /** When true, renders without the overlay backdrop (embedded inside another modal). */
  embedded?: boolean;
}

const PERMISSION_FLAGS = [
  { flag: Permission.VIEW_CHANNEL, label: "View Channel" },
  { flag: Permission.SEND_MESSAGES, label: "Send Messages" },
  { flag: Permission.JOIN_VOICE, label: "Join Voice" },
  { flag: Permission.INVITE_USERS, label: "Invite Users" },
  { flag: Permission.MANAGE_CHANNELS, label: "Manage Channels" },
  { flag: Permission.MANAGE_ROLES, label: "Manage Roles" },
  { flag: Permission.DELETE_MESSAGES, label: "Delete Messages" },
] as const;

const DEFAULT_COLOR = "#99aab5";
const DEFAULT_PERMISSIONS = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES;

export function RolesManagementModal({ serverId, onClose, embedded = false }: Props) {
  const { serverRoles, loadRoles, addRole, editRole, removeRole } = useAppStore();
  const roles = serverRoles[serverId] ?? [];

  const [editing, setEditing] = useState<ServerRole | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(DEFAULT_COLOR);
  const [formPerms, setFormPerms] = useState(DEFAULT_PERMISSIONS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRoles(serverId).catch((e) => console.error("Failed to load roles:", e));
  }, [serverId, loadRoles]);

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormColor(DEFAULT_COLOR);
    setFormPerms(DEFAULT_PERMISSIONS);
    setError(null);
    setIsCreating(true);
  }

  function openEdit(role: ServerRole) {
    setIsCreating(false);
    setFormName(role.name);
    setFormColor(role.color);
    setFormPerms(role.permissions);
    setError(null);
    setEditing(role);
  }

  function cancelEdit() {
    setEditing(null);
    setIsCreating(false);
    setError(null);
  }

  function togglePerm(flag: number) {
    setFormPerms((p) => (p & flag ? p & ~flag : p | flag));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (editing) {
        await editRole(editing.id, formName.trim(), formColor, formPerms);
      } else {
        await addRole(serverId, formName.trim(), formColor, formPerms);
      }
      cancelEdit();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(roleId: string, roleName: string) {
    if (!window.confirm(`Delete role "${roleName}"? This cannot be undone.`)) return;
    try {
      await removeRole(serverId, roleId);
    } catch (err) {
      alert(String(err));
    }
  }

  function renderContent() {
    return (
      <>
        {/* Role list */}
        <ul className={styles.roleList}>
          {roles.length === 0 && (
            <p className={modalStyles.subtitle}>No roles yet. Create one below.</p>
          )}
          {roles.map((role) => (
            <li key={role.id} className={styles.roleItem}>
              <span
                className={styles.roleColor}
                style={{ background: role.color }}
              />
              <span className={styles.roleName}>{role.name}</span>
              <span className={styles.rolePerms}>
                {PERMISSION_FLAGS.filter((p) => role.permissions & p.flag)
                  .map((p) => p.label)
                  .join(", ") || "No permissions"}
              </span>
              <div className={styles.roleActions}>
                <button
                  className={styles.iconBtn}
                  title="Edit role"
                  onClick={() => openEdit(role)}
                >
                  <Edit2 size={13} />
                </button>
                <button
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  title="Delete role"
                  onClick={() => handleDelete(role.id, role.name)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* Create / edit form */}
        {(isCreating || editing) && (
          <form className={styles.form} onSubmit={handleSave}>
            <p className={styles.formTitle}>
              {editing ? `Edit "${editing.name}"` : "New Role"}
            </p>

            <div className={styles.nameRow}>
              <div className={modalStyles.field} style={{ flex: 1 }}>
                <label className={modalStyles.label}>Role Name</label>
                <input
                  className={modalStyles.input}
                  placeholder="e.g. Moderator"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={loading}
                  maxLength={64}
                />
              </div>
              <div className={styles.colorField}>
                <label className={modalStyles.label}>Color</label>
                <input
                  type="color"
                  className={styles.colorInput}
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <label className={modalStyles.label}>Permissions</label>
            <div className={styles.permGrid}>
              {PERMISSION_FLAGS.map(({ flag, label }) => (
                <label key={flag} className={styles.permRow}>
                  <input
                    type="checkbox"
                    checked={!!(formPerms & flag)}
                    onChange={() => togglePerm(flag)}
                    disabled={loading}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {error && <p className={modalStyles.error}>{error}</p>}

            <div className={modalStyles.actions}>
              <button
                type="button"
                className={modalStyles.btnSecondary}
                onClick={cancelEdit}
                disabled={loading}
              >
                <X size={14} /> Cancel
              </button>
              <button
                type="submit"
                className={modalStyles.btnPrimary}
                disabled={loading || !formName.trim()}
              >
                <Check size={14} /> {loading ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}

        {!isCreating && !editing && (
          <button className={styles.addRoleBtn} onClick={openCreate}>
            <Plus size={14} /> Add Role
          </button>
        )}

        {!embedded && (
          <div className={modalStyles.actions}>
            <button className={modalStyles.btnSecondary} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </>
    );
  }

  if (embedded) {
    return (
      <div className={styles.embeddedContainer}>
        {renderContent()}
      </div>
    );
  }

  return (
    <div className={modalStyles.overlay} onClick={onClose}>
      <div
        className={`${modalStyles.modal} ${styles.wide}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={modalStyles.title}>Manage Roles</h2>
        {renderContent()}
      </div>
    </div>
  );
}
