// Interfaces that app depends on (ADR 0010). Implementations live in platform/local and are injected in main.ts.
// Saved results follow ADR 0022, with ADR 0024's unfinished daily.

import type { Action, FaultId, ScoreBreakdown } from "../../core/types.ts";

export interface StoredResult {
  faultId: FaultId;
  day: number | null;
  log: Action[];
  score: ScoreBreakdown;
  playedAt: string;
  /** A daily whose timer started and that has not ended (ADR 0024). Never a best; no stars, no share. */
  unfinished?: true;
}

export interface ScoreStore {
  best(faultId: FaultId): Promise<StoredResult | null>;
  /** The day's scored attempt, finished or not (ADR 0022, ADR 0024). */
  bestDaily(day: number): Promise<StoredResult | null>;
  record(result: StoredResult): Promise<void>;
  /** True once a scored attempt for this day has been recorded, even unfinished (ADR 0005, ADR 0024). */
  dailyAttempted(day: number): Promise<boolean>;
}

export interface DailyProvider {
  /** Today's day number and the fault ID for it. A server can replace this later (ADR 0002). */
  today(): Promise<{ day: number; faultId: FaultId }>;
}

export interface Share {
  /** Sends text through the share sheet or the clipboard. Resolves to which one was used, or "none". */
  share(text: string): Promise<"sheet" | "clipboard" | "none">;
}

/** The moments that make a sound (ADR 0018, plan 0013 reading 1). One file each: game/public/audio/<moment>.ogg. */
export const MOMENTS = ["turn", "give-unbolt", "give-unclip", "give-pull", "give-scrape", "land", "seat", "cord", "fail", "start"] as const;
export type Moment = (typeof MOMENTS)[number];

/** A vibration: one length in ms, or on, off, on... lengths, as navigator.vibrate takes them. */
export type VibrationPattern = number | readonly number[];

/**
 * Sound and vibration (ADR 0018). Muted means neither. Nothing plays before unlock() has run inside a tap. A moment
 * whose file is missing, late or undecodable plays nothing (ADR 0023). Every failure is swallowed.
 */
export interface Audio {
  /** Plays a moment now, or after delaySeconds. */
  play(moment: Moment, delaySeconds?: number): void;
  /** Vibrates where the phone supports it, now or after delaySeconds. */
  vibrate(pattern: VibrationPattern, delaySeconds?: number): void;
  setMuted(muted: boolean): void;
  /** Call inside a tap or key press: starts the browser's audio, which browsers allow only after a gesture. */
  unlock(): void;
  /** Hands over a moment's downloaded file. Resolves to true once it can play, false if it cannot be decoded. */
  load(moment: Moment, data: ArrayBuffer): Promise<boolean>;
}

export interface Clock {
  now(): number;
  today(): Date;
}
