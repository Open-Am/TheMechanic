// Today's fault and saved results (ADR 0005, ADR 0022, ADR 0024). The day and fault come from the DailyProvider; app
// only chooses the day's customer, asks the store what has been played, and saves results.

import { dailyCustomerId } from "../core/index.ts";
import type { Customer, FaultId } from "../core/index.ts";
import type { DailyProvider, ScoreStore, StoredResult } from "../platform/interfaces/index.ts";
import type { RoundRecord } from "./round.ts";

export interface DailyStatus {
  day: number;
  faultId: FaultId;
  /** Today's scored attempt is used, finished or not (ADR 0024). Later rounds of today's fault are practice. */
  attempted: boolean;
  /** Today's saved attempt, which may be unfinished, or null. */
  result: StoredResult | null;
}

/** Everyone gets the same customer on the same day (ADR 0015), from the same day seed as the fault. */
export function dailyCustomer(customers: readonly Customer[], day: number): Customer {
  const id = dailyCustomerId(customers, day);
  return customers.find((c) => c.id === id)!;
}

/** Today's day, fault, and whether its scored attempt is used. A store that fails reads as nothing played. */
export async function dailyStatus(provider: DailyProvider, store: ScoreStore | undefined): Promise<DailyStatus> {
  const { day, faultId } = await provider.today();
  let result: StoredResult | null = null;
  let attempted = false;
  if (store) {
    try {
      result = await store.bestDaily(day);
      attempted = result !== null || (await store.dailyAttempted(day));
    } catch {
      // The store keeps its own memory fallback; if even that fails, today's daily is offered again.
    }
  }
  return { day, faultId, attempted, result };
}

/** Saves a scored daily as unfinished when its timer starts (ADR 0024). Never throws. */
export function recordUnfinished(store: ScoreStore | undefined, result: StoredResult): void {
  if (!store) return;
  store.record(result).catch(() => {});
}

/**
 * Saves an ended round and reports what the result screen shows. Practice is never saved and shows no best
 * (plan 0014 reading 5). A walked round is saved but is never a best (ADR 0022). Never rejects.
 */
export async function recordResult(store: ScoreStore | undefined, result: StoredResult, mode: RoundRecord["mode"]): Promise<RoundRecord> {
  const none: RoundRecord = { mode, day: result.day, best: null, newBest: false };
  if (mode === "practice" || !store) return none;
  try {
    const previous = await store.best(result.faultId);
    await store.record(result);
    const fixed = result.score.outcome === "fixed" && !result.unfinished;
    const newBest = fixed && (previous === null || result.score.total < previous.score.total);
    return { mode, day: result.day, best: newBest ? result.score.total : (previous?.score.total ?? null), newBest };
  } catch {
    return none;
  }
}
