// Text-mode player (plan 0001). Plays every fault to completion from an action log and prints each step and the score.
// Run from the repository root with `npm run play`, or `node tools/play/play.ts [machineId]`. Each play checks first and
// prints what every check shows (ADR 0029).
// Node 22.6 or later strips the types itself; no build step.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, initialState, clueText, conditionText } from "../../game/src/core/reducer.ts";
import { checkPossible, isVisible, removalOrder, removableNow } from "../../game/src/core/rules.ts";
import { scoreState } from "../../game/src/core/score.ts";
import { validateAll } from "../../game/src/core/validate.ts";
import { CHECK_IDS, type Action, type ActionType, type CheckId, type CustomerFile, type Fault, type FaultFile, type Machine, type PartId, type RoundState } from "../../game/src/core/types.ts";
import { walkOutTime } from "../../game/src/core/patience.ts";

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
 *  It opens with a check (ADR 0029): the first one possible with every part on, as a mechanic would listen first. Then
 *  it looks at the first part on the removal path where it sits (ADR 0011), and does every other check that becomes
 *  possible on the way in. */
function perfectPlay(fault: Fault, stepMs: number): Action[] {
  const order = removalOrder(machine, fault);
  const steps: Array<[ActionType, PartId | CheckId | undefined]> = [];
  let state = initialState(machine);
  const done = new Set<CheckId>();
  const checksNow = (all: boolean) => {
    for (const id of CHECK_IDS) {
      if (done.has(id) || !checkPossible(machine, state, id)) continue;
      done.add(id);
      steps.push(["check", id]);
      if (!all) return;
    }
  };
  checksNow(false);
  const look = order.find((id) => isVisible(machine, state, id));
  if (look) steps.push(["inspect", look]);
  for (const id of order) {
    steps.push(["remove", id]);
    const installed = new Set(state.installed);
    installed.delete(id);
    state = { ...state, installed, tray: [...state.tray, id] };
    checksNow(true);
  }
  steps.push(["inspect", fault.culprit], ["fix", fault.culprit]);
  for (const id of [...order].reverse()) steps.push(["install", id]);
  steps.push(["pull", undefined]);
  return steps.map(([type, id], i) => {
    const t = (i + 1) * stepMs;
    if (type === "check") return { t, type, checkId: id as CheckId };
    return id ? { t, type, partId: id } : { t, type };
  });
}

function describe(fault: Fault, state: RoundState, action: Action): string {
  const who = action.partId ?? "";
  switch (action.type) {
    case "remove": return `remove ${who}`;
    case "inspect": return `inspect ${who}${state.installed.has(who) ? " in place" : ""}: "${conditionText(machine, fault, state, who)}"`;
    case "fix": return `fix ${who}: ${fault.fix}`;
    case "install": return `put back ${who}`;
    case "pull": return "pull the cord";
    case "check": return `check ${action.checkId}`;
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
    const extra =
      action.type === "pull" ? (state.endedAt !== null ? "  -> the engine starts" : "  -> failed pull") : action.type === "check" ? `: "${clueText(fault, state, action.checkId!)}"` : "";
    console.log(`   ${String(action.t / 1000).padStart(3)}s  ${line}${extra}`);
  }
  const s = scoreState(machine, fault, state, state.endedAt ?? state.t);
  console.log(`   score ${s.total} (${s.elapsedSeconds}s + ${s.wrongParts} wrong + ${s.failedPulls} failed pulls + ${s.checkSeconds}s of checks${s.clean ? " - clean job" : ""})  ${"★".repeat(s.stars)}  ${s.complete ? "complete" : "INCOMPLETE"}`);
  if (state.checksDone.length === 0) allOk = false;
  if (!s.complete) allOk = false;
}

// A walked round (ADR 0015): the most impatient customer, a wrong part, then two failed pulls.
const customers = JSON.parse(readFileSync(join(root, "game", "public", "customers.json"), "utf8")) as CustomerFile;
const impatient = [...customers.customers].sort((a, b) => a.patience - b.patience)[0]!;
const walkFault = faultFile.faults[0]!;
console.log(`\n== walk-out ==  ${impatient.name} (patience ${impatient.patience}s) brings ${walkFault.id}`);
let ws = initialState(machine);
const walkLog: Action[] = [
  { t: 5000, type: "remove", partId: "muffler" },
  { t: 10000, type: "install", partId: "muffler" },
  { t: 20000, type: "pull" },
  { t: 40000, type: "pull" },
  { t: 41000, type: "remove", partId: removalOrder(machine, walkFault)[0]! },
];
for (const action of walkLog) {
  const r = apply(machine, walkFault, ws, action, impatient);
  const label = `${String(action.t / 1000).padStart(3)}s  ${action.type} ${action.partId ?? ""}`;
  if (!r.ok) {
    console.log(`   ${label}  -> REFUSED ${r.refusal.reason}`);
    break;
  }
  ws = r.state;
  console.log(`   ${label}  (leaves at ${walkOutTime(ws, impatient) / 1000}s)`);
}
// Scored a second after the walk-out, whatever the patience (since release 0.11 customers wait minutes, not seconds).
const walked = scoreState(machine, walkFault, ws, walkOutTime(ws, impatient) + 1000, impatient);
console.log(`   ${impatient.name} took the generator away at ${walked.elapsedSeconds}s: outcome ${walked.outcome}, ${walked.stars} stars`);
if (walked.outcome !== "walked") allOk = false;

console.log(allOk ? "\nAll faults solved." : "\nSome faults did not complete.");
process.exit(allOk ? 0 : 1);
