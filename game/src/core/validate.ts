// Validator for machine.json and faults.json (ADR 0003 section "Validation", ADR 0008).
// Never throws. Returns every issue found so a data author sees them all at once.

import { MOTION_TYPES, SYMPTOMS, type FaultFile, type Machine, type ValidationIssue, type ValidationResult } from "./types.ts";

function result(issues: ValidationIssue[]): ValidationResult {
  return { ok: !issues.some((i) => i.level === "error"), issues };
}

function error(code: string, message: string): ValidationIssue {
  return { level: "error", code, message };
}

function warning(code: string, message: string): ValidationIssue {
  return { level: "warning", code, message };
}

/** Finds a cycle in `requires`. Returns the cycle as a list of part IDs, or null. */
export function findRequiresCycle(machine: Machine): string[] | null {
  const requires = new Map(machine.parts.map((p) => [p.id, p.requires]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    const s = state.get(id);
    if (s === "done") return null;
    if (s === "visiting") return stack.slice(stack.indexOf(id)).concat(id);
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of requires.get(id) ?? []) {
      if (!requires.has(dep)) continue; // reported separately as unknown
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  }

  for (const p of machine.parts) {
    const cycle = visit(p.id);
    if (cycle) return cycle;
  }
  return null;
}

export function validateMachine(machine: Machine): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();

  for (const piece of [...machine.base, ...machine.parts]) {
    if (ids.has(piece.id)) issues.push(error("duplicate_id", `Duplicate ID "${piece.id}".`));
    ids.add(piece.id);
  }
  for (const b of machine.base) {
    if (!b.id.startsWith("base_")) issues.push(warning("base_prefix", `Base piece "${b.id}" should start with "base_".`));
  }

  const partIds = new Set(machine.parts.map((p) => p.id));
  for (const p of machine.parts) {
    for (const dep of p.requires) {
      if (!partIds.has(dep)) issues.push(error("unknown_requires", `Part "${p.id}" requires "${dep}", which is not a part.`));
      if (dep === p.id) issues.push(error("self_requires", `Part "${p.id}" requires itself.`));
    }
    for (const hider of p.hiddenBy ?? []) {
      if (!partIds.has(hider)) issues.push(error("unknown_hidden_by", `Part "${p.id}" is hidden by "${hider}", which is not a part.`));
      else if (!p.requires.includes(hider)) issues.push(warning("hidden_by_not_required", `Part "${p.id}" is hidden by "${hider}", which is not in its requires. Check this is meant.`));
    }
    if (p.motion &&!(MOTION_TYPES as readonly string[]).includes(p.motion.type)) {
      issues.push(warning("unknown_motion", `Part "${p.id}" has motion type "${p.motion.type}", which this build does not know. It will play as "slide".`));
    }
  }

  const cycle = findRequiresCycle(machine);
  if (cycle) issues.push(error("requires_cycle", `Cycle in requires: ${cycle.join(" -> ")}.`));

  return result(issues);
}

export function validateFaults(file: FaultFile, machine: Machine): ValidationResult {
  const issues: ValidationIssue[] = [];
  const partIds = new Set(machine.parts.map((p) => p.id));
  const seen = new Set<string>();

  if (file.machine !== machine.id) {
    issues.push(error("machine_mismatch", `Faults are for "${file.machine}" but the machine is "${machine.id}".`));
  }
  for (const f of file.faults) {
    if (seen.has(f.id)) issues.push(error("duplicate_id", `Duplicate fault ID "${f.id}".`));
    seen.add(f.id);
    if (!partIds.has(f.culprit)) issues.push(error("unknown_culprit", `Fault "${f.id}" blames "${f.culprit}", which is not a part.`));
    if (!(SYMPTOMS as readonly string[]).includes(f.symptom)) issues.push(error("unknown_symptom", `Fault "${f.id}" has symptom "${f.symptom}", which is not one of ${SYMPTOMS.join(", ")}.`));
  }
  if (file.faults.length === 0) issues.push(error("no_faults", "The fault file has no faults."));

  return result(issues);
}

/** Validates both files together. The fault check is skipped if the machine is invalid. */
export function validateAll(machine: Machine, faults: FaultFile): ValidationResult {
  const m = validateMachine(machine);
  if (!m.ok) return m;
  const f = validateFaults(faults, machine);
  return result([...m.issues, ...f.issues]);
}
