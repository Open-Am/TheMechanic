// Removal and install rules (ADR 0004). Pure functions over machine data and a round state.

import type { Fault, Machine, PartId, RoundState } from "./types.ts";

export function partById(machine: Machine, id: PartId) {
  return machine.parts.find((p) => p.id === id);
}

/** Installed parts that must come off before `partId` can. Empty means it can come off now. */
export function blockers(machine: Machine, state: RoundState, partId: PartId): PartId[] {
  const part = partById(machine, partId);
  if (!part) return [];
  return part.requires.filter((dep) => state.installed.has(dep));
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
