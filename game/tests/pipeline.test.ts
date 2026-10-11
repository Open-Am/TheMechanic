import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CUSTOMER_CLIPS, checkCustomer, checkFileSize, checkHand, checkModel, imageSize, materialsUsingImages, nodeTriangles, readGlb, rootNodes, type Budgets, type Glb } from "../../tools/pipeline/check.ts";
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
  const customerJson = (opts: { roots?: string[]; tris?: number; joints?: number; clips?: string[]; images?: Array<[number, number]> } = {}) => {
    const roots = opts.roots ?? [`customer_${look}`];
    const joints = opts.joints ?? 53;
    const images = opts.images ?? [];
    return {
      scene: 0,
      scenes: [{ nodes: roots.map((_, i) => i) }],
      nodes: [...roots.map((name, i) => ({ name, ...(i === 0 ? { children: [roots.length] } : {}) })), { name: `${look}_body`, mesh: 0, skin: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
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
