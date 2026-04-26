import { useEffect, useRef } from "react";
import { MessagePayload } from "../../lib/tauri";
import { useAppStore } from "../../store/useAppStore";
import styles from "./MessageList.module.css";

interface Props {
  messages: MessagePayload[];
}

export function MessageList({ messages }: Props) {
  const { localPeerId } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No messages yet. Say something! 👋</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          isOwn={msg.author_peer_id === localPeerId}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface ItemProps {
  message: MessagePayload;
  isOwn: boolean;
}

function MessageItem({ message, isOwn }: ItemProps) {
  const date = new Date(message.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`${styles.message} ${isOwn ? styles.messageOwn : ""}`}>
      <div className={styles.avatar}>
        {message.author_peer_id.slice(0, 2).toUpperCase()}
      </div>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.author} title={message.author_peer_id}>
            {isOwn ? "You" : message.author_peer_id.slice(0, 12) + "…"}
          </span>
          <span className={styles.time}>{timeStr}</span>
        </div>
        <p className={styles.content}>{message.content}</p>
      </div>
    </div>
  );
}
