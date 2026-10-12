// The workbench stage (plan 0016, ADR 0025): where the bench, the machine, the toolbox and the customer stand, how the
// default camera is framed, and how a drag turns the machine on the bench. Pure: the view copies the results onto
// Three.js objects. Nothing here imports Three.js, so it is unit tested.
//
// World axes: metres, Y up, the floor at y = 0. The bench's long side runs along X; the mechanic (the camera) stands on
// the +Z side and the customer on the -Z side. The machine's own origin (the middle of its base) stands on the bench top
// at the pivot, (0, BENCH.top, 0), and the machine turns about the upright line through it. The camera never moves
// sideways: it looks along -Z, tilted down.

import type { Vec3 } from "../core/index.ts";
import { ROTATE_PER_PX, TURN } from "./orbit.ts";

/** The workbench (ADR 0025): top 0.78 m high, 1.15 by 0.65 m; `centre` is the floor point under the top's middle. */
export const BENCH = {
  top: 0.78,
  width: 1.15,
  depth: 0.65,
  /** Under the middle of the top. The near edge is 0.31 m in front of the pivot, the far edge 0.34 m behind it. */
  centre: [0, 0, -0.015] as Vec3,
} as const;

/** The near and far edges of the bench top, z in world metres. */
export const BENCH_EDGES = { near: BENCH.centre[2] + BENCH.depth / 2, far: BENCH.centre[2] - BENCH.depth / 2 } as const;

/** Where the customer stands (ADR 0025): 0.35 m behind the far edge, facing the mechanic. Placed by plan 0015. */
export const CUSTOMER_SPOT = { x: 0, z: BENCH_EDGES.far - 0.35, rotationY: 0 } as const;

/** The machine's turn on the bench in the default view: the old default camera's three-quarter view (0.55 rad). */
export const DEFAULT_YAW = -0.55;

/**
 * The toolbox on the bench's left end (ADR 0021 as changed by ADR 0025), its back tray with the tools towards the
 * camera. Clear of the circle the machine sweeps as it turns; its far left hangs a little past the bench's end, off
 * screen.
 */
export const TOOLBOX_ON_BENCH = { x: -0.45, z: 0.08, rotationY: Math.PI } as const;

export const FRAMING = {
  /** A standing mechanic's eye, metres above the floor (ADR 0025). */
  eyeHeight: 1.6,
  /** The generator's share of the screen's width in the default view, and the least it may shrink to. */
  widthShare: 0.6,
  minWidthShare: 0.4,
  /** Where the middle of the generator sits across the screen, as a share of its width: a little right of centre, so
   * the toolbox on the bench's left end shows its tools. */
  centreShare: 0.58,
  /** CSS px between the generator's lowest point and the top of the controls. */
  gapPx: 60,
  /** CSS px at the top taken by the timer and the patience meter; a customer's head stays below this plus the margin. */
  topPx: 70,
  headMarginPx: 12,
  /** A tall customer's head (ADR 0025): 1.76 m. */
  headHeight: 1.76,
  /** The generator always gets at least this share of the view's height above the controls (release 0.9.3). */
  minFreeShare: 0.4,
  /** The most the camera may look down after an up-and-down drag, radians (about 35 degrees). */
  maxTilt: (35 * Math.PI) / 180,
  /** Pinch and wheel: the closest and farthest, as a share of the framed distance. */
  minZoom: 0.7,
  maxZoom: 1.4,
} as const;

/** A camera standing at `eye`, looking along -Z, tilted down by `pitch` radians. */
export interface CameraPose {
  eye: Vec3;
  pitch: number;
}

/** The default framing for one screen: the camera at `eye`, tilted `pitch`, and what it shows. */
export interface Framing extends CameraPose {
  /** Horizontal distance from the camera to the pivot, metres. */
  distance: number;
  /** The machine's share of the screen's width at the default turn. */
  widthShare: number;
  /** CSS px from the top of the screen to the top of a 1.76 m customer's head. */
  headPx: number;
  /** CSS px from the top of the screen to the machine's lowest point. */
  bottomPx: number;
  /** The centre of the vertical orbit an up-and-down drag moves the camera on: the machine's middle. */
  orbitY: number;
}

/** What the player has done to the view: the machine's turn, how far the camera has risen, and the pinch zoom. */
export interface StageState {
  /** The machine's turn about its upright axis, radians, in (-pi, pi]. */
  yaw: number;
  /** How far the camera has risen on its orbit from the default, radians; 0 is the default view. */
  lift: number;
  /** The camera's distance as a share of the framed distance. */
  zoom: number;
}

export interface StageLimits {
  maxLift: number;
  minZoom: number;
  maxZoom: number;
}

export const DEFAULT_STAGE: StageState = { yaw: DEFAULT_YAW, lift: 0, zoom: 1 };

/** An angle brought into (-pi, pi]. */
export function wrapAngle(a: number): number {
  const t = 2 * Math.PI;
  const r = (((a + Math.PI) % t) + t) % t;
  return r === 0 ? Math.PI : r - Math.PI;
}

/** A point in the machine's own axes, turned by `yaw` about its upright axis and stood on the bench at the pivot. */
export function machineToWorld(p: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // Three.js rotation about +Y: x' = x cos + z sin, z' = -x sin + z cos.
  return [p[0] * c + p[2] * s, p[1] + BENCH.top, -p[0] * s + p[2] * c];
}

/** Where a world point lands in normalised device coordinates (-1 to 1, y up), or null if it is behind the camera. */
export function projectWorld(cam: CameraPose, p: Vec3, fovY: number, aspect: number): [number, number] | null {
  const dx = p[0] - cam.eye[0];
  const dy = p[1] - cam.eye[1];
  const dz = p[2] - cam.eye[2];
  const sp = Math.sin(cam.pitch);
  const cp = Math.cos(cam.pitch);
  // forward (0, -sin, -cos), up (0, cos, -sin), right (1, 0, 0)
  const z = -dy * sp - dz * cp;
  if (z <= 1e-6) return null;
  const t = Math.tan(fovY / 2);
  return [dx / (z * t * aspect), (dy * cp - dz * sp) / (z * t)];
}

const toPx = (ndc: [number, number], w: number, h: number): [number, number] => [((ndc[0] + 1) / 2) * w, ((1 - ndc[1]) / 2) * h];

interface Measure {
  share: number;
  centre: number;
  bottom: number;
  head: number;
}

function measure(cam: CameraPose, world: readonly Vec3[], head: Vec3, fovY: number, w: number, h: number): Measure {
  let l = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const p of world) {
    const n = projectWorld(cam, p, fovY, w / h);
    if (!n) continue;
    const [x, y] = toPx(n, w, h);
    l = Math.min(l, x);
    r = Math.max(r, x);
    b = Math.max(b, y);
  }
  const hn = projectWorld(cam, head, fovY, w / h);
  return { share: (r - l) / w, centre: (l + r) / 2 / w, bottom: b, head: hn ? toPx(hn, w, h)[1] : -Infinity };
}

/**
 * The default framing (ADR 0025, plan 0016 reading 3). `points` are the machine's points in its own axes (vertices, or
 * box corners), seen at `yaw`; the screen is `widthPx` by `heightPx` CSS px with `coverPx` at the bottom covered by the
 * controls. The camera stands at a standing mechanic's eye height. It finds the distance, tilt and sideways place that
 * put the machine at FRAMING.widthShare of the width, its middle at FRAMING.centreShare across, and its lowest point
 * FRAMING.gapPx above the controls. If a 1.76 m customer's head would then go under the timer, the camera stands back
 * until it clears, but never so far that the machine is under FRAMING.minWidthShare of the width.
 */
export function frameBench(points: readonly Vec3[], yaw: number, fovY: number, widthPx: number, heightPx: number, coverPx: number): Framing {
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const world = points.map((p) => machineToWorld(p, yaw));
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const orbitY = BENCH.top + (Number.isFinite(minY) ? (minY + maxY) / 2 : 0);
  const head: Vec3 = [CUSTOMER_SPOT.x, FRAMING.headHeight, CUSTOMER_SPOT.z];
  const cover = Math.min(Math.max(0, coverPx), h * (1 - FRAMING.minFreeShare));
  const bottomTarget = h - cover - FRAMING.gapPx;
  const headTarget = FRAMING.topPx + FRAMING.headMarginPx;
  const t = Math.tan(fovY / 2);

  let d = 2.2;
  let pitch = 0.22;
  let ex = 0;
  const cam = (): CameraPose => ({ eye: [ex, FRAMING.eyeHeight, d], pitch });
  // mode "width": fit the width share; mode "head": stand back until the head clears; mode "floor": the least width.
  const solve = (mode: "width" | "head" | "floor"): Measure => {
    let m = measure(cam(), world, head, fovY, w, h);
    for (let i = 0; i < 80; i++) {
      if (mode === "head") d *= 1 + ((headTarget - m.head) / h) * 0.8;
      else if (m.share > 0) d *= m.share / (mode === "width" ? FRAMING.widthShare : FRAMING.minWidthShare);
      d = Math.min(20, Math.max(0.3, d));
      pitch += ((m.bottom - bottomTarget) / h) * fovY * 0.8;
      pitch = Math.min(1.2, Math.max(-0.5, pitch));
      // World metres per CSS px across, at the pivot's depth.
      ex -= (FRAMING.centreShare - m.centre) * w * ((2 * d * t) / h);
      m = measure(cam(), world, head, fovY, w, h);
    }
    return m;
  };
  let m = solve("width");
  if (m.head < headTarget) {
    m = solve("head");
    if (m.share < FRAMING.minWidthShare) m = solve("floor");
  }
  return { eye: [ex, FRAMING.eyeHeight, d], pitch, distance: d, widthShare: m.share, headPx: m.head, bottomPx: m.bottom, orbitY };
}

/** The limits of the player's view for a framing: the camera rises until it looks FRAMING.maxTilt down. */
export function stageLimits(f: Framing): StageLimits {
  return { maxLift: Math.max(0, FRAMING.maxTilt - f.pitch), minZoom: FRAMING.minZoom, maxZoom: FRAMING.maxZoom };
}

export function clampStage(s: StageState, l: StageLimits): StageState {
  return { yaw: wrapAngle(s.yaw), lift: Math.min(l.maxLift, Math.max(0, s.lift)), zoom: Math.min(l.maxZoom, Math.max(l.minZoom, s.zoom)) };
}

/**
 * Where the camera stands for a framing and what the player has done. Rising (lift) and zooming move it on a circle about
 * the machine's middle in the upright plane through the camera, so the machine stays where it was on screen; the camera
 * never moves sideways, and turning the machine does not move it at all.
 */
export function cameraPose(f: Framing, s: StageState): CameraPose {
  const ry = f.eye[1] - f.orbitY;
  const rz = f.eye[2];
  const r = Math.hypot(ry, rz) * s.zoom;
  const e = Math.atan2(ry, rz) + s.lift;
  return { eye: [f.eye[0], f.orbitY + r * Math.sin(e), r * Math.cos(e)], pitch: f.pitch + s.lift };
}

/** Where a point of the machine (its own axes) lands on screen, in normalised device coordinates. */
export function projectMachinePoint(f: Framing, s: StageState, p: Vec3, fovY: number, aspect: number): [number, number] | null {
  return projectWorld(cameraPose(f, s), machineToWorld(p, s.yaw), fovY, aspect);
}

/**
 * A drag with nothing held: dragging right turns the machine to the right (its front goes right); dragging down raises
 * the camera to look from above, as the orbit did.
 */
export function rotateStage(s: StageState, dxPx: number, dyPx: number, l: StageLimits): StageState {
  return clampStage({ ...s, yaw: s.yaw + dxPx * ROTATE_PER_PX, lift: s.lift + dyPx * ROTATE_PER_PX }, l);
}

/** factor > 1 moves away, < 1 moves closer. */
export function zoomStage(s: StageState, factor: number, l: StageLimits): StageState {
  if (!(factor > 0) || !Number.isFinite(factor)) return s;
  return clampStage({ ...s, zoom: s.zoom * factor }, l);
}

/**
 * One step of turning so that `point` (the spot the hand holds, in the machine's own axes) moves towards the pointer at
 * `ndc`: a Newton step on the machine's turn and the camera's rise, its screen motion estimated numerically, each change
 * capped at TURN.maxStep (ADR 0020's held spot, with ADR 0025's two variables).
 */
export function turnStageToward(s: StageState, l: StageLimits, f: Framing, point: Vec3, ndc: [number, number], fovY: number, aspect: number): StageState {
  const p0 = projectMachinePoint(f, s, point, fovY, aspect);
  const py = projectMachinePoint(f, { ...s, yaw: s.yaw + TURN.eps }, point, fovY, aspect);
  const pl = projectMachinePoint(f, { ...s, lift: s.lift + TURN.eps }, point, fovY, aspect);
  if (!p0 || !py || !pl) return s;
  const j00 = (py[0] - p0[0]) / TURN.eps;
  const j01 = (pl[0] - p0[0]) / TURN.eps;
  const j10 = (py[1] - p0[1]) / TURN.eps;
  const j11 = (pl[1] - p0[1]) / TURN.eps;
  const ex = ndc[0] - p0[0];
  const ey = ndc[1] - p0[1];
  const cap = (v: number) => Math.max(-TURN.maxStep, Math.min(TURN.maxStep, v));
  const det = j00 * j11 - j01 * j10;
  if (Math.abs(det) < 1e-9) {
    // The point is on the turning axis or the rise does not move it: turn only, by the sideways error.
    if (Math.abs(j00) < 1e-9) return s;
    return clampStage({ ...s, yaw: s.yaw + cap(ex / j00) }, l);
  }
  const dy = cap((j11 * ex - j01 * ey) / det);
  const dl = cap((-j10 * ex + j00 * ey) / det);
  return clampStage({ ...s, yaw: s.yaw + dy, lift: s.lift + dl }, l);
}
