// Motion defaults and poses (ADR 0008, docs/design/animation.md). The one file that holds the defaults.
// Pure: a pose is a function of the motion, the explode vector and progress p, where 0 is installed and 1 is fully out.
// Install plays the same pose with p running from 1 back to 0.

import { MOTION_TYPES, type Axis, type Motion, type MotionType, type Vec3 } from "../core/index.ts";
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
