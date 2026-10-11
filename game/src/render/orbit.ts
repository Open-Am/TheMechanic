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

// ---- Framing above the controls (release 0.9.3) ----

export const FRAME = {
  /** The machine always gets at least this share of the view's height, however tall the controls grow. */
  minFreeShare: 0.4,
} as const;

/**
 * Frames the machine in the part of the view the controls leave free: `coverPx` CSS px at the bottom of a view
 * `widthPx` by `heightPx` are covered by the pull cord and the tray. Returns how far to move the picture up (CSS px, a
 * view offset on the camera) and how much farther the camera must stand than the whole-view fit for the machine to fit
 * the free part. On a narrow portrait screen the width decides the fit, so the scale stays 1 and the machine keeps its
 * size; it only moves up.
 */
export function frameAbove(fovY: number, widthPx: number, heightPx: number, coverPx: number): { shiftPx: number; distanceScale: number } {
  if (!(coverPx > 0) || !(heightPx > 0) || !(widthPx > 0)) return { shiftPx: 0, distanceScale: 1 };
  const free = Math.max(heightPx * FRAME.minFreeShare, heightPx - coverPx);
  const fovFree = 2 * Math.atan((Math.tan(fovY / 2) * free) / heightPx);
  const scale = fitDistance(1, fovFree, widthPx / free) / fitDistance(1, fovY, widthPx / heightPx);
  return { shiftPx: (heightPx - free) / 2, distanceScale: Math.max(1, scale) };
}

/** A y in normalised device coordinates of a view moved up by `shiftPx`, in the unmoved frustum the orbit maths uses. */
export function unshiftNdcY(ndcY: number, shiftPx: number, heightPx: number): number {
  return ndcY - (2 * shiftPx) / heightPx;
}

/** World units per CSS pixel at `distance` from a perspective camera. */
export function worldPerPixel(distance: number, fovY: number, viewportHeightPx: number): number {
  return (2 * distance * Math.tan(fovY / 2)) / viewportHeightPx;
}

// ---- Turning by the hand (plan 0010, ADR 0020) ----

export const TURN = {
  /** Most the camera may move in one step, radians on each of azimuth and tilt. */
  maxStep: 0.15,
  /** Radians used to estimate how the held point moves on screen. */
  eps: 1e-3,
  /** CSS px the held point may lag the pointer before the hand lets go and grabs again under the pointer. */
  regripPx: 60,
} as const;

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

/**
 * Where `point` lands on screen, in normalised device coordinates (-1 to 1, y up), for a camera orbiting `target`
 * with the world's up as up, as the scene's camera does. Null if the point is behind the camera.
 */
export function projectPoint(s: OrbitState, target: Vec3, point: Vec3, fovY: number, aspect: number): [number, number] | null {
  const eye = position(s, target);
  const f = unit3(sub3(target, eye));
  const r = unit3(cross3(f, [0, 1, 0]));
  const u = cross3(r, f);
  const d = sub3(point, eye);
  const z = dot3(d, f);
  if (z <= 1e-6) return null;
  const t = Math.tan(fovY / 2);
  return [dot3(d, r) / (z * t * aspect), dot3(d, u) / (z * t)];
}

/**
 * One step of turning the camera so that `point` (the spot the hand holds) moves towards the pointer at `ndc`: a
 * Newton step on azimuth and tilt, its screen motion estimated numerically, each change capped at TURN.maxStep.
 */
export function turnToward(s: OrbitState, l: OrbitLimits, target: Vec3, point: Vec3, ndc: [number, number], fovY: number, aspect: number): OrbitState {
  const p0 = projectPoint(s, target, point, fovY, aspect);
  const pa = projectPoint({ ...s, azimuth: s.azimuth + TURN.eps }, target, point, fovY, aspect);
  const pp = projectPoint({ ...s, polar: s.polar + TURN.eps }, target, point, fovY, aspect);
  if (!p0 || !pa || !pp) return s;
  const j00 = (pa[0] - p0[0]) / TURN.eps;
  const j01 = (pp[0] - p0[0]) / TURN.eps;
  const j10 = (pa[1] - p0[1]) / TURN.eps;
  const j11 = (pp[1] - p0[1]) / TURN.eps;
  const det = j00 * j11 - j01 * j10;
  if (Math.abs(det) < 1e-9) return s;
  const ex = ndc[0] - p0[0];
  const ey = ndc[1] - p0[1];
  const cap = (v: number) => Math.max(-TURN.maxStep, Math.min(TURN.maxStep, v));
  const da = cap((j11 * ex - j01 * ey) / det);
  const dp = cap((-j10 * ex + j00 * ey) / det);
  return clampOrbit({ ...s, azimuth: s.azimuth + da, polar: s.polar + dp }, l);
}
