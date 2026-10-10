// Types for the data contracts (ADR 0003, ADR 0008) and the round (ADR 0004).
// This file, like everything in core, imports nothing.

export type PartId = string;
export type FaultId = string;

export const SYMPTOMS = ["no_start", "starts_then_dies", "runs_no_output", "runs_weak"] as const;
export type Symptom = (typeof SYMPTOMS)[number];

export const MOTION_TYPES = ["slide", "lift", "pull", "unscrew", "unbolt", "unclip"] as const;
export type MotionType = (typeof MOTION_TYPES)[number];
export type Axis = "x" | "y" | "z";

export interface Motion {
  type: MotionType | string;
  axis?: Axis;
  turns?: number;
  duration?: number;
}

export type Vec3 = [number, number, number];

export interface Placeholder {
  shape: "box" | "cylinder";
  axis?: Axis;
  size: Vec3;
  position: Vec3;
  color: string;
}

export interface BasePiece {
  id: string;
  placeholder: Placeholder;
}

export interface Part {
  id: PartId;
  name: string;
  does: string;
  requires: PartId[];
  /** Parts that hide this one while installed (ADR 0011). Absent means the same as `requires`. */
  hiddenBy?: PartId[];
  inspectOk: string;
  placeholder: Placeholder;
  explode: Vec3;
  motion?: Motion;
}

export interface Machine {
  id: string;
  name: string;
  schema: number;
  verified: boolean;
  size: Vec3;
  base: BasePiece[];
  parts: Part[];
}

export interface Fault {
  id: FaultId;
  complaint: string;
  symptom: Symptom;
  culprit: PartId;
  inspectBad: string;
  fix: string;
  author: string;
  verified: boolean;
}

export interface FaultFile {
  machine: string;
  schema: number;
  faults: Fault[];
}

// ---- Round (ADR 0004) ----

export const ACTION_TYPES = ["remove", "inspect", "fix", "install", "pull"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** One entry in the action log. `t` is milliseconds since the timer started. */
export interface Action {
  t: number;
  type: ActionType;
  partId?: PartId;
}

export interface RoundState {
  /** Parts currently on the machine. */
  installed: ReadonlySet<PartId>;
  /** Parts in the tray, in the order they came off. */
  tray: readonly PartId[];
  /** Every part that has ever been removed this round. Drives wrongParts. */
  removedEver: ReadonlySet<PartId>;
  fixed: boolean;
  failedPulls: number;
  /** Time of the last applied action, in ms. */
  t: number;
  /** Set when the engine starts. The round is over. */
  endedAt: number | null;
}

export type RefusalReason =
  | "unknown_part"
  | "round_over"
  | "not_installed"
  | "blocked_by"
  | "hidden_by"
  | "not_in_tray"
  | "dependents_missing"
  | "not_culprit"
  | "already_fixed"
  | "parts_missing"
  | "time_went_backwards";

export interface Refusal {
  reason: RefusalReason;
  action: Action;
  /** For blocked_by: installed parts from `requires`. For hidden_by: installed parts that hide it. For dependents_missing: parts that must go back first. For parts_missing: the parts still in the tray. */
  parts?: PartId[];
}

export type ApplyResult = { ok: true; state: RoundState } | { ok: false; refusal: Refusal };

export interface ScoreBreakdown {
  elapsedSeconds: number;
  wrongParts: number;
  failedPulls: number;
  total: number;
  stars: 1 | 2 | 3;
  /** The log replayed cleanly to a finished round. */
  complete: boolean;
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
