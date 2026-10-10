// The mechanic's hand in the scene (plan 0008, ADR 0015). It acts only on accepted removals and put-backs, never on
// a blocked pull (ADR 0007). One hand, reused: a new action finishes whatever the hand was doing first.

import { type Camera, type Mesh, type Object3D, type Scene, Vector3 } from "three";
import { approachDirection, basisToQuaternion, entryPoint, gripDuringReach, gripPoint, handBasis, HAND } from "./handpose.ts";
import { ease, type Tweens, type TweenSpec } from "./tween.ts";

export interface HandRig {
  /** A tween that reaches in from the side the part comes off (`explode`) and closes the grip, then holds the part. */
  reach(target: Object3D, centre: Vector3, radius: number, explode: Vector3): TweenSpec;
  /** Places the hand gripping the part at once, holding on to it (a put-back starts this way). */
  holdAt(target: Object3D, centre: Vector3, radius: number, explode: Vector3): void;
  /** Lets go, opens the hand and pulls it back out of view. */
  release(): void;
  hide(): void;
  /** For the browser check: true while the hand is visible and mostly closed. */
  readonly gripping: boolean;
}

export function createHandRig(scene: Scene, camera: Camera, model: Object3D, tweens: Tweens): HandRig {
  const root = model;
  root.name = "mechanic_hand";
  root.visible = false;
  scene.add(root);
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) m.frustumCulled = false; // the grip morph moves vertices outside the rest-pose bounds
  });
  let grip = 0;

  function setGrip(v: number): void {
    grip = v;
    root.traverse((o) => {
      const m = o as Mesh;
      const i = m.morphTargetDictionary?.["grip"];
      if (m.isMesh && i !== undefined && m.morphTargetInfluences) m.morphTargetInfluences[i] = v;
    });
  }

  let withdrawTo = new Vector3();

  function pose(centre: Vector3, radius: number, explode: Vector3) {
    const e = entryPoint([centre.x, centre.y, centre.z], [explode.x, explode.y, explode.z], [camera.position.x, camera.position.y, camera.position.z]);
    const entry = new Vector3(...e);
    withdrawTo = entry.clone();
    const a = approachDirection([centre.x, centre.y, centre.z], [entry.x, entry.y, entry.z]);
    const g = gripPoint([centre.x, centre.y, centre.z], a, radius);
    return { entry, at: new Vector3(...g), q: basisToQuaternion(handBasis(a)) };
  }

  function letGo(): void {
    tweens.finish("hand");
    if (root.parent !== scene) scene.attach(root);
  }

  const rig: HandRig = {
    reach(target, centre, radius, explode) {
      letGo();
      const p0 = pose(centre, radius, explode);
      return {
        duration: HAND.reach,
        ease: ease.outCubic,
        update: (p) => {
          root.visible = true;
          root.position.lerpVectors(p0.entry, p0.at, p);
          root.quaternion.set(...p0.q);
          setGrip(gripDuringReach(p));
        },
        done: () => target.attach(root),
      };
    },

    holdAt(target, centre, radius, explode) {
      letGo();
      const p0 = pose(centre, radius, explode);
      root.position.copy(p0.at);
      root.quaternion.set(...p0.q);
      root.visible = true;
      setGrip(1);
      target.attach(root);
    },

    release() {
      if (root.parent !== scene) scene.attach(root);
      if (!root.visible) return;
      let from: Vector3 | null = null;
      let to: Vector3 | null = null;
      tweens.play(
        "hand",
        { duration: HAND.release, update: (p) => setGrip(1 - p) },
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
      );
    },

    hide() {
      tweens.cancel("hand");
      if (root.parent !== scene) scene.attach(root);
      root.visible = false;
      setGrip(0);
    },

    get gripping() {
      return root.visible && grip > 0.5;
    },
  };
  return rig;
}
