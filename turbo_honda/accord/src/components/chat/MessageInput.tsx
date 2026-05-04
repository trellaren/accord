import { useRef, useState, KeyboardEvent } from "react";
import { Paperclip, Send } from "lucide-react";
import styles from "./MessageInput.module.css";

interface Props {
  onSend: (content: string) => Promise<void>;
  placeholder?: string;
}

export function MessageInput({ onSend, placeholder = "Send a message…" }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const mediaContent = JSON.stringify({
        _type: "media",
        mime: file.type,
        name: file.name,
        data: dataUrl,
      });
      setSending(true);
      try {
        await onSend(mediaContent);
      } finally {
        setSending(false);
      }
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className={styles.root}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button
        className={styles.attachBtn}
        onClick={() => fileInputRef.current?.click()}
        disabled={sending}
        aria-label="Attach image or video"
        title="Attach image or video"
        type="button"
      >
        <Paperclip size={18} />
      </button>
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
        type="button"
      >
        <Send size={16} />
      </button>
    </div>
  );
}

