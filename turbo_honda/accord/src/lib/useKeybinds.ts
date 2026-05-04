import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { getKeybinds, eventToKeyString } from "./keybinds";

/**
 * Registers global keyboard handlers for all configured keybinds.
 * Call once at the application root (AppLayout).
 */
export function useKeybinds() {
  // Keep a ref to the latest store state so the event handlers are never stale.
  const storeRef = useRef(useAppStore.getState());
  useEffect(() => useAppStore.subscribe((s) => { storeRef.current = s; }), []);

  useEffect(() => {
    // Track which key strings are currently held so we only fire once per press.
    const heldKeys = new Set<string>();

    function isTyping(e: KeyboardEvent): boolean {
      const tag = (e.target as HTMLElement)?.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        !!(e.target as HTMLElement)?.isContentEditable
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isTyping(e)) return;

      const key = eventToKeyString(e);
      if (!key || heldKeys.has(key)) return;
      heldKeys.add(key);

      const keybinds = getKeybinds();
      const s = storeRef.current;
      if (!s.inVoiceChannel) return;

      for (const kb of keybinds) {
        if (!kb.key || kb.key !== key) continue;

        switch (kb.action) {
          case "toggle_mute":
            s.toggleMute();
            break;
          case "toggle_deafen":
            s.toggleDeafen();
            break;
          case "disconnect_voice":
            s.leaveVoice();
            break;
          case "toggle_camera":
            if (s.videoActive) {
              s.stopVideo();
            } else if (s.voiceChannelId) {
              s.startVideo(s.voiceChannelId);
            }
            break;
          case "push_to_talk":
            // Unmute while the key is held; re-mute on keyup.
            if (s.muted) s.toggleMute();
            break;
          case "push_to_mute":
            // Mute while the key is held; unmute on keyup.
            if (!s.muted) s.toggleMute();
            break;
        }
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (isTyping(e)) return;

      const key = eventToKeyString(e);
      if (!key) return;
      heldKeys.delete(key);

      const keybinds = getKeybinds();
      const s = storeRef.current;
      if (!s.inVoiceChannel) return;

      for (const kb of keybinds) {
        if (!kb.key || kb.key !== key) continue;

        if (kb.action === "push_to_talk" && !s.muted) {
          // Key released → go back to muted.
          s.toggleMute();
        } else if (kb.action === "push_to_mute" && s.muted) {
          // Key released → go back to unmuted.
          s.toggleMute();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
}
