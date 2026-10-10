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

