import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { TextChannel } from "./components/channels/TextChannel";
import { VoiceChannel } from "./components/channels/VoiceChannel";
import { VideoChannel } from "./components/channels/VideoChannel";
import { Welcome } from "./components/layout/Welcome";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const { loadChannels, localPeerId, initNode } = useAppStore();

  useEffect(() => {
    initNode();
    loadChannels();
  }, [initNode, loadChannels]);

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
