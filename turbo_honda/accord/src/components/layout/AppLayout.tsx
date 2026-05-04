import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Settings, Bug } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { ServerRail } from "../servers/ServerRail";
import { MemberPanel } from "./MemberPanel";
import { VoiceStatusBar } from "./VoiceStatusBar";
import { UserProfileModal } from "../user/UserProfileModal";
import { ServerInviteModal } from "../servers/ServerInviteModal";
import { DebugWindow } from "./DebugWindow";
import { useAppStore } from "../../store/useAppStore";
import { useKeybinds } from "../../lib/useKeybinds";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  useKeybinds();
  const { userProfile, localPeerId, pendingInvites } = useAppStore();
  const [showProfile, setShowProfile] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Display name: prefer set display name, fall back to truncated peer ID.
  const displayLabel =
    userProfile?.display_name?.trim() ||
    (localPeerId ? localPeerId.slice(0, 8) + "…" : "Me");

  const avatarUrl = userProfile?.avatar_url?.trim() || "";

  return (
    <div className={styles.root}>
      {/* Far-left server rail */}
      <ServerRail />

      {/* Channel sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className={styles.contentWrapper}>
        <main className={styles.content}>
          <Outlet />
        </main>

        {/* Persistent voice-channel status bar (shown when in a voice call) */}
        <VoiceStatusBar />

        {/* User area at the bottom */}
        <div className={styles.userArea}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayLabel}
              className={styles.userAvatarImg}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className={styles.userAvatar}>
              {displayLabel.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className={styles.userName}>{displayLabel}</span>
          <button
            className={styles.settingsBtn}
            onClick={() => setShowDebug((v) => !v)}
            title="Debug Logs"
          >
            <Bug size={16} />
          </button>
          <button
            className={styles.settingsBtn}
            onClick={() => setShowProfile(true)}
            title="User Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Right-side member panel */}
      <MemberPanel />

      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
      {pendingInvites.length > 0 && <ServerInviteModal invites={pendingInvites} />}
      {showDebug && <DebugWindow onClose={() => setShowDebug(false)} />}
    </div>
  );
}
