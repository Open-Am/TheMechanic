// The workbench stage: framing and turning (plan 0016 step 3, ADR 0025).

import { readFileSync } from "node:fs";
import { Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { readGlb } from "../../tools/pipeline/check.ts";
import type { Vec3 } from "../src/core/types.ts";
import { ROTATE_PER_PX, TURN } from "../src/render/orbit.ts";
import {
  BENCH,
  BENCH_EDGES,
  cameraPose,
  CUSTOMER_SPOT,
  DEFAULT_STAGE,
  DEFAULT_YAW,
  FRAMING,
  frameBench,
  machineToWorld,
  projectMachinePoint,
  projectWorld,
  rotateStage,
  stageLimits,
  type StageState,
  TOOLBOX_ON_BENCH,
  turnStageToward,
  wrapAngle,
  zoomStage,
} from "../src/render/stage.ts";
import { loadMachine } from "./helpers.ts";

const machine = loadMachine();
const fov = (40 * Math.PI) / 180;
/** The machine's points: the corners of every part's and base piece's box in the shipped machine.json. */
const points: Vec3[] = [];
for (const it of [...machine.parts, ...machine.base]) {
  const p = it.placeholder;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) points.push([p.position[0] + (sx * p.size[0]) / 2, p.position[1] + (sy * p.size[1]) / 2, p.position[2] + (sz * p.size[2]) / 2]);
}
const reach = Math.max(...points.map((p) => Math.hypot(p[0], p[2])));
const EMPTY_TRAY = 134; // CSS px the pull cord and an empty tray cover (styles.css)
const FULL_TRAY = 300; // all twelve chips, the most at 360 px wide
const frame = (w: number, h: number, cover = EMPTY_TRAY) => frameBench(points, DEFAULT_YAW, fov, w, h, cover);
const px = (n: [number, number] | null, w: number, h: number): [number, number] => (n ? [((n[0] + 1) / 2) * w, ((1 - n[1]) / 2) * h] : [Number.NaN, Number.NaN]);
const headLine = FRAMING.topPx + FRAMING.headMarginPx;

describe("the default framing (plan 0016, ADR 0025)", () => {
  it("at 390 by 844 the generator fills 55 to 65 percent of the width, from a standing mechanic's eye about 12 degrees down", () => {
    const f = frame(390, 844);
    expect(f.widthShare).toBeGreaterThanOrEqual(0.55);
    expect(f.widthShare).toBeLessThanOrEqual(0.65);
    expect(f.eye[1]).toBeCloseTo(1.6, 9);
    expect((f.pitch * 180) / Math.PI).toBeGreaterThan(8);
    expect((f.pitch * 180) / Math.PI).toBeLessThan(16);
    // Its lowest point sits above the controls, and a 1.76 m customer's head is under the timer.
    expect(f.bottomPx).toBeLessThanOrEqual(844 - EMPTY_TRAY);
    expect(f.headPx).toBeGreaterThanOrEqual(headLine - 0.5);
  });

  it("on a shorter screen the camera stands back until the head clears the timer, never under 40 percent wide", () => {
    const tall = frame(390, 844);
    const short = frame(360, 640);
    expect(short.distance).toBeGreaterThan(tall.distance);
    expect(short.headPx).toBeGreaterThanOrEqual(headLine - 0.5);
    expect(short.widthShare).toBeGreaterThanOrEqual(0.4 - 1e-6);
    expect(short.widthShare).toBeLessThan(tall.widthShare);
  });

  it("with the tray full the generator stays above the controls and at 40 percent of the width or more", () => {
    for (const [w, h] of [[390, 844], [360, 640]] as const) {
      const full = frame(w, h, FULL_TRAY);
      expect(full.widthShare).toBeGreaterThanOrEqual(0.4 - 1e-6);
      expect(full.bottomPx).toBeLessThanOrEqual(h - Math.min(FULL_TRAY, h * 0.6) + 1);
    }
  });

  it("is the same for the same screen, every time", () => {
    expect(frame(390, 844)).toEqual(frame(390, 844));
  });
});

describe("turning the generator on the bench (plan 0016, ADRs 0020 and 0025)", () => {
  const f = frame(390, 844);
  const l = stageLimits(f);
  const aspect = 390 / 844;
  const front: Vec3 = [0, 0.15, 0.16];

  it("a sideways drag turns the machine and leaves the camera where it was", () => {
    const s = rotateStage(DEFAULT_STAGE, 80, 0, l);
    expect(s.yaw).not.toBeCloseTo(DEFAULT_STAGE.yaw, 3);
    expect(cameraPose(f, s)).toEqual(cameraPose(f, DEFAULT_STAGE));
    // Dragging right brings the front of the machine to the right.
    expect(projectMachinePoint(f, s, front, fov, aspect)![0]).toBeGreaterThan(projectMachinePoint(f, DEFAULT_STAGE, front, fov, aspect)![0]);
    // A turn held on the machine never moves the camera sideways either.
    const held = turnStageToward(DEFAULT_STAGE, l, f, front, [0.4, -0.2], fov, aspect);
    expect(cameraPose(f, held).eye[0]).toBe(f.eye[0]);
  });

  it("an up-and-down drag raises the camera within its limits and the machine keeps its place on screen", () => {
    const up = rotateStage(DEFAULT_STAGE, 0, 60, l);
    expect(up.lift).toBeGreaterThan(0);
    expect(cameraPose(f, up).eye[1]).toBeGreaterThan(f.eye[1]);
    const top = rotateStage(DEFAULT_STAGE, 0, 10_000, l);
    expect(cameraPose(f, top).pitch).toBeCloseTo(FRAMING.maxTilt, 9);
    expect(rotateStage(DEFAULT_STAGE, 0, -500, l).lift).toBe(0); // never lower than the default
    const middle: Vec3 = [0, f.orbitY - BENCH.top, 0];
    const a = projectMachinePoint(f, DEFAULT_STAGE, middle, fov, aspect)!;
    const b = projectMachinePoint(f, up, middle, fov, aspect)!;
    expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeLessThan(1e-9);
  });

  it("the held spot stays under the pointer as far as the turn allows", () => {
    const spot: Vec3 = [0.1, 0.2, 0.15];
    let s: StageState = DEFAULT_STAGE;
    const start = projectMachinePoint(f, s, spot, fov, aspect)!;
    const want: [number, number] = [start[0] + 0.15, start[1] - 0.04];
    for (let i = 0; i < 12; i++) s = turnStageToward(s, l, f, spot, want, fov, aspect);
    const now = projectMachinePoint(f, s, spot, fov, aspect)!;
    expect(Math.hypot(now[0] - want[0], now[1] - want[1])).toBeLessThan(0.002);
    // Past what the camera's rise allows, it stops at the limit, as close as it can get.
    let far: StageState = DEFAULT_STAGE;
    for (let i = 0; i < 20; i++) far = turnStageToward(far, l, f, spot, [start[0], start[1] - 0.6], fov, aspect);
    expect(far.lift).toBeCloseTo(l.maxLift, 9);
    // Each step is capped, so a far jump of the pointer cannot spin the machine.
    const one = turnStageToward(DEFAULT_STAGE, l, f, spot, [5, 0], fov, aspect);
    expect(Math.abs(one.yaw - DEFAULT_STAGE.yaw)).toBeLessThanOrEqual(TURN.maxStep + 1e-12);
  });

  it("a spot on the turning axis still turns the machine sideways", () => {
    const axis: Vec3 = [0, 0.3, 0];
    const s = turnStageToward(DEFAULT_STAGE, l, f, axis, [0.5, 0], fov, aspect);
    expect(s).toEqual(DEFAULT_STAGE); // nothing to turn by: the spot does not move as the machine turns
    expect(turnStageToward(DEFAULT_STAGE, l, f, front, [0.5, 0], fov, aspect).yaw).toBeGreaterThan(DEFAULT_STAGE.yaw);
  });

  it("turning all the way round returns to the start", () => {
    let s = DEFAULT_STAGE;
    const steps = 40;
    const perStep = (2 * Math.PI) / ROTATE_PER_PX / steps;
    for (let i = 0; i < steps; i++) s = rotateStage(s, perStep, 0, l);
    expect(s.yaw).toBeCloseTo(DEFAULT_STAGE.yaw, 9);
    expect(s.yaw).toBeGreaterThan(-Math.PI);
    expect(s.yaw).toBeLessThanOrEqual(Math.PI);
    expect(cameraPose(f, s)).toEqual(cameraPose(f, DEFAULT_STAGE));
  });

  it("zooming keeps within its limits and ignores nonsense", () => {
    expect(zoomStage(DEFAULT_STAGE, 10, l).zoom).toBe(FRAMING.maxZoom);
    expect(zoomStage(DEFAULT_STAGE, 0.01, l).zoom).toBe(FRAMING.minZoom);
    expect(zoomStage(DEFAULT_STAGE, Number.NaN, l)).toBe(DEFAULT_STAGE);
  });

  it("wraps angles into (-pi, pi]", () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(3 * Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 12);
    expect(wrapAngle(0.3)).toBeCloseTo(0.3, 12);
  });
});

describe("the bench, the customer's spot and the toolbox (plan 0016, ADRs 0021 and 0025)", () => {
  it("the machine turns on the bench top without hanging over its edges, and there is room behind for the customer", () => {
    expect(reach).toBeLessThan(BENCH_EDGES.near - 0.02);
    expect(reach).toBeLessThan(-BENCH_EDGES.far - 0.02);
    expect(BENCH_EDGES.far - CUSTOMER_SPOT.z).toBeCloseTo(0.35, 9);
    expect(machineToWorld([0, 0, 0], 1.2)).toEqual([0, BENCH.top, 0]);
    // Its shadow (footprint plus blur) stays on the top too.
    expect(reach + 0.05).toBeLessThan(BENCH_EDGES.near + 1e-9);
  });

  // The shipped toolbox and its slots, placed as the game places it.
  const glb = readGlb(new Uint8Array(readFileSync(new URL("../public/hand/toolbox.glb", import.meta.url))));
  type Node = { name?: string; translation?: number[]; rotation?: number[]; scale?: number[] };
  const nodes = (glb.json.nodes ?? []) as Node[];
  const local = (n: Node) =>
    new Matrix4().compose(
      new Vector3(...((n.translation ?? [0, 0, 0]) as [number, number, number])),
      new Quaternion(...((n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
      new Vector3(...((n.scale ?? [1, 1, 1]) as [number, number, number])),
    );
  const box = nodes.find((n) => n.name === "toolbox")!;
  const place = new Matrix4().compose(new Vector3(TOOLBOX_ON_BENCH.x, BENCH.top, TOOLBOX_ON_BENCH.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), TOOLBOX_ON_BENCH.rotationY), new Vector3(1, 1, 1));
  const slot = (name: string): Vec3 => {
    const v = new Vector3().applyMatrix4(new Matrix4().multiplyMatrices(place, local(box)).multiply(local(nodes.find((x) => x.name === name)!)));
    return [v.x, v.y, v.z];
  };
  /** The toolbox's footprint corners (360 by 180 mm body, with its trays and hanging lids about 470 mm deep), as placed. */
  const corners = [-0.185, 0.185].flatMap((x) => [-0.235, 0.235].map((z) => new Vector3(x, 0, z).applyMatrix4(place)));

  it("the toolbox stands on the bench's left end, clear of the circle the machine sweeps as it turns", () => {
    // Its side nearest the machine is a straight edge left of the circle.
    expect(Math.min(...corners.map((c) => -c.x))).toBeGreaterThan(reach + 0.005);
    for (const c of corners) {
      expect(c.z).toBeLessThanOrEqual(BENCH_EDGES.near + 0.04);
      expect(c.z).toBeGreaterThanOrEqual(BENCH_EDGES.far);
    }
    expect(Math.min(...corners.map((c) => c.x))).toBeGreaterThan(BENCH.centre[0] - BENCH.width / 2 - 0.08);
    expect(slot("slot_spanner")[1]).toBeGreaterThan(BENCH.top);
  });

  it("it is cut by the left screen edge with its tools in view, above the controls, at both phone sizes", () => {
    for (const [w, h] of [[390, 844], [360, 640]] as const) {
      const f = frame(w, h);
      const left = Math.min(...corners.map((c) => px(projectWorld(f, [c.x, BENCH.top + 0.1, c.z], fov, w / h), w, h)[0]));
      if (w === 390) expect(left).toBeLessThan(0);
      for (const name of ["slot_spanner", "slot_screwdriver"]) {
        const [x, y] = px(projectWorld(f, slot(name), fov, w / h), w, h);
        expect(x, `${name} at ${w}x${h}`).toBeGreaterThan(8);
        expect(y, `${name} at ${w}x${h}`).toBeLessThan(h - EMPTY_TRAY);
      }
    }
  });
});
