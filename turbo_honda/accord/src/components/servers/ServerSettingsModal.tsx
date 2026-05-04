import { useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { RolesManagementModal } from "./RolesManagementModal";
import styles from "./ServerSettingsModal.module.css";

interface Props {
  serverId: string;
  serverName: string;
  serverAvatarUrl: string;
  onClose: () => void;
}

type Tab = "general" | "roles";

export function ServerSettingsModal({ serverId, serverName, serverAvatarUrl, onClose }: Props) {
  const { updateExistingServer } = useAppStore();
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState(serverName);
  const [avatarUrl, setAvatarUrl] = useState(serverAvatarUrl);
  const [avatarPreview, setAvatarPreview] = useState(serverAvatarUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatarUrl(dataUrl);
      setAvatarPreview(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await updateExistingServer(serverId, name.trim(), avatarUrl);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleAvatarError() {
    setAvatarUrl("");
    setAvatarPreview("");
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Server Settings</h2>

        {/* Tab bar */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "general" ? styles.tabActive : ""}`}
            onClick={() => setTab("general")}
          >
            General
          </button>
          <button
            className={`${styles.tab} ${tab === "roles" ? styles.tabActive : ""}`}
            onClick={() => setTab("roles")}
          >
            Roles
          </button>
        </div>

        {tab === "general" && (
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Avatar */}
            <div className={styles.avatarSection}>
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Server avatar"
                  className={styles.avatarPreview}
                  onError={handleAvatarError}
                />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {(name || "S").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className={styles.avatarActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  Choose Image
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={() => { setAvatarUrl(""); setAvatarPreview(""); }}
                    disabled={loading}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Server Name</label>
              <input
                className={styles.input}
                placeholder="Server name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                maxLength={64}
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}
            {saved && <p className={styles.success}>✓ Saved!</p>}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onClose}
                disabled={loading}
              >
                Close
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={loading || !name.trim()}
              >
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        {tab === "roles" && (
          <RolesManagementModal
            serverId={serverId}
            onClose={() => setTab("general")}
            embedded
          />
        )}
      </div>
    </div>
  );
}
