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
