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

/** What holds a part on (ADR 0020): a bolt, a screw or a nut. Fasteners are not parts. */
export const FASTENER_KINDS = ["bolt", "screw", "nut"] as const;
export type FastenerKind = (typeof FASTENER_KINDS)[number];

export interface Fastener {
  /** Unique across the machine, written `<part id>.<name>`, e.g. `alternator_cover.bolt_1`. */
  id: string;
  kind: FastenerKind;
  /** Where it sits, in the machine's axes and metres, as `placeholder.position` is. */
  position: Vec3;
  /** The direction it backs out along, a unit vector. */
  axis: Vec3;
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
  /** What holds it on, undone by the hand while loosening (ADR 0020). Absent means none. */
  fasteners?: Fastener[];
}

// ---- Diagnosis checks (ADR 0029) ----

/** The six checks, a fixed vocabulary like the symptoms. */
export const CHECK_IDS = ["listen_pull", "look_smoke", "look_plug", "spark_test", "fuel_flow", "volts_test"] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** When a check is possible, as data in machine.json (ADR 0029). */
export interface CheckNeeds {
  /** Parts that must be off the machine (in the tray). */
  off?: PartId[];
  /** Parts that must be on the machine. */
  on?: PartId[];
  /** Every part must be on. */
  allOn?: boolean;
  /** The tester the hand fetches from the toolbox, if any. A visual only. */
  tool?: string;
}

export interface Machine {
  id: string;
  name: string;
  schema: number;
  verified: boolean;
  size: Vec3;
  base: BasePiece[];
  parts: Part[];
  /** Every check of CHECK_IDS, keyed by id (ADR 0029). */
  checks: Record<CheckId, CheckNeeds>;
}

/** How hard a fault is (ADR 0030): how deep the bad part sits and how much another fault looks like it. */
export const DIFFICULTIES = [1, 2, 3] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface Fault {
  id: FaultId;
  complaint: string;
  symptom: Symptom;
  culprit: PartId;
  inspectBad: string;
  fix: string;
  /** 1, 2 or 3 (ADR 0030). */
  difficulty: Difficulty;
  /** What each check shows, one line of player text per check (ADR 0029). Never names the bad part. */
  clues: Record<CheckId, string>;
  author: string;
  verified: boolean;
}

export interface FaultFile {
  machine: string;
  schema: number;
  faults: Fault[];
}

// ---- Customers (ADR 0015) ----

export const CUSTOMER_MOMENTS = ["arrive", "waiting", "annoyed", "leaving", "pleased"] as const;
export type CustomerMoment = (typeof CUSTOMER_MOMENTS)[number];

export interface Customer {
  id: string;
  name: string;
  /** Which character model and outfit (used once the 3D customer exists). */
  look: string;
  /** Seconds of patience at the start of the round. */
  patience: number;
  /** What the customer says at each moment, in Nigerian Pidgin. At least one line per moment. */
  lines: Record<CustomerMoment, string[]>;
  /** False until the owner or the mechanic has checked the lines. */
  verified: boolean;
}

export interface CustomerFile {
  schema: number;
  customers: Customer[];
}

export type RoundOutcome = "fixed" | "walked";

// ---- Round (ADR 0004) ----

export const ACTION_TYPES = ["remove", "inspect", "fix", "install", "pull", "check"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** One entry in the action log. `t` is milliseconds since the timer started. */
export interface Action {
  t: number;
  type: ActionType;
  partId?: PartId;
  /** For a check (ADR 0029): which one. */
  checkId?: CheckId;
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
  /** Checks done this round, in the order they were done (ADR 0029). Each at most once. */
  checksDone: readonly CheckId[];
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
  | "time_went_backwards"
  | "customer_left"
  | "check_unavailable"
  | "already_checked";

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
  /** The sum of the costs of the checks done, in seconds (ADR 0029). */
  checkSeconds: number;
  /** Fixed with no wrong parts and no failed pulls: earns CLEAN_BONUS (ADR 0029). */
  clean: boolean;
  /** Never below 0. */
  total: number;
  /** 0 for a round the customer walked out of (ADR 0015). */
  stars: 0 | 1 | 2 | 3;
  /** The log replayed cleanly to a finished round. */
  complete: boolean;
  /** How the round ended, or null while it is still going. */
  outcome: RoundOutcome | null;
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
