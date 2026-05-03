import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { MessageList } from "../chat/MessageList";
import { MessageInput } from "../chat/MessageInput";
import { ScreenSharePanel } from "./ScreenSharePanel";
import styles from "./TextChannel.module.css";

export function TextChannel() {
  const { channelId } = useParams<{ channelId: string }>();
  const { channels, messages, loadMessages, postMessage, beginScreenShare, endScreenShare } =
    useAppStore();

  const channel = channels.find((c) => c.id === channelId);
  const channelMessages = (channelId ? messages[channelId] : undefined) ?? [];

  // Local MediaStream from getDisplayMedia – null when not sharing.
  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;

  // Keep a ref in sync so the unmount cleanup always sees the latest stream.
  const shareStreamRef = useRef<MediaStream | null>(null);
  shareStreamRef.current = shareStream;

  useEffect(() => {
    if (channelId) loadMessages(channelId);
  }, [channelId, loadMessages]);

  // Stop sharing when the user navigates away from the channel.
  useEffect(() => {
    return () => {
      const stream = shareStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        endScreenShare().catch(() => {/* ignore */});
      }
    };
    // endScreenShare is a stable Zustand action; shareStreamRef is a ref (no re-run needed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endScreenShare]);

  async function handleSend(content: string) {
    if (!channelId) return;
    await postMessage(channelId, content);
  }

  async function handleStartShare() {
    if (!channelId) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });
      setShareStream(stream);
      await beginScreenShare(channelId);
    } catch {
      // User cancelled the picker or permission was denied – nothing to do.
    }
  }

  const handleStopShare = useCallback(async () => {
    if (shareStream) {
      shareStream.getTracks().forEach((t) => t.stop());
      setShareStream(null);
    }
    await endScreenShare().catch(() => {/* ignore */});
  }, [shareStream, endScreenShare]);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.icon}>#</span>
        <span className={styles.name}>{channel?.name ?? "unknown"}</span>
        <button
          className={styles.shareBtn}
          onClick={shareStream ? handleStopShare : handleStartShare}
          title={shareStream ? "Stop sharing" : "Share your screen or application"}
        >
          {shareStream ? "⏹ Stop Share" : "📺 Share Screen"}
        </button>
      </header>

      {shareStream && (
        <ScreenSharePanel stream={shareStream} onStop={handleStopShare} />
      )}

      <MessageList messages={channelMessages} />
      <MessageInput onSend={handleSend} placeholder={`Message #${channel?.name ?? ""}`} />
    </div>
  );
}
