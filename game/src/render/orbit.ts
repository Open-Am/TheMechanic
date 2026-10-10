// Orbit camera maths, written in the project because OrbitControls cannot hand a drag over to the pull gesture.
// Pure: the scene copies position() onto the Three.js camera.

import type { Vec3 } from "../core/index.ts";

export interface OrbitLimits {
  minDistance: number;
  maxDistance: number;
  /** Polar angle from straight up, in radians. */
  minPolar: number;
  maxPolar: number;
}

export interface OrbitState {
  /** Azimuth around the up axis, radians. 0 looks at the front (+Z) of the machine. */
  azimuth: number;
  polar: number;
  distance: number;
}

/** Radians of rotation per CSS pixel of drag. */
export const ROTATE_PER_PX = 0.008;

export function clampOrbit(s: OrbitState, l: OrbitLimits): OrbitState {
  return {
    azimuth: s.azimuth,
    polar: Math.min(l.maxPolar, Math.max(l.minPolar, s.polar)),
    distance: Math.min(l.maxDistance, Math.max(l.minDistance, s.distance)),
  };
}

/** Dragging right turns the machine right (the camera goes left); dragging down tilts to look from above. */
export function rotate(s: OrbitState, dxPx: number, dyPx: number, l: OrbitLimits): OrbitState {
  return clampOrbit({ ...s, azimuth: s.azimuth - dxPx * ROTATE_PER_PX, polar: s.polar - dyPx * ROTATE_PER_PX }, l);
}

/** factor > 1 moves away, < 1 moves closer. */
export function zoom(s: OrbitState, factor: number, l: OrbitLimits): OrbitState {
  if (!(factor > 0) || !Number.isFinite(factor)) return s;
  return clampOrbit({ ...s, distance: s.distance * factor }, l);
}

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
