// Builds the machine the scene shows: each part from the GLB when it has a node named by the part ID (brief section 8),
// otherwise from its placeholder in machine.json, with a warning. One group per part, named exactly the part ID,
// plus an invisible hit volume for picking. Every part gets its own copies of its materials, so fading one part while
// it moves never fades another part that shares a material in the GLB.

import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3, type BufferGeometry, type Material, type Object3D } from "three";
import type { Machine, PartId, Placeholder, Vec3 } from "../core/index.ts";
import { matchNodes } from "./match.ts";

export interface PartView {
  id: PartId;
  /** Positioned at the part's installed centre. Animations move this. */
  group: Group;
  /** The visible part inside the group. The press acknowledgement scales this, not the group. */
  visual: Object3D;
  /** Every mesh of the part, each with materials of its own. */
  meshes: Mesh[];
  /** Invisible box used for picking, at least the minimum finger size. */
  hit: Mesh<BoxGeometry, MeshBasicMaterial>;
  home: Vec3;
  size: Vec3;
  /** Where the part came from. */
  source: "model" | "placeholder";
}

export interface MachineView {
  root: Group;
  parts: Map<PartId, PartView>;
  /** Centre of the machine's bounding box, for the camera to orbit. */
  center: Vec3;
  /** Radius of a sphere that holds the whole machine. */
  radius: number;
  /** IDs that fell back to placeholders because the model had no node for them. */
  fallbacks: string[];
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

function placeholderMesh(p: Placeholder): Mesh {
  return new Mesh(geometryFor(p), new MeshStandardMaterial({ color: p.color, roughness: 0.75, metalness: 0.15 }));
}

/** Gives every mesh under `obj` its own material copies, and returns the meshes. */
function ownMaterials(obj: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  obj.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((x: Material) => x.clone()) : m.material.clone();
    meshes.push(m);
  });
  return meshes;
}

/**
 * `model` is the GLB scene, or null to use placeholders throughout. Model nodes are taken out of `model`.
 * A part node's own origin is the part's centre (brief section 8), so its position becomes the part's home.
 */
export function buildMachine(machine: Machine, model: Object3D | null = null): MachineView {
  const root = new Group();
  root.name = machine.id;
  const byName = new Map<string, Object3D>();
  for (const child of model?.children ?? []) byName.set(child.name, child);
  const match = matchNodes([...byName.keys()], [...machine.parts.map((p) => p.id), ...machine.base.map((b) => b.id)]);
  const fallbacks = model ? match.missing : [];
  for (const id of fallbacks) console.warn(`The model has no node for "${id}"; using its placeholder.`);

  for (const b of machine.base) {
    const node = model ? byName.get(b.id) : undefined;
    if (node) {
      ownMaterials(node);
      root.add(node);
    } else {
      const mesh = placeholderMesh(b.placeholder);
      mesh.name = b.id;
      mesh.position.set(...b.placeholder.position);
      root.add(mesh);
    }
  }

  const parts = new Map<PartId, PartView>();
  const hitMaterial = new MeshBasicMaterial({ visible: false });
  for (const part of machine.parts) {
    const node = model ? byName.get(part.id) : undefined;
    const group = new Group();
    group.name = part.id;
    let visual: Object3D;
    let home: Vec3;
    let size: Vec3;
    if (node) {
      home = [node.position.x, node.position.y, node.position.z];
      node.position.set(0, 0, 0);
      // The node keeps its own scale: mesh quantization (KHR_mesh_quantization) stores positions in a normalised
      // range and decodes them with the node's scale. Animations scale this wrapper, never the node.
      visual = new Group();
      visual.name = `${part.id}__visual`;
      visual.add(node);
      const box = new Box3().setFromObject(node);
      const s = box.getSize(new Vector3());
      size = [s.x, s.y, s.z];
    } else {
      visual = placeholderMesh(part.placeholder);
      visual.name = `${part.id}__visual`;
      home = [...part.placeholder.position];
      size = [...part.placeholder.size];
    }
    group.position.set(...home);
    const meshes = ownMaterials(visual);
    const hit = new Mesh(new BoxGeometry(1, 1, 1), hitMaterial);
    hit.name = `${part.id}__hit`;
    hit.userData.partId = part.id;
    hit.scale.set(...size);
    group.add(visual, hit);
    root.add(group);
    parts.set(part.id, { id: part.id, group, visual, meshes, hit, home, size, source: node ? "model" : "placeholder" });
  }

  const [sx, sy, sz] = machine.size;
  return { root, parts, center: [0, sy / 2, 0], radius: Math.hypot(sx, sy, sz) / 2, fallbacks };
}

/** Grows every hit volume to at least `minWorld` on each axis, never smaller than the part. */
export function sizeHitVolumes(view: MachineView, minWorld: number): void {
  for (const pv of view.parts.values()) {
    pv.hit.scale.set(Math.max(pv.size[0], minWorld), Math.max(pv.size[1], minWorld), Math.max(pv.size[2], minWorld));
  }
}

/** Sets a part's opacity on every one of its own materials. */
export function setPartOpacity(pv: PartView, opacity: number): void {
  for (const mesh of pv.meshes) {
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      m.transparent = opacity < 1;
      m.opacity = opacity;
    }
  }
}
