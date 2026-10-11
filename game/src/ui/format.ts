// Pure formatting helpers for the interface.

/** Milliseconds as m:ss. Negative or invalid input shows 0:00. */
/** CSS px above the controls (pull cord and tray) that still count as dropping on the tray (ADR 0020 tuning). */
export const DROP_REACH = 64;

/**
 * True if a screen point is in the tray's drop zone: the whole strip of the screen from a little above the controls to
 * the bottom, across its full width, so a carried part does not have to land on the tray itself.
 */
export function inDropZone(y: number, controlsTop: number, screenBottom: number): boolean {
  return y >= controlsTop - DROP_REACH && y <= screenBottom;
}

export function formatTime(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Filled and empty stars, always three characters. */
export function starText(stars: number): string {
  const n = Math.max(0, Math.min(3, Math.round(stars)));
  return "★".repeat(n) + "☆".repeat(3 - n);
}

/** The meter's colour band for a share of patience left (ADR 0015 thresholds: 50 and 20 percent). */
export function patienceMood(share: number): "calm" | "waiting" | "annoyed" {
  if (share < 0.2) return "annoyed";
  if (share < 0.5) return "waiting";
  return "calm";
}
