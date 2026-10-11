// Checks the optimised model and its companions against machine.json and the budgets, then copies them into the game
// (plan 0005 step 7, brief section 9, ADR 0014). Fails on the first run with any error.
//
//   node tools/pipeline/check.ts [model.glb] [--no-copy]
//
// The checks are pure functions, exported for game/tests/pipeline.test.ts.

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Budgets {
  glbBytes: number;
  glbAimBytes: number;
  triangles: number;
  texturePx: number;
  atlasPx: number;
  atlasCount: number;
  environmentBytes: number;
  groundBytes: number;
  allocation: Record<string, number>;
  hand: { triangles: number; bytes: number; texturePx: number };
  tools: { triangles: number; bytes: number; texturePx: number };
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

/** A companion file (environment, ground shadow) against its byte budget. */
export function checkFileSize(label: string, bytes: number | null, budget: number, required: boolean): string[] {
  if (bytes === null) return required ? [`${label} is missing.`] : [];
  return bytes > budget ? [`${label} is ${(bytes / 1000).toFixed(1)} KB, over the ${budget / 1000} KB budget.`] : [];
}

// ---- Command line ----

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

function main(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const argv = process.argv.slice(2);
  if (argv.includes("--hand")) return mainHand(root, argv.filter((a) => a !== "--hand"));
  if (argv.includes("--tools")) return mainTools(root, argv.filter((a) => a !== "--tools"));
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
