import { useEffect, useRef, useState } from "react";
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
  const {
    userProfile,
    loadUserProfile,
    saveUserProfile,
    audioDevices,
    videoDevices,
    loadAudioDevices,
    loadVideoDevices,
  } = useAppStore();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [inputDeviceId, setInputDeviceId] = useState("");
  const [outputDeviceId, setOutputDeviceId] = useState("");
  const [videoDeviceId, setVideoDeviceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Populate form from loaded profile and load device lists.
  useEffect(() => {
    if (!userProfile) {
      loadUserProfile().catch(() => {});
    } else {
      setDisplayName(userProfile.display_name);
      setEmail(userProfile.email);
      setTimezone(userProfile.timezone || "UTC");
      setAvatarUrl(userProfile.avatar_url || "");
      setInputDeviceId(userProfile.input_device_id || "");
      setOutputDeviceId(userProfile.output_device_id || "");
      setVideoDeviceId(userProfile.video_device_id || "");
    }
  }, [userProfile, loadUserProfile]);

  useEffect(() => {
    loadAudioDevices().catch(() => {});
    loadVideoDevices().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputDevices = audioDevices.filter((d) => d.is_input);
  const outputDevices = audioDevices.filter((d) => !d.is_input);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await saveUserProfile(displayName, email, timezone, avatarUrl, inputDeviceId, outputDeviceId, videoDeviceId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatarUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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
          {/* Avatar preview + file picker */}
          <div className={styles.avatarSection}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className={styles.avatarPreview}
                onError={() => setAvatarUrl("")}
              />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {(displayName || "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className={styles.avatarInput}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatarFileChange}
              />
              <button
                type="button"
                className={styles.btnChooseFile}
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                Choose Image
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className={styles.btnRemoveAvatar}
                  onClick={() => setAvatarUrl("")}
                  disabled={loading}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

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

          {/* ── Device settings ─────────────────────── */}
          <p className={styles.sectionHeading}>Audio &amp; Video Devices</p>

          <div className={styles.field}>
            <label className={styles.label}>Microphone (Input)</label>
            <select
              className={styles.select}
              value={inputDeviceId}
              onChange={(e) => setInputDeviceId(e.target.value)}
              disabled={loading}
            >
              <option value="">System Default</option>
              {inputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Speaker / Headphones (Output)</label>
            <select
              className={styles.select}
              value={outputDeviceId}
              onChange={(e) => setOutputDeviceId(e.target.value)}
              disabled={loading}
            >
              <option value="">System Default</option>
              {outputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Webcam (Video Input)</label>
            <select
              className={styles.select}
              value={videoDeviceId}
              onChange={(e) => setVideoDeviceId(e.target.value)}
              disabled={loading}
            >
              <option value="">System Default</option>
              {videoDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
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
