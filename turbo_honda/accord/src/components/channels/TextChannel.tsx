import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { MessageList } from "../chat/MessageList";
import { MessageInput } from "../chat/MessageInput";
import styles from "./TextChannel.module.css";

export function TextChannel() {
  const { channelId } = useParams<{ channelId: string }>();
  const { channels, messages, loadMessages, postMessage } = useAppStore();

  const channel = channels.find((c) => c.id === channelId);
  const channelMessages = (channelId ? messages[channelId] : undefined) ?? [];

  useEffect(() => {
    if (channelId) loadMessages(channelId);
  }, [channelId, loadMessages]);

  async function handleSend(content: string) {
    if (!channelId) return;
    await postMessage(channelId, content);
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.icon}>#</span>
        <span className={styles.name}>{channel?.name ?? "unknown"}</span>
      </header>
      <MessageList messages={channelMessages} />
      <MessageInput onSend={handleSend} placeholder={`Message #${channel?.name ?? ""}`} />
    </div>
  );
}
