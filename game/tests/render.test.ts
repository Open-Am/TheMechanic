import { describe, expect, it } from "vitest";
import { classify, GESTURE, screenDirection } from "../src/render/gesture.ts";
import { MOTION_DEFAULTS, poseAt, resolveMotion } from "../src/render/motion.ts";
import { clampOrbit, fitDistance, position, rotate, worldPerPixel, zoom, type OrbitLimits } from "../src/render/orbit.ts";
import { ease, Tweens } from "../src/render/tween.ts";
import { MOTION_TYPES, type Vec3 } from "../src/core/types.ts";
import { loadMachine } from "./helpers.ts";

const machine = loadMachine();
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("easing", () => {
  it("every ease runs from 0 to 1", () => {
    for (const [name, f] of Object.entries(ease)) {
      expect(f(0), name).toBe(0);
      expect(close(f(1), 1), name).toBe(true);
    }
  });

  it("ease-out is ahead of linear in the middle", () => {
    expect(ease.outCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("tweens", () => {
  it("advances with update and calls done once at the end", () => {
    const tw = new Tweens();
    const seen: number[] = [];
    let done = 0;
    tw.play("a", { duration: 1, update: (p) => seen.push(p), done: () => done++ });
    tw.update(0.25);
    tw.update(0.25);
    tw.update(1);
    tw.update(1);
    expect(seen).toEqual([0.25, 0.5, 1]);
    expect(done).toBe(1);
    expect(tw.busy("a")).toBe(false);
  });

  it("runs a queue in order and carries leftover time into the next", () => {
    const tw = new Tweens();
    const log: string[] = [];
    tw.play("a", { duration: 1, update: (p) => log.push(`x${p}`) }, { duration: 1, update: (p) => log.push(`y${p}`) });
    tw.update(1.5);
    expect(log).toEqual(["x1", "y0.5"]);
  });

  it("playing on a busy channel finishes the old tween first", () => {
    const tw = new Tweens();
    const log: string[] = [];
    tw.play("a", { duration: 1, update: (p) => log.push(`old${p}`), done: () => log.push("old done") });
    tw.update(0.5);
    tw.play("a", { duration: 1, update: (p) => log.push(`new${p}`) });
    expect(log).toEqual(["old0.5", "old1", "old done"]);
    tw.update(1);
    expect(log.at(-1)).toBe("new1");
  });

  it("a done that starts a new tween on the same channel is safe", () => {
    const tw = new Tweens();
    const log: string[] = [];
    tw.play("a", { duration: 1, update: () => {}, done: () => tw.play("a", { duration: 1, update: (p) => log.push(`next${p}`) }) }, { duration: 1, update: (p) => log.push(`queued${p}`) });
    tw.update(1);
    expect(log).toEqual(["queued1"]);
    tw.update(0.5);
    expect(log).toEqual(["queued1", "next0.5"]);
  });

  it("zero duration finishes on the next update; cancel drops without finishing", () => {
    const tw = new Tweens();
    let p = -1;
    tw.play("a", { duration: 0, update: (x) => (p = x) });
    tw.update(0);
    expect(p).toBe(1);
    let q = -1;
    tw.play("b", { duration: 1, update: (x) => (q = x) });
    tw.cancel("b");
    tw.update(1);
    expect(q).toBe(-1);
  });
});

describe("motion", () => {
  it("absent motion is slide; unknown types fall back to slide (ADR 0008)", () => {
    expect(resolveMotion(undefined)).toEqual(MOTION_DEFAULTS.slide);
    expect(resolveMotion({ type: "teleport" }).type).toBe("slide");
  });

  it("part fields override the defaults; a bad duration does not", () => {
    const m = resolveMotion({ type: "unscrew", axis: "z", turns: 1, duration: 2 });
    expect(m).toEqual({ type: "unscrew", axis: "z", turns: 1, duration: 2 });
    expect(resolveMotion({ type: "unscrew", duration: 0 }).duration).toBe(MOTION_DEFAULTS.unscrew.duration);
  });

  it("every type starts installed and ends at the explode offset", () => {
    const explode: Vec3 = [0.1, 0.2, -0.3];
    for (const type of MOTION_TYPES) {
      const m = resolveMotion({ type });
      const start = poseAt(m, explode, 0);
      const end = poseAt(m, explode, 1);
      for (let i = 0; i < 3; i++) {
        expect(close(start.offset[i]!, 0), `${type} start`).toBe(true);
        expect(close(end.offset[i]!, explode[i]!), `${type} end`).toBe(true);
      }
      expect(start.angle, `${type} start angle`).toBe(0);
    }
  });

  it("every part in the shipped data has a pose for every progress value", () => {
    for (const part of machine.parts) {
      const m = resolveMotion(part.motion);
      for (let p = 0; p <= 1; p += 0.05) {
        const pose = poseAt(m, part.explode, p);
        expect(pose.offset.every(Number.isFinite) && Number.isFinite(pose.angle), part.id).toBe(true);
      }
    }
  });

  it("unscrew turns the given number of turns; unclip rocks and returns", () => {
    const m = resolveMotion({ type: "unscrew", turns: 3 });
    expect(close(poseAt(m, [0, 1, 0], 1).angle, 6 * Math.PI)).toBe(true);
    const c = resolveMotion({ type: "unclip" });
    expect(poseAt(c, [0, 0, 1], 0.1).angle).toBeGreaterThan(0);
    expect(poseAt(c, [0, 0, 1], 1).angle).toBe(0);
  });

  it("lift settles downward before rising", () => {
    const m = resolveMotion({ type: "lift" });
    expect(poseAt(m, [0, 0.15, 0], 0.08).offset[1]).toBeLessThan(0);
  });

  it("clamps progress outside 0 to 1", () => {
    const m = resolveMotion(undefined);
    expect(poseAt(m, [1, 0, 0], 2).offset[0]).toBe(1);
    expect(poseAt(m, [1, 0, 0], -1).offset[0]).toBe(0);
  });
});

describe("gesture", () => {
  const right = screenDirection({ x: 1, y: 0, z: 0 });

  it("a direction mostly toward the camera is head-on", () => {
    expect(screenDirection({ x: 0, y: 0, z: 1 }).headOn).toBe(true);
    expect(screenDirection({ x: 0.2, y: 0, z: 1 }).headOn).toBe(true);
    expect(screenDirection({ x: 0.5, y: 0, z: 1 }).headOn).toBe(false);
    expect(screenDirection({ x: 0, y: 0, z: 0 }).headOn).toBe(true);
  });

  it("view y up becomes screen y down", () => {
    const d = screenDirection({ x: 0, y: 1, z: 0 });
    expect(d.y).toBe(-1);
  });

  it("under the tap slop is still pending", () => {
    expect(classify(5, 5, right).kind).toBe("pending");
    expect(classify(GESTURE.tapSlop - 1, 0, null).kind).toBe("pending");
  });

  it("off a part, any drag rotates", () => {
    expect(classify(30, 0, null).kind).toBe("rotate");
  });

  it("along the part's path is a pull once far enough, within 45 degrees", () => {
    expect(classify(20, 0, right).kind).toBe("pulling");
    expect(classify(GESTURE.pullDistance, 0, right).kind).toBe("pull");
    expect(classify(40, 38, right).kind).toBe("pull");
    expect(classify(40, 42, right).kind).toBe("rotate");
    expect(classify(-40, 0, right).kind).toBe("rotate");
  });

  it("a head-on part accepts any direction", () => {
    const headOn = screenDirection({ x: 0, y: 0, z: 1 });
    expect(classify(0, 40, headOn).kind).toBe("pull");
    expect(classify(-40, 0, headOn).kind).toBe("pull");
  });
});

describe("orbit", () => {
  const limits: OrbitLimits = { minDistance: 0.5, maxDistance: 2, minPolar: 0.3, maxPolar: 1.5 };

  it("keeps distance and tilt inside the limits", () => {
    const s = clampOrbit({ azimuth: 0, polar: 3, distance: 10 }, limits);
    expect(s.polar).toBe(1.5);
    expect(s.distance).toBe(2);
    expect(rotate(s, 0, 10000, limits).polar).toBe(0.3);
    expect(zoom(s, 0.001, limits).distance).toBe(0.5);
  });

  it("ignores a nonsense zoom factor", () => {
    const s = { azimuth: 0, polar: 1, distance: 1 };
    expect(zoom(s, 0, limits)).toBe(s);
    expect(zoom(s, Number.NaN, limits)).toBe(s);
  });

  it("azimuth 0 looks at the front of the machine from +Z", () => {
    const [x, y, z] = position({ azimuth: 0, polar: Math.PI / 2, distance: 1 }, [0, 0, 0]);
    expect(close(x, 0) && close(y, 0) && close(z, 1)).toBe(true);
  });

  it("the camera stays at the orbit distance from the target", () => {
    const t: Vec3 = [0.1, 0.2, 0.3];
    const p = position({ azimuth: 1, polar: 0.7, distance: 1.3 }, t);
    expect(close(Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]), 1.3)).toBe(true);
  });

  it("a narrow portrait screen needs more distance than a square one", () => {
    expect(fitDistance(0.3, 0.8, 0.5)).toBeGreaterThan(fitDistance(0.3, 0.8, 1));
  });

  it("world per pixel grows with distance", () => {
    expect(worldPerPixel(2, 0.8, 800)).toBeCloseTo(2 * worldPerPixel(1, 0.8, 800));
  });
});
