// Pictures of single parts for the tray chips (plan 0003 step 11). Each part is drawn alone into a small offscreen
// target once, read back, and cached as a data URL. ui receives this through main.ts, never by importing render.
// Offscreen targets get no tone mapping or sRGB encoding from Three.js, so encodePicture applies the scene's own.

import { DataUtils, HalfFloatType, Mesh, PerspectiveCamera, Scene, UnsignedByteType, Vector3, WebGLRenderTarget, type WebGLRenderer } from "three";
import type { PartId } from "../core/index.ts";
import { encodePicture } from "./colour.ts";
import { LIGHTING, type Lighting } from "./lighting.ts";
import { fitDistance, position } from "./orbit.ts";
import type { MachineView } from "./placeholders.ts";

/** Pixel size of a picture. Shown at 32 CSS px, so this is sharp at a device pixel ratio up to 4. */
export const THUMB_PX = 128;
const FOV_DEG = 30;
/** The same three-quarter view as the main camera, so a part looks in the tray as it did on the machine. */
const VIEW = { azimuth: 0.55, polar: 1.12 };

/** Pictures are lit by the same rig as the scene, so a part looks the same in the tray as on the machine. */
export function createThumbnailer(renderer: WebGLRenderer, view: MachineView, lighting: Lighting): (partId: PartId) => string | null {
  const cache = new Map<PartId, string | null>();
  const scene = new Scene();
  lighting.addTo(scene);
  const camera = new PerspectiveCamera(FOV_DEG, 1, 0.001, 10);
  // Half float keeps dark tones smooth before tone mapping; the fallback rig means half float may be missing.
  const halfFloat = lighting.rig === "ibl";

  function draw(partId: PartId): string | null {
    const pv = view.parts.get(partId);
    if (!pv || typeof document === "undefined") return null;

    // A copy of the visible mesh with a fresh material, so a part fading out mid-animation is still drawn solid.
    const material = pv.mesh.material.clone();
    material.transparent = false;
    material.opacity = 1;
    const mesh = new Mesh(pv.mesh.geometry, material);
    scene.add(mesh);

    pv.mesh.geometry.computeBoundingSphere();
    const sphere = pv.mesh.geometry.boundingSphere!;
    const distance = fitDistance(sphere.radius, (FOV_DEG * Math.PI) / 180, 1, 1.08);
    const c: [number, number, number] = [sphere.center.x, sphere.center.y, sphere.center.z];
    camera.position.set(...position({ ...VIEW, distance }, c));
    camera.near = distance / 100;
    camera.far = distance * 4;
    camera.updateProjectionMatrix();
    camera.lookAt(new Vector3(...c));

    const target = new WebGLRenderTarget(THUMB_PX, THUMB_PX, { samples: 4, type: halfFloat ? HalfFloatType : UnsignedByteType });
    const previousTarget = renderer.getRenderTarget();
    const previousAlpha = renderer.getClearAlpha();
    const count = THUMB_PX * THUMB_PX * 4;
    const raw = halfFloat ? new Uint16Array(count) : new Uint8Array(count);
    try {
      renderer.setRenderTarget(target);
      renderer.setClearAlpha(0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, THUMB_PX, THUMB_PX, raw);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearAlpha(previousAlpha);
      scene.remove(mesh);
      material.dispose();
      target.dispose();
    }

    const linear = new Float32Array(count);
    if (halfFloat) for (let i = 0; i < count; i++) linear[i] = DataUtils.fromHalfFloat(raw[i]!);
    else for (let i = 0; i < count; i++) linear[i] = raw[i]! / 255;

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = THUMB_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.createImageData(THUMB_PX, THUMB_PX);
    image.data.set(encodePicture(linear, THUMB_PX, THUMB_PX, LIGHTING.exposure));
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }

  return (partId) => {
    if (!cache.has(partId)) {
      let url: string | null = null;
      try {
        url = draw(partId);
      } catch (e) {
        console.warn(`No tray picture for ${partId}:`, e);
      }
      cache.set(partId, url);
    }
    return cache.get(partId) ?? null;
  };
}
