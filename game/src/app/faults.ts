// Free-play fault choice (ADR 0010: fault selection lives in app).

import type { Fault, FaultId } from "../core/index.ts";

/** Picks a fault uniformly at random, never `previous` when there is any other choice. `random` returns [0, 1). */
export function pickFault(faults: readonly Fault[], previous: FaultId | null, random: () => number): Fault {
  if (faults.length === 0) throw new Error("No faults to pick from.");
  const choices = faults.length > 1 ? faults.filter((f) => f.id !== previous) : faults;
  const i = Math.min(choices.length - 1, Math.floor(random() * choices.length));
  return choices[i]!;
}
