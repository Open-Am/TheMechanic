"""The spanner and screwdriver the mechanic's hand uses on fasteners (plan 0011, ADR 0020).

    node tools/run-blender.mjs tools/blender/tools.py -- build     # model, bake, save assets/tools/blend/tools.blend
    node tools/run-blender.mjs tools/blender/tools.py --blend assets/tools/blend/tools.blend -- export   # validate, export

Two objects, each a root node in assets/tools/export/tools.glb (glTF axes, metres):

- `spanner`: a 10 mm open-ended spanner, about 135 mm, chrome. Origin at the centre of the jaw, where the bolt sits;
  the jaw and handle lie in the XY plane, so the bolt's axis is local Z; the handle runs along +X.
- `screwdriver`: a Phillips screwdriver, about 175 mm, chrome shaft, yellow handle with black ends. Origin at the tip;
  the shaft runs along +Z, out of the screw.

Each carries a custom property `grip_point` (glTF axes), where the hand closes on it. Visuals only: there is no tool to
choose, buy or upgrade (ADR 0020). Made by script from our own materials; no outside images.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from shapes import box, cut, cyl, join, mat  # noqa: E402

common.check_version()
DIR = os.path.join(common.ROOT, "assets", "tools")
BLEND = os.path.join(DIR, "blend", "tools.blend")
EXPORT = os.path.join(DIR, "export", "tools.glb")
BUDGET = common.BUDGETS["tools"]
NAMES = ("spanner", "screwdriver")


def bevelled(obj, width, segments=2):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def place_origin(obj, origin_gl):
    """join() put the origin at the bounds centre; move it to `origin_gl` without moving the mesh."""
    target = Vector(common.gl(*origin_gl))
    obj.data.transform(Matrix.Translation(obj.location - target))
    obj.location = target


def spanner(M):
    head = bevelled(cyl(0.0145, 0.005, (0.0, 0.0, 0.0), "z", M["chrome"], verts=24), 0.0008)
    cut(head, [box((0.03, 0.0105, 0.012), (-0.016, 0.0, 0.0), M["chrome"])])  # the 10 mm jaw, open towards -X
    handle = bevelled(box((0.112, 0.012, 0.0042), (0.068, 0.0, 0.0), M["chrome"]), 0.0012)
    ring = bevelled(cyl(0.0115, 0.0048, (0.128, 0.0, 0.0), "z", M["chrome"], verts=20), 0.0008)
    cut(ring, [cyl(0.0062, 0.02, (0.128, 0.0, 0.0), "z", M["chrome"], verts=12)])
    obj = join([head, handle, ring], "spanner", common.ensure_collection("tools"))
    place_origin(obj, (0.0, 0.0, 0.0))
    obj["grip_point"] = [0.085, 0.0, 0.0]
    return obj


def screwdriver(M):
    tip = cyl(0.0016, 0.006, (0.0, 0.0, 0.003), "z", M["chrome"], verts=8)
    shaft = cyl(0.003, 0.08, (0.0, 0.0, 0.046), "z", M["chrome"], verts=10)
    handle = bevelled(cyl(0.0125, 0.09, (0.0, 0.0, 0.13), "z", M["handle_yellow"], verts=12), 0.003)
    ends = [bevelled(cyl(0.0131, 0.012, (0.0, 0.0, z), "z", M["handle_black"], verts=12), 0.002) for z in (0.09, 0.169)]
    obj = join([tip, shaft, handle, *ends], "screwdriver", common.ensure_collection("tools"))
    place_origin(obj, (0.0, 0.0, 0.0))
    obj["grip_point"] = [0.0, 0.0, 0.13]
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    M = {
        "chrome": mat("chrome", "#c9ccd0", 1.0, 0.25),
        "handle_yellow": mat("handle_yellow", "#e2b21f", 0.0, 0.45),
        "handle_black": mat("handle_black", "#1a1a1a", 0.0, 0.5),
    }
    objs = [spanner(M), screwdriver(M)]
    tris = sum(common.triangle_count(o) for o in objs)
    print(f"Tools: {tris} triangles (budget {BUDGET['triangles']})")
    if tris > BUDGET["triangles"]:
        common.fail(f"The tools have {tris} triangles, over their budget of {BUDGET['triangles']}.")
    import texture  # noqa: E402  (reused baker)

    texture.bake_groups({"tools": (BUDGET["texturePx"], list(NAMES))}, os.path.join(DIR, "textures"))
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print(f"Saved {BLEND}")


def export():
    errors = []
    objs = []
    for n in NAMES:
        o = bpy.data.objects.get(n)
        if o is None:
            errors.append(f"No object named {n}; run tools.py -- build first.")
            continue
        if "grip_point" not in o:
            errors.append(f"{n} has no grip_point property.")
        objs.append(o)
    tris = sum(common.triangle_count(o) for o in objs)
    if tris > BUDGET["triangles"]:
        errors.append(f"The tools have {tris} triangles, over their budget of {BUDGET['triangles']}.")
    if errors:
        for e in errors:
            print(f"error: {e}")
        sys.exit(1)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    os.makedirs(os.path.dirname(EXPORT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=EXPORT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_materials="EXPORT",
    )
    print(f"Validated the tools: {tris} triangles. Exported {EXPORT} ({os.path.getsize(EXPORT) / 1000:.1f} KB)")


mode = (common.args() or ["build"])[0]
if mode == "build":
    build()
elif mode == "export":
    export()
else:
    common.fail(f"Unknown mode {mode}: use build or export.")
