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

export type SoundName = "remove" | "fail" | "start";

export interface Audio {
  play(name: SoundName): void;
}

export interface Clock {
  now(): number;
  today(): Date;
}
