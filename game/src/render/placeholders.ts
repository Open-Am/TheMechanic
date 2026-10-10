// Placeholder geometry from machine.json (brief section 5.1). One group per part, named exactly the part ID,
// the same shape the GLB will have in Phase 3. Each part also gets an invisible hit volume for picking.

import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type BufferGeometry } from "three";
import type { Machine, PartId, Placeholder, Vec3 } from "../core/index.ts";

export interface PartView {
  id: PartId;
  /** Positioned at the part's installed centre. Animations move this. */
  group: Group;
  /** The visible shape. The press acknowledgement scales this, not the group. */
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  /** Invisible box used for picking, at least the minimum finger size. */
  hit: Mesh<BoxGeometry, MeshBasicMaterial>;
  home: Vec3;
  size: Vec3;
}

export interface MachineView {
  root: Group;
  parts: Map<PartId, PartView>;
  /** Centre of the machine's bounding box, for the camera to orbit. */
  center: Vec3;
  /** Radius of a sphere that holds the whole machine. */
  radius: number;
}

function geometryFor(p: Placeholder): BufferGeometry {
  const [x, y, z] = p.size;
  if (p.shape === "box") return new BoxGeometry(x, y, z);
  const axis = p.axis ?? "y";
  const length = axis === "x" ? x : axis === "y" ? y : z;
  const across = axis === "x" ? Math.max(y, z) : axis === "y" ? Math.max(x, z) : Math.max(x, y);
  const g = new CylinderGeometry(across / 2, across / 2, length, 20);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  return g;
}

function material(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15 });
}

export function buildMachine(machine: Machine): MachineView {
  const root = new Group();
  root.name = machine.id;

  for (const b of machine.base) {
    const mesh = new Mesh(geometryFor(b.placeholder), material(b.placeholder.color));
    mesh.name = b.id;
    mesh.position.set(...b.placeholder.position);
    root.add(mesh);
  }

  const parts = new Map<PartId, PartView>();
  const hitMaterial = new MeshBasicMaterial({ visible: false });
  for (const part of machine.parts) {
    const p = part.placeholder;
    const group = new Group();
    group.name = part.id;
    group.position.set(...p.position);
    const mesh = new Mesh(geometryFor(p), material(p.color));
    mesh.name = `${part.id}__mesh`;
    const hit = new Mesh(new BoxGeometry(1, 1, 1), hitMaterial);
    hit.name = `${part.id}__hit`;
    hit.userData.partId = part.id;
    hit.scale.set(...p.size);
    group.add(mesh, hit);
    root.add(group);
    parts.set(part.id, { id: part.id, group, mesh, hit, home: [...p.position], size: [...p.size] });
  }

  const [sx, sy, sz] = machine.size;
  return { root, parts, center: [0, sy / 2, 0], radius: Math.hypot(sx, sy, sz) / 2 };
}

/** Grows every hit volume to at least `minWorld` on each axis, never smaller than the part. */
export function sizeHitVolumes(view: MachineView, minWorld: number): void {
  for (const pv of view.parts.values()) {
    pv.hit.scale.set(Math.max(pv.size[0], minWorld), Math.max(pv.size[1], minWorld), Math.max(pv.size[2], minWorld));
  }
}
