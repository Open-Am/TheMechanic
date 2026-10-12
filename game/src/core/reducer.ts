// The one place game rules are applied (ADR 0004, ADR 0010).
// `apply` is pure: same inputs, same output. Time comes from the action, never from a clock.

import { walkOutTime } from "./patience.ts";
import { blockers, checkPossible, hiders, isCheckId, missingDependents } from "./rules.ts";
import type { Action, ApplyResult, CheckId, Customer, Fault, Machine, PartId, Refusal, RoundState } from "./types.ts";

export function initialState(machine: Machine): RoundState {
  return {
    installed: new Set(machine.parts.map((p) => p.id)),
    tray: [],
    removedEver: new Set(),
    fixed: false,
    failedPulls: 0,
    checksDone: [],
    t: 0,
    endedAt: null,
  };
}

function refuse(action: Action, reason: Refusal["reason"], parts?: PartId[]): ApplyResult {
  const refusal: Refusal = parts ? { reason, action, parts } : { reason, action };
  return { ok: false, refusal };
}

function withTime(state: RoundState, t: number, patch: Partial<RoundState>): ApplyResult {
  return { ok: true, state: { ...state, ...patch, t } };
}

/** `customer` is optional: without one there is no patience, as before ADR 0015. */
export function apply(machine: Machine, fault: Fault, state: RoundState, action: Action, customer?: Customer): ApplyResult {
  if (state.endedAt !== null) return refuse(action, "round_over");
  if (!Number.isFinite(action.t) || action.t < state.t) return refuse(action, "time_went_backwards");
  if (customer && action.t >= walkOutTime(state, customer)) return refuse(action, "customer_left");

  const partId = action.partId;
  const known = partId !== undefined && machine.parts.some((p) => p.id === partId);

  switch (action.type) {
    case "remove": {
      if (!known || partId === undefined) return refuse(action, "unknown_part");
      if (!state.installed.has(partId)) return refuse(action, "not_installed");
      const blocking = blockers(machine, state, partId);
      if (blocking.length) return refuse(action, "blocked_by", blocking);
      const installed = new Set(state.installed);
      installed.delete(partId);
      const removedEver = new Set(state.removedEver);
      removedEver.add(partId);
      return withTime(state, action.t, { installed, tray: [...state.tray, partId], removedEver });
    }

    case "inspect": {
      if (!known || partId === undefined) return refuse(action, "unknown_part");
      // From the tray, or in place when nothing hides it (ADR 0011).
      if (state.tray.includes(partId)) return withTime(state, action.t, {});
      if (!state.installed.has(partId)) return refuse(action, "not_in_tray");
      const hiding = hiders(machine, state, partId);
      if (hiding.length) return refuse(action, "hidden_by", hiding);
      return withTime(state, action.t, {});
    }

    case "fix": {
      if (!known || partId === undefined) return refuse(action, "unknown_part");
      if (!state.tray.includes(partId)) return refuse(action, "not_in_tray");
      if (partId !== fault.culprit) return refuse(action, "not_culprit");
      if (state.fixed) return refuse(action, "already_fixed");
      return withTime(state, action.t, { fixed: true });
    }

    case "install": {
      if (!known || partId === undefined) return refuse(action, "unknown_part");
      if (!state.tray.includes(partId)) return refuse(action, "not_in_tray");
      const missing = missingDependents(machine, state, partId);
      if (missing.length) return refuse(action, "dependents_missing", missing);
      const installed = new Set(state.installed);
      installed.add(partId);
      return withTime(state, action.t, { installed, tray: state.tray.filter((id) => id !== partId) });
    }

    case "pull": {
      if (state.tray.length) return refuse(action, "parts_missing", [...state.tray]);
      if (state.fixed) return withTime(state, action.t, { endedAt: action.t });
      return withTime(state, action.t, { failedPulls: state.failedPulls + 1 });
    }

    // ADR 0029: possible now (the machine's checks data), not yet done this round, and the fault not yet fixed.
    case "check": {
      const id = action.checkId;
      if (!isCheckId(id) || !machine.checks?.[id]) return refuse(action, "check_unavailable");
      if (state.fixed) return refuse(action, "already_fixed");
      if (state.checksDone.includes(id)) return refuse(action, "already_checked");
      if (!checkPossible(machine, state, id)) return refuse(action, "check_unavailable");
      return withTime(state, action.t, { checksDone: [...state.checksDone, id] });
    }
  }
}

/** What a check showed: the fault's line for it, once the check has been done this round, otherwise null (ADR 0029).
 *  This is the only path to clue text; app wraps it as resultOf. */
export function clueText(fault: Fault, state: RoundState, checkId: CheckId): string | null {
  if (!isCheckId(checkId) || !state.checksDone.includes(checkId)) return null;
  return fault.clues?.[checkId] ?? null;
}

/** What the player reads when inspecting a part: the fault's bad text while the culprit is unfixed, otherwise the part's ok text.
 *  This is the only path to condition text (ADR 0010); app wraps it as conditionOf. */
export function conditionText(machine: Machine, fault: Fault, state: RoundState, partId: PartId): string | null {
  const part = machine.parts.find((p) => p.id === partId);
  if (!part) return null;
  return partId === fault.culprit && !state.fixed ? fault.inspectBad : part.inspectOk;
}
