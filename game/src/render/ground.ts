// The ground under the machine (ADR 0014): a dark surface that fades at its edges, with a soft contact shadow.
// This shadow is drawn in code from the machine's footprint as a stand-in; Phase 3 replaces it with one baked in Blender.

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import type { Vec3 } from "../core/index.ts";

/** Texture size in pixels. Small: the shadow is soft and the budget is 64 KB (ADR 0014). */
const PX = 256;
/** The ground plane spans this many times the machine's longest side. */
const SPAN = 3;

/** Shadow strength in the middle, and how far it spreads past the footprint, as a share of the footprint. */
export const GROUND = { shadowAlpha: 0.62, spread: 0.18, floorAlpha: 0.07 } as const;

export function createGround(size: Vec3): Mesh {
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

  // The contact shadow: the footprint, blurred.
  const w = (size[0] / span) * PX;
  const d = (size[2] / span) * PX;
  ctx.filter = `blur(${Math.round(Math.max(w, d) * GROUND.spread)}px)`;
  ctx.fillStyle = `rgba(0, 0, 0, ${GROUND.shadowAlpha})`;
  ctx.fillRect(c - w / 2, c - d / 2, w, d);
  ctx.filter = "none";

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
