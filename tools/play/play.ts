// Text-mode player (plan 0001). Plays every fault to completion from an action log and prints each step and the score.
// Run from the repository root with `npm run play`, or `node tools/play/play.ts [machineId]`.
// Node 22.6 or later strips the types itself; no build step.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, initialState, conditionText } from "../../game/src/core/reducer.ts";
import { isVisible, removalOrder, removableNow } from "../../game/src/core/rules.ts";
import { scoreState } from "../../game/src/core/score.ts";
import { validateAll } from "../../game/src/core/validate.ts";
import type { Action, ActionType, Fault, FaultFile, Machine, PartId, RoundState } from "../../game/src/core/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const machineId = process.argv[2] ?? "gen950";
const dir = join(root, "game", "public", "machines", machineId);
const machine = JSON.parse(readFileSync(join(dir, "machine.json"), "utf8")) as Machine;
const faultFile = JSON.parse(readFileSync(join(dir, "faults.json"), "utf8")) as FaultFile;

const v = validateAll(machine, faultFile);
for (const i of v.issues) console.log(`${i.level}: ${i.message}`);
if (!v.ok) {
  console.error("Data is invalid. Stopping.");
  process.exit(1);
}

/** The shortest correct play, with timestamps that make the score readable.
 *  It opens by looking at the first part on the removal path where it sits (ADR 0011), as a mechanic would. */
function perfectPlay(fault: Fault, stepMs: number): Action[] {
  const order = removalOrder(machine, fault);
  const steps: Array<[ActionType, PartId?]> = [];
  const look = order.find((id) => isVisible(machine, initialState(machine), id));
  if (look) steps.push(["inspect", look]);
  for (const id of order) steps.push(["remove", id]);
  steps.push(["inspect", fault.culprit], ["fix", fault.culprit]);
  for (const id of [...order].reverse()) steps.push(["install", id]);
  steps.push(["pull"]);
  return steps.map(([type, partId], i) => (partId ? { t: (i + 1) * stepMs, type, partId } : { t: (i + 1) * stepMs, type }));
}

function describe(fault: Fault, state: RoundState, action: Action): string {
  const who = action.partId ?? "";
  switch (action.type) {
    case "remove": return `remove ${who}`;
    case "inspect": return `inspect ${who}${state.installed.has(who) ? " in place" : ""}: "${conditionText(machine, fault, state, who)}"`;
    case "fix": return `fix ${who}: ${fault.fix}`;
    case "install": return `put back ${who}`;
    case "pull": return "pull the cord";
  }
}

let allOk = true;
for (const fault of faultFile.faults) {
  console.log(`\n== ${fault.id} ==  "${fault.complaint}"  (${fault.symptom}, culprit ${fault.culprit})`);
  let state = initialState(machine);
  console.log(`   removable now: ${removableNow(machine, state).join(", ")}`);
  for (const action of perfectPlay(fault, 3000)) {
    const line = describe(fault, state, action);
    const r = apply(machine, fault, state, action);
    if (!r.ok) {
      console.log(`   ${String(action.t / 1000).padStart(3)}s  ${line}  -> REFUSED ${r.refusal.reason} ${(r.refusal.parts ?? []).join(",")}`);
      allOk = false;
      break;
    }
    state = r.state;
    const extra = action.type === "pull" ? (state.endedAt !== null ? "  -> the engine starts" : "  -> failed pull") : "";
    console.log(`   ${String(action.t / 1000).padStart(3)}s  ${line}${extra}`);
  }
  const s = scoreState(machine, fault, state, state.endedAt ?? state.t);
  console.log(`   score ${s.total} (${s.elapsedSeconds}s + ${s.wrongParts} wrong + ${s.failedPulls} failed pulls)  ${"★".repeat(s.stars)}  ${s.complete ? "complete" : "INCOMPLETE"}`);
  if (!s.complete) allOk = false;
}

console.log(allOk ? "\nAll faults solved." : "\nSome faults did not complete.");
process.exit(allOk ? 0 : 1);
