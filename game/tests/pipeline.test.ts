import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MOMENTS } from "../src/platform/interfaces/index.ts";
import { RUN_LOOP } from "../src/app/moments.ts";
import { checkAudio, checkLoop, licenceRows, licenceText, oggPages, opusHead, opusOnly, type SoundSource } from "../../tools/pipeline/check.ts";
import { CUSTOMER_CLIPS, CUSTOMER_NODES, checkBench, checkCustomer, checkFileSize, checkHand, checkModel, checkToolbox, checkTools, imageSize, materialsUsingImages, nodeTriangles, readGlb, rootNodes, type Budgets, type Glb } from "../../tools/pipeline/check.ts";
import { loadMachine } from "./helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
const machine = loadMachine();
const ids = { parts: machine.parts.map((p) => p.id), base: machine.base.map((b) => b.id) };

/** Builds a GLB in memory from a JSON object and an optional binary chunk. */
function makeGlb(json: object, bin?: Uint8Array): Uint8Array {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(enc.length / 4) * 4;
  const binLen = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const total = 12 + 8 + jsonLen + (bin ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLen);
  out.set(enc, 20);
  if (bin) {
    dv.setUint32(20 + jsonLen, binLen, true);
    dv.setUint32(24 + jsonLen, 0x004e4942, true);
    out.set(bin, 28 + jsonLen);
  }
  return out;
}

/** A model JSON with one root node per ID, each drawing `tris` triangles. */
function modelJson(names: string[], tris = 10) {
  return {
    scene: 0,
    scenes: [{ nodes: names.map((_, i) => i) }],
    nodes: names.map((name, i) => ({ name, mesh: i })),
    meshes: names.map((_, i) => ({ primitives: [{ attributes: { POSITION: i * 2 }, indices: i * 2 + 1 }] })),
    accessors: names.flatMap(() => [{ count: tris * 3 }, { count: tris * 3 }]),
  };
}

const all = [...ids.parts, ...ids.base];
const glbOf = (json: object): Glb => readGlb(makeGlb(json));

describe("GLB reading", () => {
  it("reads the shipped model and finds one root node per ID", () => {
    const glb = readGlb(new Uint8Array(readFileSync(join(root, "game", "public", "machines", "gen950", "model.glb"))));
    expect(rootNodes(glb.json).map((n) => n.name).sort()).toEqual([...all].sort());
  });

  it("rejects a file that is not a GLB", () => {
    expect(() => readGlb(new TextEncoder().encode("not a model at all, just text"))).toThrow(/magic/);
  });

  it("counts triangles through children and skips non-triangle primitives", () => {
    const json = {
      nodes: [{ name: "a", mesh: 0, children: [1] }, { mesh: 1 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }, { primitives: [{ attributes: { POSITION: 2 }, mode: 1 }, { attributes: { POSITION: 2 } }] }],
      accessors: [{ count: 9 }, { count: 6 }, { count: 12 }],
    };
    expect(nodeTriangles(json, 0)).toBe(2 + 4);
  });
});

describe("the model contract and budgets (ADR 0014)", () => {
  it("the shipped model passes", () => {
    const glb = readGlb(new Uint8Array(readFileSync(join(root, "game", "public", "machines", "gen950", "model.glb"))));
    expect(checkModel(glb, ids, budgets).errors).toEqual([]);
  });

  it("a missing part node is an error", () => {
    const r = checkModel(glbOf(modelJson(all.filter((n) => n !== "spark_plug"))), ids, budgets);
    expect(r.errors.join(" ")).toMatch(/No node named "spark_plug"/);
  });

  it("an extra or misnamed node is an error", () => {
    const r = checkModel(glbOf(modelJson([...all, "Cube.001"])), ids, budgets);
    expect(r.errors.join(" ")).toMatch(/"Cube.001" is not a part/);
  });

  it("a duplicated node is an error", () => {
    const r = checkModel(glbOf(modelJson([...all, "muffler"])), ids, budgets);
    expect(r.errors.join(" ")).toMatch(/2 nodes named "muffler"/);
  });

  it("an object over its triangle allocation, and a model over the total, are errors", () => {
    const over = checkModel(glbOf(modelJson(all, 5001)), ids, budgets);
    expect(over.errors.some((e) => /"fuel_tank" has 5001 triangles/.test(e))).toBe(true);
    expect(over.errors.some((e) => /over the budget of 60000/.test(e))).toBe(true);
    expect(checkModel(glbOf(modelJson(all, 100)), ids, budgets).errors).toEqual([]);
  });

  it("a GLB over 5 MB is an error, over 3 MB a warning", () => {
    const glb = glbOf(modelJson(all));
    expect(checkModel({ ...glb, byteLength: 5_000_001 }, ids, budgets).errors.join(" ")).toMatch(/over the 5 MB budget/);
    const aim = checkModel({ ...glb, byteLength: 3_500_000 }, ids, budgets);
    expect(aim.errors).toEqual([]);
    expect(aim.warnings.join(" ")).toMatch(/over the 3 MB aim/);
  });

  it("textures: at most one atlas (one material's set) over 1024 px, none over 2048, none outside the file", () => {
    const png = (w: number, h: number) => {
      const b = new Uint8Array(32);
      b.set([0x89, 0x50, 0x4e, 0x47], 0);
      new DataView(b.buffer).setUint32(16, w);
      new DataView(b.buffer).setUint32(20, h);
      return b;
    };
    const images = [png(2048, 2048), png(2048, 1024), png(4096, 4096), png(2048, 2048)];
    const bin = new Uint8Array(32 * images.length);
    images.forEach((im, i) => bin.set(im, i * 32));
    const json = {
      ...modelJson(all),
      images: [...images.map((_, i) => ({ bufferView: i, mimeType: "image/png" })), { uri: "outside.png" }],
      bufferViews: images.map((_, i) => ({ byteOffset: i * 32, byteLength: 32 })),
      textures: [{ source: 0 }, { source: 1 }, { extensions: { EXT_texture_webp: { source: 3 } } }],
      // One atlas set (base colour and normal both 2048 px) on one material is fine; a second large material is not.
      materials: [
        { name: "exterior", pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1 } },
        { name: "second", pbrMetallicRoughness: { baseColorTexture: { index: 2 } } },
      ],
    };
    const r = checkModel(readGlb(makeGlb(json, bin)), ids, budgets);
    expect(r.errors.join(" ")).toMatch(/4096 x 4096, over 2048 px/);
    expect(r.errors.join(" ")).toMatch(/2 materials use images larger than 1024 px \(exterior, second\)/);
    expect(r.errors.join(" ")).toMatch(/external file \(outside.png\)/);
  });

  it("textures: a material without a baked base colour texture is an error (an unbaked model)", () => {
    // Plan 0011 found an export from an unbaked .blend (model.py rerun, texture.py not) passing with 0 errors.
    const json = {
      ...modelJson(all),
      images: [{ bufferView: 0, mimeType: "image/png" }],
      bufferViews: [{ byteOffset: 0, byteLength: 32 }],
      textures: [{ source: 0 }],
      materials: [{ name: "baked_exterior", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }, { name: "tank_paint", pbrMetallicRoughness: { baseColorFactor: [0.1, 0.3, 0.7, 1] } }],
    };
    const r = checkModel(readGlb(makeGlb(json, new Uint8Array(32))), ids, budgets);
    expect(r.errors.join(" ")).toMatch(/"tank_paint" has no base colour texture/);
    const baked = { ...json, materials: [json.materials[0]] };
    expect(checkModel(readGlb(makeGlb(baked, new Uint8Array(32))), ids, budgets).errors).toEqual([]);
  });
});

describe("atlas counting", () => {
  it("one material with several large maps is one atlas", () => {
    const json = {
      textures: [{ source: 0 }, { source: 1 }, { source: 2 }],
      materials: [{ name: "exterior", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 } }, normalTexture: { index: 2 } }, { name: "small" }],
    };
    expect(materialsUsingImages(json, new Set([0, 1, 2]))).toEqual(["exterior"]);
  });
});

describe("image sizes", () => {
  it("reads PNG, WebP (lossy and lossless) and JPEG headers, and gives up on anything else", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50], 0);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });

    const riff = (fourcc: string) => {
      const b = new Uint8Array(40);
      b.set(new TextEncoder().encode("RIFF"), 0);
      b.set(new TextEncoder().encode("WEBP"), 8);
      b.set(new TextEncoder().encode(fourcc), 12);
      return b;
    };
    const lossy = riff("VP8 ");
    new DataView(lossy.buffer).setUint16(26, 1024, true);
    new DataView(lossy.buffer).setUint16(28, 512, true);
    expect(imageSize(lossy)).toEqual({ width: 1024, height: 512 });

    const lossless = riff("VP8L");
    new DataView(lossless.buffer).setUint32(21, (256 - 1) | ((128 - 1) << 14), true);
    expect(imageSize(lossless)).toEqual({ width: 256, height: 128 });

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x02, 0x00, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 512, height: 256 });

    expect(imageSize(new Uint8Array(40))).toBeNull();
  });
});

describe("companion files", () => {
  it("the environment and ground shadow are held to their budgets", () => {
    expect(checkFileSize("env", 378_553, budgets.environmentBytes, true)).toEqual([]);
    expect(checkFileSize("env", 400_001, budgets.environmentBytes, true)[0]).toMatch(/over the 400 KB budget/);
    expect(checkFileSize("env", null, budgets.environmentBytes, true)[0]).toMatch(/missing/);
    expect(checkFileSize("ground", null, budgets.groundBytes, false)).toEqual([]);
  });

  it("the shipped environment map is within budget", () => {
    const bytes = readFileSync(join(root, "game", "public", "env", "workshop.hdr")).length;
    expect(checkFileSize("env", bytes, budgets.environmentBytes, true)).toEqual([]);
  });
});

describe("the customers' budgets (ADR 0015, plan 0015)", () => {
  it("each look is held to 15,000 triangles, 1.5 MB, one 1024 px texture set and 64 joints", () => {
    expect(budgets.customers).toMatchObject({ trianglesPerLook: 15000, bytesPerLook: 1500000, texturePx: 1024, jointsPerLook: 64 });
  });
});

describe("a customer's file (ADRs 0015 and 0023, plan 0015 step 4)", () => {
  const looks = (JSON.parse(readFileSync(join(root, "game", "public", "customers.json"), "utf8")) as { customers: Array<{ look: string }> }).customers.map((c) => c.look);
  const look = "man_young";
  const customerJson = (opts: { roots?: string[]; tris?: number; joints?: number; clips?: string[]; images?: Array<[number, number]>; extra?: string[]; loose?: string[]; morphs?: string[] } = {}) => {
    const roots = opts.roots ?? [`customer_${look}`];
    const joints = opts.joints ?? 53;
    const images = opts.images ?? [];
    const extra = opts.extra ?? CUSTOMER_NODES.map((n) => `${look}_${n}`);
    const under = [roots.length, ...extra.map((_, i) => roots.length + 1 + i)];
    return {
      scene: 0,
      scenes: [{ nodes: [...roots.map((_, i) => i), ...(opts.loose ?? []).map((_, i) => roots.length + 1 + extra.length + i)] }],
      nodes: [
        ...roots.map((name, i) => ({ name, ...(i === 0 ? { children: under } : {}) })),
        { name: `${look}_body`, mesh: 0, skin: 0 },
        ...extra.map((name) => ({ name })),
        ...(opts.loose ?? []).map((name) => ({ name })),
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }], extras: { targetNames: opts.morphs ?? ["smile"] } }],
      accessors: [{ count: (opts.tris ?? 100) * 3 }, { count: (opts.tris ?? 100) * 3 }],
      skins: [{ joints: Array.from({ length: joints }, (_, i) => i) }],
      animations: (opts.clips ?? CUSTOMER_CLIPS.map((c) => `${look}.${c}`)).map((name) => ({ name })),
      images: images.map((_, i) => ({ bufferView: i, mimeType: "image/png" })),
      bufferViews: images.map((_, i) => ({ byteOffset: i * 32, byteLength: 32 })),
    };
  };
  const png = (w: number, h: number) => {
    const b = new Uint8Array(32);
    b.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  const check = (json: object, bin?: Uint8Array, name = look) => checkCustomer(readGlb(makeGlb(json, bin)), name, looks, budgets).errors.join(" ");

  it("needs the smile morph target on the face (2026-10-12)", () => {
    expect(check(customerJson({ morphs: [] }))).toMatch(/no "smile" morph target/);
    expect(check(customerJson({ morphs: ["frown"] }))).toMatch(/no "smile" morph target/);
    expect(check(customerJson({ morphs: ["smile"] }))).toBe("");
  });

  it("needs both hands' grip points and the notes under the root (plan 0017 step 1)", () => {
    expect(CUSTOMER_CLIPS).toContain("pay_leave");
    expect(CUSTOMER_CLIPS).toContain("storm_off");
    expect(check(customerJson({ clips: CUSTOMER_CLIPS.filter((c) => c !== "storm_off").map((c) => `${look}.${c}`) }))).toMatch(/no clip "man_young.storm_off"/);
    expect(check(customerJson({ clips: CUSTOMER_CLIPS.filter((c) => c !== "pay_leave").map((c) => `${look}.${c}`) }))).toMatch(/no clip "man_young.pay_leave"/);
    expect(check(customerJson({ extra: [`${look}_grip_l`, `${look}_notes`] }))).toMatch(/no node "man_young_grip_r"/);
    expect(check(customerJson({ extra: [`${look}_grip_r`, `${look}_grip_l`] }))).toMatch(/no node "man_young_notes"/);
    expect(check(customerJson({ extra: [`${look}_grip_r`, `${look}_notes`], loose: [`${look}_grip_l`] }))).toMatch(/"man_young_grip_l" must be under "customer_man_young"/);
  });

  it("every look in customers.json has a name the check accepts, and a good file passes", () => {
    expect(looks).toEqual(["woman_market", "man_kaftan", "man_young"]);
    expect(checkCustomer(readGlb(makeGlb(customerJson())), look, looks, budgets).errors).toEqual([]);
  });

  it("an unknown look, a misnamed root and an extra root node are errors", () => {
    expect(check(customerJson({ roots: ["customer_man_old"] }), undefined, "man_old")).toMatch(/not a look in customers.json/);
    expect(check(customerJson({ roots: ["Armature"] }))).toMatch(/one root node named "customer_man_young"/);
    expect(check(customerJson({ roots: [`customer_${look}`, "Light"] }))).toMatch(/found customer_man_young, Light/);
  });

  it("every clip of plan 0015 must be there; a missing one is named", () => {
    const missing = CUSTOMER_CLIPS.filter((c) => c !== "leaving").map((c) => `${look}.${c}`);
    expect(check(customerJson({ clips: missing }))).toMatch(/no clip "man_young.leaving"/);
    expect(check(customerJson({ clips: CUSTOMER_CLIPS.map((c) => `woman_market.${c}`) }))).toMatch(/no clip "man_young.idle"/);
    const extra = checkCustomer(readGlb(makeGlb(customerJson({ clips: [...CUSTOMER_CLIPS.map((c) => `${look}.${c}`), `${look}.dance`] }))), look, looks, budgets);
    expect(extra.errors).toEqual([]);
    expect(extra.warnings.join(" ")).toMatch(/man_young.dance/);
  });

  it("a look over its triangles, joints, bytes or texture size is an error", () => {
    expect(check(customerJson({ tris: 15001 }))).toMatch(/15001 triangles, over its budget of 15000/);
    expect(check(customerJson({ tris: 15000 }))).toBe("");
    expect(check(customerJson({ joints: 65 }))).toMatch(/65 joints, over its budget of 64/);
    expect(check(customerJson({ joints: 0 }))).not.toMatch(/joints, over/);
    const big = { ...readGlb(makeGlb(customerJson())), byteLength: 1_500_001 };
    expect(checkCustomer(big, look, looks, budgets).errors.join(" ")).toMatch(/over its 1.5 MB budget/);
    const bin = new Uint8Array(64);
    bin.set(png(1024, 1024), 0);
    bin.set(png(2048, 1024), 32);
    expect(check(customerJson({ images: [[1024, 1024], [2048, 1024]] }), bin)).toMatch(/image 1 is 2048 x 1024, over 1024 px/);
  });

  it("a file with no skeleton is an error", () => {
    const json = { ...customerJson(), skins: [] };
    expect(check(json)).toMatch(/no skin/);
  });
});

describe("the mechanic's hand (ADRs 0015 and 0020)", () => {
  const handJson = (name: string, tris: number, morph: boolean, targetNames = ["grip"], extras?: Record<string, unknown>) => ({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, ...(extras ? { extras } : {}) }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, ...(morph ? { targets: targetNames.map(() => ({ POSITION: 2 })) } : {}) }], ...(morph ? { extras: { targetNames } } : {}) }],
    accessors: [{ count: tris * 3 }, { count: tris * 3 }, { count: tris * 3 }],
  });

  it("allows more morphs; a pinch morph needs a pinch point near the hand (ADR 0020)", () => {
    const pinch = (extras?: Record<string, unknown>) => checkHand(readGlb(makeGlb(handJson("mechanic_hand", 100, true, ["grip", "pinch"], extras))), budgets).errors;
    expect(pinch({ pinch_point: [0.01, -0.02, -0.05] })).toEqual([]);
    expect(pinch().join(" ")).toMatch(/no pinch_point/);
    expect(pinch({ pinch_point: [0, 0] }).join(" ")).toMatch(/no pinch_point/);
    expect(pinch({ pinch_point: [0, 0, 1] }).join(" ")).toMatch(/no pinch_point/);
    expect(checkHand(readGlb(makeGlb(handJson("mechanic_hand", 100, true, ["grip", "brace"]))), budgets).errors).toEqual([]);
    // ADR 0020: an optional fingertip point for the hovering hand, checked when present.
    expect(checkHand(readGlb(makeGlb(handJson("mechanic_hand", 100, true, ["grip"], { tip_point: [0.01, -0.01, -0.1] }))), budgets).errors).toEqual([]);
    expect(checkHand(readGlb(makeGlb(handJson("mechanic_hand", 100, true, ["grip"], { tip_point: [0, 0, 2] }))), budgets).errors.join(" ")).toMatch(/tip_point/);
    expect(checkHand(readGlb(makeGlb(handJson("mechanic_hand", 100, true, ["pinch"], { pinch_point: [0, 0, 0] }))), budgets).errors.join(" ")).toMatch(/no "grip" morph/);
  });

  it("the shipped hand passes: one node, a grip morph, within budget", () => {
    const glb = readGlb(new Uint8Array(readFileSync(join(root, "game", "public", "hand", "hand.glb"))));
    expect(checkHand(glb, budgets).errors).toEqual([]);
  });

  it("rejects a misnamed node, a missing grip morph, and too many triangles or bytes", () => {
    expect(checkHand(readGlb(makeGlb(handJson("Hand.001", 100, true))), budgets).errors.join(" ")).toMatch(/mechanic_hand/);
    expect(checkHand(readGlb(makeGlb(handJson("mechanic_hand", 100, false))), budgets).errors.join(" ")).toMatch(/no "grip" morph/);
    expect(checkHand(readGlb(makeGlb(handJson("mechanic_hand", 4001, true))), budgets).errors.join(" ")).toMatch(/over its budget of 4000/);
    const big = { ...readGlb(makeGlb(handJson("mechanic_hand", 100, true))), byteLength: 400_001 };
    expect(checkHand(big, budgets).errors.join(" ")).toMatch(/over its 400 KB budget/);
    expect(checkHand(readGlb(makeGlb(handJson("mechanic_hand", 100, true))), budgets).errors).toEqual([]);
  });
});

describe("fasteners in the model (ADR 0020, plan 0011)", () => {
  /** Parts and base as roots; each fastener a child of its part, drawing `tris` triangles. */
  const withFasteners = (fasteners: Record<string, string[]>, tris = 10, parentOf?: (part: string) => string) => {
    const names = [...ids.parts, ...ids.base];
    const nodes: Array<{ name: string; mesh: number; children?: number[] }> = names.map((name, i) => ({ name, mesh: i }));
    const meshes = names.map((_, i) => ({ primitives: [{ attributes: { POSITION: i * 2 }, indices: i * 2 + 1 }] }));
    const accessors = names.flatMap(() => [{ count: 30 }, { count: 30 }]);
    for (const [part, list] of Object.entries(fasteners)) {
      for (const id of list) {
        const m = meshes.length;
        meshes.push({ primitives: [{ attributes: { POSITION: accessors.length }, indices: accessors.length + 1 }] });
        accessors.push({ count: tris * 3 }, { count: tris * 3 });
        nodes.push({ name: id, mesh: m });
        const parent = nodes.find((n) => n.name === (parentOf ? parentOf(part) : part))!;
        parent.children = [...(parent.children ?? []), nodes.length - 1];
      }
    }
    return readGlb(makeGlb({ scene: 0, scenes: [{ nodes: names.map((_, i) => i) }], nodes, meshes, accessors }));
  };
  const fasteners = Object.fromEntries(machine.parts.filter((p) => p.fasteners?.length).map((p) => [p.id, p.fasteners!.map((f) => f.id)]));
  const all = { ...ids, fasteners };

  it("accepts every fastener as a node under its part", () => {
    expect(checkModel(withFasteners(fasteners), all, budgets).errors).toEqual([]);
  });

  it("reports a missing fastener node, and one that is not under its part", () => {
    const missing = { ...fasteners, alternator_cover: fasteners["alternator_cover"]!.slice(1) };
    expect(checkModel(withFasteners(missing), all, budgets).errors.join(" ")).toMatch(/No node named "alternator_cover.bolt_1"/);
    const elsewhere = checkModel(withFasteners(fasteners, 10, (part) => (part === "muffler" ? "fuel_tank" : part)), all, budgets).errors.join(" ");
    expect(elsewhere).toMatch(/"muffler.nut_1" must be a node under "muffler"/);
  });

  it("counts fasteners against their own allocation, not their part's", () => {
    const many = Object.values(fasteners).flat().length;
    const per = Math.floor(budgets.allocation["fasteners"]! / many) + 1;
    expect(checkModel(withFasteners(fasteners, per), all, budgets).errors.join(" ")).toMatch(/fasteners have \d+ triangles, over their allocation/);
  });
});

describe("the tools (ADR 0020, plan 0011)", () => {
  const toolsJson = (names: string[], extras = true, tris = 100) => ({
    scene: 0,
    scenes: [{ nodes: names.map((_, i) => i) }],
    nodes: names.map((name, i) => ({ name, mesh: i, ...(extras ? { extras: { grip_point: [0.08, 0, 0] } } : {}) })),
    meshes: names.map((_, i) => ({ primitives: [{ attributes: { POSITION: i * 2 }, indices: i * 2 + 1 }] })),
    accessors: names.flatMap(() => [{ count: tris * 3 }, { count: tris * 3 }]),
  });

  it("the shipped tools pass: a spanner and a screwdriver with grip points, within budget", () => {
    const glb = readGlb(new Uint8Array(readFileSync(join(root, "game", "public", "hand", "tools.glb"))));
    expect(checkTools(glb, budgets).errors).toEqual([]);
  });

  it("rejects a missing tool, a stray node, a missing grip point, and too many triangles", () => {
    expect(checkTools(readGlb(makeGlb(toolsJson(["spanner"]))), budgets).errors.join(" ")).toMatch(/No root node named "screwdriver"/);
    expect(checkTools(readGlb(makeGlb(toolsJson(["spanner", "screwdriver", "hammer"]))), budgets).errors.join(" ")).toMatch(/"hammer" is not a tool/);
    expect(checkTools(readGlb(makeGlb(toolsJson(["spanner", "screwdriver"], false))), budgets).errors.join(" ")).toMatch(/no grip_point/);
    expect(checkTools(readGlb(makeGlb(toolsJson(["spanner", "screwdriver"], true, 1001))), budgets).errors.join(" ")).toMatch(/over their budget of 2000/);
  });
});


describe("sounds (ADR 0018, plan 0013 step 4)", () => {
  /** One Ogg page holding `body` (under 255 bytes), on logical stream `serial`. The checksum is not checked. */
  function page(serial: number, body: Uint8Array, bos = false): Uint8Array {
    const out = new Uint8Array(28 + body.length);
    out.set([0x4f, 0x67, 0x67, 0x53, 0, bos ? 2 : 0]);
    new DataView(out.buffer).setUint32(14, serial, true);
    out[26] = 1;
    out[27] = body.length;
    out.set(body, 28);
    return out;
  }
  const cat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  const text = (s: string) => new TextEncoder().encode(s);
  const opusHeadBody = (channels: number) => cat(text("OpusHead"), new Uint8Array([1, channels, 0x38, 1, 0x80, 0xbb, 0, 0, 0, 0, 0]));
  /** A small Ogg Opus file: its head, its tags and one packet. */
  const opus = (channels = 1, serial = 7) => cat(page(serial, opusHeadBody(channels), true), page(serial, text("OpusTags........")), page(serial, new Uint8Array(40).fill(9)));
  const theora = (serial = 3) => cat(page(serial, cat(new Uint8Array([0x80]), text("theora"), new Uint8Array([3, 2, 1])), true), page(serial, new Uint8Array(30).fill(1)));
  const names = () => MOMENTS.map((m) => `${m}.ogg`);
  const all = (): Array<{ name: string; bytes: Uint8Array }> => MOMENTS.map((m) => ({ name: `${m}.ogg`, bytes: opus() }));
  const cc0 = (files = names()) =>
    ["| File | Source | Author | Licence | Fetched | Trim |", "| --- | --- | --- | --- | --- | --- |", ...files.map((n) => `| ${n} | https://freesound.org/x | someone | CC0 1.0 | 2026-10-11 | 0–1 s |`)].join("\n");
  const check = (files = all(), licence: string | null = cc0(), budget = budgets.audioBytes, required = true) => checkAudio(files, licence, MOMENTS, budget, required);

  it("the shipped folder passes; until the owner adds the files, each missing one is a warning, not an error", () => {
    const dir = join(root, "game", "public", "audio");
    const files = existsSync(dir) ? readdirSync(dir).filter((n) => n !== "LICENCE.md").map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(dir, name))) })) : [];
    const licence = existsSync(join(dir, "LICENCE.md")) ? readFileSync(join(dir, "LICENCE.md"), "utf8") : null;
    // Once any file ships, every file is required, as in npm run audio.
    const result = checkAudio(files, licence, MOMENTS, budgets.audioBytes, files.length > 0);
    expect(result.errors).toEqual([]);
    if (files.length === 0) expect(result.warnings).toEqual([`${MOMENTS.length} of ${MOMENTS.length} sound files are missing: ${names().join(", ")}. Until they are added, those moments are silent.`]);
    expect(budgets.audioBytes).toBe(250_000);
  });

  it("a full set of mono Ogg Opus files, CC0 or our own, within budget, passes", () => {
    expect(check()).toEqual({ errors: [], warnings: [], bytes: all().reduce((n, f) => n + f.bytes.length, 0) });
    const own = cc0().replace("| turn.ogg | https://freesound.org/x | someone | CC0 1.0 |", "| turn.ogg | the workshop | the owner | own recording |");
    expect(check(all(), own).errors).toEqual([]);
  });

  it("fails a stereo file", () => {
    const files = all();
    files[0] = { name: "turn.ogg", bytes: opus(2) };
    expect(check(files).errors).toEqual(["turn.ogg has 2 channels: sounds are mono (ADR 0018)."]);
  });

  it("fails a file that is not Opus, or not Ogg", () => {
    const files = all();
    files[1] = { name: "give-unbolt.ogg", bytes: page(1, cat(new Uint8Array([1]), text("vorbis"), new Uint8Array([0, 0, 0, 0, 1])), true) };
    files[2] = { name: "give-unclip.ogg", bytes: text("RIFF....WAVEfmt ") };
    expect(check(files).errors).toEqual(["give-unbolt.ogg has no Opus stream: sounds are Ogg Opus (ADR 0018).", "give-unclip.ogg is not an Ogg file."]);
  });

  it("fails a file with another stream beside the sound", () => {
    const files = all();
    files[3] = { name: "give-pull.ogg", bytes: cat(theora(), opus()) };
    expect(check(files).errors).toEqual(["give-pull.ogg holds another stream beside the sound (Blender's video stream?): run it through opusOnly."]);
  });

  it("fails over the budget", () => {
    const bytes = all().reduce((n, f) => n + f.bytes.length, 0);
    expect(check(all(), cc0(), bytes - 1).errors).toEqual([`The sounds are ${(bytes / 1000).toFixed(1)} KB, over the ${(bytes - 1) / 1000} KB budget (ADR 0018).`]);
    expect(check(all(), cc0(), bytes).errors).toEqual([]);
  });

  it("fails a missing licence row, a missing LICENCE.md, and any licence but CC0 1.0 or our own recording", () => {
    expect(check(all(), cc0(names().filter((n) => n !== "seat.ogg"))).errors).toEqual(["seat.ogg has no row in LICENCE.md."]);
    expect(check(all(), null).errors).toEqual(["LICENCE.md is missing: every sound file is listed there with its source and licence (ADR 0018)."]);
    const by = cc0().replace("| land.ogg | https://freesound.org/x | someone | CC0 1.0 |", "| land.ogg | https://freesound.org/x | someone | CC BY 4.0 |");
    expect(check(all(), by).errors).toEqual(['land.ogg is listed as "CC BY 4.0" in LICENCE.md: only CC0 1.0 or own recording is allowed (ADR 0018).']);
  });

  it("fails an extra file", () => {
    const files = [...all(), { name: "remove.ogg", bytes: opus() }];
    expect(check(files, cc0([...names(), "remove.ogg"])).errors).toEqual([`remove.ogg is not one of the moments' files (${names().join(", ")}): remove it.`]);
  });

  it("fails a missing moment in the release check, and only warns in the game's own tests", () => {
    const files = all().filter((f) => f.name !== "cord.ogg");
    const missing = `1 of ${MOMENTS.length} sound files are missing: cord.ogg. Until they are added, those moments are silent.`;
    expect(check(files).errors).toEqual([missing]);
    const relaxed = check(files, cc0(), budgets.audioBytes, false);
    expect(relaxed.errors).toEqual([]);
    expect(relaxed.warnings).toEqual([missing]);
  });

  it("opusOnly drops Blender's video stream and keeps every Opus page byte for byte", () => {
    const sound = opus(1, 9);
    const head = page(9, opusHeadBody(1), true);
    const mixed = cat(theora().subarray(0, 38), head, theora().subarray(38), sound.subarray(head.length));
    const only = opusOnly(mixed)!;
    expect(only).toEqual(sound);
    expect(oggPages(only)!.every((p) => p.serial === 9)).toBe(true);
    expect(opusHead(only, oggPages(only)!)).toEqual({ serial: 9, channels: 1 });
    expect(opusOnly(sound)).toBe(sound); // nothing to drop
    expect(opusOnly(theora())).toBeNull();
    expect(opusOnly(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("oggPages refuses a page that runs past the end, and an empty file", () => {
    const f = opus();
    expect(oggPages(f.subarray(0, f.length - 1))).toBeNull();
    expect(oggPages(new Uint8Array())).toBeNull();
  });

  it("LICENCE.md written from sounds.json reads back and passes", () => {
    const row: SoundSource = { source: "a.wav", url: "https://freesound.org/people/x/sounds/1/", author: "x", licence: "CC0 1.0", fetched: "2026-10-11", start: 0.1, end: 0.4, fadeIn: 0, fadeOut: 0.05, gainDb: 0 };
    const sounds = Object.fromEntries(MOMENTS.map((m) => [m, row]));
    const written = licenceText(sounds, MOMENTS);
    expect(licenceRows(written).get("turn.ogg")).toBe("CC0 1.0");
    expect(written).toContain("| turn.ogg | https://freesound.org/people/x/sounds/1/ | x | CC0 1.0 | 2026-10-11 | 0.10–0.40 s |");
    expect(check(all(), written).errors).toEqual([]);
  });

  it("assets/audio/sounds.json has a row for every moment, and only CC0 or our own licences", () => {
    const file = JSON.parse(readFileSync(join(root, "assets", "audio", "sounds.json"), "utf8")) as { sounds: Record<string, SoundSource> };
    expect(Object.keys(file.sounds).sort()).toEqual([...MOMENTS].sort());
    for (const [m, s] of Object.entries(file.sounds)) {
      if (s.licence !== null) expect(["CC0 1.0", "own recording"], m).toContain(s.licence);
      if (s.source !== null) expect(s.end, m).toBeGreaterThan(s.start);
      expect(checkLoop(m, s), m).toEqual([]);
      expect(s.loop === true, m).toBe(m === "run"); // only the engine running loops (ADR 0028)
    }
  });

  it("the game loops run.ogg where sounds.json says, in seconds into the encoded file (ADR 0028)", () => {
    const run = (JSON.parse(readFileSync(join(root, "assets", "audio", "sounds.json"), "utf8")) as { sounds: Record<string, SoundSource> }).sounds.run!;
    expect(RUN_LOOP.start).toBeCloseTo(run.loopStart! - run.start, 6);
    expect(RUN_LOOP.end).toBeCloseTo(run.loopEnd! - run.start, 6);
  });

  describe("checkLoop (ADR 0028: a seamless loop of 1 to 3 s)", () => {
    const base: SoundSource = { source: "a.wav", url: "u", author: "x", licence: "CC0 1.0", fetched: "2026-10-12", start: 1, end: 4, fadeIn: 0, fadeOut: 0, gainDb: 0, loop: true, loopStart: 1.1, loopEnd: 3.6 };
    it("passes a loop inside its trim, 1 to 3 s long, with no fade reaching it", () => {
      expect(checkLoop("run", base)).toEqual([]);
      expect(checkLoop("run", { ...base, fadeIn: 0.1, fadeOut: 0.4 })).toEqual([]);
    });
    it("passes a row that does not loop and has no loop points", () => {
      const { loop: _l, loopStart: _s, loopEnd: _e, ...plain } = base;
      expect(checkLoop("turn", plain)).toEqual([]);
    });
    it("refuses loop points outside the trim, in the wrong order, or missing", () => {
      expect(checkLoop("run", { ...base, loopStart: 0.9 })).toHaveLength(1);
      expect(checkLoop("run", { ...base, loopEnd: 4.1 })).toHaveLength(1);
      expect(checkLoop("run", { ...base, loopStart: 3.6, loopEnd: 1.1 }).length).toBeGreaterThan(0);
      const { loopEnd: _e, ...missing } = base;
      expect(checkLoop("run", missing)).toHaveLength(1);
    });
    it("refuses a loop shorter than 1 s or longer than 3 s", () => {
      expect(checkLoop("run", { ...base, loopEnd: 2.0 })).toHaveLength(1);
      expect(checkLoop("run", { ...base, start: 0, end: 5, loopStart: 0.5, loopEnd: 3.6 })).toHaveLength(1);
    });
    it("refuses a fade that reaches into the loop, which would dip at every seam", () => {
      expect(checkLoop("run", { ...base, fadeIn: 0.2 })).toHaveLength(1);
      expect(checkLoop("run", { ...base, fadeOut: 0.5 })).toHaveLength(1);
    });
    it("refuses loop points on a row that does not loop", () => {
      expect(checkLoop("turn", { ...base, loop: false })).toHaveLength(1);
    });
  });

  it("LICENCE.md says where a looping sound loops", () => {
    const row: SoundSource = { source: "a.wav", url: "https://freesound.org/people/x/sounds/1/", author: "x", licence: "CC0 1.0", fetched: "2026-10-12", start: 1.15, end: 3.62, fadeIn: 0, fadeOut: 0, gainDb: 0, loop: true, loopStart: 1.260227, loopEnd: 3.50873 };
    expect(licenceText({ run: row }, ["run"])).toContain("| run.ogg | https://freesound.org/people/x/sounds/1/ | x | CC0 1.0 | 2026-10-12 | 1.15–3.62 s, loops 1.260227–3.508730 s |");
  });
});

describe("the toolbox (ADR 0021, plan 0012)", () => {
  /** A toolbox JSON: one root node with `slots` as its children (or as roots, if `slotsAsRoots`), drawing `tris`. */
  const toolboxJson = (name = "toolbox", slots = ["slot_spanner", "slot_screwdriver"], tris = 100, slotsAsRoots = false) => ({
    scene: 0,
    scenes: [{ nodes: slotsAsRoots ? [0, ...slots.map((_, i) => i + 1)] : [0] }],
    nodes: [{ name, mesh: 0, ...(slotsAsRoots ? {} : { children: slots.map((_, i) => i + 1) }) }, ...slots.map((n) => ({ name: n }))],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: tris * 3 }, { count: tris * 3 }],
  });

  it("has its own budget: 3,000 triangles, 200 KB, one 1024 px texture set", () => {
    expect(budgets.toolbox).toEqual({ _source: expect.any(String), triangles: 3000, bytes: 200000, texturePx: 1024 });
  });

  it("passes one toolbox node with both slots under it, within budget", () => {
    const r = checkToolbox(readGlb(makeGlb(toolboxJson())), budgets);
    expect(r.errors).toEqual([]);
    expect(r.triangles).toBe(100);
  });

  it("rejects a wrong root name, a missing slot, a slot outside the toolbox, and too many triangles", () => {
    expect(checkToolbox(readGlb(makeGlb(toolboxJson("crate"))), budgets).errors.join(" ")).toMatch(/one root node named "toolbox"; found crate/);
    expect(checkToolbox(readGlb(makeGlb(toolboxJson("toolbox", ["slot_spanner"]))), budgets).errors.join(" ")).toMatch(/No node named "slot_screwdriver"/);
    expect(checkToolbox(readGlb(makeGlb(toolboxJson("toolbox", ["slot_spanner", "slot_screwdriver"], 100, true))), budgets).errors.join(" ")).toMatch(/"slot_spanner" must be a node under "toolbox"/);
    expect(checkToolbox(readGlb(makeGlb(toolboxJson("toolbox", undefined, 3001))), budgets).errors.join(" ")).toMatch(/3001 triangles, over its budget of 3000/);
  });

  it("rejects a file over 200 KB", () => {
    const big = readGlb(makeGlb(toolboxJson(), new Uint8Array(200_001)));
    expect(checkToolbox(big, budgets).errors.join(" ")).toMatch(/over its 200 KB budget/);
  });
});

describe("the workbench (ADR 0025, plan 0016)", () => {
  /** A bench JSON: one root node named `name` drawing `tris`, with `images` embedded images. */
  const benchJson = (name = "bench", tris = 900, images = 3) => ({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: tris * 3 }, { count: tris * 3 }],
    images: Array.from({ length: images }, () => ({ mimeType: "image/webp" })),
  });

  it("has its own budget: 3,000 triangles, 300 KB, one 1024 px texture set", () => {
    expect(budgets.bench).toEqual({ _source: expect.any(String), triangles: 3000, bytes: 300000, texturePx: 1024 });
  });

  it("passes one bench node within budget", () => {
    const r = checkBench(readGlb(makeGlb(benchJson())), budgets);
    expect(r.errors).toEqual([]);
    expect(r.triangles).toBe(900);
  });

  it("rejects a wrong root name, a second root, too many triangles and a second texture set", () => {
    expect(checkBench(readGlb(makeGlb(benchJson("table"))), budgets).errors.join(" ")).toMatch(/one root node named "bench"; found table/);
    const two = { ...benchJson(), scenes: [{ nodes: [0, 1] }], nodes: [{ name: "bench", mesh: 0 }, { name: "stool" }] };
    expect(checkBench(readGlb(makeGlb(two)), budgets).errors.join(" ")).toMatch(/found bench, stool/);
    expect(checkBench(readGlb(makeGlb(benchJson("bench", 3001))), budgets).errors.join(" ")).toMatch(/3001 triangles, over its budget of 3000/);
    expect(checkBench(readGlb(makeGlb(benchJson("bench", 900, 6))), budgets).errors.join(" ")).toMatch(/6 images; one texture set is at most 3/);
  });

  it("rejects a file over 300 KB", () => {
    const big = readGlb(makeGlb(benchJson(), new Uint8Array(300_001)));
    expect(checkBench(big, budgets).errors.join(" ")).toMatch(/over its 300 KB budget/);
  });

  it("the shipped bench passes its check", () => {
    const file = join(root, "game", "public", "scene", "bench.glb");
    expect(existsSync(file)).toBe(true);
    const r = checkBench(readGlb(new Uint8Array(readFileSync(file))), budgets);
    expect(r.errors).toEqual([]);
    expect(r.triangles).toBeGreaterThan(0);
  });
});
