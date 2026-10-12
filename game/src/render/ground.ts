// The ground under the machine (ADR 0014): a dark surface that fades at its edges, with a soft contact shadow.
// The shadow is the one baked in Blender (tools/blender/bake_ground.py) when it loaded; otherwise it is drawn from the
// machine's footprint. The baked image spans the same 3x area as this plane.

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import type { Vec3 } from "../core/index.ts";

/** Texture size in pixels. Small: the shadow is soft and the budget is 64 KB (ADR 0014). */
const PX = 256;
/** The ground plane spans this many times the machine's longest side. */
const SPAN = 3;

/** Shadow strength in the middle, and how far it spreads past the footprint, as a share of the footprint. */
export const GROUND = { shadowAlpha: 0.62, spread: 0.18, floorAlpha: 0.07 } as const;

export function createGround(size: Vec3, baked: CanvasImageSource | null = null): Mesh {
  const span = Math.max(size[0], size[2]) * SPAN;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext("2d")!;
  const c = PX / 2;

  // A faint floor that fades to nothing at the edge, so the machine stands on something.
  const floor = ctx.createRadialGradient(c, c, 0, c, c, c);
  floor.addColorStop(0, `rgba(255, 248, 235, ${GROUND.floorAlpha})`);
  floor.addColorStop(1, "rgba(255, 248, 235, 0)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, PX, PX);

  if (baked) {
    ctx.drawImage(baked, 0, 0, PX, PX);
  } else {
    // The contact shadow: the footprint, blurred.
    const w = (size[0] / span) * PX;
    const d = (size[2] / span) * PX;
    ctx.filter = `blur(${Math.round(Math.max(w, d) * GROUND.spread)}px)`;
    ctx.fillStyle = `rgba(0, 0, 0, ${GROUND.shadowAlpha})`;
    ctx.fillRect(c - w / 2, c - d / 2, w, d);
    ctx.filter = "none";
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(span, span), material);
  mesh.name = "ground";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0005;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * A soft contact shadow for something standing on the ground beside the machine (the toolbox, plan 0012): a blurred
 * rectangle of `width` by `depth` metres, in the object's own frame, lying just above the ground.
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
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(width / 0.6, depth / 0.6), material);
  mesh.name = "contact_shadow";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.renderOrder = -1;
  return mesh;
}
