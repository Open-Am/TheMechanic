// Camera helpers shared by the scene and the tray pictures. Pure.
//
// Since plan 0016 (ADR 0025) the scene's camera no longer orbits the machine: render/stage.ts frames it from a standing
// mechanic's eye and turns the machine instead. What stays here: the orbit position the tray pictures still use for
// their three-quarter view, fitting a sphere in view, world size per pixel, and the turning rates and limits.

import type { Vec3 } from "../core/index.ts";

export interface OrbitState {
  /** Azimuth around the up axis, radians. 0 looks at the front (+Z) of the machine. */
  azimuth: number;
  /** Polar angle from straight up, radians. */
  polar: number;
  distance: number;
}

/** Radians of turn per CSS pixel of drag. */
export const ROTATE_PER_PX = 0.008;

export function position(s: OrbitState, target: Vec3): Vec3 {
  const sinP = Math.sin(s.polar);
  return [
    target[0] + s.distance * sinP * Math.sin(s.azimuth),
    target[1] + s.distance * Math.cos(s.polar),
    target[2] + s.distance * sinP * Math.cos(s.azimuth),
  ];
}

/**
 * The distance at which a sphere of `radius` fits the narrower of the two fields of view, with margin.
 * `fovY` in radians, `aspect` = width / height.
 */
export function fitDistance(radius: number, fovY: number, aspect: number, margin = 1.15): number {
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
  const fov = Math.min(fovY, fovX);
  return (radius * margin) / Math.sin(fov / 2);
}

/** World units per CSS pixel at `distance` from a perspective camera. */
export function worldPerPixel(distance: number, fovY: number, viewportHeightPx: number): number {
  return (2 * distance * Math.tan(fovY / 2)) / viewportHeightPx;
}

// ---- Turning by the hand (plan 0010, ADR 0020; the solver is turnStageToward in stage.ts since plan 0016) ----

export const TURN = {
  /** Most the view may change in one step, radians on each of its two variables. */
  maxStep: 0.15,
  /** Radians used to estimate how the held point moves on screen. */
  eps: 1e-3,
  /** CSS px the held point may lag the pointer before the hand lets go and grabs again under the pointer. */
  regripPx: 60,
} as const;
