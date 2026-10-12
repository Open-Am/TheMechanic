"""Validates the model against machine.json and the budgets (plan 0005 step 5, brief section 9, ADR 0014).

    node tools/run-blender.mjs tools/blender/validate.py --blend assets/gen950/blend/gen950.blend

Errors (exit 1): an object missing or extra in `parts` or `base`, a name that is not an ID, a non-mesh object,
rotation or scale not applied, origin not at the geometry centre, a mesh without a material, an object over its
triangle allocation, the total over 60,000; a fastener or a node the pull moves (plan 0018) missing, misplaced or
misparented. Warnings: an object more than 2 cm from its placeholder position.
"""

import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
machine = common.load_machine()
part_ids, base_ids = common.object_ids(machine)
placeholders = {p["id"]: p["placeholder"] for p in machine["parts"] + machine["base"]}
errors, warnings = [], []


def check_collection(name, expected):
    col = bpy.data.collections.get(name)
    if col is None:
        errors.append(f"Collection '{name}' is missing.")
        return []
    names = [o.name for o in col.objects]
    for e in expected:
        if e not in names:
            errors.append(f"'{e}' is missing from '{name}'.")
    for n in names:
        if n not in expected:
            errors.append(f"'{n}' in '{name}' is not an ID in machine.json. Move it to 'reference' or rename it.")
    return [o for o in col.objects if o.name in expected]


objects = check_collection("parts", part_ids) + check_collection("base", base_ids)
total = 0
for obj in objects:
    n = obj.name
    if obj.type != "MESH":
        errors.append(f"'{n}' is a {obj.type}, not a mesh.")
        continue
    if any(abs(r) > 1e-5 for r in obj.rotation_euler) or any(abs(s - 1) > 1e-5 for s in obj.scale):
        errors.append(f"'{n}' has unapplied rotation or scale.")
    local = [Vector(c) for c in obj.bound_box]
    centre = sum(local, Vector()) / 8
    if centre.length > 0.001:
        errors.append(f"'{n}' origin is {centre.length * 1000:.1f} mm from its geometry centre.")
    if not obj.data.materials or any(m is None for m in obj.data.materials):
        errors.append(f"'{n}' has a missing material.")
    tris = common.triangle_count(obj)
    total += tris
    budget = common.ALLOCATION.get(n)
    if budget is not None and tris > budget:
        errors.append(f"'{n}' has {tris} triangles, over its allocation of {budget}.")
    ph = placeholders.get(n)
    if ph:
        loc = obj.matrix_world.translation
        gl = Vector((loc.x, loc.z, -loc.y))
        off = (gl - Vector(ph["position"])).length
        if off > 0.02:
            warnings.append(f"'{n}' is {off * 100:.1f} cm from its placeholder position in machine.json.")

# Fasteners (plan 0011, ADR 0020): one object per fastener in machine.json, named by its id, parented to its part,
# its origin at its head (its position in the data), within the fasteners' own allocation.
specs = {f["id"]: (p["id"], f) for p in machine["parts"] for f in p.get("fasteners", [])}
fcol = bpy.data.collections.get("fasteners")
fobjs = list(fcol.objects) if fcol else []
present = {o.name for o in fobjs}
for fid in specs:
    if fid not in present:
        errors.append(f"Fastener '{fid}' is missing from 'fasteners'. Run model.py for its part.")
ftotal = 0
for o in fobjs:
    if o.name not in specs:
        errors.append(f"'{o.name}' in 'fasteners' is not a fastener in machine.json.")
        continue
    pid, f = specs[o.name]
    if o.parent is None or o.parent.name != pid:
        errors.append(f"Fastener '{o.name}' must be parented to '{pid}'.")
    loc = o.matrix_world.translation
    off = (Vector((loc.x, loc.z, -loc.y)) - Vector(f["position"])).length
    if off > 0.001:
        errors.append(f"Fastener '{o.name}' origin is {off * 1000:.1f} mm from its position in machine.json.")
    if not o.data.materials or any(m is None for m in o.data.materials):
        errors.append(f"Fastener '{o.name}' has a missing material.")
    ftotal += common.triangle_count(o)
total += ftotal

# The nodes the pull moves (plan 0018, ADR 0027, tools/pipeline/child-nodes.json): an empty per node, parented to its
# part, with no rotation or scale (the game moves, turns and stretches it); a "mesh" node's shape is one child mesh
# "<id>.mesh" at the empty's origin, counted against its part's allocation. The rope runs along +X from its origin.
dcol = bpy.data.collections.get(common.DETAILS)
dobjs = {o.name: o for o in (dcol.objects if dcol else [])}
expected_details = set()
part_tris = {}
for pid, nodes in common.CHILD_NODES.items():
    for nid, kind in nodes.items():
        expected_details.add(nid)
        e = dobjs.get(nid)
        if e is None:
            errors.append(f"Node '{nid}' is missing from '{common.DETAILS}'. Run model.py for '{pid}'.")
            continue
        if e.type != "EMPTY":
            errors.append(f"Node '{nid}' must be an empty, not a {e.type}.")
        if e.parent is None or e.parent.name != pid:
            errors.append(f"Node '{nid}' must be parented to '{pid}'.")
        if any(abs(r) > 1e-5 for r in e.rotation_euler) or any(abs(s - 1) > 1e-5 for s in e.scale):
            errors.append(f"Node '{nid}' has a rotation or scale; it must have neither.")
        if kind == "empty":
            continue
        expected_details.add(f"{nid}.mesh")
        m = dobjs.get(f"{nid}.mesh")
        if m is None or m.type != "MESH" or m.parent is not e:
            errors.append(f"Node '{nid}' needs one child mesh '{nid}.mesh'.")
            continue
        if (m.matrix_world.translation - e.matrix_world.translation).length > 1e-5 or any(abs(r) > 1e-5 for r in m.rotation_euler) or any(abs(s - 1) > 1e-5 for s in m.scale):
            errors.append(f"'{nid}.mesh' must sit at its node's origin with no rotation or scale.")
        if not m.data.materials or any(x is None for x in m.data.materials):
            errors.append(f"'{nid}.mesh' has a missing material.")
        tris = common.triangle_count(m)
        total += tris
        part_tris[pid] = part_tris.get(pid, 0) + tris
        if nid == "recoil_starter.rope":
            # Blender (x, y, z) is glTF (x, -z, y): the rope must start at its origin and run along +X.
            xs = [c[0] for c in m.bound_box]
            across = max(max(c[1] for c in m.bound_box) - min(c[1] for c in m.bound_box), max(c[2] for c in m.bound_box) - min(c[2] for c in m.bound_box))
            if abs(min(xs)) > 1e-4 or max(xs) < 0.005 or across > 0.01:
                errors.append(f"'{nid}.mesh' must run along +X from its origin (x {min(xs):.4f} to {max(xs):.4f}, {across * 1000:.1f} mm across).")
for pid, extra in part_tris.items():
    own = next((o for o in objects if o.name == pid and o.type == "MESH"), None)
    budget = common.ALLOCATION.get(pid)
    if own is not None and budget is not None and common.triangle_count(own) + extra > budget:
        errors.append(f"'{pid}' has {common.triangle_count(own) + extra} triangles with its nodes, over its allocation of {budget}.")
for n in dobjs:
    if n not in expected_details:
        errors.append(f"'{n}' in '{common.DETAILS}' is not a node in tools/pipeline/child-nodes.json.")

if ftotal > common.ALLOCATION.get("fasteners", ftotal):
    errors.append(f"The fasteners have {ftotal} triangles, over their allocation of {common.ALLOCATION['fasteners']}.")

if total > common.TRIANGLE_BUDGET:
    errors.append(f"The model has {total} triangles, over the budget of {common.TRIANGLE_BUDGET} (ADR 0014).")

for w in warnings:
    print(f"warning: {w}")
for e in errors:
    print(f"error: {e}")
print(f"Validated {len(objects)} objects, {total} triangles: {len(errors)} error(s), {len(warnings)} warning(s).")
sys.exit(1 if errors else 0)
