// Removal and install rules (ADR 0004), and when a check is possible (ADR 0029). Pure functions over machine data and a
// round state.

import { CHECK_SECONDS } from "./constants.ts";
import { CHECK_IDS, type CheckId, type Fault, type Machine, type PartId, type RoundState } from "./types.ts";

/** What a check still needs before it can be done: parts to take off, parts to put on, or every part on. */
export interface UnmetNeeds {
  /** Parts still on that must be off. */
  off: PartId[];
  /** Parts off that must be on. */
  on: PartId[];
  /** The check needs every part on, and some are off. */
  allOn: boolean;
}

export function isCheckId(id: unknown): id is CheckId {
  return typeof id === "string" && (CHECK_IDS as readonly string[]).includes(id);
}

/**
 * What a check still needs, from the machine's `checks` data alone (ADR 0029): facts the player can see, never anything
 * about the fault. Null for an id that is not a check of this machine.
 */
export function unmetNeeds(machine: Machine, state: RoundState, checkId: CheckId): UnmetNeeds | null {
  const needs = isCheckId(checkId) ? machine.checks?.[checkId] : undefined;
  if (!needs) return null;
  return {
    off: (needs.off ?? []).filter((id) => state.installed.has(id)),
    on: (needs.on ?? []).filter((id) => !state.installed.has(id)),
    allOn: needs.allOn === true && machine.parts.some((p) => !state.installed.has(p.id)),
  };
}

/** True when the machine is in the state a check needs. Says nothing about whether it was done or the fault is fixed. */
export function checkPossible(machine: Machine, state: RoundState, checkId: CheckId): boolean {
  const n = unmetNeeds(machine, state, checkId);
  return n !== null && n.off.length === 0 && n.on.length === 0 && !n.allOn;
}

/** Seconds the checks done so far cost (ADR 0029). */
export function checkSeconds(checks: readonly CheckId[]): number {
  let total = 0;
  for (const id of checks) total += CHECK_SECONDS[id] ?? 0;
  return total;
}

export function partById(machine: Machine, id: PartId) {
  return machine.parts.find((p) => p.id === id);
}

/** Installed parts that must come off before `partId` can. Empty means it can come off now. */
export function blockers(machine: Machine, state: RoundState, partId: PartId): PartId[] {
  const part = partById(machine, partId);
  if (!part) return [];
  return part.requires.filter((dep) => state.installed.has(dep));
}

/** Installed parts that hide `partId` (ADR 0011). `hiddenBy` defaults to `requires`. Empty means it can be seen. */
export function hiders(machine: Machine, state: RoundState, partId: PartId): PartId[] {
  const part = partById(machine, partId);
  if (!part) return [];
  return (part.hiddenBy ?? part.requires).filter((id) => state.installed.has(id));
}

/** An installed part that nothing hides. Parts in the tray are not "visible" here; they are inspected from the tray. */
export function isVisible(machine: Machine, state: RoundState, partId: PartId): boolean {
  return state.installed.has(partId) && hiders(machine, state, partId).length === 0;
}

export function canRemove(machine: Machine, state: RoundState, partId: PartId): boolean {
  return state.installed.has(partId) && blockers(machine, state, partId).length === 0;
}

/**
 * Parts that list `partId` in their requires and are not yet back on.
 * If P requires X, then X sits on top of P (X had to come off before P could). So P must go back before X can.
 * The brief: a part can go back only when every part that lists it in `requires` is already back on.
 */
export function missingDependents(machine: Machine, state: RoundState, partId: PartId): PartId[] {
  return machine.parts.filter((p) => p.requires.includes(partId) && !state.installed.has(p.id)).map((p) => p.id);
}

export function canInstall(machine: Machine, state: RoundState, partId: PartId): boolean {
  return state.tray.includes(partId) && missingDependents(machine, state, partId).length === 0;
}

/** The culprit plus everything in its requires, transitively. Removing any of these is never a wrong part. */
export function necessarySet(machine: Machine, fault: Fault): Set<PartId> {
  const out = new Set<PartId>();
  const todo = [fault.culprit];
  while (todo.length) {
    const id = todo.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const part = partById(machine, id);
    if (part) todo.push(...part.requires);
  }
  return out;
}

/** Every part that can come off right now. Diagnostic mode shows this; player mode never does. */
export function removableNow(machine: Machine, state: RoundState): PartId[] {
  return machine.parts.filter((p) => canRemove(machine, state, p.id)).map((p) => p.id);
}

/** A valid removal order for the necessary set: dependencies first. */
export function removalOrder(machine: Machine, fault: Fault): PartId[] {
  const need = necessarySet(machine, fault);
  const order: PartId[] = [];
  const done = new Set<PartId>();
  function visit(id: PartId) {
    if (done.has(id)) return;
    done.add(id);
    for (const dep of partById(machine, id)?.requires ?? []) visit(dep);
    order.push(id);
  }
  for (const id of need) visit(id);
  return order;
}
