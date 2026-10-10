import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Action, ActionType, Fault, FaultFile, Machine, PartId } from "../src/core/types.ts";
import { removalOrder } from "../src/core/rules.ts";

const here = dirname(fileURLToPath(import.meta.url));
const machineDir = join(here, "..", "public", "machines", "gen950");

export function loadMachine(): Machine {
  return JSON.parse(readFileSync(join(machineDir, "machine.json"), "utf8")) as Machine;
}

export function loadFaults(): FaultFile {
  return JSON.parse(readFileSync(join(machineDir, "faults.json"), "utf8")) as FaultFile;
}

export function faultById(file: FaultFile, id: string): Fault {
  const f = file.faults.find((x) => x.id === id);
  if (!f) throw new Error(`no fault ${id}`);
  return f;
}

/** Builds a log with evenly spaced timestamps. */
export function log(steps: Array<[ActionType, PartId?]>, stepMs = 1000): Action[] {
  return steps.map(([type, partId], i) => (partId ? { t: (i + 1) * stepMs, type, partId } : { t: (i + 1) * stepMs, type }));
}

/** The shortest correct play for a fault: remove the necessary set in order, inspect and fix the culprit, put back in reverse, pull. */
export function perfectPlay(machine: Machine, fault: Fault, stepMs = 1000): Action[] {
  const order = removalOrder(machine, fault);
  const steps: Array<[ActionType, PartId?]> = [];
  for (const id of order) steps.push(["remove", id]);
  steps.push(["inspect", fault.culprit]);
  steps.push(["fix", fault.culprit]);
  for (const id of [...order].reverse()) steps.push(["install", id]);
  steps.push(["pull"]);
  return log(steps, stepMs);
}
