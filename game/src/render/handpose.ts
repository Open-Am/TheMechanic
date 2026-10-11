// Where the mechanic's hand goes and which way it faces (plan 0008). Pure vector maths, tested without a GPU.
// The hand model's frame: fingers point -Z, the palm faces -Y, the forearm runs +Z; its origin is the grip point.

import type { Vec3 } from "../core/index.ts";

export const HAND = {
  /** Seconds to reach in and close the grip before the part starts moving. */
  reach: 0.18,
  /** Share of the reach spent closing the grip, at its end. */
  gripShare: 0.4,
  /** Seconds to open the hand once the part is in the tray or in place. */
  release: 0.12,
  /** Seconds to pull the hand back out of view. */
  withdraw: 0.25,
  /** Metres from the part the hand starts its reach, and withdraws to. */
  reachFrom: 0.32,
  /** How much the reach leans towards the camera, so the hand is seen rather than hidden behind the machine. */
  cameraBias: 0.45,
  /** How far in front of the part's centre the grip point sits, as a share of the part's radius. */
  gripInset: 0.3,
} as const;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, -1];
}

/**
 * Where the hand starts its reach: out along the side the part comes off (its explode direction), leaning towards the
 * camera. Coming from that side, the hand reaches around the machine, never through it.
 */
export function entryPoint(part: Vec3, explode: Vec3, camera: Vec3): Vec3 {
  const out = normalize(explode);
  const toCamera = normalize(sub(camera, part));
  const dir = normalize([out[0] + toCamera[0] * HAND.cameraBias, out[1] + toCamera[1] * HAND.cameraBias, out[2] + toCamera[2] * HAND.cameraBias]);
  return [part[0] + dir[0] * HAND.reachFrom, part[1] + dir[1] * HAND.reachFrom, part[2] + dir[2] * HAND.reachFrom];
}

/** Unit direction the hand travels: from where it enters towards the part. */
export function approachDirection(part: Vec3, entry: Vec3): Vec3 {
  return normalize(sub(part, entry));
}

/** Where the hand's grip point goes: a little in front of the part's centre, on the side the hand comes from. */
export function gripPoint(part: Vec3, approach: Vec3, partRadius: number): Vec3 {
  return sub(part, scale(approach, partRadius * HAND.gripInset));
}

/**
 * The hand's orientation as basis vectors (its local x, y, z in world space): fingers (-z) along the approach, palm (-y)
 * turned as far down as the approach allows, so it closes over the part from above and in front.
 */
export function handBasis(approach: Vec3, up: Vec3 = [0, 1, 0]): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize(scale(approach, -1));
  let x = cross(up, z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-6) x = cross([0, 0, 1], z); // approach straight up or down
  x = normalize(x);
  const y = cross(z, x);
  return { x, y, z };
}

/** Quaternion [x, y, z, w] for a right-handed orthonormal basis given as columns. */
export function basisToQuaternion(b: { x: Vec3; y: Vec3; z: Vec3 }): [number, number, number, number] {
  const [m00, m10, m20] = b.x;
  const [m01, m11, m21] = b.y;
  const [m02, m12, m22] = b.z;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

/** How closed the grip is during the reach, from 0 (open) to 1 (gripping): it closes over the last part of the reach. */
export function gripDuringReach(p: number): number {
  const start = 1 - HAND.gripShare;
  return p <= start ? 0 : Math.min(1, (p - start) / HAND.gripShare);
}


// ---- Pinching small parts (plan 0009) ----

/** Parts whose longest side is at most this many metres are pinched with the fingertips instead of gripped. */
export const PINCH_MAX_SIZE = 0.075;

/** The hand's morph targets (ADR 0016): `grip` closes around a bar about 30 mm thick, `pinch` meets thumb and index tips. */
export type GripShape = "grip" | "pinch";

export function gripShapeFor(size: Vec3): GripShape {
  return Math.max(size[0], size[1], size[2]) <= PINCH_MAX_SIZE ? "pinch" : "grip";
}

/** Where the hand's origin goes so that `handPoint`, a point in the hand's own frame, lands on `at`. */
export function originFor(at: Vec3, handPoint: Vec3, b: { x: Vec3; y: Vec3; z: Vec3 }): Vec3 {
  const [px, py, pz] = handPoint;
  return [
    at[0] - (b.x[0] * px + b.y[0] * py + b.z[0] * pz),
    at[1] - (b.x[1] * px + b.y[1] * py + b.z[1] * pz),
    at[2] - (b.x[2] * px + b.y[2] * py + b.z[2] * pz),
  ];
}

// ---- Holding the base while the view turns (ADR 0016) ----

export const HOLD = {
  /** Degrees the view may turn after the hand takes hold before it lets go and takes a new hold. */
  regripDegrees: 70,
  /** How far round to the right of the camera the hold is taken: tan of the angle, so the forearm comes from the right. */
  rightShare: 0.6,
  /** Metres in under the plate's edge that the grip point sits: the fingers slide under the plate, between the feet. */
  inset: 0.025,
  /** Metres below the plate's underside that the grip point sits: the palm is under the plate, the fingers curl up. */
  under: 0.012,
  /** Metres a hold must keep from every removable part (ADR 0016: the hand touches the base only). The hand is under
   *  the plate, and parts sit on or overhang its edge, so this keeps the knuckles and thumb off them. */
  clearance: 0.02,
  /** Points tried around the edge of the plate. */
  samples: 72,
  /** How the forearm leans out from the plate: towards the camera and the right of the screen, level with the plate
   *  (the plate sits low, so a rising forearm would cross the machine on screen and a falling one the ground). */
  towardCamera: 0.8,
  towardRight: 0.35,
} as const;

/** An axis-aligned box, metres. */
export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface Hold {
  /** Where the grip point goes. */
  point: Vec3;
  /** The plate edge's outward direction, horizontal. */
  outward: Vec3;
  /** Its direction from the plate's centre, as an orbit azimuth (0 is the front, +Z). */
  angle: number;
  /** The camera's azimuth when the hold was taken. */
  takenAt: number;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The point on the edge of a horizontal plate (seen from above, a rectangle) in the direction `angle` from its centre. */
export function edgeAt(plate: Box, height: number, angle: number): Hold {
  const cx = (plate.min[0] + plate.max[0]) / 2;
  const cz = (plate.min[2] + plate.max[2]) / 2;
  const hx = (plate.max[0] - plate.min[0]) / 2;
  const hz = (plate.max[2] - plate.min[2]) / 2;
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  const tx = Math.abs(dx) > 1e-9 ? hx / Math.abs(dx) : Infinity;
  const tz = Math.abs(dz) > 1e-9 ? hz / Math.abs(dz) : Infinity;
  const onSide = tx < tz; // the ray leaves through a side face (x = ±hx) before the front or back
  const t = Math.min(tx, tz);
  const outward: Vec3 = onSide ? [Math.sign(dx), 0, 0] : [0, 0, Math.sign(dz)];
  const edge: Vec3 = [cx + dx * t, height, cz + dz * t];
  return { point: [edge[0] - outward[0] * HOLD.inset, height, edge[2] - outward[2] * HOLD.inset], outward, angle, takenAt: Number.NaN };
}

export function distanceToBox(p: Vec3, b: Box): number {
  const d = [0, 1, 2].map((i) => Math.max(b.min[i]! - p[i]!, 0, p[i]! - b.max[i]!));
  return Math.hypot(d[0]!, d[1]!, d[2]!);
}

/** The azimuth the hand would like to hold the plate at: round to the right of the camera. */
export function preferredHoldAngle(cameraAzimuth: number): number {
  return cameraAzimuth + Math.atan(HOLD.rightShare);
}

/**
 * The hold for a camera at `cameraAzimuth`: the point on the plate's edge nearest the preferred angle that keeps clear
 * of every removable part. Null if the whole edge is crowded (then no hand is shown).
 */
export function holdFor(plate: Box, height: number, parts: Box[], cameraAzimuth: number): Hold | null {
  const want = preferredHoldAngle(cameraAzimuth);
  let best: Hold | null = null;
  let bestOff = Infinity;
  for (let i = 0; i < HOLD.samples; i++) {
    const h = edgeAt(plate, height, (2 * Math.PI * i) / HOLD.samples);
    const edge: Vec3 = [h.point[0] + h.outward[0] * HOLD.inset, height, h.point[2] + h.outward[2] * HOLD.inset];
    if (parts.some((b) => Math.min(distanceToBox(h.point, b), distanceToBox(edge, b)) < HOLD.clearance)) continue;
    const off = Math.abs(wrap(h.angle - want));
    if (off < bestOff) {
      best = h;
      bestOff = off;
    }
  }
  return best ? { ...best, takenAt: cameraAzimuth } : null;
}

/**
 * True once the view has turned so far since the hold was taken that the hand should let go and take a new one, hand
 * over hand. Measured from the turn, not from the preferred hold: when parts crowd the preferred side, the hold taken
 * is already far from it, and the hand must not keep starting over.
 */
export function needsRegrip(hold: Hold, cameraAzimuth: number): boolean {
  return Math.abs(wrap(cameraAzimuth - hold.takenAt)) > (HOLD.regripDegrees * Math.PI) / 180;
}

/**
 * Which way the fingers point while holding the plate: level, in under its edge, with the forearm leaning out towards
 * the camera and the right of the screen, so it runs off the bottom right rather than across the machine.
 */
export function holdApproach(outward: Vec3, toCamera: Vec3, cameraRight: Vec3): Vec3 {
  const flat = (v: Vec3): Vec3 => normalize([v[0], 0, v[2]]);
  const c = flat(toCamera);
  const r = flat(cameraRight);
  return normalize([
    -(outward[0] + c[0] * HOLD.towardCamera + r[0] * HOLD.towardRight),
    0,
    -(outward[2] + c[2] * HOLD.towardCamera + r[2] * HOLD.towardRight),
  ]);
}

/** The hand's basis while holding the plate: palm up under it, so the curled fingers close on its underside. */
export function holdBasis(approach: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  return handBasis(approach, [0, -1, 0]);
}
