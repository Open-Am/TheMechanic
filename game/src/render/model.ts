// Loads what the scene needs from the machine folder at startup (plan 0005 step 8): the model, its baked ground shadow,
// and the shared environment map; and the hand, its tools, the toolbox and the workbench (plans 0008, 0011, 0012, 0016). Fetched with the machine data, before the game starts. The customers are
// the one thing fetched later, one look at a time (loadCustomer, ADR 0023). Each file is optional: whatever is missing falls back (placeholders, RoomEnvironment, a drawn shadow).

import { DataTexture, EquirectangularReflectionMapping, LinearFilter, type AnimationClip, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { type LoadProgress, progressCounter } from "./progress.ts";

export interface RenderAssets {
  /** The GLB scene, or null to use placeholders. */
  model: Object3D | null;
  /** The equirectangular environment, or null to use the generated studio. */
  environment: DataTexture | null;
  /** The baked ground shadow (alpha), or null to draw one. */
  ground: ImageBitmap | null;
  /** The mechanic's hand (plan 0008), or null: parts then move on their own. */
  hand: Object3D | null;
  /** The spanner and screwdriver (plan 0011), or null: the hand then turns fasteners with its fingers. */
  tools?: Tools | null;
  /** The toolbox with the tools' slots (plan 0012), or null: the tools then come from just off screen. */
  toolbox?: Toolbox | null;
  /** The workbench (plan 0016), or null: the view then draws a plain box-shaped bench. */
  bench?: Object3D | null;
}

/** Picks the bench out of bench.glb by name. Null if it is not there. */
export function pickBench(scene: Object3D | null): Object3D | null {
  if (!scene) return null;
  let found: Object3D | null = null;
  scene.traverse((o) => {
    if (!found && (o.userData?.["name"] === "bench" || o.name === "bench")) found = o;
  });
  const bench = found as Object3D | null;
  bench?.removeFromParent();
  return bench;
}

export interface Toolbox {
  object: Object3D;
  /** Empty nodes under the toolbox: where each tool rests, as the tool's own origin and axes. */
  slots: { spanner: Object3D; screwdriver: Object3D };
}

/** Picks the toolbox and its two slots out of toolbox.glb by name. Null if any is missing. */
export function pickToolbox(scene: Object3D | null): Toolbox | null {
  if (!scene) return null;
  const named = (name: string): Object3D | null => {
    let found: Object3D | null = null;
    scene.traverse((o) => {
      if (!found && (o.userData?.["name"] === name || o.name === name)) found = o;
    });
    return found;
  };
  const object = named("toolbox");
  const spanner = named("slot_spanner");
  const screwdriver = named("slot_screwdriver");
  if (!object || !spanner || !screwdriver) return null;
  object.removeFromParent();
  return { object, slots: { spanner, screwdriver } };
}

/** How many files loadRenderAssets fetches: the model, environment and ground, and each optional file given. */
export function renderFileCount(...optional: Array<string | null | undefined>): number {
  return 3 + optional.filter((u) => !!u).length;
}

export interface Tool {
  object: Object3D;
  /** Where the hand closes on it, in the tool's own frame. */
  grip: [number, number, number];
}

export interface Tools {
  spanner: Tool;
  screwdriver: Tool;
}

/** Picks the two tools out of tools.glb by name (the loader keeps the original name in userData.name). */
function pickTools(scene: Object3D | null): Tools | null {
  if (!scene) return null;
  const find = (name: string): Tool | null => {
    let found: Object3D | null = null;
    scene.traverse((o) => {
      if (!found && (o.userData?.["name"] === name || o.name === name)) found = o;
    });
    if (!found) return null;
    const obj: Object3D = found;
    const g = obj.userData?.["grip_point"] as unknown;
    const grip: [number, number, number] = Array.isArray(g) && g.length === 3 ? [Number(g[0]), Number(g[1]), Number(g[2])] : [0, 0, 0];
    obj.removeFromParent();
    return { object: obj, grip };
  };
  const spanner = find("spanner");
  const screwdriver = find("screwdriver");
  return spanner && screwdriver ? { spanner, screwdriver } : null;
}

async function fetchOk(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url);
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

async function loadModel(url: string): Promise<Object3D | null> {
  const r = await fetchOk(url);
  if (!r) return null;
  try {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(await r.arrayBuffer(), "");
    return gltf.scene;
  } catch (e) {
    console.warn("The model could not be read; using placeholders.", e);
    return null;
  }
}

/**
 * One customer's file (plan 0015 step 8, ADR 0023): the scene and its clips, or null if it is missing or cannot be read.
 * Never throws. The dev server answers a missing file with the page itself, which counts as missing.
 */
export async function loadCustomer(url: string): Promise<{ scene: Object3D; animations: AnimationClip[] } | null> {
  const r = await fetchOk(url);
  if (!r || (r.headers.get("content-type") ?? "").includes("text/html")) return null;
  try {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(await r.arrayBuffer(), "");
    return { scene: gltf.scene, animations: gltf.animations };
  } catch (e) {
    console.warn(`The customer ${url} could not be read; the round plays without the figure.`, e);
    return null;
  }
}

async function loadEnvironment(url: string): Promise<DataTexture | null> {
  const r = await fetchOk(url);
  if (!r) return null;
  try {
    // The same texture settings HDRLoader.load would apply; parse() only decodes.
    const hdr = new HDRLoader().parse(await r.arrayBuffer());
    const texture = new DataTexture(hdr.data, hdr.width, hdr.height, undefined, hdr.type);
    texture.mapping = EquirectangularReflectionMapping;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  } catch (e) {
    console.warn("The environment map could not be read; using the generated studio.", e);
    return null;
  }
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  const r = await fetchOk(url);
  if (!r) return null;
  try {
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

/** `machineBase`, `envUrl`, `handUrl`, `toolsUrl`, `toolboxUrl` and `benchUrl` are URLs relative to the page. Never throws. */
export async function loadRenderAssets(machineBase: string, envUrl: string, handUrl: string | null = null, toolsUrl: string | null = null, toolboxUrl: string | null = null, benchUrl: string | null = null, onProgress?: LoadProgress): Promise<RenderAssets> {
  const counted = progressCounter(renderFileCount(handUrl, toolsUrl, toolboxUrl, benchUrl), onProgress);
  const [model, environment, ground, hand, tools, toolbox, bench] = await Promise.all([
    counted(loadModel(`${machineBase}model.glb`)),
    counted(loadEnvironment(envUrl)),
    counted(loadImage(`${machineBase}ground.png`)),
    handUrl ? counted(loadModel(handUrl)) : Promise.resolve(null),
    toolsUrl ? counted(loadModel(toolsUrl)) : Promise.resolve(null),
    toolboxUrl ? counted(loadModel(toolboxUrl)) : Promise.resolve(null),
    benchUrl ? counted(loadModel(benchUrl)) : Promise.resolve(null),
  ]);
  return { model, environment, ground, hand, tools: pickTools(tools), toolbox: pickToolbox(toolbox), bench: pickBench(bench) };
}
