// The mechanic's hand in the scene (plans 0008 to 0010, ADRs 0015 and 0020). It is the player's pointer: it rests open
// on whatever the pointer points at, closes on it on a press, rides along with a part it holds, and withdraws when
// the pointer leaves. It looks and moves the same over every part, removable or not (ADR 0007).

import { type Camera, type Mesh, type Object3D, Quaternion, type Scene, Vector3 } from "three";
import type { Vec3 } from "../core/index.ts";
import { armAnchor, followShare, type GripShape, HAND, type HandAction, pointerPose } from "./handpose.ts";

export interface HandRig {
  /** Rests the open hand on `at` (the spot under the pointer; `normal` faces out of the surface). Comes in if hidden. */
  point(at: Vector3, normal: Vector3): void;
  /** Closes the hand on `at`: a grip, or a fingertip pinch. Comes in if hidden. */
  grab(at: Vector3, normal: Vector3, shape: GripShape): void;
  /** Holds on to an object and moves with it, keeping the pose it has now (a part being loosened or carried). */
  attachTo(object: Object3D): void;
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
}

const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const isPoint = (p: unknown): p is Vec3 => Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === "number");

export function createHandRig(scene: Scene, camera: Camera, model: Object3D, onState?: () => void): HandRig {
  const root = model;
  root.name = "mechanic_hand";
  root.visible = false;
  scene.add(root);
  let pinchPoint: Vec3 | null = null;
  let tipPoint: Vec3 | null = null;
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.frustumCulled = false; // the morphs move vertices outside the rest-pose bounds
      meshes.push(m);
    }
    const ud = o.userData ?? {};
    if (isPoint(ud["pinch_point"])) pinchPoint = ud["pinch_point"];
    if (isPoint(ud["tip_point"])) tipPoint = ud["tip_point"];
  });

  let action: HandAction = "hover";
  let closed = 0;
  let wantClosed = 0;
  let target: { at: Vector3; normal: Vector3 } | null = null;
  let attached: Object3D | null = null;
  let withdrawing: { to: Vector3; left: number } | null = null;
  const goalPos = new Vector3();
  const goalQ = new Quaternion();

  function setMorphs(): void {
    for (const m of meshes) {
      if (!m.morphTargetDictionary || !m.morphTargetInfluences) continue;
      for (const [name, i] of Object.entries(m.morphTargetDictionary)) m.morphTargetInfluences[i] = action !== "hover" && name === action ? closed : 0;
    }
  }

  function anchor(): Vec3 {
    const e = camera.matrixWorld.elements;
    const right: Vec3 = [e[0]!, e[1]!, e[2]!];
    const up: Vec3 = [e[4]!, e[5]!, e[6]!];
    const forward: Vec3 = [-e[8]!, -e[9]!, -e[10]!];
    return armAnchor(v3(camera.position), right, up, forward);
  }

  function goal(): boolean {
    if (!target) return false;
    const usable = action === "pinch" && !pinchPoint ? "grip" : action;
    const p = pointerPose(v3(target.at), v3(target.normal), anchor(), usable, { tip: tipPoint, pinch: pinchPoint });
    goalPos.set(...p.position);
    goalQ.set(...p.quaternion);
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
    if (attached) {
      scene.attach(root);
      attached = null;
    }
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
      letGo();
      object.attach(root);
      attached = object;
      onState?.();
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
      if (attached) return; // riding with the part
      if (!goal()) return;
      const k = followShare(dt);
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
  };
  return rig;
}
