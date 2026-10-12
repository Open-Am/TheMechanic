// The local score store (ADR 0005, ADR 0022, ADR 0024). One localStorage key holds the best fixed round per fault and
// the scored attempt per day. Every read and write is in try/catch and the store always keeps its records in memory,
// so blocked, full or broken storage only means this session's results are not kept after a reload.

import type { FaultId } from "../../core/types.ts";
import type { ScoreStore, StoredResult } from "../interfaces/index.ts";
import { safeStorage, type StorageLike } from "./storage.ts";

export { safeStorage, type StorageLike };

/** The one key the game saves under (ADR 0022). A format change uses a new key and starts empty. */
export const SCORES_KEY = "openam.scores.v1";

interface Saved {
  v: 1;
  best: Record<string, StoredResult>;
  daily: Record<string, StoredResult>;
}

function isResult(r: unknown): r is StoredResult {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Partial<StoredResult>;
  return typeof x.faultId === "string" && Array.isArray(x.log) && typeof x.score === "object" && x.score !== null && typeof x.score.total === "number";
}

/** Parses the saved value. Anything unreadable, not JSON, or of another version is empty (ADR 0022). */
export function parseSaved(text: string | null): Saved {
  const empty: Saved = { v: 1, best: {}, daily: {} };
  if (!text) return empty;
  try {
    const raw = JSON.parse(text) as Partial<Saved> | null;
    if (!raw || raw.v !== 1 || typeof raw.best !== "object" || typeof raw.daily !== "object" || !raw.best || !raw.daily) return empty;
    const out: Saved = { v: 1, best: {}, daily: {} };
    for (const [k, r] of Object.entries(raw.best)) if (isResult(r)) out.best[k] = r;
    for (const [k, r] of Object.entries(raw.daily)) if (isResult(r)) out.daily[k] = r;
    return out;
  } catch {
    return empty;
  }
}

/** A best is a fixed, finished round (ADR 0022, ADR 0024). */
function canBeBest(r: StoredResult): boolean {
  return !r.unfinished && r.score.outcome === "fixed";
}

/** Keeps the lowest total; a tie keeps the one already there. */
function better(current: StoredResult | undefined, next: StoredResult): StoredResult {
  if (!canBeBest(next)) return current ?? next;
  if (!current || !canBeBest(current) || next.score.total < current.score.total) return next;
  return current;
}

/** A day's record changes only while it is missing or unfinished: one scored attempt a day (ADR 0005, ADR 0024). */
function dayRecord(current: StoredResult | undefined, next: StoredResult): StoredResult {
  return !current || current.unfinished ? next : current;
}

export function createScoreStore(storage: StorageLike | null): ScoreStore {
  const memory: Saved = { v: 1, best: {}, daily: {} };

  /** Merges what storage holds into memory, so another tab's or a previous page's results count. */
  function load(): void {
    if (!storage) return;
    let text: string | null = null;
    try {
      text = storage.getItem(SCORES_KEY);
    } catch {
      return;
    }
    const saved = parseSaved(text);
    for (const [k, r] of Object.entries(saved.best)) {
      const merged = better(memory.best[k], r);
      if (canBeBest(merged)) memory.best[k] = merged;
    }
    for (const [k, r] of Object.entries(saved.daily)) memory.daily[k] = mergeDay(memory.daily[k], r);
  }

  /** Two records of one day: a finished one wins over an unfinished one; otherwise the first stands. */
  function mergeDay(a: StoredResult | undefined, b: StoredResult): StoredResult {
    if (!a) return b;
    if (a.unfinished && !b.unfinished) return b;
    return a;
  }

  function save(): void {
    if (!storage) return;
    try {
      storage.setItem(SCORES_KEY, JSON.stringify(memory));
    } catch {
      // Full or blocked: memory keeps this session's results (ADR 0005).
    }
  }

  load();

  return {
    async best(faultId: FaultId) {
      load();
      return memory.best[faultId] ?? null;
    },
    async bestDaily(day) {
      load();
      return memory.daily[String(day)] ?? null;
    },
    async record(result) {
      load();
      const r = copy(result);
      if (r.day !== null) memory.daily[String(r.day)] = dayRecord(memory.daily[String(r.day)], r);
      if (canBeBest(r)) memory.best[r.faultId] = better(memory.best[r.faultId], r);
      save();
    },
    async dailyAttempted(day) {
      load();
      return memory.daily[String(day)] !== undefined;
    },
  };
}

/** A copy, so a caller changing its object later cannot change what was saved. */
function copy(r: StoredResult): StoredResult {
  return JSON.parse(JSON.stringify(r)) as StoredResult;
}
