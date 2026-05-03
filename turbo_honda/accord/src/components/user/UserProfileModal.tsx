import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import styles from "./UserProfileModal.module.css";

// Common timezones for the selector.
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

interface Props {
  onClose: () => void;
}

export function UserProfileModal({ onClose }: Props) {
  const { userProfile, loadUserProfile, saveUserProfile } = useAppStore();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Populate form from loaded profile.
  useEffect(() => {
    if (!userProfile) {
      loadUserProfile().catch(() => {});
    } else {
      setDisplayName(userProfile.display_name);
      setEmail(userProfile.email);
      setTimezone(userProfile.timezone || "UTC");
    }
  }, [userProfile, loadUserProfile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await saveUserProfile(displayName, email, timezone);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>User Settings</h2>

        {/* Peer ID (read-only) */}
        {userProfile && (
          <div className={styles.peerIdBox}>
            <span className={styles.peerIdLabel}>Peer ID</span>
            <code className={styles.peerId}>{userProfile.peer_id}</code>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Display Name</label>
            <input
              className={styles.input}
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
              maxLength={64}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              maxLength={256}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Timezone</label>
            <select
              className={styles.select}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={loading}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {error && <p className={styles.error}>{error}</p>}
          {saved && <p className={styles.success}>✓ Profile saved!</p>}

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
              disabled={loading}
            >
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
