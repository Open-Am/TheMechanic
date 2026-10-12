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
  /** Where the arm is aimed, relative to the camera: right, down and forward, in metres. In front of the camera but
   *  outside its view, low and to the right, so the arm leaves through the bottom right of the screen while staying
   *  far enough from the camera to look its real size. */
  anchorRight: 0.35,
  anchorDown: 0.5,
  anchorForward: 0.35,
  /** Metres every point of the hand keeps outside the surface it rests on or holds. */
  margin: 0.003,
  /** Floor on how much moving towards the camera lifts the hand off a surface seen almost edge-on. */
  minLift: 0.25,
  /** Most the hand is moved back in one go, metres. */
  maxPush: 0.2,
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

/**
 * Where the forearm comes from: in front of the camera, low and to the right, so it runs off the bottom right. `side`
 * moves it across: 1 is the lower right, -1 the mirror place at the lower left (on a trip to a toolbox on the left of
 * the screen), still below the bottom edge.
 */
export function armAnchor(camera: Vec3, right: Vec3, up: Vec3, forward: Vec3, side = 1, lift = 0): Vec3 {
  // `lift` (0 to 1, plan 0018) raises the arm's root towards eye height and further out to its side, so the forearm
  // comes in from the side of the screen rather than up from its bottom edge: for a press on the machine's face, where
  // an arm from below would lie across the machine.
  const l = Math.max(0, Math.min(1, Number.isFinite(lift) ? lift : 0));
  return add(add(add(camera, scale(right, HAND.anchorRight * side * (1 + ARM_LIFT_OUT * l))), scale(up, -HAND.anchorDown * (1 - l))), scale(forward, HAND.anchorForward));
}

/** How much further out to its side a fully lifted arm's root goes, as a share of HAND.anchorRight. */
export const ARM_LIFT_OUT = 0.6;

// ---- The arm on the toolbox trip (release 0.11.1 follow-up) ----

/**
 * On a trip to the toolbox the arm comes from the toolbox's side of the screen, so the forearm rises from the bottom
 * edge below the toolbox instead of lying across the machine; at the fasteners it comes from the lower right again.
 */
export const ARM_REACH = {
  /** The toolbox this far from the middle of the screen (normalised device x) or more puts the arm fully on its side. */
  sideNdc: 0.5,
  /** Half-life, seconds, of the easing that moves the arm's root from one side to the other, so it never jumps. */
  halfLife: 0.08,
  /** Share of a leg over which the arm's root crosses: it arrives early on legs to the toolbox and leaves late on legs
   *  from it, so the forearm already comes from below the toolbox as the hand gets there. */
  crossShare: 0.7,
} as const;

/**
 * Which side the arm comes from to reach a target at screen x `targetNdcX` (normalised device x, -1 left to 1 right) on
 * or beside a machine whose middle is at `machineNdcX`: from below the target's own side of the machine, so the forearm
 * rises from the bottom edge on that side and never lies across the machine (plan 0018: the notes, the switch). Fully
 * to one side once the target is REACH_SIDE_BAND from the middle; in between it blends, so it never jumps. -1 to 1.
 */
export function reachArmSide(targetNdcX: number, machineNdcX: number): number {
  if (!Number.isFinite(targetNdcX) || !Number.isFinite(machineNdcX)) return 1;
  return Math.max(-1, Math.min(1, (targetNdcX - machineNdcX) / REACH_SIDE_BAND));
}

/** Screen distance (normalised device x) from the machine's middle at which a reach comes fully from one side. */
export const REACH_SIDE_BAND = 0.12;

/** Which side the arm comes from at the toolbox, from the toolbox's x on screen (-1 left to 1 right): -1 to 1. */
export function toolboxArmSide(ndcX: number): number {
  if (!Number.isFinite(ndcX)) return 1;
  return Math.max(-1, Math.min(1, ndcX / ARM_REACH.sideNdc));
}

const smooth = (p: number): number => {
  const t = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
  return t * t * (3 - 2 * t);
};

/**
 * The arm's side (as `armAnchor` takes it) at progress `p` of a trip step, with the toolbox's side `box`: it glides
 * to the toolbox's side on the legs to the toolbox, stays there while a tool is taken or laid back, and glides back to
 * the right (1) on the legs to the fasteners and home. Each step starts where the one before it ends.
 */
export function armSideOnTrip(kind: "toToolbox" | "pick" | "toFastener" | "fasten" | "free" | "toSlot" | "putBack" | "home", p: number, box: number): number {
  const k = ARM_REACH.crossShare;
  const at = (from: number, to: number, t: number) => from + (to - from) * smooth(t);
  switch (kind) {
    case "toToolbox":
    case "toSlot":
      return at(1, box, p / k);
    case "pick":
    case "putBack":
      return box;
    case "toFastener":
    case "home":
      return at(box, 1, (p - (1 - k)) / k);
    default:
      return 1;
  }
}

/** What the hand is doing at the pointer: resting open, gripping, or pinching. */
export type HandAction = "hover" | GripShape;

/**
 * The hand's pose at the pointer: `point` is the spot under the pointer and `normal` the surface's outward normal there
 * (or the direction to the camera off the machine). The forearm comes from `anchor`. The hand keeps one steady attitude
 * relative to the screen, palm turned down towards the scene (`screenUp` is the camera's up), the way a hand reaching
 * into a scene looks; it does not roll to face each surface it passes over. The hand point that lands on the spot is
 * the fingertips (`tip`) when hovering, the pinch point when pinching, and the grip point (the origin) when gripping;
 * each floats its own distance off the surface. `pushOut` then keeps the rest of the hand out of the surface.
 */
export function pointerPose(point: Vec3, normal: Vec3, anchor: Vec3, screenUp: Vec3, action: HandAction, points: { tip: Vec3 | null; pinch: Vec3 | null }): { position: Vec3; quaternion: [number, number, number, number] } {
  const n = normalize(normal);
  const basis = handBasis(normalize(sub(point, anchor)), screenUp);
  const float = action === "hover" ? HAND.hoverFloat : action === "pinch" ? HAND.pinchFloat : HAND.gripFloat;
  const at = add(point, scale(n, float));
  const handPoint: Vec3 = action === "hover" ? (points.tip ?? [0, 0, 0]) : action === "pinch" ? (points.pinch ?? [0, 0, 0]) : [0, 0, 0];
  return { position: originFor(at, handPoint, basis), quaternion: basisToQuaternion(basis) };
}

/**
 * How far to move the hand so no point of it (`samples`, in world space) is inside the surface through `point` with
 * outward `normal`: every sample ends at least `margin` outside. The hand moves along `toward` (a unit vector, towards
 * the camera), so it stays under the pointer on screen and only its depth changes. Returns the offset to add.
 */
export function pushOut(samples: readonly Vec3[], point: Vec3, normal: Vec3, toward: Vec3, margin: number = HAND.margin): Vec3 {
  const n = normalize(normal);
  const along = Math.max(HAND.minLift, toward[0] * n[0] + toward[1] * n[1] + toward[2] * n[2]);
  let t = 0;
  for (const s of samples) {
    const d = (s[0] - point[0]) * n[0] + (s[1] - point[1]) * n[1] + (s[2] - point[2]) * n[2];
    if (d < margin) t = Math.max(t, (margin - d) / along);
  }
  return scale(toward, Math.min(t, HAND.maxPush));
}

/** The share of the remaining distance to cover this frame, for smoothing with a half-life of `halfLife` seconds. */
export function followShare(dt: number, halfLife: number = HAND.followHalfLife): number {
  if (!(dt > 0)) return 0;
  if (!(halfLife > 0)) return 1;
  return 1 - Math.pow(0.5, dt / halfLife);
}

// ---- Tools on fasteners (plan 0011, ADR 0020) ----

/** Which tool a fastener needs: a screwdriver for screws, a spanner for bolts and nuts. */
export function toolFor(kind: "bolt" | "screw" | "nut"): "spanner" | "screwdriver" {
  return kind === "screw" ? "screwdriver" : "spanner";
}

/**
 * How a tool sits on a fastener, as a basis (its local x, y, z in world space), the same for both tools. The tool's local z lies along the
 * fastener's axis (out of the hole). A screwdriver turns with the screw by `angle`. A spanner lies across the bolt with
 * its handle (local x) towards the lower right of the screen, so the hand holding it stays in view, swung about the
 * bolt's axis by `angle`.
 */
export function toolBasis(axis: Vec3, screenRight: Vec3, screenUp: Vec3, angle: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize(axis);
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const flat = (v: Vec3): Vec3 => sub(v, scale(z, dot(v, z)));
  // The handle's direction before the swing: towards the lower right of the screen, in the plane across the axis.
  let x = flat(sub(screenRight, screenUp));
  if (Math.hypot(...x) < 1e-6) x = flat(screenRight);
  if (Math.hypot(...x) < 1e-6) x = flat([1, 0, 0]);
  x = normalize(x);
  const y0 = cross(z, x);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const xr = add(scale(x, c), scale(y0, s));
  const yr = cross(z, xr);
  return { x: xr, y: yr, z };
}

// ---- Where the spanner's handle lies (plan 0012 follow-up) ----

/**
 * How many turns of the spanner about its bolt are tried when choosing where its handle lies. The handle towards the
 * lower right of the screen (turn 0) can put the hand holding it behind the machine, for a bolt under the tank's
 * overhang: the hand would have to come forward further than HAND.maxPush to show. One of the other turns shows it.
 */
export const SPANNER_TURNS = 12;

/** The angle about the bolt of turn `k`, radians. */
export function spannerTurn(k: number): number {
  return (2 * Math.PI * k) / SPANNER_TURNS;
}

/** The index of the cheapest option, or the first within `tie` of it: the turn that hides the hand least. */
export function cheapest(costs: readonly number[], tie = 0.001): number {
  if (costs.length === 0) return 0;
  const best = Math.min(...costs);
  return Math.max(0, costs.findIndex((c) => c <= best + tie));
}
