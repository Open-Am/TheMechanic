// Score as a pure function of the action log (ADR 0004).

import { FAILED_PULL_PENALTY, STAR_THRESHOLDS, WRONG_PART_PENALTY } from "./constants.ts";
import { hasWalked, walkOutTime } from "./patience.ts";
import { replay } from "./replay.ts";
import { necessarySet } from "./rules.ts";
import type { Action, Customer, Fault, Machine, RoundState, ScoreBreakdown } from "./types.ts";

export function stars(total: number): 1 | 2 | 3 {
  if (total <= STAR_THRESHOLDS.three) return 3;
  if (total <= STAR_THRESHOLDS.two) return 2;
  return 1;
}

/**
 * Scores a round state. `elapsedMs` is the end time for a finished round, or the current time for a live one.
 * With a customer, a round past the customer's walk-out time is walked: scored at the walk-out time, with no stars.
 */
export function scoreState(machine: Machine, fault: Fault, state: RoundState, elapsedMs: number, customer?: Customer): ScoreBreakdown {
  const need = necessarySet(machine, fault);
  let wrongParts = 0;
  for (const id of state.removedEver) if (!need.has(id)) wrongParts++;
  const walked = customer !== undefined && hasWalked(state, customer, elapsedMs);
  const endMs = walked ? walkOutTime(state, customer) : elapsedMs;
  const elapsedSeconds = Math.round(endMs / 1000);
  const total = elapsedSeconds + WRONG_PART_PENALTY * wrongParts + FAILED_PULL_PENALTY * state.failedPulls;
  const fixed = state.endedAt !== null;
  return {
    elapsedSeconds,
    wrongParts,
    failedPulls: state.failedPulls,
    total,
    stars: walked ? 0 : stars(total),
    complete: fixed,
    outcome: fixed ? "fixed" : walked ? "walked" : null,
  };
}

/**
 * Scores a log from scratch. An invalid or unfinished log still gets a breakdown, with `complete` false.
 * `atMs` is the round time the round was given up at (for a walked round, any time at or after the walk-out).
 */
export function score(machine: Machine, fault: Fault, log: readonly Action[], customer?: Customer, atMs?: number): ScoreBreakdown {
  const { state } = replay(machine, fault, log, customer);
  return scoreState(machine, fault, state, state.endedAt ?? atMs ?? state.t, customer);
}
