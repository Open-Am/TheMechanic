// Loads what the scene needs from the machine folder at startup (plan 0005 step 8): the model, its baked ground shadow,
// and the shared environment map. Fetched with the machine data, before the game starts; nothing is fetched after
// (ADR 0010). Each file is optional: whatever is missing falls back (placeholders, RoomEnvironment, a drawn shadow).

import { DataTexture, EquirectangularReflectionMapping, LinearFilter, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

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

/** `machineBase`, `envUrl`, `handUrl` and `toolsUrl` are URLs relative to the page. Never throws. */
export async function loadRenderAssets(machineBase: string, envUrl: string, handUrl: string | null = null, toolsUrl: string | null = null): Promise<RenderAssets> {
  const [model, environment, ground, hand, tools] = await Promise.all([
    loadModel(`${machineBase}model.glb`),
    loadEnvironment(envUrl),
    loadImage(`${machineBase}ground.png`),
    handUrl ? loadModel(handUrl) : Promise.resolve(null),
    toolsUrl ? loadModel(toolsUrl) : Promise.resolve(null),
  ]);
  return { model, environment, ground, hand, tools: pickTools(tools) };
}
