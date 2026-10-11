// Tells taps, double taps, carries and turns apart (docs/design/interface.md, ADR 0020). Pure: positions in CSS px,
// y down.

export const GESTURE = {
  /** Movement under this is still a tap. */
  tapSlop: 8,
  /** Below this ratio of on-screen to true length, the part comes at the camera and any direction counts. */
  headOnRatio: 1 / 3,
} as const;

/** A part's removal direction as seen on screen. */
export interface ScreenDirection {
  /** Unit vector in screen space (y down). Ignored when headOn. */
  x: number;
  y: number;
  /** True when the direction is too short on screen to follow. */
  headOn: boolean;
}

/**
 * Projects a view-space direction (camera looking down -z, y up) to the screen.
 * The ratio of its on-screen length to its true length decides whether it is head-on.
 */
export function screenDirection(view: { x: number; y: number; z: number }): ScreenDirection {
  const len = Math.hypot(view.x, view.y, view.z);
  const flat = Math.hypot(view.x, view.y);
  if (len === 0 || flat / len < GESTURE.headOnRatio) return { x: 0, y: 0, headOn: true };
  return { x: view.x / flat, y: -view.y / flat, headOn: false };
}

// ---- Deliberate removal (plan 0010, ADR 0020) ----

/** A double tap: two taps on the same part within this many ms and this many CSS px of each other. */
export const DOUBLE_TAP = { ms: 300, px: 30 } as const;

export interface Tap {
  part: string | null;
  t: number;
  x: number;
  y: number;
}

/** True if `tap` completes a double tap on a part, after `prev`. A double tap on nothing is not one. */
export function isDoubleTap(prev: Tap | null, tap: Tap): boolean {
  if (!prev || !tap.part || prev.part !== tap.part) return false;
  return tap.t - prev.t <= DOUBLE_TAP.ms && Math.hypot(tap.x - prev.x, tap.y - prev.y) <= DOUBLE_TAP.px;
}

/**
 * What a drag does once it passes the tap slop: carries the part if the press was on a loose part, otherwise turns the
 * machine. Whether a part that is not loose could come off plays no part in it (ADR 0007).
 */
export function dragMode(part: string | null, loose: (id: string) => boolean): "carry" | "turn" {
  return part !== null && loose(part) ? "carry" : "turn";
}
