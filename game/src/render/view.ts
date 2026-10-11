// The Three.js view: scene, lights, orbit camera, pointer input, and the animations that follow app events.
// It proposes removals to app and listens for what app accepted (ADR 0010). It never imports ui.
//
// Input (plan 0010, ADR 0020): the mechanic's hand is the pointer. It rests on what a mouse points at, comes in under a
// finger, and closes on a press. A double tap (or double click, or G) loosens the part under the pointer if it can come
// off; a drag on a loose part carries it, and dropping it on the tray proposes its removal. Every other drag turns the
// machine, the held spot following the pointer. Whether a part could come off only ever shows in whether it loosens.

import {
  Box3,
  Color,
  type Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Game } from "../app/round.ts";
import { canRemove, type Machine, type PartId } from "../core/index.ts";
import { awaitingSecondTap, doubleTapGrasp, doubleTapPart, dragMode, GESTURE, screenDirection, type ScreenDirection, type Tap } from "./gesture.ts";
import { CARRY, carryPose, carryProgress, FASTEN, fastenerPose, LOOSEN, loosePose, poseAt, resolveMotion, spannerSwing, TIMING, type Pose } from "./motion.ts";
import { fitDistance, frameAbove, position, projectPoint, rotate, TURN, turnToward, unshiftNdcY, worldPerPixel, zoom, type OrbitLimits, type OrbitState } from "./orbit.ts";
import { firstPart, partIdOf } from "./picking.ts";
import { createHandRig, type HandRig } from "./handrig.ts";
import { basisToQuaternion, gripShapeFor, type GripShape, HAND, toolBasis, toolFor } from "./handpose.ts";
import type { RenderAssets, Tool } from "./model.ts";
import { buildMachine, setPartOpacity, sizeHitVolumes, type FastenerView, type PartView } from "./placeholders.ts";
import { createThumbnailer } from "./thumbnails.ts";
import { createGround } from "./ground.ts";
import { createLighting } from "./lighting.ts";
import { clamp01, ease, Tweens, type TweenSpec } from "./tween.ts";

/** Minimum finger target, CSS px (docs/design/interface.md). */
const FINGER_PX = 44;
const FOV_DEG = 40;
const DEFAULT_ORBIT = { azimuth: 0.55, polar: 1.12 };
const BACKGROUND = "#1b1c1e";
/** Seconds for the machine to settle halfway into its new place when the controls grow or shrink (release 0.9.3). */
const REFRAME_HALF_LIFE = 0.08;

export interface RenderView {
  /** A picture of one part as a data URL, for the tray. Null if it cannot be drawn. */
  partImage(partId: PartId): string | null;
  /** Tells the view where the tray is: true if a screen point (CSS px) is over it. Supplied by main.ts from ui. */
  setTrayTest(overTray: (x: number, y: number) => boolean): void;
  /** Tells the view how many CSS px at the bottom of the screen the controls cover; the machine is framed above them. */
  setBottomCover(px: number): void;
  /** A tray chip is being dragged at (x, y): the hand carries that part under the pointer (ADR 0020). */
  carryChip(partId: PartId, x: number, y: number): void;
  /** The chip drag ended; if the part did not go back on, it returns to the tray. */
  endChipCarry(partId: PartId): void;
  /** Told whenever carrying a part to the tray starts, comes over the tray, leaves it, or ends. Supplied by main.ts. */
  onCarry(fn: (state: "none" | "carrying" | "over") => void): void;
  dispose(): void;
}

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

interface Surface {
  point: Vector3;
  normal: Vector3;
  /** The part under the pointer, or null for the base or empty space. */
  part: PartId | null;
  /** True if the point is on the machine, false if it is at the machine's depth in empty space. */
  onMachine: boolean;
}

/** Throws if WebGL is not available, so main can show the "cannot run" message. `assets` come from loadRenderAssets. */
export function mountRender(container: HTMLElement, game: Game, assets: RenderAssets = { model: null, environment: null, ground: null, hand: null }): RenderView {
  const machine: Machine = game.machine;
  const renderer = new WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); // ADR 0006
  renderer.domElement.style.touchAction = "none"; // also stops a double tap zooming the page
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  // ADR 0014. In development, ?lighting=fallback forces the simple rig to check it still works.
  const forced = import.meta.env.DEV ? new URLSearchParams(location.search).get("lighting") : null;
  const lighting = createLighting(renderer, forced, assets.environment);
  lighting.addTo(scene);
  // Diagnostic mode reads this; it may not import render (ADR 0010).
  document.documentElement.dataset.lighting = lighting.rig;
  scene.add(createGround(machine.size, assets.ground));

  const view = buildMachine(machine, assets.model);
  document.documentElement.dataset.model = assets.model ? (view.fallbacks.length ? "partial" : "glb") : "placeholders";
  scene.add(view.root);
  const partIds = new Set(view.parts.keys());

  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.01, 20);
  const fovY = (FOV_DEG * Math.PI) / 180;
  const center = new Vector3(...view.center);
  const target = center.clone();
  let orbit: OrbitState = { ...DEFAULT_ORBIT, distance: 1 };
  let limits: OrbitLimits = { minDistance: 0.5, maxDistance: 2, minPolar: 0.35, maxPolar: 1.55 };
  let fitted = false;
  let fit = 1;
  // The machine is framed in the part of the screen the controls leave free (release 0.9.3): the picture moves up by a
  // view offset, and the camera stands back if the free part is too short for the machine. `cover` eases towards
  // `coverWanted`, the CSS px the controls cover, so the machine glides rather than jumps when a tray row comes or goes.
  let coverWanted = 0;
  let cover = 0;
  let framing = { shiftPx: 0, distanceScale: 1 };

  function applyFraming(): void {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    framing = frameAbove(fovY, w, h, cover);
    if (framing.shiftPx > 0.25) camera.setViewOffset(w, h, 0, framing.shiftPx, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    sizeHitVolumes(view, FINGER_PX * worldPerPixel(fit * framing.distanceScale, fovY, h));
  }

  function resize(): void {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    fit = fitDistance(view.radius, fovY, camera.aspect);
    limits = { ...limits, minDistance: fit * 0.6, maxDistance: fit * 1.6 };
    orbit = fitted ? zoom(orbit, 1, limits) : { ...orbit, distance: fit };
    fitted = true;
    applyFraming();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  /** The orbit as the camera stands: farther back when the free part of the screen is too short for the machine. */
  const cameraOrbit = (): OrbitState => ({ ...orbit, distance: orbit.distance * framing.distanceScale });

  /** A pointer's normalised device coordinates in the unmoved frustum the orbit maths works in. */
  const orbitNdc = (ndc: Vector2): [number, number] => [ndc.x, unshiftNdcY(ndc.y, framing.shiftPx, Math.max(1, container.clientHeight))];

  function placeCamera(): void {
    camera.position.set(...position(cameraOrbit(), [target.x, target.y, target.z]));
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  // ---- Parts ----

  const tweens = new Tweens();
  // The hand keeps out of the machine as the camera sees it (plan 0010): any sampled point of it behind the machine's
  // surface brings the whole hand towards the camera, so it stays under the pointer but in front.
  const collideRay = new Raycaster();
  const collide = (points: readonly Vector3[]): number => {
    let need = 0;
    view.root.updateMatrixWorld();
    for (const p of points) {
      const dir = p.clone().sub(camera.position);
      const dist = dir.length();
      collideRay.set(camera.position, dir.divideScalar(dist));
      collideRay.far = dist;
      // The part the hand holds does not count: fingers curl behind what they grip.
      const held = hand?.holding ?? null;
      const hit = collideRay.intersectObject(view.root, true).find((h) => !hitMeshes.has(h.object) && shown(h.object) && (held === null || partIdOf(h.object, partIds) !== held));
      if (hit) need = Math.max(need, dist - hit.distance + HAND.margin);
    }
    return need;
  };
  const hand: HandRig | null = assets.hand ? createHandRig(scene, camera, assets.hand, collide) : null;
  const tmpQ = new Quaternion();
  const partById = (id: PartId) => machine.parts.find((p) => p.id === id)!;

  function applyPose(pv: PartView, pose: Pose): void {
    pv.group.position.set(pv.home[0] + pose.offset[0], pv.home[1] + pose.offset[1], pv.home[2] + pose.offset[2]);
    pv.group.quaternion.copy(tmpQ.setFromAxisAngle(AXES[pose.axis], pose.angle));
  }

  const setOpacity = setPartOpacity;

  /** A point near the bottom of the screen at the part's depth: where the tray is. */
  function trayPoint(from: Vector3): Vector3 {
    const ndc = from.clone().project(camera);
    return new Vector3(ndc.x * 0.3, -0.9, ndc.z).unproject(camera);
  }

  function reset(pv: PartView): void {
    tweens.cancel(pv.id);
    for (const f of pv.fasteners) applyFastener(f, 0);
    pv.group.visible = true;
    pv.group.position.set(...pv.home);
    pv.group.quaternion.identity();
    pv.group.scale.setScalar(1);
    pv.visual.scale.setScalar(1);
    setOpacity(pv, 1);
  }

  function press(id: PartId): void {
    const pv = view.parts.get(id);
    if (!pv) return;
    tweens.play(`press:${id}`, {
      duration: TIMING.press,
      update: (p) => pv.visual.scale.setScalar(1 + (TIMING.pressScale - 1) * Math.sin(Math.PI * p)),
    });
  }

  // Loose parts sit proud of their place, ready to be carried to the tray (ADR 0020). Render state only: the core
  // sees nothing until a part is dropped on the tray.
  const loose = new Set<PartId>();
  const loosening = new Set<PartId>();

  /**
   * Loosens a part: the hand undoes it and it sits loose. Does nothing at all if it cannot come off now (ADR 0007). The
   * hand takes hold at `at`, where the player touched the part, if given; otherwise at the last spot under the pointer
   * if that is on the part, else at the part's origin.
   */
  function loosen(id: PartId, then?: () => void, at?: Surface | null): void {
    if (!game.running || loose.has(id) || loosening.has(id) || !game.state.installed.has(id)) return;
    if (!canRemove(machine, game.state, id)) return;
    const pv = view.parts.get(id);
    if (!pv) return;
    const part = partById(id);
    const m = resolveMotion(part.motion);
    loosening.add(id);
    const s = at ?? (lastSurface && lastSurface.part === id ? lastSurface : surfaceOfPart(pv));
    const freeing: TweenSpec[] = pv.fasteners.length
      ? [...fastenerSteps(pv), { duration: FASTEN.freeSeconds, ease: ease.inOutCubic, update: (q) => applyPose(pv, loosePose(m, part.explode, q)) }, ...toolReturn()]
      : [
          { duration: HAND.close, update: () => hand?.grab(s.point, s.normal, shapeOf(id)), done: () => hand?.attachTo(pv.group) },
          { duration: LOOSEN.seconds[m.type], ease: ease.inOutCubic, update: (q) => applyPose(pv, loosePose(m, part.explode, q)) },
        ];
    tweens.play(
      `loosen:${id}`,
      ...freeing,
      {
        duration: 0,
        update: () => {},
        done: () => {
          loosening.delete(id);
          loose.add(id);
          if (then) then();
          else {
            hand?.detach();
            hand?.open();
          }
        },
      },
    );
  }

  // ---- Fasteners and tools (plan 0011, ADR 0020) ----

  const tools = assets.tools ?? null;
  if (tools) {
    for (const t of [tools.spanner, tools.screwdriver]) {
      t.object.visible = false;
      scene.add(t.object);
    }
  }
  /** Seconds to fetch the tool to the first fastener, or take it back after the last. */
  const TOOL_TRAVEL = 0.3;
  /** Share of each fastener's time spent moving the tool to it from the last one. */
  const TOOL_HOP = 0.25;
  let toolInHand: Tool | null = null;
  let toolFrom = new Vector3();

  function applyFastener(f: FastenerView, q: number): void {
    const p = fastenerPose(q);
    f.pivot.position.copy(f.rest).addScaledVector(f.axis, p.out);
    f.pivot.quaternion.setFromAxisAngle(f.axis, p.angle);
  }

  const screen = (): { right: [number, number, number]; up: [number, number, number]; forward: Vector3 } => {
    const e = camera.matrixWorld.elements;
    return { right: [e[0]!, e[1]!, e[2]!], up: [e[4]!, e[5]!, e[6]!], forward: new Vector3(-e[8]!, -e[9]!, -e[10]!) };
  };

  /** Where tools come from and go back to: just off screen at the lower left. (ADR 0021 puts a toolbox here; plan 0012.) */
  function toolSource(): Vector3 {
    const sc = screen();
    return camera.position.clone().addScaledVector(new Vector3(...sc.right), -0.3).addScaledVector(new Vector3(...sc.up), -0.5).addScaledVector(sc.forward, 0.45);
  }

  const fastenerAt = (f: FastenerView): Vector3 => f.pivot.getWorldPosition(new Vector3());
  const fastenerAxis = (pv: PartView, f: FastenerView): Vector3 => f.axis.clone().transformDirection(pv.group.matrixWorld);

  /** Puts a tool with its working end at `at`, along `axis`, turned by `angle`, and the hand on its grip. */
  function holdTool(tool: Tool, at: Vector3, axis: Vector3, angle: number): void {
    const sc = screen();
    tool.object.quaternion.set(...basisToQuaternion(toolBasis([axis.x, axis.y, axis.z], sc.right, sc.up, angle)));
    tool.object.position.copy(at);
    tool.object.visible = true;
    const grip = new Vector3(...tool.grip).applyQuaternion(tool.object.quaternion).add(at);
    hand?.grab(grip, camera.position.clone().sub(grip).normalize(), "grip");
  }

  /** The steps that undo each of a part's fasteners in turn, fetching the right tool first (ADR 0020). */
  function fastenerSteps(pv: PartView): TweenSpec[] {
    const steps: TweenSpec[] = [];
    const first = pv.fasteners[0]!;
    const firstTool = tools ? tools[toolFor(first.kind)] : null;
    if (firstTool) {
      let from: Vector3 | null = null;
      steps.push({
        duration: TOOL_TRAVEL,
        ease: ease.inOutCubic,
        update: (p) => {
          from ??= toolSource();
          holdTool(firstTool, from.clone().lerp(fastenerAt(first), p), fastenerAxis(pv, first), 0);
          toolInHand = firstTool;
        },
      });
    }
    pv.fasteners.forEach((f, i) => {
      steps.push({
        duration: FASTEN.outSeconds,
        update: (p) => {
          const hop = i === 0 ? 1 : clamp01(p / TOOL_HOP);
          const q = i === 0 ? clamp01(p) : clamp01((p - TOOL_HOP) / (1 - TOOL_HOP));
          if (i > 0 && hop < 1) {
            if (hop === 0 || toolFrom.lengthSq() === 0) toolFrom = fastenerAt(pv.fasteners[i - 1]!);
          }
          applyFastener(f, q);
          const tool = tools ? tools[toolFor(f.kind)] : null;
          if (tool) {
            if (toolInHand && toolInHand !== tool) toolInHand.object.visible = false; // a different fastener, a different tool
            toolInHand = tool;
            const at = i > 0 && hop < 1 ? toolFrom.clone().lerp(fastenerAt(f), ease.inOutCubic(hop)) : fastenerAt(f);
            holdTool(tool, at, fastenerAxis(pv, f), tool === tools?.screwdriver ? fastenerPose(q).angle : spannerSwing(q));
          } else {
            // No tools file: the fingers turn it.
            const ax = fastenerAxis(pv, f);
            hand?.grab(fastenerAt(f).addScaledVector(ax, 0.01), ax, "pinch");
          }
        },
        done: () => {
          toolFrom = fastenerAt(f);
        },
      });
    });
    return steps;
  }

  /** The tool is back where it came from and the hand is free of it. */
  function putToolAway(): void {
    if (toolInHand) toolInHand.object.visible = false;
    toolInHand = null;
    toolFrom.set(0, 0, 0);
  }

  /** Takes the tool back where it came from, then the hand is free. */
  function toolReturn(): TweenSpec[] {
    let from: Vector3 | null = null;
    let axis: Vector3 | null = null;
    return [
      {
        duration: TOOL_TRAVEL,
        ease: ease.inOutCubic,
        update: (p) => {
          const tool = toolInHand;
          if (!tool) return;
          from ??= tool.object.position.clone();
          axis ??= new Vector3(0, 0, 1).applyQuaternion(tool.object.quaternion);
          holdTool(tool, from.clone().lerp(toolSource(), p), axis, 0);
        },
        done: putToolAway,
      },
    ];
  }

  /** Before the cord is pulled, the hand presses every loose part home. No rule changes (ADR 0020). */
  function pressHome(): void {
    // A part stopped half undone leaves no tool behind in the hand (plan 0011).
    if (loosening.size > 0 && toolInHand) {
      putToolAway();
      hand?.detach();
      hand?.open();
    }
    for (const id of [...loose, ...loosening]) {
      const pv = view.parts.get(id);
      if (!pv) continue;
      tweens.cancel(`loosen:${id}`);
      const from = pv.group.position.clone();
      const q0 = pv.group.quaternion.clone();
      // Its fasteners go back in with it, quickly (ADR 0020).
      const fastFrom = pv.fasteners.map((f) => ({ f, at: f.pivot.position.clone(), q: f.pivot.quaternion.clone() }));
      tweens.play(id, {
        duration: CARRY.homeSeconds,
        ease: ease.inOutCubic,
        update: (p) => {
          pv.group.position.lerpVectors(from, new Vector3(...pv.home), p);
          pv.group.quaternion.slerpQuaternions(q0, new Quaternion(), p);
          for (const { f, at, q } of fastFrom) {
            f.pivot.position.lerpVectors(at, f.rest, p);
            f.pivot.quaternion.slerpQuaternions(q, new Quaternion(), p);
          }
        },
        done: () => reset(pv),
      });
    }
    loose.clear();
    loosening.clear();
  }

  // ---- Carrying a loose part to the tray ----

  let carry: { id: PartId; pv: PartView; startX: number; startY: number; free: { offset: Vector3; depth: Vector3 } | null } | null = null;
  let overTray: (x: number, y: number) => boolean = (_x, y) => y > container.getBoundingClientRect().bottom - container.clientHeight * 0.25;
  let carryState: (state: "none" | "carrying" | "over") => void = () => {};
  let lastCarryState: "none" | "carrying" | "over" = "none";
  const tellCarry = (state: "none" | "carrying" | "over"): void => {
    if (state !== lastCarryState) carryState(state);
    lastCarryState = state;
  };

  function startCarry(id: PartId, x: number, y: number): void {
    const pv = view.parts.get(id);
    if (!pv) return;
    tweens.cancel(id);
    carry = { id, pv, startX: x, startY: y, free: null };
    hand?.attachTo(pv.group);
    tellCarry("carrying");
  }

  function moveCarry(x: number, y: number): void {
    if (!carry) return;
    tellCarry(overTray(x, y) ? "over" : "carrying");
    const part = partById(carry.id);
    const m = resolveMotion(part.motion);
    const c = carryProgress(Math.hypot(x - carry.startX, y - carry.startY));
    if (!carry.free) {
      applyPose(carry.pv, carryPose(m, part.explode, c));
      if (c >= 1) {
        // Out of its place: from here it follows the hand freely, at the depth it came out at.
        const depth = carry.pv.group.position.clone();
        const under = pointAtDepth(x, y, depth);
        carry.free = { offset: depth.clone().sub(under), depth };
      }
      return;
    }
    carry.pv.group.position.copy(pointAtDepth(x, y, carry.free.depth).add(carry.free.offset));
  }

  /** Drops the carried part: on the tray it is removed; anywhere else it flies back to its loose point. */
  function dropCarry(x: number, y: number): void {
    if (!carry) return;
    const c = carry;
    tellCarry("none");
    if (overTray(x, y) && game.propose({ type: "remove", partId: c.id })) return; // "removed" sinks it into the tray
    carry = null;
    const part = partById(c.id);
    const m = resolveMotion(part.motion);
    const back = loosePose(m, part.explode, 1);
    const toPos = new Vector3(c.pv.home[0] + back.offset[0], c.pv.home[1] + back.offset[1], c.pv.home[2] + back.offset[2]);
    const toQ = new Quaternion().setFromAxisAngle(AXES[back.axis], back.angle);
    const fromPos = c.pv.group.position.clone();
    const fromQ = c.pv.group.quaternion.clone();
    tweens.play(c.id, {
      duration: CARRY.backSeconds,
      ease: ease.inOutCubic,
      update: (p) => {
        c.pv.group.position.lerpVectors(fromPos, toPos, p);
        c.pv.group.quaternion.slerpQuaternions(fromQ, toQ, p);
      },
      done: () => {
        hand?.detach();
        hand?.open();
      },
    });
  }

  function animateRemove(id: PartId): void {
    const pv = view.parts.get(id);
    if (!pv) return;
    loose.delete(id);
    if (carry?.id === id) carry = null;
    hand?.detach();
    hand?.open();
    const from = pv.group.position.clone();
    const to = trayPoint(from);
    tweens.play(id, {
      duration: CARRY.intoTraySeconds,
      ease: ease.inOutCubic,
      update: (p) => {
        pv.group.position.lerpVectors(from, to, p);
        pv.group.scale.setScalar(1 - 0.5 * p);
        setOpacity(pv, 1 - p);
      },
      done: () => {
        pv.group.visible = false;
        pv.group.scale.setScalar(1);
        setOpacity(pv, 1);
      },
    });
  }

  // ---- Carrying a part back from the tray ----

  let chip: { id: PartId; pv: PartView } | null = null;

  function carryChip(id: PartId, x: number, y: number): void {
    const pv = view.parts.get(id);
    if (!pv || game.state.installed.has(id)) return;
    if (!chip || chip.id !== id) {
      reset(pv);
      const part = partById(id);
      applyPose(pv, poseAt(resolveMotion(part.motion), part.explode, 1));
      chip = { id, pv };
      const s = surfaceOfPart(pv);
      hand?.grab(s.point, s.normal, shapeOf(id));
      hand?.attachTo(pv.group);
    }
    pv.group.position.copy(pointAtDepth(x, y, center));
  }

  function endChipCarry(id: PartId): void {
    if (!chip || chip.id !== id) return;
    const pv = chip.pv;
    chip = null;
    if (game.state.installed.has(id)) return; // "installed" took it over
    hand?.detach();
    hand?.withdraw();
    pv.group.visible = false;
  }

  function animateInstall(id: PartId): void {
    const pv = view.parts.get(id);
    if (!pv) return;
    const part = partById(id);
    const m = resolveMotion(part.motion);
    const out = poseAt(m, part.explode, 1);
    const outPos = new Vector3(pv.home[0] + out.offset[0], pv.home[1] + out.offset[1], pv.home[2] + out.offset[2]);
    const carried = chip?.id === id;
    const start = carried ? pv.group.position.clone() : trayPoint(outPos);
    if (!carried) {
      reset(pv);
      applyPose(pv, out);
      pv.group.position.copy(start);
      setOpacity(pv, 0);
    }
    for (const f of pv.fasteners) applyFastener(f, 1); // they come back with the part, out of their holes
    chip = null;
    tweens.play(
      id,
      {
        duration: TIMING.drift,
        ease: ease.inOutCubic,
        update: (p) => {
          pv.group.position.lerpVectors(start, outPos, p);
          if (!carried) setOpacity(pv, p);
        },
      },
      {
        duration: m.duration,
        update: (p) => applyPose(pv, poseAt(m, part.explode, 1 - p)),
      },
      // The part is home; its fasteners go back in, one after another (ADR 0020).
      ...pv.fasteners.map((f) => ({ duration: FASTEN.upSeconds, update: (p: number) => applyFastener(f, 1 - p) })),
      {
        duration: 0,
        update: () => {},
        done: () => {
          hand?.detach();
          hand?.withdraw();
          reset(pv);
        },
      },
    );
  }

  const unsubscribe = [
    game.events.on("removed", (e) => animateRemove(e.partId)),
    game.events.on("installed", (e) => animateInstall(e.partId)),
    game.events.on("pulled", () => pressHome()),
    game.events.on("started", () => {
      tellCarry("none");
      hand?.hide();
      loose.clear();
      loosening.clear();
      carry = null;
      chip = null;
      for (const pv of view.parts.values()) reset(pv);
      target.copy(center);
    }),
    game.events.on("ended", () => hand?.withdraw()),
    game.events.on("left", () => hand?.withdraw()),
  ];

  // ---- Where the pointer is ----

  const raycaster = new Raycaster();
  const hitMeshes = new Set<Object3D>([...view.parts.values()].map((pv) => pv.hit));
  const ndcOf = (clientX: number, clientY: number): Vector2 => {
    const rect = renderer.domElement.getBoundingClientRect();
    return new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  };

  /** The installed part under the pointer, using the finger-sized hit volumes. */
  function pickAt(clientX: number, clientY: number): PartId | null {
    view.root.updateMatrixWorld();
    raycaster.setFromCamera(ndcOf(clientX, clientY), camera);
    const hits = raycaster.intersectObjects([...hitMeshes], false);
    return firstPart(hits, partIds, (id) => game.state.installed.has(id));
  }

  /** Every installed part whose finger-sized hit volume is under the pointer. */
  function partsUnder(clientX: number, clientY: number): PartId[] {
    view.root.updateMatrixWorld();
    raycaster.setFromCamera(ndcOf(clientX, clientY), camera);
    const ids = new Set<PartId>();
    for (const h of raycaster.intersectObjects([...hitMeshes], false)) {
      const id = partIdOf(h.object, partIds);
      if (id && game.state.installed.has(id)) ids.add(id);
    }
    return [...ids];
  }

  const shown = (o: Object3D | null): boolean => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };

  /** The point where a screen ray meets the plane through `depth` facing the camera. */
  function pointAtDepth(clientX: number, clientY: number, depth: Vector3): Vector3 {
    raycaster.setFromCamera(ndcOf(clientX, clientY), camera);
    const normal = camera.getWorldDirection(new Vector3()).negate();
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, depth);
    return raycaster.ray.intersectPlane(plane, new Vector3()) ?? depth.clone();
  }

  /** The spot under the pointer: on the machine's surface, or at the machine's depth over empty space. */
  function surfaceAt(clientX: number, clientY: number): Surface {
    view.root.updateMatrixWorld();
    raycaster.setFromCamera(ndcOf(clientX, clientY), camera);
    const hit = raycaster.intersectObject(view.root, true).find((h) => !hitMeshes.has(h.object) && shown(h.object) && h.face);
    const part = pickAt(clientX, clientY);
    if (hit) {
      const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
      if (normal.dot(raycaster.ray.direction) > 0) normal.negate(); // a back face: point it at the camera
      const on = partIdOf(hit.object, partIds);
      return { point: hit.point.clone(), normal, part: on ?? part, onMachine: true };
    }
    const toCamera = camera.position.clone().sub(center).normalize();
    return { point: pointAtDepth(clientX, clientY, center), normal: toCamera, part, onMachine: false };
  }

  /** A spot on a part for the hand when the pointer is not on it: its centre, facing the camera. */
  function surfaceOfPart(pv: PartView): Surface {
    const p = pv.group.getWorldPosition(new Vector3());
    return { point: p, normal: camera.position.clone().sub(p).normalize(), part: pv.id, onMachine: true };
  }

  const shapeOf = (id: PartId | null): GripShape => {
    const pv = id ? view.parts.get(id) : undefined;
    return pv ? gripShapeFor(pv.size) : "grip";
  };

  // ---- Input ----

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: number | null = null;
  let lastSurface: Surface | null = null;
  let mouseAt: { x: number; y: number } | null = null;
  let lastTap: Tap | null = null;
  /** The spot under the pointer when `lastTap` came down. */
  let lastTapSurface: Surface | null = null;
  let drag: {
    id: number;
    touch: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    part: PartId | null;
    surface: Surface;
    mode: "pending" | "carry" | "turn";
    /** For a turn: the spot the hand holds, or null over empty space. */
    held: { point: Vector3; normal: Vector3 } | null;
    /** Set when G loosens the part under a held press: the press carries the part once it is loose. */
    carryWhenLoose: boolean;
    /** The press's event time stamp, ms. */
    downT: number;
  } | null = null;

  /** Rests the hand on the spot under a mouse pointer that is not pressing. */
  function hover(x: number, y: number): void {
    if (!hand || !game.running || drag || chip || loosening.size > 0 || carry) return;
    const s = surfaceAt(x, y);
    lastSurface = s;
    hand.point(s.point, s.normal);
  }

  function pinchDistance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onDown(e: PointerEvent): void {
    renderer.domElement.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      // A second finger: zoom. The hand goes away until one finger is left (ADR 0020).
      if (drag?.mode === "carry") dropCarry(drag.lastX, drag.lastY);
      drag = null;
      pinch = pinchDistance();
      hand?.withdraw();
      return;
    }
    if (pointers.size > 2) return;
    const s = surfaceAt(e.clientX, e.clientY);
    lastSurface = s;
    if (game.running && s.part) press(s.part); // the same press for every part, allowed or not (ADR 0007)
    // Pressing grabs what is under the pointer, the same way whatever it is (ADR 0020).
    if (game.running && hand && loosening.size === 0) hand.grab(s.point, s.normal, shapeOf(s.part));
    drag = { id: e.pointerId, touch: e.pointerType !== "mouse", startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, part: game.running ? s.part : null, surface: s, mode: "pending", held: null, carryWhenLoose: false, downT: e.timeStamp };
  }

  function startTurn(x: number, y: number): void {
    if (!drag) return;
    drag.mode = "turn";
    drag.held = drag.surface.onMachine ? { point: drag.surface.point.clone(), normal: drag.surface.normal.clone() } : null;
    turnTo(x, y);
  }

  function turnTo(x: number, y: number): void {
    if (!drag) return;
    const mdx = x - drag.lastX;
    const mdy = y - drag.lastY;
    if (!drag.held) {
      // Nothing held: turn at the old rate, the hand following the pointer at the machine's depth.
      orbit = rotate(orbit, mdx, mdy, limits);
      placeCamera();
      if (game.running && loosening.size === 0) hand?.grab(pointAtDepth(x, y, center), camera.position.clone().sub(center).normalize(), "grip");
      return;
    }
    const ndc = ndcOf(x, y);
    const at = orbitNdc(ndc);
    const turned = turnToward(cameraOrbit(), limits, [target.x, target.y, target.z], [drag.held.point.x, drag.held.point.y, drag.held.point.z], at, fovY, camera.aspect);
    orbit = { ...orbit, azimuth: turned.azimuth, polar: turned.polar };
    placeCamera();
    // Let go and grab again under the pointer if the held spot has turned away or fallen behind the pointer.
    const p = projectPoint(cameraOrbit(), [target.x, target.y, target.z], [drag.held.point.x, drag.held.point.y, drag.held.point.z], fovY, camera.aspect);
    const rect = renderer.domElement.getBoundingClientRect();
    const lagPx = p ? Math.hypot(((p[0] - at[0]) / 2) * rect.width, ((p[1] - at[1]) / 2) * rect.height) : Infinity;
    const facing = drag.held.normal.dot(camera.position.clone().sub(drag.held.point)) > 0;
    if (lagPx > TURN.regripPx || !facing) {
      const s = surfaceAt(x, y);
      drag.held = s.onMachine ? { point: s.point, normal: s.normal } : null;
      if (game.running && loosening.size === 0) hand?.grab(s.point, s.normal, shapeOf(s.part));
    } else if (game.running && loosening.size === 0) {
      hand?.grab(drag.held.point, drag.held.normal, shapeOf(drag.surface.part));
    }
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerType === "mouse") mouseAt = { x: e.clientX, y: e.clientY };
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === "mouse") hover(e.clientX, e.clientY);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const d = pinchDistance();
      if (d > 0) orbit = zoom(orbit, pinch / d, limits);
      pinch = d;
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.mode === "pending" && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= GESTURE.tapSlop) {
      if (dragMode(drag.part, (id) => loose.has(id)) === "carry" && drag.part) {
        drag.mode = "carry";
        startCarry(drag.part, drag.startX, drag.startY);
      } else if (drag.part && loosening.has(drag.part) && drag.carryWhenLoose) {
        // Still loosening under a G press: wait, the carry starts when it is loose.
      } else {
        startTurn(e.clientX, e.clientY);
      }
    }
    if (drag.mode === "carry") moveCarry(e.clientX, e.clientY);
    else if (drag.mode === "turn") turnTo(e.clientX, e.clientY);
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  }

  function onUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag || drag.id !== e.pointerId) {
      if (pointers.size === 0) drag = null;
      return;
    }
    const d = drag;
    drag = null;
    if (d.mode === "carry") dropCarry(e.clientX, e.clientY);
    else if (d.mode === "pending") {
      // A tap. Two on the same part make a double tap, which loosens it (ADR 0020).
      // Timed by the events' own time stamps, so a slow frame cannot push a quick double tap out of the window (0.9.3).
      const under = lastTap?.part ? partsUnder(e.clientX, e.clientY) : [];
      const tap: Tap = { part: d.part, under, down: d.downT, up: e.timeStamp, x: e.clientX, y: e.clientY };
      const part = doubleTapPart(lastTap, tap);
      if (part) {
        // The hand takes hold where a tap touched the part, not at the part's origin inside the machine (0.9.4).
        const at = doubleTapGrasp(part, lastTapSurface, d.surface);
        lastTap = null;
        lastTapSurface = null;
        loosen(part, undefined, at);
      } else {
        lastTap = tap;
        lastTapSurface = d.surface;
      }
    }
    if (loosening.size > 0 || carry) return; // the hand is busy with a part
    if (d.touch) hand?.withdraw();
    else {
      hand?.open();
      if (mouseAt) hover(mouseAt.x, mouseAt.y);
    }
  }

  function onLeave(e: PointerEvent): void {
    if (e.pointerType === "mouse" && !pointers.has(e.pointerId)) {
      mouseAt = null;
      if (!drag && loosening.size === 0 && !carry && !chip) hand?.withdraw();
    }
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    orbit = zoom(orbit, Math.exp(e.deltaY * 0.001), limits);
  }

  /** G loosens the part under the pointer; with the button held, the press then carries it (ADR 0020). */
  function onKey(e: KeyboardEvent): void {
    if (e.key !== "g" && e.key !== "G") return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const at = drag ? { x: drag.lastX, y: drag.lastY } : mouseAt;
    if (!at) return;
    const id = drag?.part ?? pickAt(at.x, at.y);
    if (!id) return;
    if (drag && drag.part === id) {
      const held = drag;
      held.carryWhenLoose = true;
      loosen(id, () => {
        if (drag === held && pointers.has(held.id)) {
          held.mode = "carry";
          startCarry(id, held.lastX, held.lastY);
        } else {
          hand?.detach();
          hand?.open();
        }
      });
    } else loosen(id);
  }

  const el = renderer.domElement;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("pointerleave", onLeave);
  el.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKey);

  // ---- Development hook for the browser check (plan 0003). Vite drops this block from production builds. ----

  if (import.meta.env.DEV) {
    const directionOf = (id: PartId): ScreenDirection => {
      const v = new Vector3(...partById(id).explode).transformDirection(camera.matrixWorldInverse);
      return screenDirection(v);
    };
    const probe = (id: PartId): { x: number; y: number; dir: ScreenDirection } | null => {
      const pv = view.parts.get(id);
      if (!pv || !game.state.installed.has(id)) return null;
      view.root.updateMatrixWorld();
      const rect = renderer.domElement.getBoundingClientRect();
      const steps = [0, -0.3, 0.3, -0.15, 0.15, -0.45, 0.45];
      for (const u of steps) for (const v of steps) for (const w of steps) {
        const p = new Vector3(u, v, w).applyMatrix4(pv.hit.matrixWorld).project(camera);
        if (Math.abs(p.x) > 0.98 || Math.abs(p.y) > 0.98 || p.z > 1) continue;
        const x = rect.left + ((p.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - p.y) / 2) * rect.height;
        if (pickAt(x, y) === id) return { x, y, dir: directionOf(id) };
      }
      return null;
    };
    /**
     * Where a player would put a finger on a part: the visible point of the part nearest the middle of its picture on
     * screen (not the hit volume), and which part a press there picks. Null if no point of it is in view.
     */
    const aim = (id: PartId): { x: number; y: number; pick: PartId | null; solid: boolean } | null => {
      const pv = view.parts.get(id);
      if (!pv || !shown(pv.group)) return null;
      view.root.updateMatrixWorld();
      const rect = renderer.domElement.getBoundingClientRect();
      const box = new Box3().setFromObject(pv.visual);
      const toScreen = (v: Vector3) => {
        const p = v.clone().project(camera);
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      };
      const c = toScreen(box.getCenter(new Vector3()));
      let reach = 0;
      for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
        const s = toScreen(new Vector3(cx, cy, cz));
        reach = Math.max(reach, Math.hypot(s.x - c.x, s.y - c.y));
      }
      const seen = (x: number, y: number): boolean => {
        raycaster.setFromCamera(ndcOf(x, y), camera);
        const hit = raycaster.intersectObject(view.root, true).find((h) => !hitMeshes.has(h.object) && shown(h.object) && h.face);
        return !!hit && partIdOf(hit.object, partIds) === id;
      };
      // Prefer a point with the part all round it (a 5 px ring), where a finger lands squarely on it.
      let edge: { x: number; y: number } | null = null;
      for (let r = 0; r <= reach; r += 3) {
        const n = r === 0 ? 1 : Math.max(8, Math.round(r / 2));
        for (let k = 0; k < n; k++) {
          const x = c.x + r * Math.cos((2 * Math.PI * k) / n);
          const y = c.y + r * Math.sin((2 * Math.PI * k) / n);
          if (x < rect.left + 8 || x > rect.right - 8 || y < rect.top + 8 || y > rect.bottom - 8 || !seen(x, y)) continue;
          let solid = true;
          for (let j = 0; j < 8 && solid; j++) solid = seen(x + 5 * Math.cos((j * Math.PI) / 4), y + 5 * Math.sin((j * Math.PI) / 4));
          if (solid) return { x, y, pick: pickAt(x, y), solid: true };
          edge ??= { x, y };
        }
      }
      return edge ? { ...edge, pick: pickAt(edge.x, edge.y), solid: false } : null;
    };
    (window as unknown as Record<string, unknown>).__openAmDevRender = {
      probe,
      aim,
      carrying: () => carry?.id ?? null,
      /** The lowest screen y (CSS px) of any vertex of the machine still drawn, and the part it belongs to. */
      machineBottom: () => {
        view.root.updateMatrixWorld();
        const rect = renderer.domElement.getBoundingClientRect();
        const v = new Vector3();
        let bottom: { y: number; part: PartId | null } | null = null;
        view.root.traverse((o) => {
          const mesh = o as Object3D & { isMesh?: boolean; geometry?: { attributes: { position?: { count: number } } } };
          if (!mesh.isMesh || hitMeshes.has(o) || !shown(o) || !mesh.geometry?.attributes.position) return;
          const m = o as unknown as { getVertexPosition(i: number, t: Vector3): Vector3; matrixWorld: import("three").Matrix4 };
          const n = mesh.geometry.attributes.position.count;
          for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 4000))) {
            m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).project(camera);
            const y = rect.top + ((1 - v.y) / 2) * rect.height;
            if (!bottom || y > bottom.y) bottom = { y, part: partIdOf(o, partIds) };
          }
        });
        const b = bottom as { y: number; part: PartId | null } | null;
        return b ? { y: Math.round(b.y), part: b.part } : null;
      },
      /** The part a press at (x, y) would take hold of: what a tap or a carry acts on. */
      pressPart: (x: number, y: number) => surfaceAt(x, y).part,
      tweenCount: () => tweens.size,
      busy: () => tweens.size > 0,
      hasHand: () => hand !== null,
      hand: () => (hand ? { visible: hand.visible, closed: hand.closed, action: hand.action, holding: hand.holding } : null),
      handGripping: () => (hand ? hand.visible && hand.closed > 0.5 : false),
      loose: () => [...loose],
      // Plan 0011: the tool in the hand, and how far each fastener of a part stands out of its hole (metres).
      tool: () => (toolInHand ? (toolInHand === tools?.spanner ? "spanner" : "screwdriver") : null),
      toolVisible: () => !!(tools && (tools.spanner.object.visible || tools.screwdriver.object.visible)),
      fasteners: (id: PartId) => (view.parts.get(id)?.fasteners ?? []).map((f) => f.pivot.position.distanceTo(f.rest)),
      // Share of the hand's sample points hidden behind the machine's surface from the camera: a hand that sinks into
      // the machine shows here (plan 0010 fix).
      handHidden: () => {
        if (!hand || !hand.visible) return 0;
        const pts = hand.samplePoints();
        let hidden = 0;
        view.root.updateMatrixWorld();
        for (const p of pts) {
          const dir = p.clone().sub(camera.position);
          const dist = dir.length();
          raycaster.set(camera.position, dir.normalize());
              const held = hand.holding;
          const hit = raycaster.intersectObject(view.root, true).find((h) => !hitMeshes.has(h.object) && shown(h.object) && (held === null || partIdOf(h.object, partIds) !== held));
          if (hit && hit.distance < dist - 0.004) hidden++;
        }
        return pts.length ? hidden / pts.length : 0;
      },
      orbit: () => ({ ...orbit }),
      /** Sets the camera's azimuth and polar (radians), for checks that need a given angle. */
      setOrbit: (azimuth: number, polar: number) => {
        orbit = { ...orbit, azimuth, polar };
        placeCamera();
      },
      /** How far (metres) the whole hand, every sample point, would have to come towards the camera to clear the machine. */
      handNeed: () => (hand && hand.visible ? collide(hand.samplePoints()) : 0),
      marker: "open-am-dev-hook",
    };
  }

  // ---- Loop ----

  let last = performance.now();
  let frame = 0;
  function tick(now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    tweens.update(dt);
    // Settle into the space above the controls, but never under a finger that is carrying or turning, nor between the
    // two taps of a double tap (0.9.4).
    if (cover !== coverWanted && !drag && !carry && !chip && !awaitingSecondTap(lastTap, now)) {
      const next = cover + (coverWanted - cover) * (1 - Math.pow(0.5, dt / REFRAME_HALF_LIFE));
      cover = Math.abs(coverWanted - next) < 0.5 ? coverWanted : next;
      applyFraming();
    }
    placeCamera();
    hand?.update(dt);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  const partImage = createThumbnailer(renderer, view, lighting);

  return {
    partImage,
    setBottomCover(px) {
      coverWanted = Number.isFinite(px) ? Math.max(0, px) : 0;
    },
    setTrayTest(fn) {
      overTray = fn;
    },
    onCarry(fn) {
      carryState = fn;
    },
    carryChip,
    endChipCarry,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const off of unsubscribe) off();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      lighting.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
