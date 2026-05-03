import { useEffect, useRef } from "react";
import styles from "./ScreenSharePanel.module.css";

interface ScreenSharePanelProps {
  stream: MediaStream;
  onStop: () => void;
}

/**
 * Inline stream viewer embedded inside a text channel.
 *
 * Renders the `MediaStream` obtained from `navigator.mediaDevices.getDisplayMedia()`
 * directly in the channel view so viewers can watch gameplay / application
 * sharing without leaving the chat.
 */
export function ScreenSharePanel({ stream, onStop }: ScreenSharePanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Mirror the browser's own "Stop sharing" action: when the user clicks the
  // browser's built-in stop button the track fires an "ended" event.
  useEffect(() => {
    const tracks = stream.getTracks();
    const handleEnded = () => onStop();
    tracks.forEach((t) => t.addEventListener("ended", handleEnded));
    return () => tracks.forEach((t) => t.removeEventListener("ended", handleEnded));
  }, [stream, onStop]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.liveBadge}>● LIVE</span>
        <span className={styles.label}>Screen Share</span>
        <button className={styles.stopBtn} onClick={onStop} title="Stop sharing">
          ✕ Stop Sharing
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className={styles.video}
        autoPlay
        muted
        playsInline
      />
    </div>
  );
}
