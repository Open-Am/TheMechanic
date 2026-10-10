// Tells a tap, a pull and a rotate apart (docs/design/interface.md). Pure: positions in CSS px, y down.

export const GESTURE = {
  /** Movement under this is still a tap. */
  tapSlop: 8,
  /** A pull is recognised after this much movement. */
  pullDistance: 40,
  /** A pull must stay within this angle of the part's on-screen direction. */
  pullDegrees: 45,
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

export type GestureState =
  | { kind: "pending" } // not moved enough to tell
  | { kind: "pulling" } // on a part, heading the right way, not far enough yet
  | { kind: "pull" } // far enough: propose the removal, once
  | { kind: "rotate" }; // a camera drag

/**
 * Classifies a single-pointer drag from its total movement (dx, dy) since pointer-down.
 * `part` is the direction of the part under the finger at pointer-down, or null if none.
 * Once a drag becomes rotate it stays rotate; the caller keeps the last state and stops asking.
 */
export function classify(dx: number, dy: number, part: ScreenDirection | null): GestureState {
  const dist = Math.hypot(dx, dy);
  if (dist < GESTURE.tapSlop) return { kind: "pending" };
  if (!part) return { kind: "rotate" };
  if (!part.headOn) {
    const cos = (dx * part.x + dy * part.y) / dist;
    if (cos < Math.cos((GESTURE.pullDegrees * Math.PI) / 180)) return { kind: "rotate" };
  }
  return dist >= GESTURE.pullDistance ? { kind: "pull" } : { kind: "pulling" };
}
