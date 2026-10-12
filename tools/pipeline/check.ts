// Checks the optimised model and its companions against machine.json and the budgets, then copies them into the game
// (plan 0005 step 7, brief section 9, ADR 0014). Fails on the first run with any error.
//
//   node tools/pipeline/check.ts [model.glb] [--no-copy]
//   node tools/pipeline/check.ts --audio [--from <dir>] [--to <dir>] [--sounds <sounds.json>]
//   node tools/pipeline/check.ts --hand | --tools | --toolbox | --bench [file.glb] [--no-copy]
//   node tools/pipeline/check.ts --customer <look> [file.glb] [--no-copy]
//
// The checks are pure functions, exported for game/tests/pipeline.test.ts.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MOMENTS } from "../../game/src/platform/interfaces/index.ts";

export interface Budgets {
  glbBytes: number;
  glbAimBytes: number;
  triangles: number;
  texturePx: number;
  atlasPx: number;
  atlasCount: number;
  environmentBytes: number;
  groundBytes: number;
  audioBytes: number;
  allocation: Record<string, number>;
  hand: { triangles: number; bytes: number; texturePx: number };
  customers: { trianglesPerLook: number; bytesPerLook: number; texturePx: number; jointsPerLook: number };
  tools: { triangles: number; bytes: number; texturePx: number };
  toolbox: { triangles: number; bytes: number; texturePx: number };
  bench: { triangles: number; bytes: number; texturePx: number };
}

interface GltfJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{ name?: string; mesh?: number; children?: number[]; extras?: Record<string, unknown> }>;
  meshes?: Array<{ primitives: Array<{ mode?: number; indices?: number; attributes: Record<string, number>; targets?: unknown[] }>; extras?: { targetNames?: string[] } }>;
  accessors?: Array<{ count: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string; uri?: string }>;
  textures?: Array<{ source?: number; extensions?: Record<string, { source?: number }> }>;
  materials?: Array<Record<string, unknown>>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
  skins?: Array<{ joints: number[] }>;
  animations?: Array<{ name?: string }>;
}

export interface Glb {
  json: GltfJson;
  bin: Uint8Array | null;
  byteLength: number;
}

/** Splits a GLB into its JSON and binary chunks. Throws on anything that is not glTF 2.0 binary. */
export function readGlb(data: Uint8Array): Glb {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB file (bad magic).");
  if (view.getUint32(4, true) !== 2) throw new Error("Only glTF 2.0 is supported.");
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= data.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB has no JSON chunk.");
  return { json, bin, byteLength: data.byteLength };
}

/** Root node names of the default scene, with their node indices. */
export function rootNodes(json: GltfJson): Array<{ name: string; index: number }> {
  const scene = json.scenes?.[json.scene ?? 0];
  return (scene?.nodes ?? []).map((index) => ({ name: json.nodes?.[index]?.name ?? "", index }));
}

/** Triangles drawn by a node and its children. Non-triangle primitives count as zero. */
export function nodeTriangles(json: GltfJson, index: number): number {
  const node = json.nodes?.[index];
  if (!node) return 0;
  let tris = 0;
  if (node.mesh !== undefined) {
    for (const prim of json.meshes?.[node.mesh]?.primitives ?? []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const accessor = prim.indices !== undefined ? prim.indices : prim.attributes.POSITION;
      tris += Math.floor((accessor !== undefined ? json.accessors?.[accessor]?.count ?? 0 : 0) / 3);
    }
  }
  for (const child of node.children ?? []) tris += nodeTriangles(json, child);
  return tris;
}

/** Width and height of a PNG, JPEG or WebP image, or null if the format is not recognised. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { width: dv.getUint32(16), height: dv.getUint32(20) };
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const fourcc = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (fourcc === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    if (fourcc === "VP8L") {
      const bits = dv.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === "VP8X") return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
  triangles: number;
}

export interface MachineIds {
  parts: string[];
  base: string[];
  /** Fastener ids by part (ADR 0020): each must be a node under its part's node. */
  fasteners?: Record<string, string[]>;
}

/** The model contract (brief section 8) and the ADR 0014 budgets. */
export function checkModel(glb: Glb, ids: MachineIds, budgets: Budgets): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const roots = rootNodes(glb.json);
  const expected = [...ids.parts, ...ids.base];
  const seen = new Map<string, number>();
  for (const r of roots) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);
  for (const id of expected) {
    const n = seen.get(id) ?? 0;
    if (n === 0) errors.push(`No node named "${id}". The game would fall back to its placeholder.`);
    if (n > 1) errors.push(`${n} nodes named "${id}"; there must be exactly one.`);
  }
  for (const r of roots) {
    if (!expected.includes(r.name)) errors.push(`Root node "${r.name || "(unnamed)"}" is not a part or base ID in machine.json.`);
  }

  // Fasteners (ADR 0020): one node each, named by its id, somewhere under its part's node. They count towards the
  // machine's total and their own allocation, not their part's.
  const nodes = glb.json.nodes ?? [];
  const under = (rootIndex: number, target: number): boolean => {
    const stack = [...(nodes[rootIndex]?.children ?? [])];
    while (stack.length) {
      const i = stack.pop()!;
      if (i === target) return true;
      stack.push(...(nodes[i]?.children ?? []));
    }
    return false;
  };
  const fastenerTris = new Map<string, number>();
  let allFastenerTris = 0;
  for (const [part, list] of Object.entries(ids.fasteners ?? {})) {
    const root = roots.find((r) => r.name === part);
    for (const id of list) {
      const index = nodes.findIndex((n) => n.name === id);
      if (index < 0) {
        errors.push(`No node named "${id}" (a fastener of "${part}").`);
        continue;
      }
      if (root && !under(root.index, index)) errors.push(`Fastener "${id}" must be a node under "${part}", so it moves with it.`);
      const tris = nodeTriangles(glb.json, index);
      fastenerTris.set(part, (fastenerTris.get(part) ?? 0) + tris);
      allFastenerTris += tris;
    }
  }
  const fastenerAllowance = budgets.allocation["fasteners"];
  if (fastenerAllowance !== undefined && allFastenerTris > fastenerAllowance) errors.push(`The fasteners have ${allFastenerTris} triangles, over their allocation of ${fastenerAllowance}.`);

  let total = 0;
  for (const r of roots) {
    const all = nodeTriangles(glb.json, r.index);
    total += all;
    const tris = all - (fastenerTris.get(r.name) ?? 0);
    const allowed = budgets.allocation[r.name];
    if (allowed !== undefined && tris > allowed) errors.push(`"${r.name}" has ${tris} triangles, over its allocation of ${allowed}.`);
  }
  if (total > budgets.triangles) errors.push(`${total} triangles, over the budget of ${budgets.triangles}.`);

  if (glb.byteLength > budgets.glbBytes) errors.push(`The GLB is ${(glb.byteLength / 1e6).toFixed(2)} MB, over the ${budgets.glbBytes / 1e6} MB budget.`);
  else if (glb.byteLength > budgets.glbAimBytes) warnings.push(`The GLB is ${(glb.byteLength / 1e6).toFixed(2)} MB, over the ${budgets.glbAimBytes / 1e6} MB aim.`);

  // An atlas is one texture set (base colour, normal, occlusion-roughness-metallic), as the modelling brief defines it:
  // count the materials that use an image over the texture size, not the images.
  const large = new Set<number>();
  for (const [i, img] of (glb.json.images ?? []).entries()) {
    if (img.uri) {
      errors.push(`Image ${i} is an external file (${img.uri}); everything must be inside the GLB.`);
      continue;
    }
    const bv = img.bufferView !== undefined ? glb.json.bufferViews?.[img.bufferView] : undefined;
    if (!bv || !glb.bin) continue;
    const start = bv.byteOffset ?? 0;
    const size = imageSize(glb.bin.subarray(start, start + bv.byteLength));
    if (!size) {
      warnings.push(`Image ${i} (${img.mimeType ?? "unknown type"}): size not readable.`);
      continue;
    }
    const side = Math.max(size.width, size.height);
    if (side > budgets.atlasPx) errors.push(`Image ${i} is ${size.width} x ${size.height}, over ${budgets.atlasPx} px.`);
    else if (side > budgets.texturePx) large.add(i);
  }
  // Every material is baked (modelling brief, plan 0006): one with only flat colours means texture.py was not run
  // after model.py, and the shipped model would lose its atlases and wear.
  for (const [i, mat] of (glb.json.materials ?? []).entries()) {
    const pbr = mat.pbrMetallicRoughness as { baseColorTexture?: unknown } | undefined;
    if (pbr?.baseColorTexture === undefined) errors.push(`Material "${String(mat.name ?? i)}" has no base colour texture: bake the model with texture.py before exporting.`);
  }
  const atlases = materialsUsingImages(glb.json, large);
  if (atlases.length > budgets.atlasCount) {
    errors.push(`${atlases.length} materials use images larger than ${budgets.texturePx} px (${atlases.join(", ")}); at most ${budgets.atlasCount} atlas is allowed.`);
  }

  return { errors, warnings, triangles: total };
}

/** Image index behind a texture index, through EXT_texture_webp or similar extensions when present. */
function textureImage(json: GltfJson, texture: number): number | undefined {
  const tex = json.textures?.[texture];
  if (!tex) return undefined;
  for (const ext of Object.values(tex.extensions ?? {})) if (ext.source !== undefined) return ext.source;
  return tex.source;
}

/** Names (or indices) of materials that reference any image in `images`. */
export function materialsUsingImages(json: GltfJson, images: ReadonlySet<number>): string[] {
  const out: string[] = [];
  for (const [i, mat] of (json.materials ?? []).entries()) {
    const refs: number[] = [];
    const walk = (v: unknown): void => {
      if (!v || typeof v !== "object") return;
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        if (k === "index" && typeof child === "number") refs.push(child);
        else walk(child);
      }
    };
    walk(mat);
    if (refs.some((ti) => images.has(textureImage(json, ti) ?? -1))) out.push(typeof mat.name === "string" ? mat.name : String(i));
  }
  return out;
}

/** Metres from the grip point within which a pinch or tip point must lie: the hand is about 0.2 m long. */
const PINCH_REACH = 0.25;

/**
 * The mechanic's hand (ADRs 0015 and 0016): one node named mechanic_hand with a "grip" morph, within its budget. Other
 * morphs are allowed; a "pinch" morph needs the node's pinch_point extra, a point near the hand in glTF axes.
 */
export function checkHand(glb: Glb, budgets: Budgets): CheckResult {
  const errors: string[] = [];
  const roots = rootNodes(glb.json);
  if (roots.length !== 1 || roots[0]!.name !== "mechanic_hand") {
    errors.push(`The hand must be one root node named "mechanic_hand"; found ${roots.map((r) => r.name || "(unnamed)").join(", ") || "none"}.`);
  }
  const triangles = roots.reduce((n, r) => n + nodeTriangles(glb.json, r.index), 0);
  if (triangles > budgets.hand.triangles) errors.push(`The hand has ${triangles} triangles, over its budget of ${budgets.hand.triangles}.`);
  if (glb.byteLength > budgets.hand.bytes) errors.push(`The hand is ${(glb.byteLength / 1000).toFixed(1)} KB, over its ${budgets.hand.bytes / 1000} KB budget.`);
  const node = roots[0] ? glb.json.nodes?.[roots[0].index] : undefined;
  const mesh = node?.mesh !== undefined ? glb.json.meshes?.[node.mesh] : undefined;
  const hasTargets = mesh?.primitives.every((p) => Array.isArray(p.targets) && p.targets.length > 0) ?? false;
  const morphs = mesh?.extras?.targetNames ?? [];
  if (!hasTargets || !morphs.includes("grip")) errors.push(`The hand has no "grip" morph target.`);
  const nearPoint = (p: unknown) => Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === "number" && Number.isFinite(v)) && Math.hypot(...(p as number[])) <= PINCH_REACH;
  if (morphs.includes("pinch") && !nearPoint(node?.extras?.["pinch_point"])) {
    errors.push(`The hand has a "pinch" morph but no pinch_point of three numbers within ${PINCH_REACH} m of the grip point.`);
  }
  // The fingertips, for the hovering hand (ADR 0020): optional, but if present it must be a point on the hand.
  const tip = node?.extras?.["tip_point"];
  if (tip !== undefined && !nearPoint(tip)) errors.push(`The hand's tip_point must be three numbers within ${PINCH_REACH} m of the grip point.`);
  for (const [i, img] of (glb.json.images ?? []).entries()) {
    const bv = img.bufferView !== undefined ? glb.json.bufferViews?.[img.bufferView] : undefined;
    if (!bv || !glb.bin) continue;
    const size = imageSize(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    if (size && Math.max(size.width, size.height) > budgets.hand.texturePx) errors.push(`Hand image ${i} is ${size.width} x ${size.height}, over ${budgets.hand.texturePx} px.`);
  }
  return { errors, warnings: [], triangles };
}

/** The clips every customer carries, named <look>.<clip> in the file (plan 0015 reading 5; pay_leave and storm_off,
 * and arrive as bringing the generator, from ADR 0026 and plan 0017). */
export const CUSTOMER_CLIPS = ["idle", "arrive", "waiting", "annoyed", "annoyed_idle", "failed_pull", "pleased", "leaving", "pay_leave", "storm_off"] as const;

/** Nodes every customer carries under its root, named <look>_<node> (plan 0017 step 1): the right and left hands' grip
 * points, which the generator and the notes hang from, and the folded naira notes. */
export const CUSTOMER_NODES = ["grip_r", "grip_l", "notes"] as const;

/** Most triangles the notes prop may have (ADR 0026). */
export const NOTES_TRIANGLES = 300;

/** The face's morph targets every customer carries (2026-10-12: the smile while paying and when pleased). */
export const CUSTOMER_MORPHS = ["smile"] as const;

/**
 * One customer's file (ADRs 0015 and 0023, plan 0015 step 4): one root node customer_<look> for a look in
 * customers.json and nothing else; within the triangle, joint, texture and byte budgets; every clip present.
 */
export function checkCustomer(glb: Glb, look: string, looks: readonly string[], budgets: Budgets): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const b = budgets.customers;
  if (!looks.includes(look)) errors.push(`"${look}" is not a look in customers.json.`);
  const roots = rootNodes(glb.json);
  const name = `customer_${look}`;
  if (roots.length !== 1 || roots[0]!.name !== name) {
    errors.push(`The file must have one root node named "${name}"; found ${roots.map((r) => r.name || "(unnamed)").join(", ") || "none"}.`);
  }
  const triangles = roots.reduce((n, r) => n + nodeTriangles(glb.json, r.index), 0);
  if (triangles > b.trianglesPerLook) errors.push(`${look} has ${triangles} triangles, over its budget of ${b.trianglesPerLook}.`);
  const skins = glb.json.skins ?? [];
  if (skins.length === 0) errors.push(`${look} has no skin (skeleton).`);
  const joints = new Set(skins.flatMap((s) => s.joints)).size;
  if (joints > b.jointsPerLook) errors.push(`${look} has ${joints} joints, over its budget of ${b.jointsPerLook}.`);
  if (glb.byteLength > b.bytesPerLook) errors.push(`${look} is ${(glb.byteLength / 1e6).toFixed(2)} MB, over its ${b.bytesPerLook / 1e6} MB budget.`);
  const clips = new Set((glb.json.animations ?? []).map((a) => a.name ?? ""));
  for (const clip of CUSTOMER_CLIPS) if (!clips.has(`${look}.${clip}`)) errors.push(`${look} has no clip "${look}.${clip}".`);
  const known = new Set(CUSTOMER_CLIPS.map((c) => `${look}.${c}`));
  for (const c of clips) if (!known.has(c)) warnings.push(`${look} has a clip "${c}" that nothing plays.`);
  const nodes = glb.json.nodes ?? [];
  const under = new Set<number>();
  const top = roots.find((r) => r.name === name);
  const stack = top ? [...(nodes[top.index]?.children ?? [])] : [];
  while (stack.length) {
    const i = stack.pop()!;
    under.add(i);
    stack.push(...(nodes[i]?.children ?? []));
  }
  const targets = new Set((glb.json.meshes ?? []).flatMap((m) => ((m as { extras?: { targetNames?: unknown } }).extras?.targetNames as string[] | undefined) ?? []));
  for (const t of CUSTOMER_MORPHS) if (!targets.has(t)) errors.push(`${look} has no "${t}" morph target.`);
  for (const n of CUSTOMER_NODES) {
    const index = nodes.findIndex((x) => x.name === `${look}_${n}`);
    if (index < 0) errors.push(`${look} has no node "${look}_${n}".`);
    else if (!under.has(index)) errors.push(`"${look}_${n}" must be under "${name}", so it moves with the skeleton.`);
    else if (n === "notes") {
      const t = nodeTriangles(glb.json, index);
      if (t > NOTES_TRIANGLES) errors.push(`${look}'s notes have ${t} triangles, over ${NOTES_TRIANGLES}.`);
    }
  }
  for (const [i, img] of (glb.json.images ?? []).entries()) {
    if (img.uri) {
      errors.push(`Image ${i} is an external file (${img.uri}); everything must be inside the GLB.`);
      continue;
    }
    const bv = img.bufferView !== undefined ? glb.json.bufferViews?.[img.bufferView] : undefined;
    if (!bv || !glb.bin) continue;
    const size = imageSize(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    if (size && Math.max(size.width, size.height) > b.texturePx) errors.push(`${look} image ${i} is ${size.width} x ${size.height}, over ${b.texturePx} px.`);
  }
  return { errors, warnings, triangles };
}

/** Tool names in tools.glb (ADR 0020): each a root node with its grip point. */
export const TOOL_NAMES = ["spanner", "screwdriver"] as const;

/** The spanner and screwdriver (ADR 0020, plan 0011): two root nodes, each with a grip_point, within their budget. */
export function checkTools(glb: Glb, budgets: Budgets): CheckResult {
  const errors: string[] = [];
  const roots = rootNodes(glb.json);
  for (const name of TOOL_NAMES) {
    const r = roots.find((x) => x.name === name);
    if (!r) {
      errors.push(`No root node named "${name}".`);
      continue;
    }
    const g = glb.json.nodes?.[r.index]?.extras?.["grip_point"];
    if (!(Array.isArray(g) && g.length === 3 && g.every((v) => typeof v === "number" && Number.isFinite(v)))) errors.push(`"${name}" has no grip_point of three numbers.`);
  }
  for (const r of roots) if (!(TOOL_NAMES as readonly string[]).includes(r.name)) errors.push(`Root node "${r.name || "(unnamed)"}" is not a tool.`);
  const triangles = roots.reduce((n, r) => n + nodeTriangles(glb.json, r.index), 0);
  if (triangles > budgets.tools.triangles) errors.push(`The tools have ${triangles} triangles, over their budget of ${budgets.tools.triangles}.`);
  if (glb.byteLength > budgets.tools.bytes) errors.push(`The tools are ${(glb.byteLength / 1000).toFixed(1)} KB, over their ${budgets.tools.bytes / 1000} KB budget.`);
  for (const [i, img] of (glb.json.images ?? []).entries()) {
    const bv = img.bufferView !== undefined ? glb.json.bufferViews?.[img.bufferView] : undefined;
    if (!bv || !glb.bin) continue;
    const size = imageSize(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    if (size && Math.max(size.width, size.height) > budgets.tools.texturePx) errors.push(`Tools image ${i} is ${size.width} x ${size.height}, over ${budgets.tools.texturePx} px.`);
  }
  return { errors, warnings: [], triangles };
}

/** The empty nodes in toolbox.glb where each tool rests (ADR 0021, plan 0012). */
export const TOOLBOX_SLOTS = ["slot_spanner", "slot_screwdriver"] as const;

/**
 * The toolbox (ADR 0021, plan 0012): one root node named toolbox, with the two slot nodes somewhere under it so they
 * move with it, within its budget of triangles, bytes and texture size.
 */
export function checkToolbox(glb: Glb, budgets: Budgets): CheckResult {
  const errors: string[] = [];
  const roots = rootNodes(glb.json);
  if (roots.length !== 1 || roots[0]!.name !== "toolbox") {
    errors.push(`The toolbox must be one root node named "toolbox"; found ${roots.map((r) => r.name || "(unnamed)").join(", ") || "none"}.`);
  }
  const nodes = glb.json.nodes ?? [];
  const box = roots.find((r) => r.name === "toolbox");
  const below = new Set<number>();
  const stack = box ? [...(nodes[box.index]?.children ?? [])] : [];
  while (stack.length) {
    const i = stack.pop()!;
    below.add(i);
    stack.push(...(nodes[i]?.children ?? []));
  }
  for (const slot of TOOLBOX_SLOTS) {
    const index = nodes.findIndex((n) => n.name === slot);
    if (index < 0) errors.push(`No node named "${slot}".`);
    else if (!below.has(index)) errors.push(`"${slot}" must be a node under "toolbox", so it moves with it.`);
  }
  const triangles = roots.reduce((n, r) => n + nodeTriangles(glb.json, r.index), 0);
  if (triangles > budgets.toolbox.triangles) errors.push(`The toolbox has ${triangles} triangles, over its budget of ${budgets.toolbox.triangles}.`);
  if (glb.byteLength > budgets.toolbox.bytes) errors.push(`The toolbox is ${(glb.byteLength / 1000).toFixed(1)} KB, over its ${budgets.toolbox.bytes / 1000} KB budget.`);
  for (const [i, img] of (glb.json.images ?? []).entries()) {
    const bv = img.bufferView !== undefined ? glb.json.bufferViews?.[img.bufferView] : undefined;
    if (!bv || !glb.bin) continue;
    const size = imageSize(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    if (size && Math.max(size.width, size.height) > budgets.toolbox.texturePx) errors.push(`Toolbox image ${i} is ${size.width} x ${size.height}, over ${budgets.toolbox.texturePx} px.`);
  }
  return { errors, warnings: [], triangles };
}

/** Images in one texture set: base colour, occlusion-roughness-metallic, normal. */
export const TEXTURE_SET_IMAGES = 3;

/**
 * The workbench (ADR 0025, plan 0016): one root node named bench, within its budget of triangles and bytes, with one
 * texture set (at most three images) no larger than its texture size.
 */
export function checkBench(glb: Glb, budgets: Budgets): CheckResult {
  const errors: string[] = [];
  const roots = rootNodes(glb.json);
  if (roots.length !== 1 || roots[0]!.name !== "bench") {
    errors.push(`The bench must be one root node named "bench"; found ${roots.map((r) => r.name || "(unnamed)").join(", ") || "none"}.`);
  }
  const triangles = roots.reduce((n, r) => n + nodeTriangles(glb.json, r.index), 0);
  if (triangles > budgets.bench.triangles) errors.push(`The bench has ${triangles} triangles, over its budget of ${budgets.bench.triangles}.`);
  if (glb.byteLength > budgets.bench.bytes) errors.push(`The bench is ${(glb.byteLength / 1000).toFixed(1)} KB, over its ${budgets.bench.bytes / 1000} KB budget.`);
  const images = glb.json.images ?? [];
  if (images.length > TEXTURE_SET_IMAGES) errors.push(`The bench has ${images.length} images; one texture set is at most ${TEXTURE_SET_IMAGES}.`);
  for (const [i, img] of images.entries()) {
    const bv = img.bufferView !== undefined ? glb.json.bufferViews?.[img.bufferView] : undefined;
    if (!bv || !glb.bin) continue;
    const size = imageSize(glb.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    if (size && Math.max(size.width, size.height) > budgets.bench.texturePx) errors.push(`Bench image ${i} is ${size.width} x ${size.height}, over ${budgets.bench.texturePx} px.`);
  }
  return { errors, warnings: [], triangles };
}

/** A companion file (environment, ground shadow) against its byte budget. */
export function checkFileSize(label: string, bytes: number | null, budget: number, required: boolean): string[] {
  if (bytes === null) return required ? [`${label} is missing.`] : [];
  return bytes > budget ? [`${label} is ${(bytes / 1000).toFixed(1)} KB, over the ${budget / 1000} KB budget.`] : [];
}

/// ---- Sound (ADR 0018, plan 0013 steps 3 and 4) ----

/** One Ogg page: where it is in the file and which logical stream it belongs to. */
export interface OggPage {
  serial: number;
  /** Beginning of stream: the first page of its logical stream. */
  bos: boolean;
  start: number;
  end: number;
  /** Where the page's packet data starts. */
  body: number;
}

/** Splits an Ogg file into pages. Null if it is not Ogg or a page runs past the end. */
export function oggPages(b: Uint8Array): OggPage[] | null {
  const pages: OggPage[] = [];
  let at = 0;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (at < b.length) {
    if (at + 27 > b.length || b[at] !== 0x4f || b[at + 1] !== 0x67 || b[at + 2] !== 0x67 || b[at + 3] !== 0x53) return null;
    const segments = b[at + 26]!;
    if (at + 27 + segments > b.length) return null;
    let size = 0;
    for (let i = 0; i < segments; i++) size += b[at + 27 + i]!;
    const body = at + 27 + segments;
    const end = body + size;
    if (end > b.length) return null;
    pages.push({ serial: dv.getUint32(at + 14, true), bos: (b[at + 5]! & 0x02) !== 0, start: at, end, body });
    at = end;
  }
  return pages.length ? pages : null;
}

const OPUS_HEAD = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]; // "OpusHead"

function startsWith(b: Uint8Array, at: number, sig: number[]): boolean {
  return sig.every((x, i) => b[at + i] === x);
}

/** The Opus stream's serial and channel count, from its OpusHead, or null if the file has no Opus stream. */
export function opusHead(b: Uint8Array, pages: OggPage[]): { serial: number; channels: number } | null {
  for (const p of pages) {
    if (p.bos && p.end - p.body >= 19 && startsWith(b, p.body, OPUS_HEAD)) return { serial: p.serial, channels: b[p.body + 9]! };
  }
  return null;
}

/**
 * Keeps only the Opus stream. Blender 4.5's FFmpeg output writes an Ogg file with a Theora video stream beside the
 * sound even with no video codec chosen; the pages of other streams are dropped whole, so every kept page and its
 * checksum stay as Blender wrote them. Returns the input unchanged if there is nothing to drop, null if there is no
 * Opus stream.
 */
export function opusOnly(b: Uint8Array): Uint8Array | null {
  const pages = oggPages(b);
  if (!pages) return null;
  const head = opusHead(b, pages);
  if (!head) return null;
  const keep = pages.filter((p) => p.serial === head.serial);
  if (keep.length === pages.length) return b;
  const out = new Uint8Array(keep.reduce((n, p) => n + p.end - p.start, 0));
  let at = 0;
  for (const p of keep) {
    out.set(b.subarray(p.start, p.end), at);
    at += p.end - p.start;
  }
  return out;
}

/** The licences a sound may have (ADR 0018, owner's choice "4. A" on 2026-10-11). */
export const SOUND_LICENCES = ["CC0 1.0", "own recording"] as const;

/** Rows of LICENCE.md's table: file name (first cell) to licence (the "Licence" column). */
export function licenceRows(text: string): Map<string, string> {
  const rows = new Map<string, string>();
  let licenceAt = -1;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const i = cells.findIndex((c) => c.toLowerCase() === "licence");
    if (i >= 0) {
      licenceAt = i;
      continue;
    }
    const file = cells[0]?.replace(/`/g, "");
    if (file && licenceAt >= 0) rows.set(file, cells[licenceAt] ?? "");
  }
  return rows;
}

export interface AudioCheck {
  errors: string[];
  warnings: string[];
  bytes: number;
}

/**
 * The sound files against ADR 0018: each a mono Ogg Opus file with no other stream, one per moment and nothing else,
 * 250 KB at most in all, each listed in LICENCE.md as CC0 1.0 or our own recording. `required` is false in the game's
 * own tests while the owner has not yet chosen the files: a missing file is then a warning, and an error in
 * `npm run audio`, the check run before a release.
 */
export function checkAudio(files: ReadonlyArray<{ name: string; bytes: Uint8Array }>, licence: string | null, moments: readonly string[], budget: number, required: boolean): AudioCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sounds = files.filter((f) => f.name !== "LICENCE.md");
  const bytes = sounds.reduce((n, f) => n + f.bytes.length, 0);
  const rows = licence === null ? new Map<string, string>() : licenceRows(licence);
  const expected = new Set(moments.map((m) => `${m}.ogg`));

  for (const f of sounds) {
    if (!expected.has(f.name)) {
      errors.push(`${f.name} is not one of the moments' files (${[...expected].join(", ")}): remove it.`);
      continue;
    }
    const pages = oggPages(f.bytes);
    const head = pages ? opusHead(f.bytes, pages) : null;
    if (!pages) errors.push(`${f.name} is not an Ogg file.`);
    else if (!head) errors.push(`${f.name} has no Opus stream: sounds are Ogg Opus (ADR 0018).`);
    else {
      if (head.channels !== 1) errors.push(`${f.name} has ${head.channels} channels: sounds are mono (ADR 0018).`);
      if (pages.some((p) => p.serial !== head.serial)) errors.push(`${f.name} holds another stream beside the sound (Blender's video stream?): run it through opusOnly.`);
    }
    if (licence === null) continue;
    const l = rows.get(f.name);
    if (l === undefined) errors.push(`${f.name} has no row in LICENCE.md.`);
    else if (!(SOUND_LICENCES as readonly string[]).includes(l)) errors.push(`${f.name} is listed as "${l}" in LICENCE.md: only ${SOUND_LICENCES.join(" or ")} is allowed (ADR 0018).`);
  }
  if (sounds.length && licence === null) errors.push("LICENCE.md is missing: every sound file is listed there with its source and licence (ADR 0018).");

  const missing = moments.filter((m) => !sounds.some((f) => f.name === `${m}.ogg`)).map((m) => `${m}.ogg`);
  if (missing.length) {
    const text = `${missing.length} of ${moments.length} sound files are missing: ${missing.join(", ")}. Until they are added, those moments are silent.`;
    (required ? errors : warnings).push(text);
  }
  if (bytes > budget) errors.push(`The sounds are ${(bytes / 1000).toFixed(1)} KB, over the ${budget / 1000} KB budget (ADR 0018).`);
  return { errors, warnings, bytes };
}

/** One moment's row in assets/audio/sounds.json: where the sound came from and how it is cut. */
export interface SoundSource {
  /** File name in assets/audio/source/, or null until the owner has chosen and downloaded it. */
  source: string | null;
  url: string | null;
  author: string | null;
  licence: string | null;
  /** Date the original was downloaded (YYYY-MM-DD). */
  fetched: string | null;
  /** Trim, seconds into the source. */
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  /** Gain in decibels. */
  gainDb: number;
}

/** LICENCE.md for the sounds in the game, written from sounds.json for the moments that have a file. */
export function licenceText(sounds: Record<string, SoundSource>, present: readonly string[]): string {
  const lines = [
    "# Sound licences",
    "",
    "Every sound file shipped in this folder, with its source and licence (ADR 0018). Only CC0 1.0 or our own recordings.",
    "Written by `npm run audio` from `assets/audio/sounds.json`; do not edit by hand.",
    "",
    "| File | Source | Author | Licence | Fetched | Trim |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const m of present) {
    const s = sounds[m];
    if (!s) continue;
    lines.push(`| ${m}.ogg | ${s.url ?? ""} | ${s.author ?? ""} | ${s.licence ?? ""} | ${s.fetched ?? ""} | ${s.start.toFixed(2)}–${s.end.toFixed(2)} s |`);
  }
  return lines.join("\n") + "\n";
}

// ---- Command line ----

/**
 * npm run audio's last step: takes Blender's encoded files from assets/audio/export, keeps only their Opus stream,
 * copies them into the game with LICENCE.md written from sounds.json, then checks the game's folder with every file
 * required. `--from`, `--to` and `--sounds` point it elsewhere (used to prove the pipeline on a test sound).
 */
function mainAudio(root: string, argv: string[]): void {
  const opt = (name: string, fallback: string) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]!) : fallback;
  };
  const from = opt("--from", join(root, "assets", "audio", "export"));
  const to = opt("--to", join(root, "game", "public", "audio"));
  const soundsPath = opt("--sounds", join(root, "assets", "audio", "sounds.json"));
  const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
  const sounds = (JSON.parse(readFileSync(soundsPath, "utf8")) as { sounds: Record<string, SoundSource> }).sounds;

  const copied: string[] = [];
  for (const m of MOMENTS) {
    const src = join(from, `${m}.ogg`);
    if (!existsSync(src)) continue;
    const only = opusOnly(new Uint8Array(readFileSync(src)));
    if (!only) {
      console.log(`error: ${src} has no Opus stream; not copied.`);
      continue;
    }
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, `${m}.ogg`), only);
    copied.push(m);
  }
  if (copied.length) {
    writeFileSync(join(to, "LICENCE.md"), licenceText(sounds, MOMENTS.filter((m) => existsSync(join(to, `${m}.ogg`)))));
    console.log(`Copied ${copied.length} sound(s) into ${to}, with LICENCE.md: ${copied.join(", ")}`);
  }

  const files = existsSync(to) ? readdirSync(to).filter((n) => n !== "LICENCE.md").map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(to, name))) })) : [];
  const licencePath = join(to, "LICENCE.md");
  const result = checkAudio(files, existsSync(licencePath) ? readFileSync(licencePath, "utf8") : null, MOMENTS, budgets.audioBytes, true);
  for (const w of result.warnings) console.log(`warning: ${w}`);
  for (const e of result.errors) console.log(`error: ${e}`);
  console.log(`Checked ${to}: ${files.length} file(s), ${(result.bytes / 1000).toFixed(1)} KB of ${budgets.audioBytes / 1000} KB, ${result.errors.length} error(s).`);
  if (result.errors.length) process.exit(1);
}


function mainToolbox(root: string, argv: string[]): void {
  const input = resolve(argv.find((a) => !a.startsWith("--")) ?? join(root, "assets", "toolbox", "export", "toolbox.optimised.glb"));
  const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
  if (!existsSync(input)) {
    console.error(`No toolbox at ${input}.`);
    process.exit(1);
  }
  const glb = readGlb(new Uint8Array(readFileSync(input)));
  const result = checkToolbox(glb, budgets);
  for (const e of result.errors) console.log(`error: ${e}`);
  console.log(`Checked ${input}: ${(glb.byteLength / 1000).toFixed(1)} KB of ${budgets.toolbox.bytes / 1000} KB, ${result.triangles} of ${budgets.toolbox.triangles} triangles, ${result.errors.length} error(s).`);
  if (result.errors.length) process.exit(1);
  if (!argv.includes("--no-copy")) {
    const out = join(root, "game", "public", "hand");
    mkdirSync(out, { recursive: true });
    copyFileSync(input, join(out, "toolbox.glb"));
    console.log(`Copied toolbox.glb to ${out}`);
  }
}

function mainBench(root: string, argv: string[]): void {
  const input = resolve(argv.find((a) => !a.startsWith("--")) ?? join(root, "assets", "scene", "export", "bench.optimised.glb"));
  const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
  if (!existsSync(input)) {
    console.error(`No bench at ${input}.`);
    process.exit(1);
  }
  const glb = readGlb(new Uint8Array(readFileSync(input)));
  const result = checkBench(glb, budgets);
  for (const e of result.errors) console.log(`error: ${e}`);
  console.log(`Checked ${input}: ${(glb.byteLength / 1000).toFixed(1)} KB of ${budgets.bench.bytes / 1000} KB, ${result.triangles} of ${budgets.bench.triangles} triangles, ${result.errors.length} error(s).`);
  if (result.errors.length) process.exit(1);
  if (!argv.includes("--no-copy")) {
    const out = join(root, "game", "public", "scene");
    mkdirSync(out, { recursive: true });
    copyFileSync(input, join(out, "bench.glb"));
    console.log(`Copied bench.glb to ${out}`);
  }
}

function mainTools(root: string, argv: string[]): void {
  const input = resolve(argv.find((a) => !a.startsWith("--")) ?? join(root, "assets", "tools", "export", "tools.optimised.glb"));
  const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
  if (!existsSync(input)) {
    console.error(`No tools at ${input}.`);
    process.exit(1);
  }
  const glb = readGlb(new Uint8Array(readFileSync(input)));
  const result = checkTools(glb, budgets);
  for (const e of result.errors) console.log(`error: ${e}`);
  console.log(`Checked ${input}: ${(glb.byteLength / 1000).toFixed(1)} KB, ${result.triangles} triangles, ${result.errors.length} error(s).`);
  if (result.errors.length) process.exit(1);
  if (!argv.includes("--no-copy")) {
    const out = join(root, "game", "public", "hand");
    mkdirSync(out, { recursive: true });
    copyFileSync(input, join(out, "tools.glb"));
    console.log(`Copied tools.glb to ${out}`);
  }
}

function mainHand(root: string, argv: string[]): void {
  const input = resolve(argv.find((a) => !a.startsWith("--")) ?? join(root, "assets", "hand", "export", "hand.optimised.glb"));
  const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
  if (!existsSync(input)) {
    console.error(`No hand at ${input}.`);
    process.exit(1);
  }
  const glb = readGlb(new Uint8Array(readFileSync(input)));
  const result = checkHand(glb, budgets);
  for (const e of result.errors) console.log(`error: ${e}`);
  console.log(`Checked ${input}: ${(glb.byteLength / 1000).toFixed(1)} KB, ${result.triangles} triangles, ${result.errors.length} error(s).`);
  if (result.errors.length) process.exit(1);
  if (!argv.includes("--no-copy")) {
    const out = join(root, "game", "public", "hand");
    mkdirSync(out, { recursive: true });
    copyFileSync(input, join(out, "hand.glb"));
    console.log(`Copied hand.glb to ${out}`);
  }
}

function mainCustomer(root: string, argv: string[]): void {
  const plain = argv.filter((a) => !a.startsWith("--"));
  const look = plain[0];
  if (!look) {
    console.error("Usage: check.ts --customer <look> [file.glb] [--no-copy]");
    process.exit(1);
  }
  const input = resolve(plain[1] ?? join(root, "assets", "customers", "export", `${look}.optimised.glb`));
  const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
  const customers = JSON.parse(readFileSync(join(root, "game", "public", "customers.json"), "utf8")) as { customers: Array<{ look: string }> };
  if (!existsSync(input)) {
    console.error(`No customer at ${input}.`);
    process.exit(1);
  }
  const glb = readGlb(new Uint8Array(readFileSync(input)));
  const result = checkCustomer(glb, look, customers.customers.map((c) => c.look), budgets);
  for (const w of result.warnings) console.log(`warning: ${w}`);
  for (const e of result.errors) console.log(`error: ${e}`);
  const joints = new Set((glb.json.skins ?? []).flatMap((s) => s.joints)).size;
  console.log(`Checked ${input}: ${(glb.byteLength / 1000).toFixed(1)} KB, ${result.triangles} triangles, ${joints} joints, ${result.errors.length} error(s).`);
  if (result.errors.length) process.exit(1);
  if (!argv.includes("--no-copy")) {
    const out = join(root, "game", "public", "customers");
    mkdirSync(out, { recursive: true });
    copyFileSync(input, join(out, `${look}.glb`));
    console.log(`Copied ${look}.glb to ${out}`);
  }
}

function main(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const argv = process.argv.slice(2);
  if (argv.includes("--hand")) return mainHand(root, argv.filter((a) => a !== "--hand"));
  if (argv.includes("--customer")) return mainCustomer(root, argv.filter((a) => a !== "--customer"));
  if (argv.includes("--audio")) return mainAudio(root, argv.filter((a) => a !== "--audio"));
  if (argv.includes("--tools")) return mainTools(root, argv.filter((a) => a !== "--tools"));
  if (argv.includes("--toolbox")) return mainToolbox(root, argv.filter((a) => a !== "--toolbox"));
  if (argv.includes("--bench")) return mainBench(root, argv.filter((a) => a !== "--bench"));
  const copy = !argv.includes("--no-copy");
  const input = resolve(argv.find((a) => !a.startsWith("--")) ?? join(root, "assets", "gen950", "export", "model.optimised.glb"));
  const groundIn = join(root, "assets", "gen950", "export", "ground.png");
  const envPath = join(root, "game", "public", "env", "workshop.hdr");
  const machineDir = join(root, "game", "public", "machines", "gen950");
  const budgets = JSON.parse(readFileSync(join(root, "tools", "pipeline", "budgets.json"), "utf8")) as Budgets;
  const machine = JSON.parse(readFileSync(join(machineDir, "machine.json"), "utf8")) as { parts: Array<{ id: string; fasteners?: Array<{ id: string }> }>; base: Array<{ id: string }> };

  if (!existsSync(input)) {
    console.error(`No model at ${input}.`);
    process.exit(1);
  }
  const glb = readGlb(new Uint8Array(readFileSync(input)));
  const fasteners = Object.fromEntries(machine.parts.filter((p) => p.fasteners?.length).map((p) => [p.id, p.fasteners!.map((f) => f.id)]));
  const result = checkModel(glb, { parts: machine.parts.map((p) => p.id), base: machine.base.map((b) => b.id), fasteners }, budgets);
  const size = (p: string) => (existsSync(p) ? statSync(p).size : null);
  result.errors.push(...checkFileSize("The environment map", size(envPath), budgets.environmentBytes, true));
  result.errors.push(...checkFileSize("The ground shadow", size(groundIn), budgets.groundBytes, false));

  for (const w of result.warnings) console.log(`warning: ${w}`);
  for (const e of result.errors) console.log(`error: ${e}`);
  console.log(`Checked ${input}: ${(glb.byteLength / 1000).toFixed(1)} KB, ${result.triangles} triangles, ${result.errors.length} error(s), ${result.warnings.length} warning(s).`);
  if (result.errors.length) process.exit(1);
  if (copy) {
    copyFileSync(input, join(machineDir, "model.glb"));
    if (existsSync(groundIn)) copyFileSync(groundIn, join(machineDir, "ground.png"));
    console.log(`Copied model.glb${existsSync(groundIn) ? " and ground.png" : ""} to ${machineDir}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
