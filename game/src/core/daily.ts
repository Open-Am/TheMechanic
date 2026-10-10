// Daily fault selection (ADR 0005). Deterministic: any client with this file and the same data agrees.

import { DAILY_CUSTOMER_SALT, DAILY_EPOCH, DAILY_SEED, LAGOS_UTC_OFFSET_MINUTES } from "./constants.ts";
import type { Customer, Fault, FaultId } from "./types.ts";

const MS_PER_DAY = 86_400_000;

/** Days since DAILY_EPOCH, counted in Lagos local time. Day 0 is the epoch date. */
export function dayNumber(now: Date): number {
  const epochUtc = Date.parse(`${DAILY_EPOCH}T00:00:00Z`);
  const lagosMs = now.getTime() + LAGOS_UTC_OFFSET_MINUTES * 60_000;
  return Math.floor((lagosMs - epochUtc) / MS_PER_DAY);
}

/** 32-bit integer hash of a day number. Small, seeded, no dependencies. */
export function hashDay(day: number): number {
  let h = (day ^ DAILY_SEED) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The fault for a day: picked from every fault except the previous day's, indexed by the day's hash.
 * Day 0 (and any negative day) picks from all faults. Recursion to the epoch is cheap and exact.
 */
export function dailyFaultId(faults: readonly Fault[], day: number): FaultId {
  if (faults.length === 0) throw new Error("dailyFaultId: no faults");
  const ids = faults.map((f) => f.id);
  if (faults.length === 1) return ids[0]!;

  let previous: FaultId | null = null;
  for (let d = Math.min(0, day); d <= day; d++) {
    const prev = previous;
    const pool: FaultId[] = prev === null ? ids : ids.filter((id) => id !== prev);
    previous = pool[hashDay(d) % pool.length]!;
  }
  return previous!;
}

/** The customer for a day (ADR 0015): from the same day hash as the fault, salted so the two are independent. */
export function dailyCustomerId(customers: readonly Customer[], day: number): string {
  if (customers.length === 0) throw new Error("dailyCustomerId: no customers");
  return customers[hashDay(day ^ DAILY_CUSTOMER_SALT) % customers.length]!.id;
}
