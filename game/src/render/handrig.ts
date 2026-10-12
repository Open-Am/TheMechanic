// The mechanic's hand in the scene (plans 0008 to 0010, ADRs 0015 and 0020). It is the player's pointer: it rests open
// on whatever the pointer points at, closes on it on a press, rides along with a part it holds, and withdraws when
// the pointer leaves. It looks and moves the same over every part, removable or not (ADR 0007).

import { type Camera, Matrix4, type Mesh, type Object3D, Quaternion, type Scene, Vector3 } from "three";
import type { Vec3 } from "../core/index.ts";
import { ARM_REACH, armAnchor, followShare, type GripShape, HAND, type HandAction, pointerPose, pushOut } from "./handpose.ts";

/** Points of the hand checked against the surface each frame: about this many, from the hand, not the sleeve. */
const SAMPLE_COUNT = 64;
/** The sleeve starts this far up the forearm from the grip point (hand frame, +Z), metres; samples stay below it. */
const SAMPLE_MAX_Z = 0.07;

export interface HandRig {
  /** Rests the open hand on `at` (the spot under the pointer; `normal` faces out of the surface). Comes in if hidden. */
  point(at: Vector3, normal: Vector3): void;
  /** Closes the hand on `at`: a grip, or a fingertip pinch. Comes in if hidden. */
  grab(at: Vector3, normal: Vector3, shape: GripShape): void;
  /** Holds on to an object and moves with it, keeping its own attitude: it follows the part's position, never its
   *  spin (a part being loosened or carried). */
  attachTo(object: Object3D): void;
  /**
   * Holding a tool on a fastener (plan 0012): checked against the whole machine every frame, with more of its points,
   * and following closely, as when it holds a part, so it stays in view while it works.
   */
  firm(on: boolean): void;
  /**
   * Which side of the screen the forearm comes from: 1 the lower right (as always), -1 the lower left (on a trip to a
   * toolbox there). The arm's root eases towards it, so it never jumps.
   */
  armSide(side: number): void;
  /** Lets go of the object it rides with; it follows the pointer again from where it is. */
  detach(): void;
  /** Opens the hand where it is. */
  open(): void;
  /** Pulls the hand back out of view. */
  withdraw(): void;
  hide(): void;
  /** Call once a frame, after the camera has moved. */
  update(dt: number): void;
  readonly visible: boolean;
  /** How closed the hand is, 0 (open) to 1. */
  readonly closed: number;
  /** What the hand is doing. */
  readonly action: HandAction;
  /** The name of the object the hand rides with, or null. */
  readonly holding: string | null;
  /** For the browser check: how far the last whole-machine check asked the hand to come forward, and how far it did. */
  readonly push: { asked: number; applied: number };
  /** For the browser check: the hand's sample points where they are now, in world space. */
  samplePoints(): Vector3[];
  /** For the browser check: points on the sleeve (the forearm above the hand) where they are now, in world space. */
  sleevePoints(): Vector3[];
}

const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const isPoint = (p: unknown): p is Vec3 => Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === "number");

/**
 * Tells how far (metres) the hand must come towards the camera so none of `points` (world space) is behind the machine's
 * surface as the camera sees it. Supplied by the view, which knows the machine.
 */
export type Collide = (points: readonly Vector3[]) => number;

/** Every this-many of the sample points is also checked against the whole machine, not just the surface held. */
const COLLIDE_EVERY = 6;
/** Holding a part, close to the machine, more points are checked. */
const COLLIDE_EVERY_HOLDING = 2;
/** Holding a part, the hand keeps up with it closely: a shorter smoothing half-life, seconds. */
const HOLD_HALF_LIFE = 0.015;
/** The whole-machine check runs every this-many frames; in between the last result is reused (smoothing hides it). */
const COLLIDE_FRAMES = 3;

export function createHandRig(scene: Scene, camera: Camera, model: Object3D, collide?: Collide, onState?: () => void): HandRig {
  const root = model;
  root.name = "mechanic_hand";
  root.visible = false;
  scene.add(root);
  let pinchPoint: Vec3 | null = null;
  let tipPoint: Vec3 | null = null;
  const meshes: Mesh[] = [];
  root.updateMatrixWorld(true);
  const samples: Array<{ mesh: Mesh; index: number }> = [];
  const sleeve: Array<{ mesh: Mesh; index: number }> = [];
  const meshToRoot = new Map<Mesh, Matrix4>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.frustumCulled = false; // the morphs move vertices outside the rest-pose bounds
      meshes.push(m);
      // The node's own transform (glTF quantization puts a decoding scale there) relative to the hand's root.
      meshToRoot.set(m, new Matrix4().copy(root.matrixWorld).invert().multiply(m.matrixWorld));
    }
    const ud = o.userData ?? {};
    if (isPoint(ud["pinch_point"])) pinchPoint = ud["pinch_point"];
    if (isPoint(ud["tip_point"])) tipPoint = ud["tip_point"];
  });

  // Pick sample points spread over the hand (not the sleeve), for keeping it out of surfaces.
  {
    const v = new Vector3();
    const candidates: Array<{ mesh: Mesh; index: number }> = [];
    const arm: Array<{ mesh: Mesh; index: number }> = [];
    for (const m of meshes) {
      const pos = m.geometry.getAttribute("position");
      const toRoot = meshToRoot.get(m)!;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
        if (v.z < SAMPLE_MAX_Z) candidates.push({ mesh: m, index: i });
        else arm.push({ mesh: m, index: i });
      }
    }
    const step = Math.max(1, Math.floor(candidates.length / SAMPLE_COUNT));
    for (let i = 0; i < candidates.length; i += step) samples.push(candidates[i]!);
    const armStep = Math.max(1, Math.floor(arm.length / SAMPLE_COUNT));
    for (let i = 0; i < arm.length; i += armStep) sleeve.push(arm[i]!);
  }
  const sampleLocal = new Vector3();
  const goalMatrix = new Matrix4();

  let collideFrame = 0;
  let lastMore = 0;
  /** What the last whole-machine check asked for, before the cap (metres). */
  let lastAsked = 0;

  /** The forearm's side (armAnchor), easing towards `sideWanted`. */
  let side = 1;
  let sideWanted = 1;
  let action: HandAction = "hover";
  let closed = 0;
  let wantClosed = 0;
  let target: { at: Vector3; normal: Vector3 } | null = null;
  let attached: Object3D | null = null;
  /** Holding a tool on a fastener: kept out of the machine as closely as when holding a part. */
  let firm = false;
  /** While following an object: the held spot's offset from the object's position, in world axes. */
  const attachOffset = new Vector3();
  let withdrawing: { to: Vector3; left: number } | null = null;
  const goalPos = new Vector3();
  const goalQ = new Quaternion();

  function setMorphs(): void {
    for (const m of meshes) {
      if (!m.morphTargetDictionary || !m.morphTargetInfluences) continue;
      for (const [name, i] of Object.entries(m.morphTargetDictionary)) m.morphTargetInfluences[i] = action !== "hover" && name === action ? closed : 0;
    }
  }

  function cameraAxes(): { right: Vec3; up: Vec3; forward: Vec3 } {
    const e = camera.matrixWorld.elements;
    return { right: [e[0]!, e[1]!, e[2]!], up: [e[4]!, e[5]!, e[6]!], forward: [-e[8]!, -e[9]!, -e[10]!] };
  }

  /** Where the hand should be: at the spot under the pointer, steady relative to the screen, out of the surface. */
  function goal(): boolean {
    if (!target) return false;
    if (attached) target.at.copy(attached.getWorldPosition(new Vector3())).add(attachOffset);
    const usable = action === "pinch" && !pinchPoint ? "grip" : action;
    const axes = cameraAxes();
    const p = pointerPose(v3(target.at), v3(target.normal), armAnchor(v3(camera.position), axes.right, axes.up, axes.forward, side), axes.up, usable, { tip: tipPoint, pinch: pinchPoint });
    goalPos.set(...p.position);
    goalQ.set(...p.quaternion);
    // Keep every sampled point of the hand, as the fingers are curled now, outside the surface: move back towards the
    // camera, along the line of sight, so the hand stays under the pointer.
    goalMatrix.compose(goalPos, goalQ, new Vector3(1, 1, 1));
    const world: Vec3[] = [];
    for (const smp of samples) {
      smp.mesh.getVertexPosition(smp.index, sampleLocal);
      sampleLocal.applyMatrix4(meshToRoot.get(smp.mesh)!).applyMatrix4(goalMatrix);
      world.push(v3(sampleLocal));
    }
    const toward = camera.position.clone().sub(target.at).normalize();
    const push = new Vector3(...pushOut(world, v3(target.at), v3(target.normal), v3(toward)));
    goalPos.add(push);
    // Then against the whole machine: a hand pinching a small part low down must not end inside the tank above it.
    if (collide) {
      // Holding a part, the hand moves with it and is checked every frame; hovering, every few frames is enough.
      if (attached || firm || collideFrame++ % COLLIDE_FRAMES === 0) {
        const checked: Vector3[] = [];
        for (let i = 0; i < world.length; i += attached || firm ? COLLIDE_EVERY_HOLDING : COLLIDE_EVERY) checked.push(new Vector3(...world[i]!).add(push));
        lastAsked = collide(checked);
        lastMore = Math.min(lastAsked, HAND.maxPush);
      }
      if (lastMore > 0) goalPos.addScaledVector(toward, lastMore);
    }
    return true;
  }

  /** Comes in from along the forearm, so the first frame is not a pop into place. */
  function comeIn(): void {
    if (root.visible && !withdrawing) return;
    withdrawing = null;
    if (!goal()) return;
    const back = new Vector3(0, 0, 1).applyQuaternion(goalQ).multiplyScalar(HAND.reachFrom);
    root.position.copy(goalPos).add(back);
    root.quaternion.copy(goalQ);
    root.visible = true;
  }

  function letGo(): void {
    attached = null;
  }

  const rig: HandRig = {
    point(at, normal) {
      target = { at: at.clone(), normal: normal.clone() };
      if (!attached) action = closed > 0.05 && wantClosed > 0 ? action : "hover";
      wantClosed = 0;
      comeIn();
    },

    grab(at, normal, shape) {
      target = { at: at.clone(), normal: normal.clone() };
      if (action !== shape) closed = action === "hover" ? closed : 0;
      action = shape;
      wantClosed = 1;
      comeIn();
      onState?.();
    },

    attachTo(object) {
      if (attached === object) return;
      if (!target) target = { at: root.position.clone(), normal: new Vector3(0, 1, 0) };
      attachOffset.copy(target.at).sub(object.getWorldPosition(new Vector3()));
      attached = object;
      onState?.();
    },

    firm(on) {
      firm = on;
    },

    armSide(s) {
      sideWanted = Number.isFinite(s) ? Math.max(-1, Math.min(1, s)) : 1;
    },

    detach() {
      letGo();
      onState?.();
    },

    open() {
      wantClosed = 0;
    },

    withdraw() {
      letGo();
      target = null;
      wantClosed = 0;
      if (!root.visible || withdrawing) return;
      const back = new Vector3(0, 0, 1).applyQuaternion(root.quaternion).multiplyScalar(HAND.reachFrom);
      withdrawing = { to: root.position.clone().add(back), left: HAND.withdraw };
      onState?.();
    },

    hide() {
      letGo();
      firm = false;
      target = null;
      withdrawing = null;
      root.visible = false;
      closed = wantClosed = 0;
      action = "hover";
      setMorphs();
    },

    update(dt) {
      // Open and close at a steady rate.
      const step = dt / HAND.close;
      closed = wantClosed > closed ? Math.min(wantClosed, closed + step) : Math.max(wantClosed, closed - step);
      if (closed === 0 && wantClosed === 0) action = "hover";
      setMorphs();
      // Hidden, the arm's root may jump; shown, it eases across.
      side = root.visible ? side + (sideWanted - side) * followShare(dt, ARM_REACH.halfLife) : sideWanted;
      if (!root.visible) return;
      if (withdrawing) {
        withdrawing.left -= dt;
        root.position.lerp(withdrawing.to, followShare(dt, HAND.withdraw / 4));
        if (withdrawing.left <= 0) {
          withdrawing = null;
          root.visible = false;
        }
        return;
      }
      if (!goal()) return;
      const k = followShare(dt, attached || firm ? HOLD_HALF_LIFE : HAND.followHalfLife);
      root.position.lerp(goalPos, k);
      root.quaternion.slerp(goalQ, k);
    },

    get visible() {
      return root.visible && !withdrawing;
    },
    get closed() {
      return closed;
    },
    get action() {
      return action;
    },
    get holding() {
      return attached ? attached.name : null;
    },
    get push() {
      return { asked: lastAsked, applied: lastMore };
    },
    samplePoints() {
      root.updateMatrixWorld(true);
      return samples.map((smp) => smp.mesh.getVertexPosition(smp.index, new Vector3()).applyMatrix4(smp.mesh.matrixWorld));
    },
    sleevePoints() {
      root.updateMatrixWorld(true);
      return sleeve.map((smp) => smp.mesh.getVertexPosition(smp.index, new Vector3()).applyMatrix4(smp.mesh.matrixWorld));
    },
  };
  return rig;
}
