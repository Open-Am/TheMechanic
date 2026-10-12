// The moments that make a sound, and which of them vibrate (ADR 0018, plan 0013 reading 1 and 7). Data, not logic:
// app plays its own moments from accepted actions; render reports the finger's moments, and main.ts passes them here.
// render imports Moment from this file, never from platform (ADR 0010).

import type { MotionType } from "../core/index.ts";
import { MOMENTS, type Audio, type Moment } from "../platform/interfaces/index.ts";

export { MOMENTS, type Moment };

/** Seconds from the cord to the engine's answer: the trimmed length of the cord file (plan 0013 reading 3). */
export const CORD_SECONDS = 0.6;

/** The vibration for each moment, in ms, or null for none (ADR 0018's table). */
export const VIBRATION: Record<Moment, number | readonly number[] | null> = {
  turn: null,
  "give-unbolt": 15,
  "give-unclip": 15,
  "give-pull": 15,
  "give-scrape": 15,
  land: null,
  seat: 15,
  cord: null,
  fail: 40,
  start: [60, 40, 60, 40, 80],
};

/**
 * The sound a part makes as it gives, by how it comes off. An unscrewed part has none: its turns click instead. An
 * unknown type plays as slide (ADR 0008), so it scrapes.
 */
export function giveMoment(type: MotionType | string | undefined): Moment | null {
  switch (type) {
    case "unscrew":
      return null;
    case "unbolt":
      return "give-unbolt";
    case "unclip":
      return "give-unclip";
    case "pull":
      return "give-pull";
    default:
      return "give-scrape";
  }
}

/** The part of Audio a moment needs. */
export type MomentPlayer = Pick<Audio, "play" | "vibrate">;

/** Plays a moment and its vibration, now or after delaySeconds. */
export function playMoment(audio: MomentPlayer, moment: Moment, delaySeconds = 0): void {
  audio.play(moment, delaySeconds);
  const pattern = VIBRATION[moment];
  if (pattern !== null) audio.vibrate(pattern, delaySeconds);
}
