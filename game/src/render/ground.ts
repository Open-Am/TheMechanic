// What the machine stands on (ADR 0014, since plan 0016 and ADR 0025 a workbench): the machine's soft contact shadow on
// the bench top, the floor beyond the bench, and small contact shadows for things standing on the bench (the toolbox).
// The machine's shadow is the one baked in Blender (tools/blender/bake_ground.py) when it loaded; otherwise it is drawn
// from the machine's footprint. The baked image spans the same SHADOW_SPAN as the shadow plane here.

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import type { Vec3 } from "../core/index.ts";

/** Texture size in pixels. Small: the shadow is soft and the budget is 64 KB (ADR 0014). */
const PX = 256;
/**
 * The shadow plane spans this many times the machine's longest side; SPAN_FACTOR in bake_ground.py matches it. Small
 * enough that the shadow stays on the bench top however the machine is turned (plan 0016).
 */
export const SHADOW_SPAN = 1.6;

/** Shadow strength in the middle, and how far it spreads past the footprint, as a share of the footprint. */
export const GROUND = { shadowAlpha: 0.62, spread: 0.18, floorAlpha: 0.07, floorSpan: 5, benchShadowAlpha: 0.5 } as const;

/** The side of the square the machine's shadow plane covers, metres. */
export function shadowSpan(size: Vec3): number {
  return Math.max(size[0], size[2]) * SHADOW_SPAN;
}

function flat(canvas: HTMLCanvasElement, width: number, depth: number, name: string): Mesh {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(width, depth), material);
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * The machine's contact shadow, centred under it in its own frame, lying just above its base: the bench top when it
 * stands on the bench. It turns with the machine. `baked` is the image from bake_ground.py, or null to draw one.
 */
export function createMachineShadow(size: Vec3, baked: CanvasImageSource | null = null): Mesh {
  const span = shadowSpan(size);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d")!;
  if (baked) {
    ctx.drawImage(baked, 0, 0, PX, PX);
  } else {
    // The footprint, blurred.
    const c = PX / 2;
    const w = (size[0] / span) * PX;
    const d = (size[2] / span) * PX;
    ctx.filter = `blur(${Math.round(Math.max(w, d) * GROUND.spread)}px)`;
    ctx.fillStyle = `rgba(0, 0, 0, ${GROUND.shadowAlpha})`;
    ctx.fillRect(c - w / 2, c - d / 2, w, d);
    ctx.filter = "none";
  }
  const mesh = flat(canvas, span, span, "machine_shadow");
  mesh.position.y = 0.0008;
  return mesh;
}

/**
 * The floor beyond the bench: a faint surface that fades to nothing at its edge, with the bench's own soft shadow under
 * it (`benchWidth` by `benchDepth` metres, centred on the plane's middle). Lies at floor level.
 */
export function createFloor(benchWidth: number, benchDepth: number): Mesh {
  const span = GROUND.floorSpan;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d")!;
  const c = PX / 2;
  const floor = ctx.createRadialGradient(c, c, 0, c, c, c);
  floor.addColorStop(0, `rgba(255, 248, 235, ${GROUND.floorAlpha})`);
  floor.addColorStop(1, "rgba(255, 248, 235, 0)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, PX, PX);
  const w = (benchWidth / span) * PX;
  const d = (benchDepth / span) * PX;
  ctx.filter = `blur(${Math.round(d * 0.25)}px)`;
  ctx.fillStyle = `rgba(0, 0, 0, ${GROUND.benchShadowAlpha})`;
  ctx.fillRect(c - w / 2, c - d / 2, w, d);
  ctx.filter = "none";
  const mesh = flat(canvas, span, span, "floor");
  mesh.position.y = 0.0005;
  return mesh;
}

/**
 * A soft contact shadow for something standing beside the machine (the toolbox, plan 0012): a blurred rectangle of
 * `width` by `depth` metres, in the object's own frame, lying just above what it stands on.
 */
export function createContactShadow(width: number, depth: number): Mesh {
  const px = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  // The rectangle fills 60 percent of the image; the rest is room for the blur.
  ctx.filter = `blur(${Math.round(px * 0.08)}px)`;
  ctx.fillStyle = `rgba(0, 0, 0, ${GROUND.shadowAlpha})`;
  ctx.fillRect(px * 0.2, px * 0.2, px * 0.6, px * 0.6);
  const mesh = flat(canvas, width / 0.6, depth / 0.6, "contact_shadow");
  mesh.position.y = 0.001;
  return mesh;
}
