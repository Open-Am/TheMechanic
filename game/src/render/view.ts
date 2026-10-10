// The Three.js view: scene, lights, orbit camera, pointer input, and the animations that follow app events.
// It proposes removals to app and listens for what app accepted (ADR 0010). It never imports ui.

import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Game } from "../app/round.ts";
import type { Machine, PartId } from "../core/index.ts";
import { classify, screenDirection, type GestureState, type ScreenDirection } from "./gesture.ts";
import { poseAt, resolveMotion, TIMING, type Pose } from "./motion.ts";
import { fitDistance, position, rotate, worldPerPixel, zoom, type OrbitLimits, type OrbitState } from "./orbit.ts";
import { firstPart } from "./picking.ts";
import { buildMachine, sizeHitVolumes, type PartView } from "./placeholders.ts";
import { createThumbnailer } from "./thumbnails.ts";
import { ease, Tweens } from "./tween.ts";

/** Minimum finger target, CSS px (docs/design/interface.md). */
const FINGER_PX = 44;
const FOV_DEG = 40;
const DEFAULT_ORBIT = { azimuth: 0.55, polar: 1.12 };
const BACKGROUND = "#1b1c1e";

export interface RenderView {
  /** A picture of one part as a data URL, for the tray. Null if it cannot be drawn. */
  partImage(partId: PartId): string | null;
  dispose(): void;
}

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

/** Throws if WebGL is not available, so main can show the "cannot run" message. */
export function mountRender(container: HTMLElement, game: Game): RenderView {
  const machine: Machine = game.machine;
  const renderer = new WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); // ADR 0006
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  scene.add(new HemisphereLight(0xfff4e0, 0x2a2622, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.4);
  sun.position.set(0.6, 1.4, 1.0);
  scene.add(sun);

  const view = buildMachine(machine);
  scene.add(view.root);
  const partIds = new Set(view.parts.keys());

  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.01, 20);
  const fovY = (FOV_DEG * Math.PI) / 180;
  const center = new Vector3(...view.center);
  const target = center.clone();
  let orbit: OrbitState = { ...DEFAULT_ORBIT, distance: 1 };
  let limits: OrbitLimits = { minDistance: 0.5, maxDistance: 2, minPolar: 0.35, maxPolar: 1.55 };
  let fitted = false;

  function resize(): void {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const fit = fitDistance(view.radius, fovY, camera.aspect);
    limits = { ...limits, minDistance: fit * 0.6, maxDistance: fit * 1.6 };
    orbit = fitted ? zoom(orbit, 1, limits) : { ...orbit, distance: fit };
    fitted = true;
    sizeHitVolumes(view, FINGER_PX * worldPerPixel(fit, fovY, h));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // ---- Animation ----

  const tweens = new Tweens();
  const tmpQ = new Quaternion();

  function applyPose(pv: PartView, pose: Pose): void {
    pv.group.position.set(pv.home[0] + pose.offset[0], pv.home[1] + pose.offset[1], pv.home[2] + pose.offset[2]);
    pv.group.quaternion.copy(tmpQ.setFromAxisAngle(AXES[pose.axis], pose.angle));
  }

  function setOpacity(pv: PartView, o: number): void {
    pv.mesh.material.transparent = o < 1;
    pv.mesh.material.opacity = o;
  }

  /** A point near the bottom of the screen at the part's depth: where the tray is. */
  function trayPoint(from: Vector3): Vector3 {
    const ndc = from.clone().project(camera);
    return new Vector3(ndc.x * 0.3, -0.9, ndc.z).unproject(camera);
  }

  function reset(pv: PartView): void {
    tweens.cancel(pv.id);
    pv.group.visible = true;
    pv.group.position.set(...pv.home);
    pv.group.quaternion.identity();
    pv.mesh.scale.setScalar(1);
    setOpacity(pv, 1);
  }

  function easeCameraToward(pv: PartView): void {
    const from = target.clone();
    const to = center.clone().lerp(new Vector3(...pv.home), TIMING.cameraCloser);
    tweens.play("camera", { duration: TIMING.cameraEase, ease: ease.inOutCubic, update: (p) => target.lerpVectors(from, to, p) });
  }

  function animateRemove(id: PartId): void {
    const pv = view.parts.get(id);
    const part = machine.parts.find((p) => p.id === id);
    if (!pv || !part) return;
    const m = resolveMotion(part.motion);
    let from: Vector3 | null = null;
    let to: Vector3 | null = null;
    tweens.play(
      id,
      { duration: m.duration, update: (p) => applyPose(pv, poseAt(m, part.explode, p)) },
      {
        duration: TIMING.drift,
        ease: ease.inOutCubic,
        update: (p) => {
          from ??= pv.group.position.clone();
          to ??= trayPoint(from);
          pv.group.position.lerpVectors(from, to, p);
          setOpacity(pv, 1 - p);
        },
        done: () => {
          pv.group.visible = false;
          setOpacity(pv, 1);
        },
      },
    );
    easeCameraToward(pv);
  }

  function animateInstall(id: PartId): void {
    const pv = view.parts.get(id);
    const part = machine.parts.find((p) => p.id === id);
    if (!pv || !part) return;
    const m = resolveMotion(part.motion);
    const out = poseAt(m, part.explode, 1);
    const outPos = new Vector3(pv.home[0] + out.offset[0], pv.home[1] + out.offset[1], pv.home[2] + out.offset[2]);
    const start = trayPoint(outPos);
    reset(pv);
    applyPose(pv, out);
    pv.group.position.copy(start);
    setOpacity(pv, 0);
    tweens.play(
      id,
      {
        duration: TIMING.drift,
        ease: ease.inOutCubic,
        update: (p) => {
          pv.group.position.lerpVectors(start, outPos, p);
          setOpacity(pv, p);
        },
      },
      { duration: m.duration, update: (p) => applyPose(pv, poseAt(m, part.explode, 1 - p)), done: () => reset(pv) },
    );
  }

  function press(id: PartId): void {
    const pv = view.parts.get(id);
    if (!pv) return;
    tweens.play(`press:${id}`, {
      duration: TIMING.press,
      update: (p) => pv.mesh.scale.setScalar(1 + (TIMING.pressScale - 1) * Math.sin(Math.PI * p)),
    });
  }

  const unsubscribe = [
    game.events.on("removed", (e) => animateRemove(e.partId)),
    game.events.on("installed", (e) => animateInstall(e.partId)),
    game.events.on("started", () => {
      for (const pv of view.parts.values()) reset(pv);
      tweens.finish("camera");
      target.copy(center);
    }),
  ];

  // ---- Input ----

  const raycaster = new Raycaster();
  const hitMeshes = [...view.parts.values()].map((pv) => pv.hit);
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { startX: number; startY: number; lastX: number; lastY: number; part: PartId | null; dir: ScreenDirection | null; state: GestureState | { kind: "done" } } | null = null;
  let pinch: number | null = null;

  function pickAt(clientX: number, clientY: number): PartId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    view.root.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    return firstPart(hits, partIds, (id) => game.state.installed.has(id));
  }

  function directionOf(id: PartId): ScreenDirection {
    const part = machine.parts.find((p) => p.id === id)!;
    const v = new Vector3(...part.explode).transformDirection(camera.matrixWorldInverse);
    return screenDirection(v);
  }

  function pinchDistance(): number {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onDown(e: PointerEvent): void {
    renderer.domElement.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      drag = null; // a second finger cancels any pull
      pinch = pinchDistance();
      return;
    }
    if (pointers.size > 2) return;
    const part = game.running ? pickAt(e.clientX, e.clientY) : null;
    if (part) press(part); // the same press for every part, allowed or not (ADR 0007)
    drag = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, part, dir: part ? directionOf(part) : null, state: { kind: "pending" } };
  }

  function onMove(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const d = pinchDistance();
      if (d > 0) orbit = zoom(orbit, pinch / d, limits);
      pinch = d;
      return;
    }
    if (!drag || drag.state.kind === "done") return;
    const mdx = e.clientX - drag.lastX;
    const mdy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (drag.state.kind === "rotate") {
      orbit = rotate(orbit, mdx, mdy, limits);
      return;
    }
    const next = classify(e.clientX - drag.startX, e.clientY - drag.startY, drag.dir);
    if (next.kind === "rotate") {
      drag.state = next;
      orbit = rotate(orbit, e.clientX - drag.startX, e.clientY - drag.startY, limits);
    } else if (next.kind === "pull" && drag.part) {
      drag.state = { kind: "done" };
      // A blocked part simply does not come off. Player mode shows nothing more (ADR 0007).
      game.propose({ type: "remove", partId: drag.part });
    } else {
      drag.state = next;
    }
  }

  function onUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    orbit = zoom(orbit, Math.exp(e.deltaY * 0.001), limits);
  }

  const el = renderer.domElement;
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });

  // ---- Development hook for the browser check (plan 0003). Vite drops this block from production builds. ----

  if (import.meta.env.DEV) {
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
    (window as unknown as Record<string, unknown>).__openAmDevRender = { probe, busy: () => tweens.size > 0, marker: "open-am-dev-hook" };
  }

  // ---- Loop ----

  let last = performance.now();
  let frame = 0;
  function tick(now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    tweens.update(dt);
    camera.position.set(...position(orbit, [target.x, target.y, target.z]));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  const partImage = createThumbnailer(renderer, view);

  return {
    partImage,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const off of unsubscribe) off();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      renderer.dispose();
      el.remove();
    },
  };
}
