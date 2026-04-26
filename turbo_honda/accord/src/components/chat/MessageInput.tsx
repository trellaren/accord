import { useState, KeyboardEvent } from "react";
import styles from "./MessageInput.module.css";

interface Props {
  onSend: (content: string) => Promise<void>;
  placeholder?: string;
}

export function MessageInput({ onSend, placeholder = "Send a message…" }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.root}>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={sending}
        rows={1}
      />
      <button
        className={styles.sendBtn}
        onClick={handleSend}
        disabled={!value.trim() || sending}
        aria-label="Send message"
      >
        ➤
      </button>
    </div>
  );
}
