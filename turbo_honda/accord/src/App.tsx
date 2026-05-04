import { useEffect, useRef, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { TextChannel } from "./components/channels/TextChannel";
import { VoiceChannel } from "./components/channels/VoiceChannel";
import { Welcome } from "./components/layout/Welcome";
import { useAppStore } from "./store/useAppStore";
import { checkForUpdate, installUpdate, UpdateInfo } from "./lib/tauri";

export default function App() {
  const localPeerId = useAppStore((s) => s.localPeerId);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);

  // Run one-time app initialisation on mount.  We read the store actions from a
  // ref so the effect doesn't re-run if the store instance changes.
  const storeRef = useRef(useAppStore.getState());
  useEffect(() => {
    const { initNode, loadServers, loadChannels, loadUserProfile } = storeRef.current;
    initNode().then(() => {
      loadServers().then(async () => {
        // After loading servers, load channels for the first server (if any).
        const { servers, activeServerId: sid } = useAppStore.getState();
        const targetSid = sid ?? servers[0]?.id ?? null;
        if (targetSid) {
          useAppStore.setState({ activeServerId: targetSid });
        }
        await loadChannels(targetSid);
      });
      loadUserProfile();
    });

    // Check for an application update silently in the background.
    checkForUpdate().then((info) => {
      if (info) setPendingUpdate(info);
    });

    // Poll for server invites received from remote peers.
    const inviteInterval = window.setInterval(() => {
      useAppStore.getState().processPendingServerInvites();
    }, 5_000);

    return () => {
      window.clearInterval(inviteInterval);
    };
  }, []); // intentionally empty – run once on mount

  async function handleInstallUpdate() {
    setInstalling(true);
    try {
      await installUpdate();
    } catch (e) {
      console.error("Update failed:", e);
      setInstalling(false);
    }
  }

  return (
    <HashRouter>
      {/* Update banner */}
      {pendingUpdate && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "var(--accent)",
          color: "#fff",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: "13px",
        }}>
          <span>
            ⬆ Accord {pendingUpdate.version} is available
            {pendingUpdate.body ? ` — ${pendingUpdate.body}` : ""}
          </span>
          <button
            onClick={handleInstallUpdate}
            disabled={installing}
            style={{
              background: "rgba(255,255,255,0.25)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              cursor: installing ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {installing ? "Installing…" : "Update & Restart"}
          </button>
          <button
            onClick={() => setPendingUpdate(null)}
            style={{
              background: "none",
              color: "rgba(255,255,255,0.7)",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
              marginLeft: "auto",
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Welcome peerId={localPeerId} />} />
          <Route path="channels/:channelId/text" element={<TextChannel />} />
          <Route path="channels/:channelId/voice" element={<VoiceChannel />} />
          {/* Legacy video-channel URLs redirect to the root. */}
          <Route path="channels/:channelId/video" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
