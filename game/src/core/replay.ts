// Rebuilds a round from its action log alone (ADR 0004). Used by scoring, tests, and later a server.

import { apply, initialState } from "./reducer.ts";
import type { Action, Customer, Fault, Machine, Refusal, RoundState } from "./types.ts";

export interface ReplayResult {
  state: RoundState;
  /** The first action the reducer refused, if any. Everything before it was applied. */
  failedAt: { index: number; refusal: Refusal } | null;
  applied: number;
}

export function replay(machine: Machine, fault: Fault, log: readonly Action[], customer?: Customer): ReplayResult {
  let state = initialState(machine);
  for (let i = 0; i < log.length; i++) {
    const action = log[i]!;
    const r = apply(machine, fault, state, action, customer);
    if (!r.ok) return { state, failedAt: { index: i, refusal: r.refusal }, applied: i };
    state = r.state;
  }
  return { state, failedAt: null, applied: log.length };
}
