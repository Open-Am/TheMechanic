// The browser's storage, made safe (ADR 0002 limit 6). localStorage can be absent, blocked or full, and every touch of
// it can throw; then the game keeps the value in memory for the session. The score store and the mute setting share
// this (ADR 0018, ADR 0022).

/** The part of the Web Storage API the game needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or null when touching it throws (blocked cookies, some private modes) or it is absent. */
export function safeStorage(get: () => StorageLike | null | undefined = () => globalThis.localStorage): StorageLike | null {
  try {
    const s = get();
    if (!s) return null;
    s.getItem("openam.probe");
    return s;
  } catch {
    return null;
  }
}

/** Where the mute choice is remembered (ADR 0018). Not a score, so not under ADR 0022's key. */
export const MUTED_KEY = "openam.muted";

/** A remembered on/off setting. */
export interface Flag {
  get(): boolean;
  set(value: boolean): void;
}

/**
 * A setting kept under `key` as "1" or "0". Reads storage each time, so another tab's choice counts; falls back to the
 * last value set in this session when storage is missing or throws. Anything other than "1" or "0" reads as `fallback`.
 */
export function createFlag(storage: StorageLike | null, key: string, fallback = false): Flag {
  let memory = fallback;
  return {
    get() {
      if (!storage) return memory;
      try {
        const v = storage.getItem(key);
        if (v === "1") return true;
        if (v === "0") return false;
        return memory;
      } catch {
        return memory;
      }
    },
    set(value) {
      memory = value;
      if (!storage) return;
      try {
        storage.setItem(key, value ? "1" : "0");
      } catch {
        // Full or blocked: memory keeps it for this session.
      }
    },
  };
}
