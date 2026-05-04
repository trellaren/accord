// Keybind action identifiers.
export type KeybindAction =
  | "push_to_talk"
  | "push_to_mute"
  | "toggle_mute"
  | "toggle_deafen"
  | "toggle_camera"
  | "disconnect_voice";

export interface KeybindConfig {
  action: KeybindAction;
  label: string;
  key: string | null;
}

const STORAGE_KEY = "accord_keybinds";

export const DEFAULT_KEYBINDS: KeybindConfig[] = [
  { action: "push_to_talk", label: "Push to Talk", key: null },
  { action: "push_to_mute", label: "Push to Mute", key: null },
  { action: "toggle_mute", label: "Toggle Mute", key: null },
  { action: "toggle_deafen", label: "Toggle Deafen", key: null },
  { action: "toggle_camera", label: "Toggle Camera", key: null },
  { action: "disconnect_voice", label: "Disconnect from Voice", key: null },
];

// Module-level cache – populated lazily, invalidated by setKeybinds().
let _cache: KeybindConfig[] | null = null;

function readFromStorage(): KeybindConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_KEYBINDS.map((k) => ({ ...k }));
    const parsed: Partial<KeybindConfig>[] = JSON.parse(stored);
    return DEFAULT_KEYBINDS.map((def) => {
      const saved = parsed.find((p) => p.action === def.action);
      return saved && "key" in saved ? { ...def, key: saved.key ?? null } : { ...def };
    });
  } catch {
    return DEFAULT_KEYBINDS.map((k) => ({ ...k }));
  }
}

/** Return the current list of keybinds (reading from storage once per page load). */
export function getKeybinds(): KeybindConfig[] {
  if (!_cache) _cache = readFromStorage();
  return _cache;
}

/** Persist an updated keybind list and refresh the in-memory cache. */
export function setKeybinds(keybinds: KeybindConfig[]): void {
  _cache = keybinds;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds));
}

/** Update a single keybind in place. */
export function setKeybindKey(action: KeybindAction, key: string | null): void {
  const updated = getKeybinds().map((kb) =>
    kb.action === action ? { ...kb, key } : kb,
  );
  setKeybinds(updated);
}

/**
 * Convert a KeyboardEvent into a displayable string such as "Ctrl+Shift+M".
 * Returns an empty string for bare modifier-only presses.
 */
export function eventToKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = e.key;
  if (k !== "Control" && k !== "Alt" && k !== "Shift" && k !== "Meta") {
    parts.push(k.length === 1 ? k.toUpperCase() : k);
  }
  return parts.join("+");
}

/** Return the human-readable representation of a stored key. */
export function formatKey(key: string | null): string {
  return key ?? "—";
}
