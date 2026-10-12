// The Three.js view: scene, lights, the workbench and the camera over it, pointer input, and the animations that follow
// app events.
// It proposes removals to app and listens for what app accepted (ADR 0010). It never imports ui.
//
// Input (plan 0010, ADR 0020): the mechanic's hand is the pointer. It rests on what a mouse points at, comes in under a
// finger, and closes on a press. A double tap (or double click, or G) loosens the part under the pointer if it can come
// off; a drag on a loose part carries it, and dropping it on the tray proposes its removal. Every other drag turns the
// machine, the held spot following the pointer. Whether a part could come off only ever shows in whether it loosens.
//
// The workbench (plan 0016, ADR 0025): the machine stands on a bench and turns there about its upright axis; the camera,
// at a standing mechanic's eye on the near side, never moves sideways. A sideways drag turns the machine, an up-and-down
// drag raises or lowers the camera within limits. The machine's group sits in a turntable group, so part positions stay
// in the machine's own axes; anything placed from a world point goes through the part's parent.

import {
  Box3,
  Color,
  Group,
  Matrix4,
  type Mesh,
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
import { giveMoment, type Moment } from "../app/moments.ts";
import type { Game } from "../app/round.ts";
import { canRemove, type Machine, type PartId, type Vec3 } from "../core/index.ts";
import { awaitingSecondTap, doubleTapGrasp, doubleTapPart, dragMode, GESTURE, screenDirection, type ScreenDirection, type Tap } from "./gesture.ts";
import { alongPath, type Bounds, CARRY, carryPose, carryProgress, FASTEN, fastenerPose, LOOSEN, loosePose, overPath, pathLength, poseAt, resolveMotion, spannerSwing, TIMING, tripPlan, turnCounter, type Pose, type TripStep, type TripTool } from "./motion.ts";
import { TURN, worldPerPixel } from "./orbit.ts";
import { BENCH, cameraPose, clampStage, wrapAngle, DEFAULT_STAGE, DEFAULT_YAW, frameBench, type Framing, projectMachinePoint, rotateStage, stageLimits, type StageLimits, type StageState, TOOLBOX_ON_BENCH, turnStageToward, zoomStage } from "./stage.ts";
import { createBench } from "./bench.ts";
import { firstPart, partIdOf } from "./picking.ts";
import { createHandRig, type HandRig } from "./handrig.ts";
import { armAnchor, armSideOnTrip, basisToQuaternion, cheapest, gripShapeFor, type GripShape, HAND, SPANNER_TURNS, spannerTurn, toolBasis, toolboxArmSide, toolFor } from "./handpose.ts";
import type { RenderAssets, Tool } from "./model.ts";
import { createCustomerStage, type CustomerLoader } from "./customer.ts";
import { carriedYaw, generatorIn, HANDLE_RIGHT, notesShown, settleShare, STORY, storyOver, type StoryClip } from "./customerpose.ts";
import { buildMachine, setPartOpacity, sizeHitVolumes, type FastenerView, type PartView } from "./placeholders.ts";
import { createThumbnailer } from "./thumbnails.ts";
import { createContactShadow, createFloor, createMachineShadow } from "./ground.ts";
import { createLighting } from "./lighting.ts";
import { clamp01, ease, Tweens, type TweenSpec } from "./tween.ts";

/** Minimum finger target, CSS px (docs/design/interface.md). */
const FINGER_PX = 44;
const FOV_DEG = 40;
const BACKGROUND = "#1b1c1e";
/** Directions on a sphere for the machine's outline points used in framing. */
const OUTLINE_DIRECTIONS = 256;
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
  /**
   * Told of each moment the finger makes, as the picture shows it: a fastener's or unscrewed part's whole turn, a part
   * giving, a part seating home (ADR 0018, plan 0013 step 5). Supplied by main.ts, which plays them; render never
   * imports platform (ADR 0010). A part that cannot come off makes none.
   */
  onMoment(fn: (moment: Moment) => void): void;
  /** True while the hand plays a loosening or doing-up sequence: a new put-back is ignored until it ends (ADR 0021). */
  busy(): boolean;
  /**
   * Plays the customer bringing the generator to the bench (plan 0017, ADR 0026) and calls `landed` when it is down, or
   * at once if there is no figure. A tap skips the rest of the arrival and puts it down at once.
   */
  playArrival(landed: () => void): void;
  /** Settles when the round's ending (pay and leave, or storm off) is over or skipped; at once if there is none. */
  ending(): Promise<void>;
  /**
   * Plan 0018 (ADR 0027): while the customer pays, the ending holds after the notes change hands until `hold` settles
   * (the engine runs and the mechanic switches it off). Without it the ending runs straight on.
   */
  setPayHold(hold: (() => Promise<void>) | null): void;
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

/**
 * The machine's outline in its own axes, for framing: of all its mesh points (not the hit volumes), the farthest in
 * each of OUTLINE_DIRECTIONS directions. A few hundred points instead of thousands, so framing stays cheap each frame
 * while the controls grow or shrink, and the picture's edges come out the same.
 */
function outlinePoints(root: Object3D): Vec3[] {
  root.updateMatrixWorld(true);
  const all: Vector3[] = [];
  const v = new Vector3();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || o.name.endsWith("__hit") || !mesh.geometry?.attributes["position"]) return;
    const n = mesh.geometry.attributes["position"].count;
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 400))) all.push(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).clone());
  });
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const chosen = new Set<Vector3>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < OUTLINE_DIRECTIONS; k++) {
    const y = 1 - (2 * (k + 0.5)) / OUTLINE_DIRECTIONS;
    const r = Math.sqrt(1 - y * y);
    const d = new Vector3(Math.cos(golden * k) * r, y, Math.sin(golden * k) * r);
    let best: Vector3 | null = null;
    let most = -Infinity;
    for (const p of all) {
      const s = p.dot(d);
      if (s > most) {
        most = s;
        best = p;
      }
    }
    if (best) chosen.add(best);
  }
  return [...chosen].map((p) => {
    const q = p.clone().applyMatrix4(inverse);
    return [q.x, q.y, q.z];
  });
}

/** Throws if WebGL is not available, so main can show the "cannot run" message. `assets` come from loadRenderAssets. */
export function mountRender(container: HTMLElement, game: Game, assets: RenderAssets = { model: null, environment: null, ground: null, hand: null }, loadCustomer: CustomerLoader | null = null): RenderView {
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
  const view = buildMachine(machine, assets.model);
  document.documentElement.dataset.model = assets.model ? (view.fallbacks.length ? "partial" : "glb") : "placeholders";
  const partIds = new Set(view.parts.keys());
  // The machine's outline in its own axes, for framing; and its bounds with every part on, for the trips (overPath).
  const machinePoints = outlinePoints(view.root);
  const machineLocalBox = new Box3().setFromObject(view.root);

  // The workbench and the floor beyond it; the machine and its shadow stand on the bench top, in the turntable.
  const bench = createBench(assets.bench ?? null);
  document.documentElement.dataset.bench = assets.bench ? "glb" : "box";
  scene.add(bench);
  const floor = createFloor(BENCH.width, BENCH.depth);
  floor.position.x = BENCH.centre[0];
  floor.position.z = BENCH.centre[2];
  scene.add(floor);
  const turntable = new Group();
  turntable.name = "turntable";
  turntable.position.set(0, BENCH.top, 0);
  const machineShadow = createMachineShadow(machine.size, assets.ground);
  machineShadow.position.y = 0.004; // over the planks' small ups and downs
  turntable.add(view.root, machineShadow);
  scene.add(turntable);

  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.01, 20);
  const fovY = (FOV_DEG * Math.PI) / 180;
  /** The machine's middle in the world: on its turning axis, so it stays put as the machine turns. */
  const center = new Vector3(view.center[0], view.center[1] + BENCH.top, view.center[2]);
  let stage: StageState = { ...DEFAULT_STAGE };
  // The default camera is framed for the screen and for the part of it the controls leave free (ADR 0025, release
  // 0.9.3). `cover` eases towards `coverWanted`, the CSS px the controls cover, so the machine glides rather than jumps
  // when a tray row comes or goes.
  let coverWanted = 0;
  let cover = 0;
  let framing: Framing = frameBench(machinePoints, DEFAULT_YAW, fovY, 390, 844, 0);
  let limits: StageLimits = stageLimits(framing);

  function applyFraming(): void {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    framing = frameBench(machinePoints, DEFAULT_YAW, fovY, w, h, cover);
    limits = stageLimits(framing);
    stage = clampStage(stage, limits);
    placeCamera();
    sizeHitVolumes(view, FINGER_PX * worldPerPixel(camera.position.distanceTo(center), fovY, h));
  }

  function resize(): void {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyFraming();
  }

  /** The camera where the framing and the player put it, and the machine turned on the bench. */
  function placeCamera(): void {
    const pose = cameraPose(framing, stage);
    camera.position.set(...pose.eye);
    camera.rotation.set(-pose.pitch, 0, 0);
    camera.updateMatrixWorld();
    turntable.rotation.y = stage.yaw;
    turntable.updateMatrixWorld(true);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // The customer across the bench (plan 0015, ADRs 0015, 0023 and 0025): fixed in the scene, never picked, never in
  // the hand's way. The round's look is downloaded as soon as the round is chosen (behind the briefing) and shown when
  // it arrives; the next round's look downloads while this round is played.
  const customer = loadCustomer ? createCustomerStage(scene, camera, loadCustomer) : null;
  customer?.show(game.customerLook);

  /** A world point in the frame a part's group is placed in (the machine's own axes). */
  const toPartFrame = (pv: PartView, world: Vector3): Vector3 => (pv.group.parent ? pv.group.parent.worldToLocal(world.clone()) : world.clone());
  /** A point in the machine's own axes, in the world. */
  const toWorld = (local: Vector3): Vector3 => view.root.localToWorld(local.clone());

  // ---- Parts ----

  const tweens = new Tweens();
  // The hand keeps out of the machine as the camera sees it (plan 0010): any sampled point of it behind the machine's
  // surface brings the whole hand towards the camera, so it stays under the pointer but in front.
  const collideRay = new Raycaster();
  const collide = (points: readonly Vector3[]): number => {
    // On its way to or from the toolbox the hand follows a path over the machine (overPath). Away from the machine
    // (at the toolbox, which may be behind it from this view) nothing is pushed; near it, the hand keeps out as always.
    if (tripLeg) {
      const near = nearMachine();
      if (!points.some((p) => near.containsPoint(p))) return 0;
    }
    return depthBehind(points);
  };
  /** How far (metres) the deepest of `points` is behind the machine's surface as the camera sees it, plus the margin. */
  const depthBehind = (points: readonly Vector3[]): number => {
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
    seating.delete(pv.id);
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
  /** Parts put back and still on their way home: they have not seated yet (plan 0013 reading 2). */
  const seating = new Set<PartId>();

  /** Where the finger's moments go (plan 0013 step 5). Set by main.ts; nothing is told until then. */
  let momentFn: ((m: Moment) => void) | null = null;
  function moment(m: Moment): void {
    try {
      momentFn?.(m);
    } catch {
      // A sound that fails never stops an animation.
    }
  }

  /**
   * The scripted sequence that is playing, if any (ADR 0021): a part being loosened with a trip to the toolbox, or done
   * up again after it is put back. While it plays, new loosen, carry and put-back input is ignored; the view still turns.
   */
  let sequence: { id: PartId; channel: string; mode: "undo" | "do-up" } | null = null;
  /** True while the hand travels to or from the toolbox: its path keeps it over the machine (overPath). */
  let tripLeg = false;
  /** Progress of the trip step playing (0 to 1); the arm's side follows it (armSideOnTrip). */
  let tripP = 0;
  let legAt: Vector3 | null = null;
  /** The closest the hand came to a tool's grip at the toolbox during the last trip, metres (browser check). */
  let tripReach = Infinity;
  /** The step of the trip under way, for the browser check. */
  let tripPhase: TripStep["kind"] | null = null;
  const handBusy = (): boolean => loosening.size > 0 || sequence !== null;

  /**
   * Loosens a part: the hand undoes it and it sits loose. Does nothing at all if it cannot come off now (ADR 0007). The
   * hand takes hold at `at`, where the player touched the part, if given; otherwise at the last spot under the pointer
   * if that is on the part, else at the part's origin. A part with fasteners is undone with the right tool, fetched from
   * the toolbox and put back after (ADR 0021).
   */
  function loosen(id: PartId, then?: () => void, at?: Surface | null): void {
    if (!game.running || loose.has(id) || handBusy() || !game.state.installed.has(id)) return;
    if (!canRemove(machine, game.state, id)) return;
    const pv = view.parts.get(id);
    if (!pv) return;
    const part = partById(id);
    const m = resolveMotion(part.motion);
    loosening.add(id);
    const s = at ?? (lastSurface && lastSurface.part === id ? lastSurface : surfaceOfPart(pv));
    const channel = `loosen:${id}`;
    // The part gives as its freeing step starts; an unscrewed part clicks once a whole turn instead (plan 0013).
    const give = giveMoment(m.type);
    let gave = false;
    const turns = turnCounter(m.type === "unscrew" ? m.turns * LOOSEN.unscrewShare : 0, () => moment("turn"));
    const freeing = (q: number): void => {
      if (!gave) {
        gave = true;
        if (give) moment(give);
      }
      turns(q);
      applyPose(pv, loosePose(m, part.explode, q));
    };
    const finish = (): void => {
      loosening.delete(id);
      loose.add(id);
      sequence = null;
      tripPhase = null;
      tripLeg = false;
      if (then) then();
      else {
        hand?.detach();
        hand?.open();
      }
    };
    if (pv.fasteners.length) {
      sequence = { id, channel, mode: "undo" };
      const free: TweenSpec = {
        duration: FASTEN.freeSeconds,
        ease: ease.inOutCubic,
        update: (q) => {
          setPhase("free");
          freeing(q);
        },
        // The part is loose now (the browser checks read it); the hand still takes the tool back before it is free.
        done: () => loose.add(id),
      };
      tweens.play(channel, ...tripSteps(pv, "undo", s, free), { duration: 0, update: () => {}, done: finish });
      return;
    }
    tweens.play(
      channel,
      { duration: HAND.close, update: () => hand?.grab(s.point, s.normal, shapeOf(id)), done: () => hand?.attachTo(pv.group) },
      { duration: LOOSEN.seconds[m.type], ease: ease.inOutCubic, update: freeing },
      { duration: 0, update: () => {}, done: finish },
    );
  }

  // ---- Fasteners, tools and the toolbox (plans 0011 and 0012, ADRs 0020 and 0021) ----

  const tools = assets.tools ?? null;
  const toolbox = assets.toolbox ?? null;
  /** The machine's bounds with every part on, as it is turned now: the hand's trips go over them, never through. */
  const machineBox = (): Box3 => machineLocalBox.clone().applyMatrix4(view.root.matrixWorld);
  /** The machine's bounds grown by a hand's length: inside it, the hand is kept out of the machine even on a trip leg. */
  const nearMachine = (): Box3 => machineBox().expandByScalar(0.1);
  const bounds = (): Bounds => {
    const b = machineBox();
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
  };
  if (toolbox) {
    // On the bench's left end, its back tray with the tools towards the camera, cut by the left screen edge (plan 0016,
    // ADR 0025; on the ground before).
    const wrap = new Group();
    wrap.name = "toolbox_place";
    wrap.position.set(TOOLBOX_ON_BENCH.x, BENCH.top, TOOLBOX_ON_BENCH.z);
    wrap.rotation.y = TOOLBOX_ON_BENCH.rotationY;
    wrap.add(toolbox.object);
    const size = new Box3().setFromObject(toolbox.object).getSize(new Vector3());
    wrap.add(createContactShadow(size.x * 0.9, size.z * 0.6));
    scene.add(wrap);
    scene.updateMatrixWorld(true);
  }
  /** Share of each fastener's time spent moving the tool to it from the last one. */
  const TOOL_HOP = 0.25;
  let toolInHand: Tool | null = null;
  /** Tools out of their resting place: in the hand, or on their way to or from it. */
  const toolsOut = new Set<Tool>();
  const toolName = (t: Tool): TripTool => (t === tools?.spanner ? "spanner" : "screwdriver");

  function applyFastener(f: FastenerView, q: number): void {
    const p = fastenerPose(q);
    f.pivot.position.copy(f.rest).addScaledVector(f.axis, p.out);
    f.pivot.quaternion.setFromAxisAngle(f.axis, p.angle);
  }

  const screen = (): { right: [number, number, number]; up: [number, number, number]; forward: Vector3 } => {
    const e = camera.matrixWorld.elements;
    return { right: [e[0]!, e[1]!, e[2]!], up: [e[4]!, e[5]!, e[6]!], forward: new Vector3(-e[8]!, -e[9]!, -e[10]!) };
  };

  /** Without a toolbox, tools come from just off screen at the lower left and go back there (plan 0011). */
  function offScreen(): Vector3 {
    const sc = screen();
    return camera.position.clone().addScaledVector(new Vector3(...sc.right), -0.3).addScaledVector(new Vector3(...sc.up), -0.5).addScaledVector(sc.forward, 0.45);
  }

  /** Where a tool rests: its slot in the toolbox, or (with no toolbox) just off screen, keeping its turn. */
  function restPose(tool: Tool): { at: Vector3; q: Quaternion } {
    const slot = toolbox ? toolbox.slots[toolName(tool)] : null;
    if (slot) return { at: slot.getWorldPosition(new Vector3()), q: slot.getWorldQuaternion(new Quaternion()) };
    return { at: offScreen(), q: tool.object.quaternion.clone() };
  }

  /** Which side of the screen the toolbox is on, for the arm (toolboxArmSide); 1 without a toolbox. */
  function toolboxSideNow(): number {
    if (!toolbox) return 1;
    const p = toolbox.slots.spanner.getWorldPosition(new Vector3()).project(camera);
    return p.z < 1 ? toolboxArmSide(p.x) : 1;
  }

  /** Lays a tool in its slot, in view; with no toolbox it is hidden until it is needed. */
  function rest(tool: Tool): void {
    toolsOut.delete(tool);
    if (toolInHand === tool) toolInHand = null;
    const p = restPose(tool);
    tool.object.position.copy(p.at);
    tool.object.quaternion.copy(p.q);
    tool.object.visible = toolbox !== null;
  }
  if (tools) {
    for (const t of [tools.spanner, tools.screwdriver]) {
      scene.add(t.object);
      rest(t);
    }
  }

  const fastenerAt = (f: FastenerView): Vector3 => f.pivot.getWorldPosition(new Vector3());
  const fastenerAxis = (pv: PartView, f: FastenerView): Vector3 => f.axis.clone().transformDirection(pv.group.matrixWorld);
  const toCamera = (p: Vector3): Vector3 => camera.position.clone().sub(p).normalize();
  const gripOf = (tool: Tool): Vector3 => new Vector3(...tool.grip).applyQuaternion(tool.object.quaternion).add(tool.object.position);

  /** How a tool sits on a fastener: its working end on it, along its axis, turned by `angle`. */
  function workQuaternion(axis: Vector3, angle: number): Quaternion {
    const sc = screen();
    return new Quaternion(...basisToQuaternion(toolBasis([axis.x, axis.y, axis.z], sc.right, sc.up, angle)));
  }

  /**
   * Where the spanner's handle lies on a bolt: the turn about the bolt at which the hand holding it is least hidden
   * behind the machine, over the whole of its stroke (plan 0012 follow-up). With the handle always towards the lower
   * right of the screen, a bolt under the tank's overhang put the hand 30 to 40 cm behind the tank, past HAND.maxPush.
   * Chosen once per bolt per trip, so the spanner does not jump while it works.
   */
  const spannerBase = new Map<FastenerView, number>();
  function baseTurn(pv: PartView, tool: Tool, f: FastenerView): number {
    if (tool !== tools?.spanner) return 0;
    const known = spannerBase.get(f);
    if (known !== undefined) return known;
    const sc = screen();
    const anchor = new Vector3(...armAnchor(v3(camera.position), sc.right, sc.up, v3(sc.forward)));
    const at = fastenerAt(f);
    const axis = fastenerAxis(pv, f);
    const costs: number[] = [];
    for (let k = 0; k < SPANNER_TURNS; k++) {
      const points: Vector3[] = [];
      for (const swing of [0, (FASTEN.spannerStroke * Math.PI) / 180]) {
        const grip = new Vector3(...tool.grip).applyQuaternion(workQuaternion(axis, spannerTurn(k) + swing)).add(at);
        const toArm = anchor.clone().sub(grip).normalize();
        points.push(grip, grip.clone().addScaledVector(toArm, 0.06), grip.clone().addScaledVector(toArm, 0.12));
      }
      costs.push(depthBehind(points));
    }
    const turn = spannerTurn(cheapest(costs));
    spannerBase.set(f, turn);
    return turn;
  }

  /** Puts a tool at `at`, turned `q`, out of its slot, and the hand closed on its grip. */
  function holdToolAt(tool: Tool, at: Vector3, q: Quaternion): void {
    tool.object.position.copy(at);
    tool.object.quaternion.copy(q);
    tool.object.visible = true;
    toolsOut.add(tool);
    hand?.firm(true);
    const grip = gripOf(tool);
    hand?.grab(grip, toCamera(grip), "grip");
  }

  const v3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];

  /** A leg's path, and the share of its length where the stand-offs from the machine's surface end and begin again. */
  type Route = { points: Vec3[]; core: [number, number] };
  function route(from: Vector3, fromOut: Vector3 | null, to: Vector3, toOut: Vector3 | null): Route {
    const points = overPath(v3(from), fromOut ? v3(fromOut) : null, v3(to), toOut ? v3(toOut) : null, bounds());
    const total = Math.max(1e-9, pathLength(points));
    const upTo = (i: number) => pathLength(points.slice(0, i + 1)) / total;
    return { points, core: [upTo(fromOut ? 1 : 0), upTo(toOut ? points.length - 2 : points.length - 1)] };
  }

  /** Records what each trip did, for the browser check (only while `watchTrips` is on, set from the dev hook). */
  let watchTrips = false;
  /**
   * The machine's rectangle on screen (CSS px), from a sparse sample of its points, and how far into it the sleeve
   * reaches, in px: the deepest sleeve point inside it, measured to the rectangle's nearest edge (browser check).
   */
  function armIntoMachine(): number {
    if (!hand || !hand.visible) return 0;
    const rect = renderer.domElement.getBoundingClientRect();
    const toPx = (v: Vector3): [number, number] => [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height];
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    const v = new Vector3();
    view.root.updateMatrixWorld();
    view.root.traverse((o) => {
      const mesh = o as Object3D & { isMesh?: boolean; geometry?: { attributes: { position?: { count: number } } } };
      if (!mesh.isMesh || hitMeshes.has(o) || !shown(o) || !mesh.geometry?.attributes.position) return;
      const m = o as unknown as { getVertexPosition(i: number, t: Vector3): Vector3; matrixWorld: Matrix4 };
      const n = mesh.geometry.attributes.position.count;
      for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 200))) {
        const [x, y] = toPx(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).project(camera));
        l = Math.min(l, x);
        t = Math.min(t, y);
        r = Math.max(r, x);
        b = Math.max(b, y);
      }
    });
    let deepest = 0;
    for (const p of hand.sleevePoints()) {
      const q = p.project(camera);
      if (q.z >= 1) continue;
      const [x, y] = toPx(q);
      if (x < 0 || x > rect.width || y < 0 || y > rect.height) continue;
      deepest = Math.max(deepest, Math.min(x - l, r - x, y - t, b - y));
    }
    return deepest;
  }
  const tripLog = { throughAt: [] as Array<{ kind: string; p: number; at: Vec3; points: Vec3[]; core: [number, number] }>, planned: 0, metres: { pointer: 0, machine: 0 }, armInto: {} as Record<string, number>, phases: [] as string[], reach: Infinity, toolAtBolts: Infinity, tools: [] as string[], through: [] as string[], legHidden: 0 };
  function setPhase(kind: TripStep["kind"]): void {
    if (tripPhase !== kind) tripLog.phases.push(kind);
    if (tripPhase !== kind) tripP = 0;
    tripPhase = kind;
  }

  /** Share of the hand's sample points hidden behind the machine's surface from the camera (the part it holds aside). */
  function hiddenShare(): number {
    if (!hand || !hand.visible) return 0;
    const pts = hand.samplePoints();
    let hidden = 0;
    view.root.updateMatrixWorld();
    const held = hand.holding;
    for (const p of pts) {
      const dir = p.clone().sub(camera.position);
      const dist = dir.length();
      raycaster.set(camera.position, dir.normalize());
      const hit = raycaster.intersectObject(view.root, true).find((h) => !hitMeshes.has(h.object) && shown(h.object) && (held === null || partIdOf(h.object, partIds) !== held));
      if (hit && hit.distance < dist - 0.004) hidden++;
    }
    return pts.length ? hidden / pts.length : 0;
  }

  /**
   * A leg of the trip along a path over the machine (overPath), computed when the leg starts so it begins where the
   * hand is. `move` places the hand (and the tool, if carried) at a point along it, with progress p.
   */
  function leg(seconds: number, kind: TripStep["kind"], path: () => Route, move: (at: Vector3, p: number) => void, done?: () => void): TweenSpec {
    let r: Route | null = null;
    return {
      duration: seconds,
      ease: ease.inOutCubic,
      update: (p) => {
        setPhase(kind);
        tripP = p;
        tripLeg = true;
        r ??= path();
        legAt = new Vector3(...alongPath(r.points, p));
        move(legAt.clone(), p);
        if (watchTrips) {
          // Between the stand-offs the path must keep out of the machine's bounds; and how much of the hand is hidden.
          if (p > r.core[0] + 1e-3 && p < r.core[1] - 1e-3 && machineBox().expandByScalar(-0.01).containsPoint(legAt)) {
            tripLog.through.push(kind);
            if (tripLog.throughAt.length < 3) tripLog.throughAt.push({ kind, p, at: v3(legAt), points: r.points, core: r.core });
          }
          tripLog.legHidden = Math.max(tripLog.legHidden, hiddenShare());
        }
      },
      done: () => {
        tripLeg = false;
        done?.();
      },
    };
  }

  /**
   * The tween steps of a trip (ADR 0021): from `start` (where the player touched the part) to the toolbox, take the
   * tool, carry it to the first fastener, work each fastener, change tool at the toolbox if another is needed, `free`
   * the part (loosening), put the tool back and return. Without the tools file the fingers turn the fasteners, with no
   * trip. Leg times come from the distances as the trip starts (tripPlan).
   */
  function tripSteps(pv: PartView, mode: "undo" | "do-up", start: Surface, free: TweenSpec | null): TweenSpec[] {
    const fasteners = pv.fasteners;
    // Each fastener clicks once a whole turn, coming out or going in (plan 0013): q runs 0 to 1 either way.
    const clicks = new Map<FastenerView, (q: number) => void>();
    const turn = (f: FastenerView, q: number): void => {
      applyFastener(f, mode === "undo" ? q : 1 - q);
      let click = clicks.get(f);
      if (!click) clicks.set(f, (click = turnCounter(FASTEN.turns, () => moment("turn"))));
      click(q);
    };
    if (!tools) {
      return [
        ...fasteners.map((f) => ({
          duration: mode === "undo" ? FASTEN.outSeconds : FASTEN.doUpSeconds,
          update: (q: number) => {
            setPhase("fasten");
            turn(f, q);
            const ax = fastenerAxis(pv, f);
            hand?.grab(fastenerAt(f).addScaledVector(ax, 0.01), ax, "pinch");
          },
        })),
        ...(free ? [free] : []),
      ];
    }
    const kit = tools;
    tripReach = Infinity;
    spannerBase.clear();
    Object.assign(tripLog, { throughAt: [], planned: 0, metres: { pointer: 0, machine: 0 }, armInto: {}, phases: [], reach: Infinity, toolAtBolts: Infinity, tools: [], through: [], legHidden: 0 });
    // The pointer's spot rides with the part, so the hand comes back to where the player touched it. A spot off the part
    // (a press on its finger-sized hit volume over empty space lies at the machine's depth, inside it) gives way to
    // the part's face the camera sees.
    pv.group.updateMatrixWorld(true);
    const at = start.onMachine && start.part === pv.id ? start : facingSurface(pv);
    const spotLocal = pv.group.worldToLocal(at.point.clone());
    const spotOut = at.onMachine ? at.normal.clone().transformDirection(new Matrix4().copy(pv.group.matrixWorld).invert()) : null;
    const spot = (): { at: Vector3; out: Vector3 | null } => ({ at: pv.group.localToWorld(spotLocal.clone()), out: spotOut ? spotOut.clone().transformDirection(pv.group.matrixWorld) : null });
    const toolOf = (t: TripTool): Tool => kit[t];
    const firstSlot = restPose(toolOf(toolFor(fasteners[0]!.kind)));
    const metres = { pointer: at.point.distanceTo(firstSlot.at), machine: pathLength(overPath(v3(firstSlot.at), null, v3(fastenerAt(fasteners[0]!)), v3(fastenerAxis(pv, fasteners[0]!)), bounds())) };
    const plan = tripPlan(fasteners.map((f) => f.kind), mode, metres);
    tripLog.planned = plan.total;
    tripLog.metres = metres;
    // The fastener the tool last worked, as the trip runs; and whether the next fastener starts a tool's run.
    let lastIndex = -1;
    let runStart = false;
    const steps: TweenSpec[] = [];
    for (const step of plan.steps) {
      switch (step.kind) {
        case "toToolbox": {
          const tool = toolOf(step.tool);
          steps.push(
            leg(
              step.seconds,
              step.kind,
              () => {
                const o = spot();
                return route(o.at, o.out, gripOf(tool), null);
              },
              (at) => hand?.point(at, toCamera(at)),
            ),
          );
          break;
        }
        case "pick": {
          const tool = toolOf(step.tool);
          steps.push({
            duration: step.seconds,
            update: () => {
              setPhase("pick");
              tripLeg = true;
              const g = gripOf(tool);
              tripReach = Math.min(tripReach, handAt().distanceTo(g));
              tripLog.reach = tripReach;
              hand?.grab(g, toCamera(g), "grip");
            },
            done: () => {
              toolInHand = tool;
              toolsOut.add(tool);
            },
          });
          break;
        }
        case "toFastener": {
          const tool = toolOf(step.tool);
          const f = fasteners[step.index]!;
          let q0: Quaternion | null = null;
          steps.push(
            leg(
              step.seconds,
              step.kind,
              () => {
                q0 = tool.object.quaternion.clone();
                return route(tool.object.position.clone(), null, fastenerAt(f), fastenerAxis(pv, f));
              },
              (at, p) => holdToolAt(tool, at, q0!.clone().slerp(workQuaternion(fastenerAxis(pv, f), baseTurn(pv, tool, f)), p)),
            ),
          );
          runStart = true;
          break;
        }
        case "fasten": {
          const tool = toolOf(step.tool);
          const f = fasteners[step.index]!;
          const index = step.index;
          // The tool hops from the last fastener it worked; the first of each tool's run starts on its fastener.
          let hopFrom: number | null = null;
          const firstOfRun = runStart;
          runStart = false;
          steps.push({
            duration: step.seconds,
            update: (p) => {
              setPhase("fasten");
              tripLeg = false;
              hand?.firm(true);
              hopFrom ??= firstOfRun ? -1 : lastIndex;
              const hop = hopFrom < 0 ? 1 : clamp01(p / TOOL_HOP);
              const q = hopFrom < 0 ? clamp01(p) : clamp01((p - TOOL_HOP) / (1 - TOOL_HOP));
              turn(f, q);
              const target = fastenerAt(f);
              const at = hop < 1 && hopFrom >= 0 ? fastenerAt(fasteners[hopFrom]!).lerp(target, ease.inOutCubic(hop)) : target;
              const angle = tool === kit.screwdriver ? fastenerPose(mode === "undo" ? q : 1 - q).angle : baseTurn(pv, tool, f) + spannerSwing(q);
              holdToolAt(tool, at, workQuaternion(fastenerAxis(pv, f), angle));
              toolInHand = tool;
              if (hop >= 1) tripLog.toolAtBolts = Math.min(tripLog.toolAtBolts, tool.object.position.distanceTo(target));
              if (!tripLog.tools.includes(toolName(tool))) tripLog.tools.push(toolName(tool));
            },
            done: () => {
              lastIndex = index;
            },
          });
          break;
        }
        case "free":
          if (free) steps.push(free);
          break;
        case "toSlot": {
          const tool = toolOf(step.tool);
          let q0: Quaternion | null = null;
          steps.push(
            leg(
              step.seconds,
              step.kind,
              () => {
                q0 = tool.object.quaternion.clone();
                const last = lastIndex >= 0 ? fasteners[lastIndex]! : null;
                return route(tool.object.position.clone(), last ? fastenerAxis(pv, last) : null, restPose(tool).at, null);
              },
              (at, p) => holdToolAt(tool, at, q0!.clone().slerp(restPose(tool).q, p)),
            ),
          );
          break;
        }
        case "putBack": {
          const tool = toolOf(step.tool);
          steps.push({
            duration: step.seconds,
            update: () => {
              setPhase("putBack");
              tripLeg = true;
              hand?.firm(false);
              const g = gripOf(tool);
              tripReach = Math.min(tripReach, handAt().distanceTo(g));
              tripLog.reach = tripReach;
              hand?.open();
              hand?.point(g, toCamera(g));
            },
            done: () => {
              rest(tool);
              lastIndex = -1;
            },
          });
          break;
        }
        case "home": {
          let fromAt: Vector3 | null = null;
          steps.push(
            leg(
              step.seconds,
              step.kind,
              () => {
                fromAt = hand ? handAt() : spot().at;
                const back = spot();
                return route(fromAt, null, back.at, back.out);
              },
              (at) => hand?.point(at, toCamera(at)),
            ),
          );
          break;
        }
      }
    }
    return steps;
  }

  /** The hand's grip point, world space. */
  const handAt = (): Vector3 => (assets.hand ? assets.hand.getWorldPosition(new Vector3()) : new Vector3());

  /** Stops the sequence where it is: every tool back in its slot and the hand free (the cord pulled, a new round). */
  function abortSequence(): void {
    if (sequence) tweens.cancel(sequence.channel);
    sequence = null;
    tripLeg = false;
    tripPhase = null;
    if (tools) for (const t of [tools.spanner, tools.screwdriver]) rest(t);
    toolInHand = null;
    hand?.firm(false);
  }

  /**
   * Before the cord is pulled, the hand presses every loose part home. No rule changes (ADR 0020). It runs on
   * "pulled", which app tells before it plays the cord: a part still going back seats now, with its `seat`, so the
   * order is always seat, cord, then start or fail. Pressing home a part that was never put back stays silent.
   */
  function pressHome(): void {
    const doingUp = sequence?.mode === "do-up" ? sequence.id : null;
    const seated = [...seating];
    seating.clear();
    // A part stopped half undone, or half done up, leaves no tool behind in the hand (plans 0011, 0012).
    if (sequence || toolInHand) {
      abortSequence();
      hand?.detach();
      hand?.open();
    } else if (seated.length) {
      hand?.detach();
      hand?.withdraw();
    }
    for (const id of seated) {
      tweens.cancel(id); // not finish: that would click its remaining turns and seat it a second time
      const pv = view.parts.get(id);
      if (pv) setOpacity(pv, 1);
      moment("seat");
    }
    for (const id of new Set([...loose, ...loosening, ...seated, ...(doingUp ? [doingUp] : [])])) {
      const pv = view.parts.get(id);
      if (!pv) continue;
      tweens.cancel(`loosen:${id}`);
      const from = pv.group.position.clone();
      const q0 = pv.group.quaternion.clone();
      // Its fasteners go back in with it, quickly, with no trip to the toolbox (ADR 0021).
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
        const depth = carry.pv.group.getWorldPosition(new Vector3());
        const under = pointAtDepth(x, y, depth);
        carry.free = { offset: depth.clone().sub(under), depth };
      }
      return;
    }
    carry.pv.group.position.copy(toPartFrame(carry.pv, pointAtDepth(x, y, carry.free.depth).add(carry.free.offset)));
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
    const to = toPartFrame(pv, trayPoint(toWorld(from)));
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
    if (!chip && sequence) return; // a put-back waits until the sequence is done (ADR 0021)
    if (!chip || chip.id !== id) {
      reset(pv);
      const part = partById(id);
      applyPose(pv, poseAt(resolveMotion(part.motion), part.explode, 1));
      chip = { id, pv };
      const s = surfaceOfPart(pv);
      hand?.grab(s.point, s.normal, shapeOf(id));
      hand?.attachTo(pv.group);
    }
    pv.group.position.copy(toPartFrame(pv, pointAtDepth(x, y, center)));
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
    const start = carried ? pv.group.position.clone() : toPartFrame(pv, trayPoint(toWorld(outPos)));
    if (!carried) {
      reset(pv);
      applyPose(pv, out);
      pv.group.position.copy(start);
      setOpacity(pv, 0);
    }
    for (const f of pv.fasteners) applyFastener(f, 1); // they come back with the part, out of their holes
    chip = null;
    const screwIn = turnCounter(m.type === "unscrew" ? m.turns : 0, () => moment("turn"));
    // The part is home; its fasteners go back in, the hand fetching the tool from the toolbox (ADRs 0020, 0021).
    if (pv.fasteners.length) sequence = { id, channel: id, mode: "do-up" };
    seating.add(id);
    let doUp: TweenSpec[] = [];
    const endInstall = (): void => {
      sequence = null;
      tripPhase = null;
      tripLeg = false;
      hand?.detach();
      hand?.withdraw();
      reset(pv);
    };
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
        update: (p) => {
          screwIn(p);
          applyPose(pv, poseAt(m, part.explode, 1 - p));
        },
        done: () => {
          seating.delete(id);
          moment("seat"); // home, before its fasteners go in (plan 0013 reading 2)
          if (!pv.fasteners.length) return;
          hand?.detach();
          // The trip's steps are made once the part is home, so its legs start from where it is.
          doUp = tripSteps(pv, "do-up", facingSurface(pv), null);
        },
      },
      {
        duration: 0,
        update: () => {},
        done: () => {
          if (doUp.length) tweens.play(id, ...doUp, { duration: 0, update: () => {}, done: endInstall });
          else endInstall();
        },
      },
    );
  }

  /** Every part home, nothing loose, carried or seating, the hand away: a new round, or a walk-out's whole generator. */
  function homeEverything(): void {
    tellCarry("none");
    abortSequence();
    hand?.hide();
    loose.clear();
    loosening.clear();
    seating.clear();
    carry = null;
    chip = null;
    for (const pv of view.parts.values()) reset(pv);
  }

  // ---- The customer brings the generator, and pays or storms off with it (plan 0017, ADR 0026) ----

  interface Story {
    clip: StoryClip;
    /** arrive: called once when the generator lands. */
    landed: (() => void) | null;
    /** The endings: settles when the customer is gone. */
    done: (() => void) | null;
    /** The machine's turn when the story started, eased back to the landed turn before they reach for it. */
    yawFrom: number;
    holdAsked: boolean;
  }
  let story: Story | null = null;
  let endingPromise: Promise<void> | null = null;
  let payHold: (() => Promise<void>) | null = null;
  /** The turntable's place on the bench. */
  const benchPlace = new Vector3(0, BENCH.top, 0);

  function startStory(clip: StoryClip, landed: (() => void) | null): Promise<void> {
    if (story?.done) story.done();
    let done: (() => void) | null = null;
    const p = new Promise<void>((r) => (done = r));
    story = { clip, landed, done, yawFrom: stage.yaw, holdAsked: false };
    customer!.story(clip, clip === "arrive" ? "idle" : "hide");
    return p;
  }

  function endStory(): void {
    if (!story) return;
    const s = story;
    story = null;
    if (s.landed) s.landed();
    customer?.setNotes(false);
    turntable.position.copy(benchPlace);
    if (s.clip !== "arrive") turntable.visible = false; // they took it away
    s.done?.();
  }

  /** Each frame while a story plays: where the generator is, the notes, the hold, the landing and the end. */
  function storyStep(): void {
    if (!story || !customer) return;
    const t = customer.storyTime();
    if (t === null || storyOver(story.clip, t)) {
      endStory();
      return;
    }
    customer.setNotes(notesShown(story.clip, t));
    if (story.clip === "pay_leave" && payHold && !story.holdAsked && t >= STORY.pay_leave.hold - 0.05) {
      story.holdAsked = true;
      customer.holdAt(STORY.pay_leave.hold);
      void payHold().then(() => customer?.release());
    }
    const grips = customer.grips();
    const where = generatorIn(story.clip, t);
    if (story.clip === "arrive" && where === "bench" && story.landed) {
      const landed = story.landed;
      story.landed = null;
      turntable.position.copy(benchPlace);
      landed();
    }
    const share = settleShare(story.clip, t);
    if (where === "carried" && grips) {
      const yaw = carriedYaw([grips.right.x, grips.right.y, grips.right.z], [grips.left.x, grips.left.y, grips.left.z]);
      const handPos = grips.right.clone().sub(new Vector3(...HANDLE_RIGHT).applyAxisAngle(AXES.y, yaw));
      if (story.clip === "arrive") {
        // Eased onto the bench at the landed turn over the last moments before it lands.
        turntable.position.lerpVectors(handPos, benchPlace, share);
        turntable.rotation.y = yaw + wrapAngle(DEFAULT_YAW - yaw) * share;
        stage = { ...stage, yaw: DEFAULT_YAW };
      } else {
        // Lifted off the bench: from where it stood into the hands over a moment.
        const k = Math.min(1, (t - STORY[story.clip].lifted) / 0.15);
        turntable.position.lerpVectors(benchPlace, handPos, k);
        turntable.rotation.y = DEFAULT_YAW + wrapAngle(yaw - DEFAULT_YAW) * k;
      }
    } else if (story.clip !== "arrive") {
      // Still on the bench: turned back to the landed turn before they reach for it.
      turntable.position.copy(benchPlace);
      stage = { ...stage, yaw: story.yawFrom + wrapAngle(DEFAULT_YAW - story.yawFrom) * share };
      turntable.rotation.y = stage.yaw;
    }
    turntable.updateMatrixWorld(true);
  }

  function skipStory(): void {
    if (!story) return;
    if (story.clip === "arrive" && story.landed) {
      const landed = story.landed;
      story.landed = null;
      turntable.position.copy(benchPlace);
      stage = { ...stage, yaw: DEFAULT_YAW };
      landed();
    }
    customer?.skip();
    endStory();
  }

  function playArrival(landed: () => void): void {
    endingPromise = null;
    homeEverything();
    turntable.visible = true;
    turntable.position.copy(benchPlace);
    stage = { ...stage, yaw: DEFAULT_YAW, lift: 0, zoom: 1 };
    customer?.show(game.customerLook);
    if (!customer || !customer.ready()) {
      landed();
      return;
    }
    void startStory("arrive", landed);
  }

  function startEnding(clip: "pay_leave" | "storm_off"): void {
    if (!customer || !customer.ready()) {
      endingPromise = Promise.resolve();
      return;
    }
    endingPromise = startStory(clip, null);
  }

  const unsubscribe = [
    game.events.on("removed", (e) => animateRemove(e.partId)),
    game.events.on("installed", (e) => animateInstall(e.partId)),
    game.events.on("pulled", () => pressHome()),
    game.events.on("started", () => {
      homeEverything();
      turntable.visible = true;
    }),
    game.events.on("ended", () => {
      abortSequence();
      hand?.withdraw();
    }),
    game.events.on("left", () => {
      abortSequence();
      hand?.withdraw();
    }),
    // The customer moves only with the clock and the cord (ADR 0007): no part event is passed to them.
    game.events.on("started", () => {
      customer?.show(game.customerLook);
      customer?.event({ type: "started" });
      customer?.request(game.nextCustomerLook);
    }),
    game.events.on("patience", (e) => customer?.event({ type: "patience", mood: e.mood })),
    game.events.on("pulled", (e) => customer?.event({ type: "pulled", started: e.started })),
    // The endings (ADR 0026): paying and leaving with it, or storming off with it.
    game.events.on("ended", () => startEnding("pay_leave")),
    game.events.on("left", () => {
      // A whole generator leaves: the parts that were off or loose snap back on, silently (plan 0017 reading 3).
      homeEverything();
      startEnding("storm_off");
    }),
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

  /** The spot on a part the camera sees at its centre, facing out; its centre if the ray misses it. */
  function facingSurface(pv: PartView): Surface {
    const c = pv.group.getWorldPosition(new Vector3());
    view.root.updateMatrixWorld();
    raycaster.set(camera.position, c.clone().sub(camera.position).normalize());
    const hit = raycaster.intersectObject(pv.group, true).find((h) => !hitMeshes.has(h.object) && shown(h.object) && h.face);
    if (!hit) return surfaceOfPart(pv);
    const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.dot(raycaster.ray.direction) > 0) normal.negate();
    return { point: hit.point.clone(), normal, part: pv.id, onMachine: true };
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
    /** For a turn: the spot the hand holds, in the machine's own axes (it turns with it), or null over empty space. */
    held: { local: Vector3; normalLocal: Vector3 } | null;
    /** Set when G loosens the part under a held press: the press carries the part once it is loose. */
    carryWhenLoose: boolean;
    /** The press's event time stamp, ms. */
    downT: number;
  } | null = null;

  /** Rests the hand on the spot under a mouse pointer that is not pressing. */
  function hover(x: number, y: number): void {
    if (!hand || !game.running || drag || chip || handBusy() || carry) return;
    const s = surfaceAt(x, y);
    lastSurface = s;
    hand.point(s.point, s.normal);
  }

  function pinchDistance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onDown(e: PointerEvent): void {
    // A tap during the arrival or an ending skips it (ADR 0026).
    if (story) {
      skipStory();
      return;
    }
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
    if (game.running && hand && !handBusy()) hand.grab(s.point, s.normal, shapeOf(s.part));
    drag = { id: e.pointerId, touch: e.pointerType !== "mouse", startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, part: game.running ? s.part : null, surface: s, mode: "pending", held: null, carryWhenLoose: false, downT: e.timeStamp };
  }

  function startTurn(x: number, y: number): void {
    if (!drag) return;
    drag.mode = "turn";
    drag.held = drag.surface.onMachine ? holdOf(drag.surface) : null;
    turnTo(x, y);
  }

  /** A spot on the machine, kept in its own axes so it turns with it. */
  function holdOf(s: Surface): { local: Vector3; normalLocal: Vector3 } {
    view.root.updateMatrixWorld();
    const inverse = new Matrix4().copy(view.root.matrixWorld).invert();
    return { local: view.root.worldToLocal(s.point.clone()), normalLocal: s.normal.clone().transformDirection(inverse) };
  }

  function turnTo(x: number, y: number): void {
    if (!drag) return;
    const mdx = x - drag.lastX;
    const mdy = y - drag.lastY;
    if (!drag.held) {
      // Nothing held: turn at the old rate, the hand following the pointer at the machine's depth.
      stage = rotateStage(stage, mdx, mdy, limits);
      placeCamera();
      if (game.running && !handBusy()) hand?.grab(pointAtDepth(x, y, center), camera.position.clone().sub(center).normalize(), "grip");
      return;
    }
    const ndc = ndcOf(x, y);
    const at: [number, number] = [ndc.x, ndc.y];
    const held: Vec3 = [drag.held.local.x, drag.held.local.y, drag.held.local.z];
    stage = turnStageToward(stage, limits, framing, held, at, fovY, camera.aspect);
    placeCamera();
    // Let go and grab again under the pointer if the held spot has turned away or fallen behind the pointer.
    const p = projectMachinePoint(framing, stage, held, fovY, camera.aspect);
    const rect = renderer.domElement.getBoundingClientRect();
    const lagPx = p ? Math.hypot(((p[0] - at[0]) / 2) * rect.width, ((p[1] - at[1]) / 2) * rect.height) : Infinity;
    const point = toWorld(drag.held.local);
    const normal = drag.held.normalLocal.clone().transformDirection(view.root.matrixWorld);
    const facing = normal.dot(camera.position.clone().sub(point)) > 0;
    if (lagPx > TURN.regripPx || !facing) {
      const s = surfaceAt(x, y);
      drag.held = s.onMachine ? holdOf(s) : null;
      if (game.running && !handBusy()) hand?.grab(s.point, s.normal, shapeOf(s.part));
    } else if (game.running && !handBusy()) {
      hand?.grab(point, normal, shapeOf(drag.surface.part));
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
      if (d > 0) {
        stage = zoomStage(stage, pinch / d, limits);
        placeCamera();
      }
      pinch = d;
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.mode === "pending" && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) >= GESTURE.tapSlop) {
      if (drag.part && loosening.has(drag.part) && drag.carryWhenLoose) {
        // Still loosening under a G press: wait, the carry starts when it is loose.
      } else if (dragMode(drag.part, (id) => loose.has(id)) === "carry" && drag.part && !sequence) {
        drag.mode = "carry";
        startCarry(drag.part, drag.startX, drag.startY);
      } else {
        // Anything else turns the machine, a loose part too while a sequence plays (ADR 0021).
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
    if (handBusy() || carry) return; // the hand is busy with a part
    if (d.touch) hand?.withdraw();
    else {
      hand?.open();
      if (mouseAt) hover(mouseAt.x, mouseAt.y);
    }
  }

  function onLeave(e: PointerEvent): void {
    if (e.pointerType === "mouse" && !pointers.has(e.pointerId)) {
      mouseAt = null;
      if (!drag && !handBusy() && !carry && !chip) hand?.withdraw();
    }
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    stage = zoomStage(stage, Math.exp(e.deltaY * 0.001), limits);
    placeCamera();
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
      const v = new Vector3(...partById(id).explode).transformDirection(view.root.matrixWorld).transformDirection(camera.matrixWorldInverse);
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
      // Plan 0012: a tool out of its slot (in the hand or on its way); the trip's step; the toolbox on screen.
      toolOut: () => toolsOut.size > 0 || toolInHand !== null,
      trip: () => tripPhase,
      sequence: () => sequence?.id ?? null,
      hasToolbox: () => toolbox !== null,
      /** Metres from a tool to its resting place in the toolbox. */
      toolFromSlot: (name: "spanner" | "screwdriver") => (tools ? tools[name].object.position.distanceTo(restPose(tools[name]).at) : null),
      /**
       * Screen rectangles (CSS px) of the toolbox and of the machine as drawn, the share of the toolbox in view, and how
       * many of its sampled points fall inside any of the `avoid` rectangles (the pull cord and the tray chips).
       */
      toolboxRect: (avoid: ReadonlyArray<{ left: number; top: number; right: number; bottom: number }> = []) => {
        if (!toolbox) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        type R = { left: number; top: number; right: number; bottom: number };
        let covered = 0;
        const box = (root: Object3D, skip: (o: Object3D) => boolean): { r: R | null; share: number } => {
          const v = new Vector3();
          let r: R | null = null;
          let seen = 0;
          let all = 0;
          root.updateMatrixWorld(true);
          root.traverse((o) => {
            const mesh = o as Object3D & { isMesh?: boolean; geometry?: { attributes: { position?: { count: number } } } };
            if (!mesh.isMesh || skip(o) || !shown(o) || !mesh.geometry?.attributes.position) return;
            const m = o as unknown as { getVertexPosition(i: number, t: Vector3): Vector3; matrixWorld: Matrix4 };
            const n = mesh.geometry.attributes.position.count;
            for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 3000))) {
              m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).project(camera);
              const x = rect.left + ((v.x + 1) / 2) * rect.width;
              const y = rect.top + ((1 - v.y) / 2) * rect.height;
              all++;
              if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) seen++;
              if (root === toolbox.object && avoid.some((a) => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom)) covered++;
              const c: R | null = r;
              r = c ? { left: Math.min(c.left, x), top: Math.min(c.top, y), right: Math.max(c.right, x), bottom: Math.max(c.bottom, y) } : { left: x, top: y, right: x, bottom: y };
            }
          });
          return { r, share: all ? seen / all : 0 };
        };
        const tb = box(toolbox.object, () => false);
        const underControls = covered;
        const mc = box(view.root, (o) => hitMeshes.has(o));
        // Points of the toolbox drawn where the machine is too (in front of it or behind it): the two overlap on screen.
        let overMachine = 0;
        let sampled = 0;
        const v = new Vector3();
        view.root.updateMatrixWorld();
        toolbox.object.traverse((o) => {
          const mesh = o as Object3D & { isMesh?: boolean; geometry?: { attributes: { position?: { count: number } } } };
          if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
          const m = o as unknown as { getVertexPosition(i: number, t: Vector3): Vector3; matrixWorld: Matrix4 };
          const n = mesh.geometry.attributes.position.count;
          for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 800))) {
            const p = m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
            raycaster.set(camera.position, p.clone().sub(camera.position).normalize());
            sampled++;
            if (raycaster.intersectObject(view.root, true).some((h) => !hitMeshes.has(h.object) && shown(h.object))) overMachine++;
          }
        });
        const slots = (["spanner", "screwdriver"] as const).map((k) => {
          const p = toolbox.slots[k].getWorldPosition(new Vector3()).project(camera);
          return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
        });
        return { toolbox: tb.r, inView: tb.share, machine: mc.r, slots, overMachine: sampled ? overMachine / sampled : 0, underControls, screen: { width: rect.width, height: rect.height } };
      },
      fasteners: (id: PartId) => (view.parts.get(id)?.fasteners ?? []).map((f) => f.pivot.position.distanceTo(f.rest)),
      // Share of the hand's sample points hidden behind the machine's surface from the camera: a hand that sinks into
      // the machine shows here (plan 0010 fix).
      handHidden: hiddenShare,
      /** Turns on the trip log (plan 0012); `tripLog` reads what the last trip did. */
      watchTrips: (on: boolean) => {
        watchTrips = on;
      },
      tripLog: () => ({ ...tripLog, reach: Number.isFinite(tripLog.reach) ? tripLog.reach : null, toolAtBolts: Number.isFinite(tripLog.toolAtBolts) ? tripLog.toolAtBolts : null }),
      /**
       * The view (plan 0016): the machine's turn, the camera's rise and zoom, where the camera stands and how far it
       * looks down, and the default framing's measures for this screen.
       */
      stage: () => ({ ...stage, eye: camera.position.toArray(), pitch: -camera.rotation.x, framing: { widthShare: framing.widthShare, headPx: framing.headPx, bottomPx: framing.bottomPx, distance: framing.distance, pitch: framing.pitch } }),
      /** Sets the machine's turn and the camera's rise (radians), for checks that need a given view; null keeps one. */
      setStage: (yaw: number | null, lift: number | null = null) => {
        stage = clampStage({ ...stage, yaw: yaw ?? stage.yaw, lift: lift ?? stage.lift }, limits);
        placeCamera();
      },
      /** The machine's turn and the camera's rise and zoom back to the default view. */
      resetStage: () => {
        stage = { ...DEFAULT_STAGE };
        placeCamera();
      },
      /**
       * Screen rectangles (CSS px) of the bench and of the machine as drawn, where the bench top's near edge crosses the
       * middle of the screen, and whether the bench is the model or the plain box.
       */
      benchRect: () => {
        const rect = renderer.domElement.getBoundingClientRect();
        const v = new Vector3();
        type R = { left: number; top: number; right: number; bottom: number };
        const box = (root: Object3D, skip: (o: Object3D) => boolean): R | null => {
          let r: R | null = null;
          root.updateMatrixWorld(true);
          root.traverse((o) => {
            const mesh = o as Object3D & { isMesh?: boolean; geometry?: { attributes: { position?: { count: number } } } };
            if (!mesh.isMesh || skip(o) || !shown(o) || !mesh.geometry?.attributes.position) return;
            const m = o as unknown as { getVertexPosition(i: number, t: Vector3): Vector3; matrixWorld: Matrix4 };
            const n = mesh.geometry.attributes.position.count;
            for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 3000))) {
              m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).project(camera);
              if (v.z > 1) continue;
              const x = rect.left + ((v.x + 1) / 2) * rect.width;
              const y = rect.top + ((1 - v.y) / 2) * rect.height;
              const c: R | null = r;
              r = c ? { left: Math.min(c.left, x), top: Math.min(c.top, y), right: Math.max(c.right, x), bottom: Math.max(c.bottom, y) } : { left: x, top: y, right: x, bottom: y };
            }
          });
          return r;
        };
        const near = new Vector3(0, BENCH.top, BENCH.centre[2] + BENCH.depth / 2).project(camera);
        return { bench: box(bench, () => false), machine: box(view.root, (o) => hitMeshes.has(o)), nearEdgeY: rect.top + ((1 - near.y) / 2) * rect.height, kind: assets.bench ? "glb" : "box", screen: { width: rect.width, height: rect.height } };
      },
      /** How far (metres) the whole hand, every sample point, would have to come towards the camera to clear the machine. */
      /**
       * The customer (plan 0015 step 8): the look shown, the clip playing, whether it is drawn, the screen box (CSS px)
       * of their joints above the bench top, the nearest joint's distance from the camera and the machine's farthest point's, and every
       * look requested so far with when.
       */
      customer: () => {
        if (!customer) return null;
        const info = customer.info();
        const rect = renderer.domElement.getBoundingClientRect();
        let box: { left: number; top: number; right: number; bottom: number } | null = null;
        let nearest = Infinity;
        customer.root.updateMatrixWorld(true);
        const v = new Vector3();
        customer.root.traverse((o) => {
          if (!(o as Object3D & { isBone?: boolean }).isBone || !info.shown) return;
          o.getWorldPosition(v);
          nearest = Math.min(nearest, v.distanceTo(camera.position));
          // The screen box is of the joints above the bench top: below it the bench stands in front of them, and the
          // feet seen through its open frame are under the controls.
          if (v.y < BENCH.top) return;
          v.project(camera);
          const x = rect.left + ((v.x + 1) / 2) * rect.width;
          const y = rect.top + ((1 - v.y) / 2) * rect.height;
          box = box ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x), bottom: Math.max(box.bottom, y) } : { left: x, top: y, right: x, bottom: y };
        });
        const mbox = new Box3().setFromObject(view.root);
        let farthest = 0;
        for (const x of [mbox.min.x, mbox.max.x]) for (const y of [mbox.min.y, mbox.max.y]) for (const z of [mbox.min.z, mbox.max.z]) farthest = Math.max(farthest, camera.position.distanceTo(new Vector3(x, y, z)));
        return { ...info, box, nearest: Number.isFinite(nearest) ? nearest : null, machineFarthest: farthest, now: Math.round(performance.now()) };
      },
      /** Plan 0017: the story clip playing (arrive, pay_leave, storm_off), how far in, where the generator is, the notes. */
      story: () => {
        if (!story || !customer) return null;
        const t = customer.storyTime() ?? 0;
        return { clip: story.clip, t, generator: generatorIn(story.clip, t), notes: notesShown(story.clip, t), machineShown: turntable.visible };
      },
      running: () => game.running,
      /** Parts not at home on the machine: off, loose or on their way (plan 0017: none after a walk-out). */
      partsAway: () => [...view.parts.values()].filter((pv) => !pv.group.visible || pv.group.position.distanceTo(new Vector3(...pv.home)) > 1e-4).map((pv) => pv.id),
      machineShown: () => turntable.visible,
      handPush: () => (hand ? hand.push : null),
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
    if (!story) customer?.show(game.customerLook);
    customer?.update(dt);
    // Settle into the space above the controls, but never under a finger that is carrying or turning, nor between the
    // two taps of a double tap (0.9.4).
    if (cover !== coverWanted && !drag && !carry && !chip && !awaitingSecondTap(lastTap, now)) {
      const next = cover + (coverWanted - cover) * (1 - Math.pow(0.5, dt / REFRAME_HALF_LIFE));
      cover = Math.abs(coverWanted - next) < 0.5 ? coverWanted : next;
      applyFraming();
    }
    placeCamera();
    storyStep();
    // On a trip the forearm comes from the toolbox's side of the screen near the toolbox, and from the lower right at
    // the fasteners, so it does not lie across the machine (0.11.1 follow-up).
    hand?.armSide(sequence && tripPhase ? armSideOnTrip(tripPhase, tripP, toolboxSideNow()) : 1);
    hand?.update(dt);
    if (watchTrips && sequence && tripPhase && hand) {
      const into = armIntoMachine();
      tripLog.armInto[tripPhase] = Math.max(tripLog.armInto[tripPhase] ?? 0, into);
      // At the toolbox: the hand within a hand's length of a tool's resting place.
      const atBox = !!tools && [tools.spanner, tools.screwdriver].some((t) => handAt().distanceTo(restPose(t).at) < 0.12);
      if (atBox) tripLog.armInto["atToolbox"] = Math.max(tripLog.armInto["atToolbox"] ?? 0, into);
    }
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
    onMoment(fn) {
      momentFn = fn;
    },
    busy: () => sequence !== null,
    playArrival,
    ending: () => new Promise<void>((r) => setTimeout(() => void (endingPromise ?? Promise.resolve()).then(r), 0)),
    setPayHold(hold) {
      payHold = hold;
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
