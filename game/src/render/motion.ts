// Motion defaults and poses (ADR 0008, docs/design/animation.md). The one file that holds the defaults.
// Pure: a pose is a function of the motion, the explode vector and progress p, where 0 is installed and 1 is fully out.
// Install plays the same pose with p running from 1 back to 0.

import { MOTION_TYPES, type Axis, type FastenerKind, type Motion, type MotionType, type Vec3 } from "../core/index.ts";
import { clamp01, ease } from "./tween.ts";

export interface ResolvedMotion {
  type: MotionType;
  axis: Axis;
  turns: number;
  duration: number;
}

export const MOTION_DEFAULTS: Record<MotionType, ResolvedMotion> = {
  slide: { type: "slide", axis: "y", turns: 0, duration: 0.45 },
  lift: { type: "lift", axis: "y", turns: 0, duration: 0.6 },
  pull: { type: "pull", axis: "y", turns: 0, duration: 0.5 },
  unscrew: { type: "unscrew", axis: "y", turns: 2, duration: 0.8 },
  unbolt: { type: "unbolt", axis: "y", turns: 0, duration: 0.6 },
  unclip: { type: "unclip", axis: "x", turns: 0, duration: 0.5 },
};

/** Other timings from docs/design/animation.md, in seconds unless named otherwise. */
export const TIMING = {
  drift: 0.35,
  cameraEase: 0.4,
  cameraCloser: 0.15,
  press: 0.1,
  pressScale: 1.06,
  settleSeconds: 0.1,
  settleDrop: 0.002,
  pullStretchSeconds: 0.15,
  pullStretch: 0.1,
  unclipRockSeconds: 0.15,
  unclipRockDegrees: 8,
  unboltTurnDegrees: 10,
} as const;

/** Fills in defaults. An unknown type plays as slide (ADR 0008). */
export function resolveMotion(motion: Motion | undefined): ResolvedMotion {
  const known = motion && (MOTION_TYPES as readonly string[]).includes(motion.type);
  const base = MOTION_DEFAULTS[known ? (motion!.type as MotionType) : "slide"];
  return {
    type: base.type,
    axis: motion?.axis ?? base.axis,
    turns: motion?.turns ?? base.turns,
    duration: motion?.duration !== undefined && motion.duration > 0 ? motion.duration : base.duration,
  };
}

export interface Pose {
  /** Offset from the installed position, in metres. */
  offset: Vec3;
  /** Rotation about `axis`, in radians. */
  angle: number;
  axis: Axis;
}

const DEG = Math.PI / 180;

function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** Splits p at the fraction `seconds / duration` (at most 0.5). Returns [phase 0 progress or null, phase 1 progress]. */
function split(p: number, seconds: number, duration: number): [number | null, number] {
  const s = Math.min(0.5, seconds / duration);
  return p < s ? [p / s, 0] : [null, (p - s) / (1 - s)];
}

export function poseAt(m: ResolvedMotion, explode: Vec3, progress: number): Pose {
  const p = clamp01(progress);
  const at = (travel: number, angle = 0, extra: Vec3 = [0, 0, 0]): Pose => {
    const o = scale(explode, travel);
    return { offset: [o[0] + extra[0], o[1] + extra[1], o[2] + extra[2]], angle, axis: m.axis };
  };

  switch (m.type) {
    case "slide":
      return at(ease.outCubic(p));
    case "lift": {
      const [settle, rest] = split(p, TIMING.settleSeconds, m.duration);
      if (settle !== null) return at(0, 0, [0, -TIMING.settleDrop * Math.sin(Math.PI * settle), 0]);
      return at(ease.outCubic(rest));
    }
    case "pull": {
      const [stretch, rest] = split(p, TIMING.pullStretchSeconds, m.duration);
      if (stretch !== null) return at(TIMING.pullStretch * ease.outCubic(stretch));
      return at(TIMING.pullStretch + (1 - TIMING.pullStretch) * ease.outCubic(rest));
    }
    case "unscrew":
      return at(p, m.turns * 2 * Math.PI * p);
    case "unbolt": {
      const [settle, rest] = split(p, TIMING.settleSeconds, m.duration);
      if (settle !== null) return at(0, 0, [0, -TIMING.settleDrop * Math.sin(Math.PI * settle), 0]);
      const e = ease.outCubic(rest);
      return at(e, TIMING.unboltTurnDegrees * DEG * e);
    }
    case "unclip": {
      const [rock, rest] = split(p, TIMING.unclipRockSeconds, m.duration);
      if (rock !== null) return at(0, TIMING.unclipRockDegrees * DEG * Math.sin(Math.PI * rock));
      return at(ease.outCubic(rest));
    }
  }
}

// ---- Loosening and carrying (plan 0010, ADR 0020) ----

/** How a part is loosened by the hand, and how it is carried out along its path. Tuning lives here. */
export const LOOSEN = {
  /** Metres a loose part sits proud of its place, along its path. */
  proud: 0.004,
  /** Seconds the hand takes to loosen each kind of part. */
  seconds: { slide: 0.5, lift: 0.6, pull: 0.6, unscrew: 0.9, unbolt: 0.8, unclip: 0.6 } satisfies Record<MotionType, number>,
  /** Share of an unscrewed part's turns done while loosening; the rest as it is carried out. */
  unscrewShare: 0.75,
  /** Degrees a bolted part twists as it cracks loose. */
  unboltDegrees: 4,
} as const;

export const CARRY = {
  /** CSS px of drag that take a loose part from its loose point to the end of its path. */
  outPx: 60,
  /** Seconds a carried part takes to fly back to its loose point when dropped away from the tray. */
  backSeconds: 0.25,
  /** Seconds a part takes to sink into the tray once it is dropped there. */
  intoTraySeconds: 0.2,
  /** Seconds the hand takes to press loose parts home before the cord is pulled. */
  homeSeconds: 0.2,
} as const;

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? scale(v, 1 / l) : [0, 0, 0];
}

/**
 * The pose while the hand loosens a part, q from 0 (in place) to 1 (loose). Each kind frees itself its own way: turns
 * out of its thread, cracks loose, rocks off its clip, tugs off its spigot, or lifts free; all end a few millimetres proud.
 */
export function loosePose(m: ResolvedMotion, explode: Vec3, q: number): Pose {
  const t = clamp01(q);
  const out = (k: number): Vec3 => scale(unit(explode), LOOSEN.proud * k);
  switch (m.type) {
    case "unscrew":
      return { offset: out(t), angle: m.turns * LOOSEN.unscrewShare * 2 * Math.PI * t, axis: m.axis };
    case "unbolt": {
      // A short bite down, then a jolt free with a small twist.
      const bite = t < 0.35 ? -TIMING.settleDrop * Math.sin((Math.PI * t) / 0.35) : 0;
      const e = t < 0.35 ? 0 : ease.outCubic((t - 0.35) / 0.65);
      const o = out(e);
      return { offset: [o[0], o[1] + bite, o[2]], angle: LOOSEN.unboltDegrees * DEG * e, axis: m.axis };
    }
    case "unclip": {
      const rock = t < 0.6 ? TIMING.unclipRockDegrees * DEG * Math.sin((Math.PI * t) / 0.6) : 0;
      return { offset: out(t < 0.6 ? 0 : ease.outCubic((t - 0.6) / 0.4)), angle: rock, axis: m.axis };
    }
    case "pull": {
      // Two tugs: the first stretches it and lets it back, the second frees it.
      const k = t < 0.4 ? 0.6 * Math.sin((Math.PI * t) / 0.4) : ease.outCubic((t - 0.4) / 0.6);
      return { offset: out(k), angle: 0, axis: m.axis };
    }
    case "lift": {
      const settle = t < 0.3 ? -TIMING.settleDrop * Math.sin((Math.PI * t) / 0.3) : 0;
      const o = out(t < 0.3 ? 0 : ease.outCubic((t - 0.3) / 0.7));
      return { offset: [o[0], o[1] + settle, o[2]], angle: 0, axis: m.axis };
    }
    case "slide":
      return { offset: out(ease.outCubic(t)), angle: 0, axis: m.axis };
  }
}

/** The pose while a loose part is carried out along its path: c from 0 (loose) to 1 (the end of its motion). */
export function carryPose(m: ResolvedMotion, explode: Vec3, c: number): Pose {
  const k = clamp01(c);
  const from = loosePose(m, explode, 1);
  const to = poseAt(m, explode, k);
  const mix = (a: number, b: number) => a + (b - a) * k;
  // Never back past the loose point: a part that is out does not sink back in as the carry starts.
  const travel = (i: number) => (Math.abs(to.offset[i]!) >= Math.abs(from.offset[i]!) ? mix(from.offset[i]!, to.offset[i]!) : from.offset[i]!);
  return { offset: [travel(0), travel(1), travel(2)], angle: mix(from.angle, to.angle), axis: m.axis };
}

/** How far out along its path a carried part is, from the drag's length on screen. */
export function carryProgress(dragPx: number): number {
  return clamp01(dragPx / CARRY.outPx);
}

// ---- Fasteners (plan 0011, ADR 0020) ----

/** How the hand undoes and does up fasteners. Tuning lives here. */
export const FASTEN = {
  /** Seconds to turn one fastener out. */
  outSeconds: 0.25,
  /** Turns while it backs out. */
  turns: 2,
  /** Metres it stands proud of its hole once out. */
  backOut: 0.008,
  /** Seconds to do one up again quickly, with no trip to the toolbox (before the cord is pulled). */
  upSeconds: 0.15,
  /** Seconds to do one up again with the tool after a part is put back (plan 0012). */
  doUpSeconds: 0.2,
  /** Seconds the part takes to come free once its fasteners are out (shorter than without fasteners). */
  freeSeconds: 0.3,
  /** Degrees the spanner swings on each stroke; it ratchets back between strokes. */
  spannerStroke: 60,
} as const;

/** A fastener's pose as it turns out: q from 0 (done up) to 1 (out). Angle in radians about its axis, out in metres. */
export function fastenerPose(q: number): { angle: number; out: number } {
  const t = clamp01(q);
  return { angle: FASTEN.turns * 2 * Math.PI * t, out: FASTEN.backOut * t };
}

/**
 * The spanner's swing about the bolt's axis while it turns the bolt out: strokes of FASTEN.spannerStroke that follow
 * the bolt, each followed by a quick swing back, so the spanner stays on the bolt and never spins round it.
 */
export function spannerSwing(q: number): number {
  const strokes = (FASTEN.turns * 360) / FASTEN.spannerStroke;
  const s = clamp01(q) * strokes;
  const f = s - Math.floor(Math.min(s, strokes - 1e-9));
  const forward = 0.8; // share of each stroke spent turning; the rest swings back
  const k = f < forward ? f / forward : 1 - (f - forward) / (1 - forward);
  return (FASTEN.spannerStroke * Math.PI) / 180 * (q >= 1 ? 1 : k);
}

/** When each step of loosening a part happens, in seconds from the start. */
export interface LoosenPlan {
  /** Start time of each fastener, in order. */
  fastenerStarts: number[];
  /** When the part itself starts to come free, and for how long. */
  freeStart: number;
  freeSeconds: number;
  total: number;
}

export function loosenPlan(type: MotionType, fastenerCount: number): LoosenPlan {
  const n = Math.max(0, Math.floor(fastenerCount));
  if (n === 0) return { fastenerStarts: [], freeStart: 0, freeSeconds: LOOSEN.seconds[type], total: LOOSEN.seconds[type] };
  const fastenerStarts = Array.from({ length: n }, (_, i) => i * FASTEN.outSeconds);
  const freeStart = n * FASTEN.outSeconds;
  return { fastenerStarts, freeStart, freeSeconds: FASTEN.freeSeconds, total: freeStart + FASTEN.freeSeconds };
}

// ---- The toolbox trip (plan 0012, ADR 0021) ----

/** How the hand fetches tools from the toolbox and puts them back. Tuning lives here. */
export const TRIP = {
  /** Seconds for one leg at the default view's distance, and the most any leg takes, however far. */
  minSeconds: 0.35,
  maxSeconds: 0.6,
  /** Metres from the toolbox to the machine in the default view, over the top where the path climbs: a leg this long
   *  takes minSeconds. */
  refMetres: 1.0,
  /** Seconds to take a tool out of its slot, or to lay it back in. */
  pickSeconds: 0.12,
  /** Metres the hand's path keeps above the machine's top where it crosses over, and out from a fastener. */
  clearance: 0.05,
  /** The most the path stands off a point inside the machine's bounds before it climbs, metres. */
  maxStandOff: 0.3,
  /** Metres a point may sit inside the bounds along its own outward direction (a recess) before the path leaves by
   *  the nearest way out instead. */
  maxRecess: 0.1,
} as const;

/** The tool a fastener needs (ADR 0020): a screwdriver for screws, a spanner for bolts and nuts. */
export type TripTool = "spanner" | "screwdriver";
const tripToolFor = (kind: FastenerKind): TripTool => (kind === "screw" ? "screwdriver" : "spanner");

/** Seconds for a leg of `metres`: minSeconds at the default view's distance, longer with distance, never past maxSeconds. */
export function legSeconds(metres: number): number {
  const m = Number.isFinite(metres) ? Math.max(0, metres) : 0;
  return Math.min(TRIP.maxSeconds, Math.max(TRIP.minSeconds, (TRIP.minSeconds * m) / TRIP.refMetres));
}

/** One step of the trip. `index` is a fastener's index in the part's own list. */
export type TripStep =
  | { kind: "toToolbox"; tool: TripTool; seconds: number }
  | { kind: "pick"; tool: TripTool; seconds: number }
  | { kind: "toFastener"; tool: TripTool; index: number; seconds: number }
  | { kind: "fasten"; tool: TripTool; index: number; seconds: number }
  | { kind: "free"; seconds: number }
  | { kind: "toSlot"; tool: TripTool; seconds: number }
  | { kind: "putBack"; tool: TripTool; seconds: number }
  | { kind: "home"; seconds: number };

export interface TripPlan {
  steps: TripStep[];
  /** Fastener indices in the order they are worked: grouped by tool, so each tool is fetched once. */
  order: number[];
  total: number;
}

/**
 * The trip for loosening a part (`undo`) or doing it up again after it is put back (`do-up`), from the kinds of its
 * fasteners in order: from the pointer to the toolbox, take the first tool, carry it to the first fastener, work each
 * fastener that tool fits, change tool at the toolbox if another is needed, free the part (loosening only), put the tool
 * back, and return. `metres` are the lengths of the legs from the pointer to the toolbox and from the toolbox to the
 * part. A part without fasteners makes no trip. Pure, so the same fasteners always make the same trip (ADR 0007).
 */
export function tripPlan(kinds: readonly FastenerKind[], mode: "undo" | "do-up", metres: { pointer: number; machine: number }): TripPlan {
  if (kinds.length === 0) return { steps: [], order: [], total: 0 };
  const tools: TripTool[] = [];
  for (const k of kinds) if (!tools.includes(tripToolFor(k))) tools.push(tripToolFor(k));
  const order = tools.flatMap((t) => kinds.flatMap((k, i) => (tripToolFor(k) === t ? [i] : [])));
  const toBox = legSeconds(metres.pointer);
  const across = legSeconds(metres.machine);
  const work = mode === "undo" ? FASTEN.outSeconds : FASTEN.doUpSeconds;
  const steps: TripStep[] = [];
  tools.forEach((tool, n) => {
    // The first leg comes from the pointer; after a tool change the hand is already at the toolbox.
    if (n === 0) steps.push({ kind: "toToolbox", tool, seconds: toBox });
    steps.push({ kind: "pick", tool, seconds: TRIP.pickSeconds });
    const mine = order.filter((i) => tripToolFor(kinds[i]!) === tool);
    steps.push({ kind: "toFastener", tool, index: mine[0]!, seconds: across });
    for (const index of mine) steps.push({ kind: "fasten", tool, index, seconds: work });
    if (n === tools.length - 1 && mode === "undo") steps.push({ kind: "free", seconds: FASTEN.freeSeconds });
    steps.push({ kind: "toSlot", tool, seconds: across });
    steps.push({ kind: "putBack", tool, seconds: TRIP.pickSeconds });
  });
  steps.push({ kind: "home", seconds: toBox });
  return { steps, order, total: steps.reduce((s, x) => s + x.seconds, 0) };
}

/** An axis-aligned box, world space: the machine's bounds. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** How far from `p` along the unit direction `d` the box ends: 0 if `p` is outside it. */
export function exitDistance(p: Vec3, d: Vec3, box: Bounds): number {
  if (p.some((v, i) => v < box.min[i]! || v > box.max[i]!)) return 0;
  let t = Infinity;
  for (let i = 0; i < 3; i++) {
    if (d[i]! > 1e-9) t = Math.min(t, (box.max[i]! - p[i]!) / d[i]!);
    else if (d[i]! < -1e-9) t = Math.min(t, (box.min[i]! - p[i]!) / d[i]!);
  }
  return Number.isFinite(t) ? t : 0;
}

/** True if the segment from a to b passes through the box (slab test). */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Bounds): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i]! - a[i]!;
    if (Math.abs(d) < 1e-12) {
      if (a[i]! < box.min[i]! || a[i]! > box.max[i]!) return false;
      continue;
    }
    let lo = (box.min[i]! - a[i]!) / d;
    let hi = (box.max[i]! - a[i]!) / d;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo);
    t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

/** Ways out of the machine's bounds when a point's own outward direction runs through it: up, then the four sides. */
const OUTWARD: readonly Vec3[] = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

const addScaled = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/**
 * The hand's path between two points, over the machine rather than through it. A point on the machine (the pointer's
 * spot, a fastener) comes with its outward direction `out`, and the path first stands off it along `out` until it is out
 * of the machine's bounds, plus TRIP.clearance: a fastener tucked under the tank's overhang comes out from under it
 * before the hand climbs. If that direction runs more than TRIP.maxRecess inside the bounds, it leaves by the nearest
 * way out instead. If the straight line between the stand-off points would pass through the machine's bounds,
 * the path rises above the machine's top by TRIP.clearance, crosses there, and comes down. Returns the corner points,
 * first and last included.
 */
export function overPath(from: Vec3, fromOut: Vec3 | null, to: Vec3, toOut: Vec3 | null, box: Bounds): Vec3[] {
  const c = TRIP.clearance;
  const standOff = (p: Vec3, out: Vec3): Vec3 => {
    let d = unit(out);
    let t = exitDistance(p, d, box);
    // A direction that runs a long way inside the bounds goes through the machine (a normal that points in, or along a
    // face): leave by the nearest way out instead, up or to a side.
    if (t > TRIP.maxRecess) {
      for (const alt of OUTWARD) {
        const ta = exitDistance(p, alt, box);
        if (ta < t) [t, d] = [ta, alt];
      }
    }
    return addScaled(p, d, Math.min(t, TRIP.maxStandOff) + c);
  };
  const s0 = fromOut ? standOff(from, fromOut) : from;
  const s1 = toOut ? standOff(to, toOut) : to;
  const points: Vec3[] = [from];
  if (fromOut) points.push(s0);
  if (segmentHitsBox(s0, s1, box)) {
    const top = box.max[1] + c;
    points.push([s0[0], Math.max(top, s0[1]), s0[2]], [s1[0], Math.max(top, s1[1]), s1[2]]);
  }
  if (toOut) points.push(s1);
  points.push(to);
  return points;
}

/** The path's length, metres. */
export function pathLength(points: readonly Vec3[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1], points[i]![2] - points[i - 1]![2]);
  return n;
}

/** The point a share t (0 to 1) of the way along the path, by length. */
export function alongPath(points: readonly Vec3[], t: number): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  const total = pathLength(points);
  if (points.length === 1 || total <= 1e-9) return [...points[0]!];
  let left = clamp01(t) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (left <= seg || i === points.length - 1) {
      const k = seg > 1e-12 ? Math.min(1, left / seg) : 1;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    left -= seg;
  }
  return [...points[points.length - 1]!];
}
