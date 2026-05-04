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
    // For push-to-talk and push-to-mute, store the mute state at the time the
    // key went down so we can correctly restore it on key-up.
    const pttStateBefore = new Map<string, boolean>();

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
            // Record initial mute state, then unmute so the user can speak.
            pttStateBefore.set(key, s.muted);
            if (s.muted) s.toggleMute();
            break;
          case "push_to_mute":
            // Record initial mute state, then mute while the key is held.
            pttStateBefore.set(key, s.muted);
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

        const wasMuted = pttStateBefore.get(key);
        if (wasMuted === undefined) continue;
        pttStateBefore.delete(key);

        if (kb.action === "push_to_talk") {
          // Restore muted state: re-mute only if the user was muted before PTT.
          if (wasMuted && !s.muted) s.toggleMute();
        } else if (kb.action === "push_to_mute") {
          // Restore unmuted state: unmute only if the user was unmuted before PTM.
          if (!wasMuted && s.muted) s.toggleMute();
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

