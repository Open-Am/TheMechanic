// Where the mechanic's hand goes and which way it faces (plans 0008 to 0010, ADR 0020). Pure vector maths, tested
// without a GPU. The hand model's frame: fingers point -Z, the palm faces -Y, the forearm runs +Z; its origin is the
// grip point. The hand is the player's pointer: it rests on what the pointer points at and grabs it on a press.

import type { Vec3 } from "../core/index.ts";

export const HAND = {
  /** Seconds to close or open the hand. */
  close: 0.12,
  /** Seconds to pull the hand back out of view. */
  withdraw: 0.25,
  /** Metres the hand travels as it comes in or withdraws, along the forearm. */
  reachFrom: 0.25,
  /** Half-life, in seconds, of the smoothing that makes the hand follow the pointer like a hand, not a sprite. */
  followHalfLife: 0.05,
  /** Metres the open hand's fingertips float off the surface under the pointer. */
  hoverFloat: 0.008,
  /** Metres the gripping hand's grip point sits off the surface it grabbed: about the radius of what it closes on. */
  gripFloat: 0.012,
  /** Metres the pinching fingertips sit off the surface. */
  pinchFloat: 0.004,
  /** Where the forearm comes from, relative to the camera: right, down and forward, in metres. Level with the camera
   *  and well below it, so the forearm leaves through the bottom of the screen and the sleeve's end is never seen. */
  anchorRight: 0.3,
  anchorDown: 0.6,
  anchorForward: 0,
} as const;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, -1];
}

/**
 * The hand's orientation as basis vectors (its local x, y, z in world space): fingers (-z) along the approach, palm
 * (-y) turned as far against `up` as the approach allows: down by default, or onto a surface when `up` is its normal.
 */
export function handBasis(approach: Vec3, up: Vec3 = [0, 1, 0]): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize(scale(approach, -1));
  let x = cross(up, z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-6) x = cross([0, 0, 1], z); // approach straight along `up`
  if (Math.hypot(x[0], x[1], x[2]) < 1e-6) x = cross([1, 0, 0], z);
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

// ---- Grip shapes (plan 0009) ----

/** Parts whose longest side is at most this many metres are pinched with the fingertips instead of gripped. */
export const PINCH_MAX_SIZE = 0.075;

/** The hand's morph targets: `grip` closes around a bar about 30 mm thick, `pinch` meets thumb and index tips. */
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

// ---- The hand as the pointer (plan 0010, ADR 0020) ----

/** Where the forearm comes from: in front of the camera, low and to the right, so it runs off the bottom right. */
export function armAnchor(camera: Vec3, right: Vec3, up: Vec3, forward: Vec3): Vec3 {
  return add(add(add(camera, scale(right, HAND.anchorRight)), scale(up, -HAND.anchorDown)), scale(forward, HAND.anchorForward));
}

/** What the hand is doing at the pointer: resting open, gripping, or pinching. */
export type HandAction = "hover" | GripShape;

/**
 * The hand's pose at the pointer: `point` is the spot under the pointer and `normal` the surface's outward normal there
 * (or the direction to the camera off the machine). The forearm comes from `anchor`; the palm faces the surface. The
 * hand point that lands on the spot is the fingertips (`tip`) when hovering, the pinch point when pinching, and the
 * grip point (the origin) when gripping; each floats its own distance off the surface.
 */
export function pointerPose(point: Vec3, normal: Vec3, anchor: Vec3, action: HandAction, points: { tip: Vec3 | null; pinch: Vec3 | null }): { position: Vec3; quaternion: [number, number, number, number] } {
  const n = normalize(normal);
  const basis = handBasis(normalize(sub(point, anchor)), n);
  const float = action === "hover" ? HAND.hoverFloat : action === "pinch" ? HAND.pinchFloat : HAND.gripFloat;
  const at = add(point, scale(n, float));
  const handPoint: Vec3 = action === "hover" ? (points.tip ?? [0, 0, 0]) : action === "pinch" ? (points.pinch ?? [0, 0, 0]) : [0, 0, 0];
  return { position: originFor(at, handPoint, basis), quaternion: basisToQuaternion(basis) };
}

/** The share of the remaining distance to cover this frame, for smoothing with a half-life of `halfLife` seconds. */
export function followShare(dt: number, halfLife: number = HAND.followHalfLife): number {
  if (!(dt > 0)) return 0;
  if (!(halfLife > 0)) return 1;
  return 1 - Math.pow(0.5, dt / halfLife);
}
