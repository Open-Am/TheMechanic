// The workbench in the scene (plan 0016, ADR 0025): the model from bench.glb, or a plain box-shaped bench if the file is
// missing. Scenery only: it is never picked and never blocks the pointer (the view raycasts only the machine).

import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { BENCH } from "./stage.ts";

/** The fallback's top thickness and leg size, metres. */
const TOP_T = 0.04;
const LEG = 0.06;

/**
 * A group standing at BENCH.centre holding the bench: `model` (its origin on the floor under the middle of the top, as
 * bench.py makes it) or, with no model, a top and four legs in plain wood colour.
 */
export function createBench(model: Object3D | null): Group {
  const place = new Group();
  place.name = "bench_place";
  place.position.set(...BENCH.centre);
  if (model) {
    // The node keeps its own transform: mesh quantization stores a decoding offset and scale there (as for the machine).
    place.add(model);
    return place;
  }
  const wood = new MeshStandardMaterial({ color: "#6f5741", roughness: 0.85, metalness: 0 });
  const fallback = new Group();
  fallback.name = "bench_fallback";
  const top = new Mesh(new BoxGeometry(BENCH.width, TOP_T, BENCH.depth), wood);
  top.position.y = BENCH.top - TOP_T / 2;
  fallback.add(top);
  const legH = BENCH.top - TOP_T;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(LEG, legH, LEG), wood);
      leg.position.set(sx * (BENCH.width / 2 - 0.07), legH / 2, sz * (BENCH.depth / 2 - 0.06));
      fallback.add(leg);
    }
  }
  place.add(fallback);
  return place;
}
