// The mechanic's hand in the scene (plans 0008 and 0009, ADRs 0015 and 0016). It acts only on accepted removals and
// put-backs, never on a blocked pull (ADR 0007), and holds the base while the player turns the view. One hand, reused:
// a new action finishes whatever the hand was doing first.

import { type Camera, type Mesh, type Object3D, type Scene, Vector3 } from "three";
import type { Vec3 } from "../core/index.ts";
import {
  approachDirection,
  basisToQuaternion,
  entryPoint,
  gripDuringReach,
  gripPoint,
  type GripShape,
  handBasis,
  HAND,
  type Hold,
  holdApproach,
  holdBasis,
  originFor,
} from "./handpose.ts";
import { ease, type Tweens, type TweenSpec } from "./tween.ts";

export interface HandRig {
  /** A tween that reaches in from the side the part comes off (`explode`) and closes the grip, then holds the part. */
  reach(target: Object3D, centre: Vector3, radius: number, explode: Vector3, shape?: GripShape): TweenSpec;
  /** Places the hand holding the part at once (a put-back starts this way). */
  holdAt(target: Object3D, centre: Vector3, radius: number, explode: Vector3, shape?: GripShape): void;
  /** Lets go, opens the hand and pulls it back out of view. */
  release(): void;
  /** Reaches in and takes hold of the base's plate at `hold` (ADR 0016). If already holding, lets go first: hand over hand. */
  holdBase(hold: Hold): void;
  /** While holding the base: re-aims the forearm at the camera's lower right, the hold point staying where it is. */
  followCamera(): void;
  hide(): void;
  /** The hold the hand is on, or null. */
  readonly baseHold: Hold | null;
  /** For the browser check: true while the hand is visible and mostly closed. */
  readonly gripping: boolean;
  /** For the browser check: the morph the hand is using. */
  readonly shape: GripShape;
}

const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

export function createHandRig(scene: Scene, camera: Camera, model: Object3D, tweens: Tweens): HandRig {
  const root = model;
  root.name = "mechanic_hand";
  root.visible = false;
  scene.add(root);
  let pinchPoint: Vec3 | null = null;
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) m.frustumCulled = false; // the morphs move vertices outside the rest-pose bounds
    const p = o.userData?.["pinch_point"] as unknown;
    if (Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === "number")) pinchPoint = p as Vec3;
  });
  let closed = 0;
  let shape: GripShape = "grip";
  let baseHold: Hold | null = null;

  function setMorph(s: GripShape, v: number): void {
    shape = s;
    closed = v;
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || !m.morphTargetDictionary || !m.morphTargetInfluences) return;
      for (const [name, i] of Object.entries(m.morphTargetDictionary)) m.morphTargetInfluences[i] = name === s ? v : 0;
    });
  }

  /** A shape the model has: without a pinch point, a pinch falls back to the grip. */
  const usable = (s: GripShape): GripShape => (s === "pinch" && pinchPoint ? "pinch" : "grip");

  let withdrawTo = new Vector3();

  function partPose(centre: Vector3, radius: number, explode: Vector3, s: GripShape) {
    const c = v3(centre);
    const entry = new Vector3(...entryPoint(c, v3(explode), v3(camera.position)));
    const a = approachDirection(c, v3(entry));
    const basis = handBasis(a);
    // A pinch puts the fingertips on the part's centre; a grip closes around it, a little in front.
    const at = s === "pinch" && pinchPoint ? originFor(c, pinchPoint, basis) : gripPoint(c, a, radius);
    const shift = new Vector3(...at).sub(centre);
    return { entry: entry.add(shift), at: new Vector3(...at), q: basisToQuaternion(basis) };
  }

  function basePose(hold: Hold) {
    const toCamera = new Vector3().subVectors(camera.position, new Vector3(...hold.point)).normalize();
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const a = holdApproach(hold.outward, v3(toCamera), v3(right));
    const at = new Vector3(...hold.point);
    return { at, entry: at.clone().addScaledVector(new Vector3(...a), -HAND.reachFrom), q: basisToQuaternion(holdBasis(a)) };
  }

  function letGo(): void {
    tweens.finish("hand");
    if (root.parent !== scene) scene.attach(root);
  }

  function withdraw(): TweenSpec[] {
    let from: Vector3 | null = null;
    let to: Vector3 | null = null;
    const s = shape;
    const c0 = closed;
    return [
      { duration: HAND.release, update: (p) => setMorph(s, c0 * (1 - p)) },
      {
        duration: HAND.withdraw,
        ease: ease.inOutCubic,
        update: (p) => {
          from ??= root.position.clone();
          to ??= from.clone().add(withdrawTo.clone().sub(from).normalize().multiplyScalar(HAND.reachFrom));
          root.position.lerpVectors(from, to, p);
        },
        done: () => {
          root.visible = false;
        },
      },
    ];
  }

  const rig: HandRig = {
    reach(target, centre, radius, explode, wanted = "grip") {
      letGo();
      baseHold = null;
      const s = usable(wanted);
      const p0 = partPose(centre, radius, explode, s);
      withdrawTo = p0.entry.clone();
      return {
        duration: HAND.reach,
        ease: ease.outCubic,
        update: (p) => {
          root.visible = true;
          root.position.lerpVectors(p0.entry, p0.at, p);
          root.quaternion.set(...p0.q);
          setMorph(s, gripDuringReach(p));
        },
        done: () => target.attach(root),
      };
    },

    holdAt(target, centre, radius, explode, wanted = "grip") {
      letGo();
      baseHold = null;
      const s = usable(wanted);
      const p0 = partPose(centre, radius, explode, s);
      withdrawTo = p0.entry.clone();
      root.position.copy(p0.at);
      root.quaternion.set(...p0.q);
      root.visible = true;
      setMorph(s, 1);
      target.attach(root);
    },

    release() {
      baseHold = null;
      if (root.parent !== scene) scene.attach(root);
      if (!root.visible) return;
      tweens.play("hand", ...withdraw());
    },

    holdBase(hold) {
      const wasHolding = baseHold !== null && root.visible;
      letGo();
      baseHold = hold;
      const p0 = basePose(hold);
      const reach: TweenSpec = {
        duration: HAND.reach,
        ease: ease.outCubic,
        update: (p) => {
          if (baseHold !== hold) return;
          const now = basePose(hold); // the view may be turning while the hand reaches
          root.visible = true;
          root.position.lerpVectors(p0.entry, now.at, p);
          root.quaternion.set(...now.q);
          setMorph("grip", gripDuringReach(p));
        },
      };
      if (wasHolding) {
        // Hand over hand: open and lift off the old hold, then reach for the new one.
        const s = shape;
        tweens.play("hand", { duration: HAND.release, update: (p) => setMorph(s, 1 - p) }, reach);
      } else {
        tweens.play("hand", reach);
      }
      withdrawTo = p0.entry.clone();
    },

    followCamera() {
      if (!baseHold || !root.visible || tweens.busy("hand")) return;
      const p = basePose(baseHold);
      root.position.copy(p.at);
      root.quaternion.set(...p.q);
      withdrawTo = p.entry.clone();
    },

    hide() {
      tweens.cancel("hand");
      baseHold = null;
      if (root.parent !== scene) scene.attach(root);
      root.visible = false;
      setMorph("grip", 0);
    },

    get baseHold() {
      return baseHold;
    },

    get gripping() {
      return root.visible && closed > 0.5;
    },

    get shape() {
      return shape;
    },
  };
  return rig;
}
