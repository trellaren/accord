import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { ServerRail } from "../servers/ServerRail";
import { UserProfileModal } from "../user/UserProfileModal";
import { useAppStore } from "../../store/useAppStore";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const { userProfile, localPeerId } = useAppStore();
  const [showProfile, setShowProfile] = useState(false);

  // Display name: prefer set display name, fall back to truncated peer ID.
  const displayLabel =
    userProfile?.display_name?.trim() ||
    (localPeerId ? localPeerId.slice(0, 8) + "…" : "Me");

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

        {/* User area at the bottom */}
        <div className={styles.userArea}>
          <div className={styles.userAvatar}>
            {displayLabel.slice(0, 2).toUpperCase()}
          </div>
          <span className={styles.userName}>{displayLabel}</span>
          <button
            className={styles.settingsBtn}
            onClick={() => setShowProfile(true)}
            title="User Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
