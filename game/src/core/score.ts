// Score as a pure function of the action log (ADR 0004).

import { FAILED_PULL_PENALTY, STAR_THRESHOLDS, WRONG_PART_PENALTY } from "./constants.ts";
import { replay } from "./replay.ts";
import { necessarySet } from "./rules.ts";
import type { Action, Fault, Machine, RoundState, ScoreBreakdown } from "./types.ts";

export function stars(total: number): 1 | 2 | 3 {
  if (total <= STAR_THRESHOLDS.three) return 3;
  if (total <= STAR_THRESHOLDS.two) return 2;
  return 1;
}

/** Scores a round state. `elapsedMs` is the end time for a finished round, or the current time for a live one. */
export function scoreState(machine: Machine, fault: Fault, state: RoundState, elapsedMs: number): ScoreBreakdown {
  const need = necessarySet(machine, fault);
  let wrongParts = 0;
  for (const id of state.removedEver) if (!need.has(id)) wrongParts++;
  const elapsedSeconds = Math.round(elapsedMs / 1000);
  const total = elapsedSeconds + WRONG_PART_PENALTY * wrongParts + FAILED_PULL_PENALTY * state.failedPulls;
  return { elapsedSeconds, wrongParts, failedPulls: state.failedPulls, total, stars: stars(total), complete: state.endedAt !== null };
}

/** Scores a log from scratch. An invalid or unfinished log still gets a breakdown, with `complete` false. */
export function score(machine: Machine, fault: Fault, log: readonly Action[]): ScoreBreakdown {
  const { state } = replay(machine, fault, log);
  return scoreState(machine, fault, state, state.endedAt ?? state.t);
}
