"""The roadside workbench the generator stands on (plan 0016, ADR 0025).

    node tools/run-blender.mjs tools/blender/bench.py -- build            # model, bake, save assets/scene/blend/bench.blend
    node tools/run-blender.mjs tools/blender/bench.py -- preview <out.png> # model without baking and render it, for tuning
    node tools/run-blender.mjs tools/blender/bench.py --blend assets/scene/blend/bench.blend -- export   # validate, export

A worn wooden workbench: five planks with gaps on two battens, aprons front and back, four square legs with low
stretchers, nail heads where the planks cross the battens. Weathered grey-brown wood, oil stains and grime on the top,
laterite dust in the corners. The shape and numbers follow the mock-up the owner chose on 2026-10-12.

One root node `bench` (glTF axes, metres): origin on the floor under the middle of the top, the long side along X, the
near edge (the mechanic's side) towards +Z, the top at TOP_H. Faces that point down are left out: the camera is always
above the top (ADR 0025), so they are never seen, and leaving them out saves triangles and atlas space.

Scenery only (ADR 0025): never picked. Made by script from our own materials; reference photos of real workbenches are
for matching only and never committed (ADR 0013).
"""

import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from shapes import box, cyl, join, mat, rotate_about  # noqa: E402

common.check_version()
DIR = os.path.join(common.ROOT, "assets", "scene")
BLEND = os.path.join(DIR, "blend", "bench.blend")
EXPORT = os.path.join(DIR, "export", "bench.glb")
BUDGET = common.BUDGETS["bench"]

# Dimensions, metres (glTF axes: X along the bench, Y up, Z towards the mechanic). Kept in step with BENCH in
# game/src/render/stage.ts.
TOP_H = 0.78
W = 1.15
D = 0.65
PLANKS = 5
GAP = 0.008
T = 0.028  # plank thickness
LEG = 0.06
STRETCHER_Y = 0.18


def materials():
    """Modelling materials; texture.py turns each into baked wood with wear (profile "wood")."""
    tops = [mat(f"bench_top_{i}", c, 0.0, 0.8) for i, c in enumerate(("#725a43", "#6c543f", "#785e46", "#66503c", "#6f5741"))]
    return {
        "tops": tops,
        "frame_x": mat("bench_frame_x", "#5e4630", 0.0, 0.85),
        "frame_y": mat("bench_frame_y", "#5a432e", 0.0, 0.85),
        "frame_z": mat("bench_frame_z", "#614832", 0.0, 0.85),
        "nail": mat("bench_nail", "#4a4540", 1.0, 0.55),
    }


def planks(M, rng):
    parts = []
    pw = (D - GAP * (PLANKS - 1)) / PLANKS
    for i in range(PLANKS):
        z = -D / 2 + pw / 2 + i * (pw + GAP)
        length = W + rng.uniform(-0.02, 0.03)
        x = rng.uniform(-0.015, 0.015)
        y = TOP_H - T / 2 + rng.uniform(-0.003, 0.003)
        p = box((length, T, pw - rng.uniform(0, 0.006)), (x, y, z), M["tops"][i], bevel=0.004, segments=1)
        rotate_about(p, "x", math.degrees(rng.uniform(-0.008, 0.008)), (x, y, z))
        rotate_about(p, "y", math.degrees(rng.uniform(-0.006, 0.006)), (x, y, z))
        parts.append(p)
    return parts, pw


def frame(M, rng):
    parts = []
    under = TOP_H - T
    # Battens under the top, across the planks.
    for x in (-W / 2 + 0.12, W / 2 - 0.12):
        parts.append(box((0.05, 0.035, D - 0.04), (x, under - 0.0175, 0), M["frame_z"], bevel=0.003, segments=1))
    # Aprons along the front and back.
    for z in (D / 2 - 0.03, -D / 2 + 0.03):
        parts.append(box((W - 0.12, 0.09, 0.022), (0, under - 0.045, z), M["frame_x"], bevel=0.003, segments=1))
    # Four legs, a little out of true.
    legs_h = under
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (W / 2 - 0.07), sz * (D / 2 - 0.06)
            leg = box((LEG, legs_h, LEG), (x, legs_h / 2, z), M["frame_y"], bevel=0.004, segments=1)
            rotate_about(leg, "x", math.degrees(rng.uniform(-0.012, 0.012)), (x, legs_h, z))
            rotate_about(leg, "z", math.degrees(rng.uniform(-0.012, 0.012)), (x, legs_h, z))
            parts.append(leg)
    # Low stretchers along the front and back, and across each end.
    for z in (D / 2 - 0.06, -D / 2 + 0.06):
        parts.append(box((W - 0.14 - LEG, 0.05, 0.03), (0, STRETCHER_Y, z), M["frame_x"], bevel=0.003, segments=1))
    for x in (-W / 2 + 0.07, W / 2 - 0.07):
        parts.append(box((0.03, 0.05, D - 0.12 - LEG), (x, STRETCHER_Y - 0.06, 0), M["frame_z"], bevel=0.003, segments=1))
    return parts


def nails(M, rng, pw):
    """Two nail heads where each plank crosses each batten."""
    parts = []
    for i in range(PLANKS):
        z = -D / 2 + pw / 2 + i * (pw + GAP)
        for x in (-W / 2 + 0.12, W / 2 - 0.12):
            for dz in (-pw * 0.28, pw * 0.28):
                at = (x + rng.uniform(-0.008, 0.008), TOP_H + 0.0006, z + dz + rng.uniform(-0.005, 0.005))
                parts.append(cyl(0.0045, 0.002, at, "y", M["nail"], verts=6))
    return parts


def drop_down_faces(obj):
    """Removes faces that point down (Blender -Z): never seen from above the top."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    down = [f for f in bm.faces if f.normal.z < -0.7]
    bmesh.ops.delete(bm, geom=down, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def model():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    rng = random.Random(7)
    M = materials()
    top, pw = planks(M, rng)
    pieces = top + frame(M, rng) + nails(M, rng, pw)
    obj = join(pieces, "bench", common.ensure_collection("bench"))
    target = Vector((0, 0, 0))
    obj.data.transform(Matrix.Translation(obj.location - target))
    obj.location = target
    drop_down_faces(obj)
    tris = common.triangle_count(obj)
    print(f"Bench: {tris} triangles (budget {BUDGET['triangles']})")
    if tris > BUDGET["triangles"]:
        common.fail(f"The bench has {tris} triangles, over its budget of {BUDGET['triangles']}.")
    return obj


def smooth_orm(orm):
    """Softens the baked occlusion and roughness (a 3 x 3 box blur): sampling noise compresses badly and reads as grain
    at the size the bench is seen (as toolbox.py does)."""
    h, w = orm.shape[:2]
    for ch in (0, 1):
        padded = np.pad(orm[:, :, ch], 1, mode="edge")
        orm[:, :, ch] = sum(padded[dy : dy + h, dx : dx + w] for dy in range(3) for dx in range(3)) / 9.0
    return orm


def lookdev():
    """The game's light for match renders: its environment map, key sun and tone mapping (as toolbox.py does)."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.exposure = math.log2(common.LOOKDEV["exposure"])
    world = bpy.data.worlds.new("lookdev")
    scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = common.LOOKDEV["environment_strength"]
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    if os.path.exists(common.ENV_PATH):
        env = nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(common.ENV_PATH)
        links.new(env.outputs["Color"], bg.inputs["Color"])
    sun = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    sun.data.energy = common.LOOKDEV["key_energy"]
    scene.collection.objects.link(sun)
    d = Vector(common.gl(*common.KEY_DIRECTION)).normalized()
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "ground"
    ground.data.materials.append(mat("ground", "#2a2723", 0.0, 0.9))


def build():
    model()
    import texture  # noqa: E402  (reused baker)

    texture.bake_groups({"bench": (BUDGET["texturePx"], ["bench"])}, os.path.join(DIR, "textures"), orm_filter=smooth_orm)
    lookdev()
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print(f"Saved {BLEND}")


def render_views(out_path, views=None):
    """Renders the bench from the game's eye level and two other angles."""
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 900, 640
    scene.eevee.taa_render_samples = 32
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.angle_y = math.radians(40)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for i, (eye, look) in enumerate(views or (((0.0, 1.6, 2.1), (0, 0.85, 0)), ((1.4, 1.3, 1.5), (0, 0.6, 0)), ((-0.5, 1.75, 1.0), (-0.2, 0.78, 0)))):
        cam.location = common.gl(*eye)
        cam.rotation_euler = (Vector(common.gl(*look)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = out_path.replace(".png", f"-{i}.png")
        bpy.ops.render.render(write_still=True)
        print(f"Rendered {scene.render.filepath}")


def preview(out_path):
    model()
    lookdev()
    render_views(out_path)


def export():
    errors = []
    obj = bpy.data.objects.get("bench")
    if obj is None:
        common.fail("No object named bench; run bench.py -- build first.")
    tris = common.triangle_count(obj)
    if tris > BUDGET["triangles"]:
        errors.append(f"The bench has {tris} triangles, over its budget of {BUDGET['triangles']}.")
    if not any(s.material and s.material.name.startswith("baked_") for s in obj.material_slots):
        errors.append("The bench is not baked; run bench.py -- build.")
    if errors:
        for e in errors:
            print(f"error: {e}")
        sys.exit(1)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    os.makedirs(os.path.dirname(EXPORT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=EXPORT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_materials="EXPORT",
    )
    print(f"Validated the bench: {tris} triangles. Exported {EXPORT} ({os.path.getsize(EXPORT) / 1000:.1f} KB)")


a = common.args() or ["build"]
mode = a[0]
if mode == "build":
    build()
elif mode == "preview":
    preview(os.path.abspath(a[1] if len(a) > 1 else os.path.join(DIR, "match", "preview.png")))
elif mode == "render":
    # Renders the saved, baked bench (run with --blend assets/scene/blend/bench.blend).
    render_views(os.path.abspath(a[1] if len(a) > 1 else os.path.join(DIR, "match", "baked.png")))
elif mode == "export":
    export()
else:
    common.fail(f"Unknown mode {mode}: use build, preview, render or export.")
