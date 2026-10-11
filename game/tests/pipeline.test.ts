import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkFileSize, checkHand, checkModel, checkTools, imageSize, materialsUsingImages, nodeTriangles, readGlb, rootNodes, type Budgets, type Glb } from "../../tools/pipeline/check.ts";
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
