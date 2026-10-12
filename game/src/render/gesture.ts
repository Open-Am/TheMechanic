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

/**
 * A double tap: the second tap comes down within `ms` of the first lifting, within `px` CSS px of it, and is itself a
 * tap of at most `holdMs`. Times are the events' own time stamps, not when the page got round to handling them, so a
 * slow frame cannot push a quick double tap past the window (release 0.9.3).
 */
export const DOUBLE_TAP = { ms: 300, px: 30, holdMs: 500 } as const;

export interface Tap {
  /** The part the press took hold of, or null for the base or empty space. */
  part: string | null;
  /** Every part under the pointer, by its finger-sized hit volume as well as by what shows. */
  under: readonly string[];
  /** Event time stamps, ms: when the press came down and when it lifted. */
  down: number;
  up: number;
  x: number;
  y: number;
}

/**
 * The part a double tap loosens if `tap` completes one after `prev`, or null. It is the first tap's part; the second
 * tap counts if that part is still under the finger (a thumb's second tap lands a few pixels off, which on a small part
 * can show a neighbour). A double tap on nothing is not one.
 */
export function doubleTapPart(prev: Tap | null, tap: Tap): string | null {
  if (!prev?.part) return null;
  if (tap.part !== prev.part && !tap.under.includes(prev.part)) return null;
  const gap = tap.down - prev.up;
  if (gap < 0 || gap > DOUBLE_TAP.ms || tap.up - tap.down > DOUBLE_TAP.holdMs) return null;
  return Math.hypot(tap.x - prev.x, tap.y - prev.y) <= DOUBLE_TAP.px ? prev.part : null;
}

/**
 * The spot a double tap on `part` takes hold of: where the second tap touched the part, or, when the second tap shows a
 * neighbour (it still counts, see `doubleTapPart`), where the first did. Null if neither tap touched the part's surface.
 * Without this the hand fell back to the part's origin, which for a muffler is inside the machine (release 0.9.4).
 */
export function doubleTapGrasp<S extends { part: string | null }>(part: string, first: S | null, second: S | null): S | null {
  if (second?.part === part) return second;
  if (first?.part === part) return first;
  return null;
}

/**
 * True while a second tap at `now` (an event or frame time stamp, ms) could still complete a double tap after `prev`.
 * The machine holds still meanwhile, so a reframe cannot slide the part from under the finger between the taps (0.9.4).
 */
export function awaitingSecondTap(prev: Tap | null, now: number): boolean {
  return !!prev?.part && now - prev.up <= DOUBLE_TAP.ms;
}

/**
 * What a drag does once it passes the tap slop: carries the part if the press was on a loose part, otherwise turns the
 * machine. Whether a part that is not loose could come off plays no part in it (ADR 0007).
 */
export function dragMode(part: string | null, loose: (id: string) => boolean): "carry" | "turn" {
  return part !== null && loose(part) ? "carry" : "turn";
}

// ---- A fast release (release 0.15.1) ----

/**
 * A quick downward flick at release counts where it was heading: a thumb lifts while still moving, and the screen
 * reports the last spot it touched, short of where the player meant. windowMs: the recent movement measured; minSpeed:
 * the downward speed that counts as a flick, px per ms; aheadMs: how far ahead the release is projected; staleMs: the
 * longest gap from the last move to the lift that still counts as lifting while moving.
 */
export const FLICK = { windowMs: 80, minSpeed: 0.8, aheadMs: 120, staleMs: 50 } as const;

export interface PointerSample {
  x: number;
  y: number;
  /** Event time stamp, ms. */
  t: number;
}

/**
 * Where a release was heading `FLICK.aheadMs` ahead, if the pointer was moving down at least `FLICK.minSpeed` over the
 * last `FLICK.windowMs` of moves before it, and lifted within `FLICK.staleMs` of the last move; otherwise null. The speed
 * is measured over the moves, up to the lift only if the lift moved: a lift is often reported a frame or two after the
 * last move, at the same spot, which would halve the speed. `samples` are the recent moves, oldest first.
 */
export function flickAhead(samples: readonly PointerSample[], release: PointerSample): { x: number; y: number } | null {
  const before = samples.filter((s) => s.t <= release.t);
  const last = before[before.length - 1];
  if (!last || release.t - last.t > FLICK.staleMs) return null;
  const moved = release.x !== last.x || release.y !== last.y;
  const end = moved ? release : last;
  const from = before.find((s) => s.t >= end.t - FLICK.windowMs);
  if (!from) return null;
  const dt = end.t - from.t;
  if (dt < 8) return null;
  const vx = (end.x - from.x) / dt;
  const vy = (end.y - from.y) / dt;
  if (vy < FLICK.minSpeed || Math.abs(vx) > vy * 2) return null;
  return { x: release.x + vx * FLICK.aheadMs, y: release.y + vy * FLICK.aheadMs };
}

/** The smallest screen rectangle holding every finite point, or null if there is none (release 0.15.1). */
export function screenBounds(points: ReadonlyArray<{ x: number; y: number }>): { left: number; top: number; right: number; bottom: number } | null {
  let box: { left: number; top: number; right: number; bottom: number } | null = null;
  for (const { x, y } of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    box = box ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x), bottom: Math.max(box.bottom, y) } : { left: x, top: y, right: x, bottom: y };
  }
  return box;
}
