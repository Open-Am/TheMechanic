import { describe, expect, it } from "vitest";
import { classify, GESTURE, screenDirection } from "../src/render/gesture.ts";
import { MOTION_DEFAULTS, poseAt, resolveMotion } from "../src/render/motion.ts";
import { clampOrbit, fitDistance, position, rotate, worldPerPixel, zoom, type OrbitLimits } from "../src/render/orbit.ts";
import { ease, Tweens } from "../src/render/tween.ts";
import { buildMachine, setPartOpacity, sizeHitVolumes } from "../src/render/placeholders.ts";
import { matchNodes } from "../src/render/match.ts";
import { firstPart, partIdOf } from "../src/render/picking.ts";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { approachDirection, basisToQuaternion, entryPoint, gripDuringReach, gripPoint, handBasis, HAND } from "../src/render/handpose.ts";
import { chooseRig, LIGHTING } from "../src/render/lighting.ts";
import { encodePicture, linearToSrgb, neutralToneMap } from "../src/render/colour.ts";
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

describe("placeholders", () => {
  const view = buildMachine(machine);

  it("one group per part, named exactly the part ID, at its placeholder position", () => {
    expect([...view.parts.keys()].sort()).toEqual(machine.parts.map((p) => p.id).sort());
    for (const part of machine.parts) {
      const pv = view.parts.get(part.id)!;
      expect(pv.group.name).toBe(part.id);
      expect(pv.group.position.toArray()).toEqual(part.placeholder.position);
    }
  });

  it("base pieces are present and are not parts", () => {
    for (const b of machine.base) {
      expect(view.root.getObjectByName(b.id)).toBeDefined();
      expect(view.parts.has(b.id)).toBe(false);
    }
  });

  it("a cylinder's long side follows its axis", () => {
    const hose = machine.parts.find((p) => p.id === "fuel_hose")!;
    const pv = view.parts.get("fuel_hose")!;
    const geometry = pv.meshes[0]!.geometry;
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new Vector3()).toArray();
    expect(size[1]).toBeCloseTo(hose.placeholder.size[1]);
  });

  it("hit volumes grow to the finger minimum and never shrink below the part", () => {
    sizeHitVolumes(view, 0.05);
    for (const pv of view.parts.values()) {
      for (let i = 0; i < 3; i++) {
        const s = pv.hit.scale.getComponent(i);
        expect(s).toBeGreaterThanOrEqual(0.05);
        expect(s).toBeGreaterThanOrEqual(pv.size[i]!);
      }
    }
  });

  it("picking walks up from the hit volume to the part, skipping parts not allowed", () => {
    const ids = new Set(view.parts.keys());
    const plug = view.parts.get("spark_plug")!;
    const cap = view.parts.get("plug_cap")!;
    expect(partIdOf(plug.hit, ids)).toBe("spark_plug");
    expect(partIdOf(view.root, ids)).toBeNull();
    const hits = [{ object: cap.hit }, { object: plug.hit }];
    expect(firstPart(hits, ids, () => true)).toBe("plug_cap");
    expect(firstPart(hits, ids, (id) => id !== "plug_cap")).toBe("spark_plug");
    expect(firstPart(hits, ids, () => false)).toBeNull();
  });
});

describe("lighting (ADR 0014)", () => {
  it("uses image-based lighting when the GPU can build it, and falls back when not", () => {
    expect(chooseRig({ halfFloatTargets: true })).toBe("ibl");
    expect(chooseRig({ halfFloatTargets: false })).toBe("fallback");
  });

  it("a development override wins either way; anything else is ignored", () => {
    expect(chooseRig({ halfFloatTargets: true, forced: "fallback" })).toBe("fallback");
    expect(chooseRig({ halfFloatTargets: false, forced: "ibl" })).toBe("ibl");
    expect(chooseRig({ halfFloatTargets: true, forced: "disco" })).toBe("ibl");
    expect(chooseRig({ halfFloatTargets: true, forced: null })).toBe("ibl");
  });

  it("keeps one key light coming from above, and positive intensities", () => {
    expect(LIGHTING.key.direction[1]).toBeGreaterThan(0);
    for (const v of [LIGHTING.exposure, LIGHTING.environmentIntensity, LIGHTING.hdrIntensity, LIGHTING.key.intensity, LIGHTING.fallback.hemisphere, LIGHTING.fallback.key]) expect(v).toBeGreaterThan(0);
  });
});

describe("colour for tray pictures", () => {
  it("PBR Neutral leaves black black, keeps mid tones nearly as they are, and never exceeds 1", () => {
    expect(neutralToneMap(0, 0, 0)).toEqual([0, 0, 0]);
    const [r] = neutralToneMap(0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.46, 2);
    for (const v of [0.9, 2, 10, 1000]) for (const c of neutralToneMap(v, v * 0.5, 0.1)) expect(c).toBeLessThanOrEqual(1);
  });

  it("is monotonic for grey", () => {
    let last = -1;
    for (let v = 0; v <= 4; v += 0.05) {
      const [g] = neutralToneMap(v, v, v);
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
  });

  it("sRGB encoding matches the standard at its anchor points and clamps", () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 9);
    expect(linearToSrgb(0.214)).toBeCloseTo(0.5, 2);
    expect(linearToSrgb(-1)).toBe(0);
    expect(linearToSrgb(5)).toBeCloseTo(1, 9);
  });

  it("flips rows, un-premultiplies, and leaves empty pixels transparent", () => {
    // 1 x 2 picture: bottom row (first in WebGL order) half-covered grey, top row empty.
    const linear = [0.25, 0.25, 0.25, 0.5, 0, 0, 0, 0];
    const out = encodePicture(linear, 1, 2, 1);
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    const grey = Math.round(linearToSrgb(neutralToneMap(0.5, 0.5, 0.5)[0]) * 255);
    expect([...out.slice(4, 8)]).toEqual([grey, grey, grey, 128]);
  });
});

describe("building the machine from a model (brief section 8)", () => {
  /** A stand-in GLB scene: one node per given ID, each a mesh at a position, sharing one material. */
  function fakeModel(ids: string[], shared = new MeshStandardMaterial()) {
    const scene = new Group();
    ids.forEach((id, i) => {
      const node = new Mesh(new BoxGeometry(0.02, 0.03, 0.04), shared);
      node.name = id;
      node.position.set(i * 0.01, 0.1, 0);
      scene.add(node);
    });
    return { scene, shared };
  }
  const allIds = [...machine.parts.map((p) => p.id), ...machine.base.map((b) => b.id)];

  it("matches nodes to IDs and reports missing and extra names", () => {
    expect(matchNodes(["muffler", "Cube.001"], ["muffler", "spark_plug"])).toEqual({ found: ["muffler"], missing: ["spark_plug"], extra: ["Cube.001"] });
  });

  it("uses every model node, homes each part at its node's position, and sizes it from its bounds", () => {
    const { scene } = fakeModel(allIds);
    const tank = scene.getObjectByName("fuel_tank")!;
    const home = tank.position.toArray();
    const view = buildMachine(machine, scene);
    expect(view.fallbacks).toEqual([]);
    const pv = view.parts.get("fuel_tank")!;
    expect(pv.source).toBe("model");
    expect(pv.home).toEqual(home);
    expect(pv.group.position.toArray()).toEqual(home);
    expect(pv.size[0]).toBeCloseTo(0.02);
    expect(pv.group.name).toBe("fuel_tank");
  });

  it("falls back to the placeholder for a part the model lacks, and warns", () => {
    const { scene } = fakeModel(allIds.filter((id) => id !== "capacitor"));
    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (m: string) => warnings.push(m);
    try {
      const view = buildMachine(machine, scene);
      expect(view.fallbacks).toEqual(["capacitor"]);
      expect(view.parts.get("capacitor")!.source).toBe("placeholder");
      expect(view.parts.get("capacitor")!.home).toEqual(machine.parts.find((p) => p.id === "capacitor")!.placeholder.position);
      expect(warnings.join(" ")).toMatch(/capacitor/);
    } finally {
      console.warn = warn;
    }
  });

  it("gives each part its own materials, so fading one never fades another", () => {
    const { scene, shared } = fakeModel(allIds);
    const view = buildMachine(machine, scene);
    const a = view.parts.get("muffler")!;
    const b = view.parts.get("recoil_starter")!;
    setPartOpacity(a, 0.3);
    expect((a.meshes[0]!.material as MeshStandardMaterial).opacity).toBe(0.3);
    expect((b.meshes[0]!.material as MeshStandardMaterial).opacity).toBe(1);
    expect(shared.opacity).toBe(1);
  });

  it("with no model, every part is a placeholder and nothing is reported missing", () => {
    const view = buildMachine(machine, null);
    expect(view.fallbacks).toEqual([]);
    expect([...view.parts.values()].every((p) => p.source === "placeholder")).toBe(true);
  });
});

describe("quantized model nodes", () => {
  it("keeps each node's own scale, so resetting the part's visual never resizes the geometry", () => {
    const scene = new Group();
    for (const id of [...machine.parts.map((p) => p.id), ...machine.base.map((b) => b.id)]) {
      const node = new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
      node.name = id;
      node.scale.setScalar(0.05); // as KHR_mesh_quantization stores it: a 2-unit box decoded to 0.1 m
      scene.add(node);
    }
    const view = buildMachine(machine, scene);
    const pv = view.parts.get("fuel_tank")!;
    pv.visual.scale.setScalar(1); // what reset() and the press pulse do
    expect(pv.size[0]).toBeCloseTo(0.1);
    expect(pv.visual.children[0]!.scale.x).toBeCloseTo(0.05);
  });
});

describe("the hand's pose (plan 0008)", () => {
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const len = (a: number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);

  it("approaches from the entry point towards the part", () => {
    const a = approachDirection([0, 0.2, 0], [0.4, -0.1, 0.6]);
    expect(len(a)).toBeCloseTo(1);
    expect(a[2]).toBeLessThan(0); // from the camera side towards the machine
  });

  it("grips a little in front of the part's centre, on the side the hand comes from", () => {
    const g = gripPoint([0, 0.2, 0], [0, 0, -1], 0.1);
    expect(g[2]).toBeCloseTo(0.1 * HAND.gripInset);
  });

  it("points the fingers along the approach with the palm turned down, as an orthonormal basis", () => {
    for (const a of [[0, 0, -1], [-0.5, 0.3, -0.8], [0.7, -0.2, -0.6]] as Array<[number, number, number]>) {
      const n = len(a);
      const ap: [number, number, number] = [a[0] / n, a[1] / n, a[2] / n];
      const b = handBasis(ap);
      expect(dot(b.x, b.y)).toBeCloseTo(0);
      expect(dot(b.y, b.z)).toBeCloseTo(0);
      expect(dot(b.z, ap)).toBeCloseTo(-1); // local -z (the fingers) along the approach
      expect(b.y[1]).toBeGreaterThan(0); // local +y up, so the palm (-y) faces down
    }
  });

  it("copes with an approach straight down", () => {
    const b = handBasis([0, -1, 0]);
    expect(len(b.x)).toBeCloseTo(1);
    expect(dot(b.z, [0, -1, 0])).toBeCloseTo(-1);
  });

  it("turns the basis into a unit quaternion that rotates -z onto the approach", () => {
    const ap: [number, number, number] = [0, -0.6, -0.8];
    const [x, y, z, w] = basisToQuaternion(handBasis(ap));
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1);
    const v = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(x, y, z, w));
    expect(v.x).toBeCloseTo(ap[0]);
    expect(v.y).toBeCloseTo(ap[1]);
    expect(v.z).toBeCloseTo(ap[2]);
  });

  it("closes the grip over the last part of the reach", () => {
    expect(gripDuringReach(0)).toBe(0);
    expect(gripDuringReach(1 - HAND.gripShare)).toBe(0);
    expect(gripDuringReach(1)).toBe(1);
    expect(gripDuringReach(1 - HAND.gripShare / 2)).toBeCloseTo(0.5);
  });
});

describe("where the hand comes from (plan 0008)", () => {
  it("starts out along the side the part comes off, leaning towards the camera", () => {
    // The muffler comes off the back (-z); the camera is in front (+z). The hand must start behind the part,
    // not reach through the machine from the front.
    const e = entryPoint([0, 0.1, -0.12], [0, 0, -0.12], [0.5, 0.6, 1.2]);
    expect(e[2]).toBeLessThan(-0.12);
    const d = Math.hypot(e[0], e[1] - 0.1, e[2] + 0.12);
    expect(d).toBeCloseTo(HAND.reachFrom);
  });

  it("for a part that comes off the front, starts in front of it", () => {
    const e = entryPoint([0, 0.1, 0.15], [0, 0, 0.12], [0.5, 0.6, 1.2]);
    expect(e[2]).toBeGreaterThan(0.15);
  });
});
