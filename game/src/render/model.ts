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

/** `machineBase` and `envUrl` are URLs relative to the page. Never throws. */
export async function loadRenderAssets(machineBase: string, envUrl: string): Promise<RenderAssets> {
  const [model, environment, ground] = await Promise.all([loadModel(`${machineBase}model.glb`), loadEnvironment(envUrl), loadImage(`${machineBase}ground.png`)]);
  return { model, environment, ground };
}
