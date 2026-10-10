// Picking (brief section 8): walk up from the hit object to the first node whose name is a part ID.

import type { Object3D } from "three";
import type { PartId } from "../core/index.ts";

export function partIdOf(object: Object3D | null, partIds: ReadonlySet<PartId>): PartId | null {
  for (let o: Object3D | null = object; o; o = o.parent) {
    if (partIds.has(o.name)) return o.name;
  }
  return null;
}

/** The nearest hit whose part passes `allowed`. Hits are sorted nearest first, as Three.js returns them. */
export function firstPart(hits: ReadonlyArray<{ object: Object3D }>, partIds: ReadonlySet<PartId>, allowed: (id: PartId) => boolean): PartId | null {
  for (const h of hits) {
    const id = partIdOf(h.object, partIds);
    if (id && allowed(id)) return id;
  }
  return null;
}
