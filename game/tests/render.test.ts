import { describe, expect, it } from "vitest";
import { awaitingSecondTap, DOUBLE_TAP, doubleTapGrasp, doubleTapPart, dragMode, screenDirection } from "../src/render/gesture.ts";
import { CARRY, carryPose, carryProgress, FASTEN, fastenerPose, LOOSEN, loosenPlan, loosePose, MOTION_DEFAULTS, poseAt, resolveMotion, spannerSwing } from "../src/render/motion.ts";
import { clampOrbit, fitDistance, FRAME, frameAbove, position, projectPoint, rotate, TURN, turnToward, unshiftNdcY, worldPerPixel, zoom, type OrbitLimits } from "../src/render/orbit.ts";
import { ease, Tweens } from "../src/render/tween.ts";
import { buildMachine, setPartOpacity, sizeHitVolumes } from "../src/render/placeholders.ts";
import { matchNodes } from "../src/render/match.ts";
import { firstPart, partIdOf } from "../src/render/picking.ts";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { armAnchor, basisToQuaternion, followShare, gripShapeFor, handBasis, HAND, originFor, pointerPose, pushOut, toolBasis, toolFor } from "../src/render/handpose.ts";
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

describe("framing the machine above the controls (0.9.3)", () => {
  const fov = (40 * Math.PI) / 180;

  it("with nothing covering the screen the picture is not moved", () => {
    expect(frameAbove(fov, 390, 844, 0)).toEqual({ shiftPx: 0, distanceScale: 1 });
    expect(frameAbove(fov, 390, 844, -20)).toEqual({ shiftPx: 0, distanceScale: 1 });
  });

  it("centres the machine in the part of the screen above the controls", () => {
    const cover = 376; // a phone with twelve chips in the tray
    const f = frameAbove(fov, 390, 844, cover);
    expect(f.shiftPx).toBe(cover / 2);
    // The orbit target, at the centre of the whole frustum, lands in the middle of the free part of the screen.
    const p = projectPoint({ azimuth: 0.5, polar: 1.1, distance: 1 }, [0, 0, 0], [0, 0, 0], fov, 390 / 844)!;
    const viewNdcY = p[1] + (2 * f.shiftPx) / 844;
    expect(close(((1 - viewNdcY) / 2) * 844, (844 - cover) / 2, 1e-9)).toBe(true);
    expect(close(unshiftNdcY(viewNdcY, f.shiftPx, 844), p[1], 1e-12)).toBe(true);
  });

  it("a narrow portrait screen is fitted by its width, so the machine keeps its size", () => {
    expect(frameAbove(fov, 390, 844, 200).distanceScale).toBeCloseTo(1, 12);
  });

  it("when the free part is the narrower side, the camera stands back so the machine still fits", () => {
    const f = frameAbove(fov, 800, 800, 400);
    const freeFov = 2 * Math.atan(Math.tan(fov / 2) * 0.5);
    expect(close(f.distanceScale, fitDistance(1, freeFov, 2) / fitDistance(1, fov, 1), 1e-12)).toBe(true);
    expect(f.distanceScale).toBeGreaterThan(1);
  });

  it("always leaves the machine a share of the screen, however tall the controls grow", () => {
    const f = frameAbove(fov, 390, 844, 5000);
    expect(f.shiftPx).toBeCloseTo((844 * (1 - FRAME.minFreeShare)) / 2);
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

});

describe("pinching small parts (plan 0009, ADR 0020)", () => {
  it("the spark plug, plug cap, fuel tap and capacitor are pinched; bigger parts are gripped", () => {
    const shape = (id: string) => gripShapeFor(machine.parts.find((p) => p.id === id)!.placeholder.size);
    for (const id of ["spark_plug", "plug_cap", "fuel_tap", "capacitor"]) expect(shape(id), id).toBe("pinch");
    for (const id of ["fuel_tank", "air_filter_cover", "recoil_starter", "muffler", "alternator_cover", "carburetor", "fuel_hose"]) expect(shape(id), id).toBe("grip");
  });

  it("puts the hand so its pinch point lands on the part", () => {
    const b = handBasis([0.3, -0.5, -0.8]);
    const at: Vec3 = [0.1, 0.2, -0.05];
    const pinch: Vec3 = [-0.04, -0.05, -0.03];
    const o = originFor(at, pinch, b);
    const back = [0, 1, 2].map((i) => o[i]! + b.x[i]! * pinch[0] + b.y[i]! * pinch[1] + b.z[i]! * pinch[2]);
    back.forEach((v, i) => expect(close(v, at[i]!, 1e-12)).toBe(true));
  });
});

describe("deliberate removal: double tap, then carry (plan 0010, ADR 0020)", () => {
  /** A tap pressed at `down` and lifted 80 ms later, unless `up` is given. */
  const tap = (part: string | null, down: number, x = 100, y = 100, under: string[] = part ? [part] : [], up = down + 80) => ({ part, under, down, up, x, y });

  it("two taps on the same part, close in time and place, are a double tap", () => {
    const first = tap("spark_plug", 0); // lifts at 80
    expect(doubleTapPart(first, tap("spark_plug", 80 + DOUBLE_TAP.ms))).toBe("spark_plug");
    expect(doubleTapPart(first, tap("spark_plug", 80 + DOUBLE_TAP.ms + 1))).toBeNull();
    expect(doubleTapPart(first, tap("plug_cap", 200))).toBeNull();
    expect(doubleTapPart(first, tap("spark_plug", 200, 100 + DOUBLE_TAP.px + 1))).toBeNull();
    expect(doubleTapPart(tap(null, 0), tap(null, 200))).toBeNull();
    expect(doubleTapPart(null, tap("spark_plug", 200))).toBeNull();
  });

  it("the window runs from the first lift to the second press, so a slow second press does not spoil it (0.9.3)", () => {
    // Before 0.9.3 the window ran lift to lift: two 120 ms presses 120 ms apart already took 240 ms of the 300.
    const first = tap("muffler", 0, 100, 100, ["muffler"], 120);
    expect(doubleTapPart(first, tap("muffler", 400, 100, 100, ["muffler"], 520))).toBe("muffler");
    // A press held down is not a tap.
    expect(doubleTapPart(first, tap("muffler", 240, 100, 100, ["muffler"], 240 + DOUBLE_TAP.holdMs + 1))).toBeNull();
    // Out of order time stamps never make a double tap.
    expect(doubleTapPart(first, tap("muffler", 100))).toBeNull();
  });

  it("a second tap a few pixels off still counts while the first part is under the finger (0.9.3)", () => {
    const first = tap("fuel_hose", 0, 100, 100);
    // The second tap shows the alternator cover, but the hose's finger-sized hit volume is still under it.
    expect(doubleTapPart(first, tap("alternator_cover", 200, 103, 102, ["alternator_cover", "fuel_hose"]))).toBe("fuel_hose");
    // Not when the hose is no longer under it.
    expect(doubleTapPart(first, tap("alternator_cover", 200, 103, 102, ["alternator_cover"]))).toBeNull();
    // A second tap on the base, with the hose's hit volume under it, also counts.
    expect(doubleTapPart(first, tap(null, 200, 103, 102, ["fuel_hose"]))).toBe("fuel_hose");
  });

  it("a double tap whose second tap shows a neighbour takes hold of the part where the first tap touched it (0.9.4)", () => {
    // In 0.9.3 the hand fell back to the part's origin, deep inside the machine for a muffler (verify:phone, 43-66%).
    const onMuffler = { part: "muffler", point: "on the muffler's shell" };
    const onCover = { part: "alternator_cover", point: "on the alternator cover" };
    expect(doubleTapGrasp("muffler", onMuffler, onCover)).toBe(onMuffler);
    // The second tap's own spot wins when it is on the part: it is where the finger is now.
    const again = { part: "muffler", point: "a little to the left" };
    expect(doubleTapGrasp("muffler", onMuffler, again)).toBe(again);
    // Neither tap showed the part (both landed on its finger-sized hit volume only): no spot to take hold of.
    expect(doubleTapGrasp("muffler", onCover, onCover)).toBeNull();
    expect(doubleTapGrasp("muffler", null, null)).toBeNull();
  });

  it("the machine holds still between the two taps of a double tap, so the second lands where the first did (0.9.4)", () => {
    // In 0.9.3 the reframe above a growing tray glided on between the taps and moved the part from under the finger.
    const first = tap("muffler", 1000); // lifts at 1080
    expect(awaitingSecondTap(first, 1080)).toBe(true);
    expect(awaitingSecondTap(first, 1080 + DOUBLE_TAP.ms)).toBe(true);
    expect(awaitingSecondTap(first, 1081 + DOUBLE_TAP.ms)).toBe(false);
    // A tap on nothing starts no double tap, and no tap holds nothing.
    expect(awaitingSecondTap(tap(null, 1000), 1100)).toBe(false);
    expect(awaitingSecondTap(null, 1100)).toBe(false);
  });

  it("only a loose part is carried; every other drag turns the machine, removable or not (ADR 0007)", () => {
    const loose = new Set(["air_filter_cover"]);
    expect(dragMode("air_filter_cover", (id) => loose.has(id))).toBe("carry");
    expect(dragMode("fuel_hose", (id) => loose.has(id))).toBe("turn"); // could come off, not loose
    expect(dragMode("fuel_tank", (id) => loose.has(id))).toBe("turn"); // blocked
    expect(dragMode(null, (id) => loose.has(id))).toBe("turn");
  });

  it("loosening starts in place and ends a few millimetres proud, for every kind of part", () => {
    for (const type of MOTION_TYPES) {
      const m = resolveMotion({ type });
      const explode: Vec3 = [0, 0.1, 0.05];
      const a = loosePose(m, explode, 0);
      expect(Math.hypot(...a.offset), type).toBeLessThan(1e-9);
      expect(a.angle, type).toBeCloseTo(0);
      const b = loosePose(m, explode, 1);
      expect(Math.hypot(...b.offset), type).toBeCloseTo(LOOSEN.proud, 6);
    }
    const plug = resolveMotion(machine.parts.find((p) => p.id === "spark_plug")!.motion);
    expect(loosePose(plug, [0, 0.1, 0], 1).angle).toBeCloseTo(plug.turns * LOOSEN.unscrewShare * 2 * Math.PI);
  });

  it("carrying runs from the loose pose to the end of the part's motion", () => {
    for (const part of machine.parts) {
      const m = resolveMotion(part.motion);
      const start = carryPose(m, part.explode, 0);
      const loosened = loosePose(m, part.explode, 1);
      start.offset.forEach((v, i) => expect(v, part.id).toBeCloseTo(loosened.offset[i]!, 9));
      const end = carryPose(m, part.explode, 1);
      const out = poseAt(m, part.explode, 1);
      end.offset.forEach((v, i) => expect(v, part.id).toBeCloseTo(out.offset[i]!, 9));
      expect(end.angle).toBeCloseTo(out.angle);
    }
  });

  it("the carry's progress grows with the drag and stops at the end of the path", () => {
    expect(carryProgress(0)).toBe(0);
    expect(carryProgress(CARRY.outPx / 2)).toBeCloseTo(0.5);
    expect(carryProgress(CARRY.outPx * 3)).toBe(1);
    expect(carryProgress(-5)).toBe(0);
  });
});

describe("turning with the hand (plan 0010, ADR 0020)", () => {
  const limits: OrbitLimits = { minDistance: 0.5, maxDistance: 2, minPolar: 0.35, maxPolar: 1.55 };
  const target: Vec3 = [0, 0.19, 0];
  const fov = (40 * Math.PI) / 180;

  it("the orbit target lands in the middle of the screen", () => {
    const p = projectPoint({ azimuth: 0.4, polar: 1.1, distance: 1 }, target, target, fov, 0.46)!;
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(0);
  });

  it("each step brings the held spot closer to the pointer, within the limits", () => {
    let s = { azimuth: 0.55, polar: 1.12, distance: 1 };
    const held: Vec3 = [0.15, 0.25, 0.12];
    const pointer: [number, number] = [0.25, 0.05];
    const gap = (st: typeof s) => {
      const p = projectPoint(st, target, held, fov, 0.46)!;
      return Math.hypot(p[0] - pointer[0], p[1] - pointer[1]);
    };
    let g = gap(s);
    for (let i = 0; i < 4; i++) {
      const next = turnToward(s, limits, target, held, pointer, fov, 0.46);
      expect(Math.abs(next.azimuth - s.azimuth)).toBeLessThanOrEqual(TURN.maxStep + 1e-12);
      expect(next.polar).toBeGreaterThanOrEqual(limits.minPolar);
      expect(next.polar).toBeLessThanOrEqual(limits.maxPolar);
      const ng = gap(next);
      expect(ng).toBeLessThanOrEqual(g + 1e-9);
      s = next;
      g = ng;
    }
    expect(g).toBeLessThan(0.05);
  });
});

describe("the hand as the pointer (plan 0010, ADR 0020)", () => {
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const points = { tip: [0.01, -0.01, -0.1] as Vec3, pinch: [-0.04, -0.05, -0.03] as Vec3 };
  const screenUp: Vec3 = [0, 1, 0];
  const anchor = armAnchor([0.5, 0.6, 1], [0.9, 0, -0.4], screenUp, [-0.5, -0.3, -0.8]);

  it("rests its fingertips just off the surface under the pointer", () => {
    const point: Vec3 = [0.05, 0.2, 0.15];
    const normal: Vec3 = [0, 0, 1];
    const p = pointerPose(point, normal, anchor, screenUp, "hover", points);
    const tip = new Vector3(...points.tip).applyQuaternion(new Quaternion(...p.quaternion)).add(new Vector3(...p.position));
    expect(tip.x).toBeCloseTo(point[0]);
    expect(tip.y).toBeCloseTo(point[1]);
    expect(tip.z).toBeCloseTo(point[2] + HAND.hoverFloat);
  });

  it("keeps one steady attitude, palm down on screen, whatever surface it passes over", () => {
    const point: Vec3 = [0.05, 0.2, 0.15];
    const onTop = pointerPose(point, [0, 1, 0], anchor, screenUp, "hover", points);
    const onSide = pointerPose(point, [1, 0, 0], anchor, screenUp, "hover", points);
    const onFront = pointerPose(point, [0, 0, 1], anchor, screenUp, "hover", points);
    expect(onSide.quaternion).toEqual(onTop.quaternion);
    expect(onFront.quaternion).toEqual(onTop.quaternion);
    const palm = new Vector3(0, -1, 0).applyQuaternion(new Quaternion(...onTop.quaternion));
    expect(dot([palm.x, palm.y, palm.z], screenUp)).toBeLessThan(0);
  });

  it("grips with its grip point and pinches with its pinch point", () => {
    const point: Vec3 = [0, 0.3, 0];
    const normal: Vec3 = [0, 1, 0];
    const g = pointerPose(point, normal, anchor, screenUp, "grip", points);
    expect(g.position[1]).toBeCloseTo(point[1] + HAND.gripFloat);
    const p = pointerPose(point, normal, anchor, screenUp, "pinch", points);
    const pinch = new Vector3(...points.pinch).applyQuaternion(new Quaternion(...p.quaternion)).add(new Vector3(...p.position));
    expect(pinch.y).toBeCloseTo(point[1] + HAND.pinchFloat);
  });

  it("the open hand depends only on the spot, never on whether the part could come off (ADR 0007)", () => {
    // The pose takes no part and no rule; the same spot gives the same hand.
    const a = pointerPose([0.1, 0.2, 0.1], [0, 0, 1], anchor, screenUp, "hover", points);
    const b = pointerPose([0.1, 0.2, 0.1], [0, 0, 1], anchor, screenUp, "hover", points);
    expect(a).toEqual(b);
  });

  it("never sinks into the surface: points inside are pushed out towards the camera, along the line of sight", () => {
    const point: Vec3 = [0, 0.3, 0];
    const up: Vec3 = [0, 1, 0];
    const toward: Vec3 = [0, 0.6, 0.8];
    const samples: Vec3[] = [[0, 0.31, 0], [0.02, 0.28, 0.01], [0.01, 0.295, -0.02]];
    const push = pushOut(samples, point, up, toward);
    // The deepest point is 20 mm in; it must end HAND.margin out.
    const moved = samples.map((s) => s[1] + push[1]);
    for (const y of moved) expect(y).toBeGreaterThanOrEqual(point[1] + HAND.margin - 1e-9);
    expect(Math.min(...moved)).toBeCloseTo(point[1] + HAND.margin);
    // Along the line of sight only: the push is a multiple of `toward`.
    expect(push[0]).toBeCloseTo(0);
    expect(push[2] / push[1]).toBeCloseTo(toward[2] / toward[1]);
  });

  it("leaves a hand that is already clear where it is", () => {
    expect(pushOut([[0, 0.32, 0], [0.01, 0.35, 0]], [0, 0.3, 0], [0, 1, 0], [0, 0.6, 0.8])).toEqual([0, 0, 0]);
  });

  it("limits the push on a surface seen almost edge-on", () => {
    const push = pushOut([[0, 0.2, 0]], [0, 0.3, 0], [0, 1, 0], [0, 0.01, 0.99995]);
    expect(Math.hypot(...push)).toBeLessThanOrEqual(HAND.maxPush + 1e-6);
  });

  it("the forearm comes from the camera's lower right", () => {
    const anc = armAnchor([0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, -1]);
    expect(anc[0]).toBeGreaterThan(0);
    expect(anc[1]).toBeLessThan(0);
    expect(anc[2]).toBeLessThanOrEqual(1); // not in front of the camera, so the sleeve leaves the screen
  });

  it("follows smoothly: half the way in one half-life, all of it at once only with no half-life", () => {
    expect(followShare(HAND.followHalfLife)).toBeCloseTo(0.5);
    expect(followShare(0)).toBe(0);
    expect(followShare(0.1, 0)).toBe(1);
    expect(followShare(1)).toBeGreaterThan(0.99);
  });
});

describe("fasteners and tools (plan 0011, ADR 0020)", () => {
  it("a fastener turns out and ends standing proud of its hole", () => {
    expect(fastenerPose(0)).toEqual({ angle: 0, out: 0 });
    const out = fastenerPose(1);
    expect(out.out).toBeCloseTo(FASTEN.backOut);
    expect(out.angle).toBeCloseTo(FASTEN.turns * 2 * Math.PI);
    expect(fastenerPose(2)).toEqual(fastenerPose(1));
  });

  it("the spanner swings in strokes on the bolt and never spins round it", () => {
    for (let q = 0; q <= 1; q += 0.01) {
      const a = spannerSwing(q);
      expect(a).toBeGreaterThanOrEqual(-1e-9);
      expect(a).toBeLessThanOrEqual((FASTEN.spannerStroke * Math.PI) / 180 + 1e-9);
    }
  });

  it("four bolts take under a second and a half; a part without fasteners keeps its own time", () => {
    const four = loosenPlan("unbolt", 4);
    expect(four.fastenerStarts).toEqual([0, FASTEN.outSeconds, 2 * FASTEN.outSeconds, 3 * FASTEN.outSeconds]);
    expect(four.total).toBeLessThan(1.5);
    expect(four.freeSeconds).toBe(FASTEN.freeSeconds);
    const none = loosenPlan("pull", 0);
    expect(none.fastenerStarts).toEqual([]);
    expect(none.total).toBe(LOOSEN.seconds.pull);
  });

  it("screws take the screwdriver, bolts and nuts the spanner", () => {
    expect(toolFor("screw")).toBe("screwdriver");
    expect(toolFor("bolt")).toBe("spanner");
    expect(toolFor("nut")).toBe("spanner");
  });

  it("a tool lies along the fastener's axis, its handle towards the lower right of the screen", () => {
    const right: Vec3 = [1, 0, 0];
    const up: Vec3 = [0, 1, 0];
    const b = toolBasis([0, 0, 1], right, up, 0);
    expect(b.z).toEqual([0, 0, 1]);
    expect(b.x[0]).toBeGreaterThan(0); // right
    expect(b.x[1]).toBeLessThan(0); // down
    const len = (v: Vec3) => Math.hypot(...v);
    expect(len(b.x)).toBeCloseTo(1);
    expect(b.x[0] * b.z[0] + b.x[1] * b.z[1] + b.x[2] * b.z[2]).toBeCloseTo(0);
    // Turning swings the handle about the axis and keeps it across the axis.
    const t = toolBasis([0, 0, 1], right, up, Math.PI / 2);
    expect(t.x[0] * b.x[0] + t.x[1] * b.x[1] + t.x[2] * b.x[2]).toBeCloseTo(0);
    // A fastener seen end on still gets a handle.
    expect(len(toolBasis([1, -1, 0].map((v) => v / Math.SQRT2) as Vec3, right, up, 0).x)).toBeCloseTo(1);
  });

  it("with no model, every fastener gets a stand-in at its position, in its own pivot", () => {
    const view = buildMachine(machine, null);
    for (const part of machine.parts) {
      const pv = view.parts.get(part.id)!;
      expect(pv.fasteners.map((f) => f.id)).toEqual((part.fasteners ?? []).map((f) => f.id));
      for (const f of pv.fasteners) {
        const spec = part.fasteners!.find((x) => x.id === f.id)!;
        expect(f.source).toBe("placeholder");
        expect(f.pivot.children.length).toBe(1);
        const world = new Vector3().copy(f.rest).add(new Vector3(...pv.home));
        expect(world.x).toBeCloseTo(spec.position[0]);
        expect(world.y).toBeCloseTo(spec.position[1]);
        expect(world.z).toBeCloseTo(spec.position[2]);
      }
    }
  });
});
