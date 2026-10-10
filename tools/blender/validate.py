"""Validates the model against machine.json and the budgets (plan 0005 step 5, brief section 9, ADR 0014).

    node tools/run-blender.mjs tools/blender/validate.py --blend assets/gen950/blend/gen950.blend

Errors (exit 1): an object missing or extra in `parts` or `base`, a name that is not an ID, a non-mesh object,
rotation or scale not applied, origin not at the geometry centre, a mesh without a material, an object over its
triangle allocation, the total over 60,000. Warnings: an object more than 2 cm from its placeholder position.
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

if total > common.TRIANGLE_BUDGET:
    errors.append(f"The model has {total} triangles, over the budget of {common.TRIANGLE_BUDGET} (ADR 0014).")

for w in warnings:
    print(f"warning: {w}")
for e in errors:
    print(f"error: {e}")
print(f"Validated {len(objects)} objects, {total} triangles: {len(errors)} error(s), {len(warnings)} warning(s).")
sys.exit(1 if errors else 0)
