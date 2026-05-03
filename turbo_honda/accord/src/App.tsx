import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { TextChannel } from "./components/channels/TextChannel";
import { VoiceChannel } from "./components/channels/VoiceChannel";
import { VideoChannel } from "./components/channels/VideoChannel";
import { Welcome } from "./components/layout/Welcome";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const { loadChannels, loadServers, loadUserProfile, initNode, localPeerId } =
    useAppStore();

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Welcome peerId={localPeerId} />} />
          <Route path="channels/:channelId/text" element={<TextChannel />} />
          <Route path="channels/:channelId/voice" element={<VoiceChannel />} />
          <Route path="channels/:channelId/video" element={<VideoChannel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
