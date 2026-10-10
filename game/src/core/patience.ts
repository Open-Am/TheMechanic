// The customer's patience (ADR 0015). Pure: a function of the round state, the customer and the time.
// Patience drains one second per second of round time; each failed pull costs FAILED_PULL_PATIENCE_COST seconds.
// Nothing else costs patience: a wrong part never does, so the customer never hints at which parts were unnecessary.

import { FAILED_PULL_PATIENCE_COST, PATIENCE_THRESHOLDS } from "./constants.ts";
import type { Customer, CustomerMoment, RoundState } from "./types.ts";

/**
 * Round time, in ms, at which the customer leaves. A failed pull that empties the meter makes them leave at that
 * pull, so the result is never earlier than the last applied action.
 */
export function walkOutTime(state: RoundState, customer: Customer): number {
  const ms = (customer.patience - FAILED_PULL_PATIENCE_COST * state.failedPulls) * 1000;
  return Math.max(state.t, ms);
}

/** Patience left at round time `t` (ms), as a share from 0 to 1. */
export function patienceAt(state: RoundState, customer: Customer, t: number): number {
  if (customer.patience <= 0) return 0;
  const left = customer.patience - FAILED_PULL_PATIENCE_COST * state.failedPulls - t / 1000;
  return Math.min(1, Math.max(0, left / customer.patience));
}

/** True when the customer has left by round time `t`. A fixed round never walks. */
export function hasWalked(state: RoundState, customer: Customer, t: number): boolean {
  return state.endedAt === null && t >= walkOutTime(state, customer);
}

/** The customer's mood for a share of patience left: arrive (calm), waiting, annoyed. */
export function moodFor(share: number): Extract<CustomerMoment, "arrive" | "waiting" | "annoyed"> {
  if (share < PATIENCE_THRESHOLDS.annoyed) return "annoyed";
  if (share < PATIENCE_THRESHOLDS.waiting) return "waiting";
  return "arrive";
}
