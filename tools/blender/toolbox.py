"""The mechanic's toolbox beside the generator (plan 0012, ADR 0021).

    node tools/run-blender.mjs tools/blender/toolbox.py -- build            # model, bake, save assets/toolbox/blend/toolbox.blend
    node tools/run-blender.mjs tools/blender/toolbox.py -- preview <out.png> # model without baking and render it, for tuning
    node tools/run-blender.mjs tools/blender/toolbox.py --blend assets/toolbox/blend/toolbox.blend -- export   # validate, export

A red-painted steel cantilever toolbox, open: the body, two trays swung out front and back on their arms, the two lids
hanging open beyond them, and the carrying handle over the middle. Worn: chipped paint, rust at the edges, grease. A few
things in it that the player never uses (a wire brush, sockets), so it reads as a working box.

One root node `toolbox` (glTF axes, metres): origin on the ground under the middle of the body, the long side along X,
the front tray towards +Z. Under it, two empty nodes where the tools rest, each turned so a tool
placed with the empty's transform lies in it. They lie side by side in the back tray, which the game turns towards the
machine, so from the default camera they show just under the machine:

- `slot_spanner`: the spanner's jaw centre; its local Z (the bolt axis) points up, its handle along +X.
- `slot_screwdriver`: the screwdriver's tip; its shaft (local +Z) runs along -X.

Scenery only (ADR 0021): no part of the game picks it. Made by script from our own materials; reference photos of real
toolboxes are for matching only and never committed (ADR 0013).
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from shapes import box, cut, cyl, join, mat, rotate_about, tube  # noqa: E402

common.check_version()
DIR = os.path.join(common.ROOT, "assets", "toolbox")
BLEND = os.path.join(DIR, "blend", "toolbox.blend")
EXPORT = os.path.join(DIR, "export", "toolbox.glb")
BUDGET = common.BUDGETS["toolbox"]
SLOTS = ("slot_spanner", "slot_screwdriver")

# Dimensions, metres (glTF axes: X long side, Y up, Z front).
W = 0.36  # body length
BODY_H = 0.11
BODY_D = 0.18
WALL = 0.003
TRAY_W = 0.34
TRAY_H = 0.05
TRAY_D = 0.09
TRAY_Y = 0.12  # tray bottom, open
TRAY_Z = 0.12  # tray centre, either side
LID_D = 0.085
HANDLE_Y = 0.19


def materials():
    return {
        "paint": mat("toolbox_red", "#b3241b", 0.15, 0.45),
        "rubber": mat("rubber", "#121212", 0.0, 0.85),
        "chrome": mat("chrome", "#c9ccd0", 1.0, 0.25),
        "wood": mat("wood", "#8a5a32", 0.0, 0.7),
        "wire": mat("wire", "#8d8b86", 1.0, 0.45),
    }


def open_box(size, centre, material, bevel=0.003):
    """A thin-walled box open at the top, glTF axes."""
    sx, sy, sz = size
    outer = box(size, centre, material, bevel=bevel, segments=1)
    inner = box((sx - 2 * WALL, sy, sz - 2 * WALL), (centre[0], centre[1] + WALL, centre[2]), material)
    return cut(outer, [inner])


def bar(p0, p1, width, thick, material):
    """A flat bar in the YZ plane from glTF point p0 to p1, `thick` along X (a cantilever arm)."""
    (x, y0, z0), (_, y1, z1) = p0, p1
    length = math.hypot(y1 - y0, z1 - z0)
    b = box((thick, width, length + width), (x, (y0 + y1) / 2, (z0 + z1) / 2), material, bevel=0.0015, segments=1)
    # The box lies along Z; turn it about X to run from p0 to p1.
    rotate_about(b, "x", -math.degrees(math.atan2(y1 - y0, z1 - z0)), (x, (y0 + y1) / 2, (z0 + z1) / 2))
    return b


def rivet(at, material):
    return cyl(0.0035, 0.004, at, "x", material, verts=6)


def body_parts(M):
    parts = [open_box((W, BODY_H, BODY_D), (0, BODY_H / 2 + 0.006, 0), M["paint"])]
    # Rubber feet, a pressed bead along each long side, and the hasp at the front.
    for x in (-W / 2 + 0.03, W / 2 - 0.03):
        for z in (-BODY_D / 2 + 0.025, BODY_D / 2 - 0.025):
            parts.append(box((0.025, 0.006, 0.02), (x, 0.003, z), M["rubber"]))
    for z in (BODY_D / 2 + 0.001, -BODY_D / 2 - 0.001):
        parts.append(box((W - 0.03, 0.006, 0.003), (0, 0.045, z), M["paint"]))
    parts.append(box((0.036, 0.03, 0.004), (0, BODY_H - 0.012, BODY_D / 2 + 0.003), M["chrome"]))
    parts.append(cyl(0.004, 0.012, (0, BODY_H - 0.002, BODY_D / 2 + 0.006), "x", M["chrome"], verts=6))
    return parts


def tray_parts(M, side):
    z = side * TRAY_Z
    parts = [open_box((TRAY_W, TRAY_H, TRAY_D), (0, TRAY_Y + TRAY_H / 2, z), M["paint"])]
    parts.append(box((WALL, TRAY_H - 0.012, TRAY_D - 2 * WALL), (0.13, TRAY_Y + TRAY_H / 2 - 0.004, z), M["paint"]))  # divider
    # The lid, hinged on the tray's outer top edge and hanging open, sloping down and out.
    hinge = (0, TRAY_Y + TRAY_H, z + side * TRAY_D / 2)
    lid = box((TRAY_W + 0.006, 0.004, LID_D), (0, hinge[1], hinge[2] + side * LID_D / 2), M["paint"], bevel=0.0015, segments=1)
    lip = box((TRAY_W + 0.006, 0.012, 0.004), (0, hinge[1] - 0.006, hinge[2] + side * LID_D), M["paint"])
    for piece in (lid, lip):
        rotate_about(piece, "x", side * 35, hinge)
    parts += [lid, lip, cyl(0.004, TRAY_W, hinge, "x", M["paint"], verts=6)]
    return parts


def arm_parts(M):
    parts = []
    for x in (-W / 2 - 0.004, W / 2 + 0.004):
        for side in (1, -1):
            # Two arms per tray per end, a parallelogram from the body's top to the tray's end.
            for dz in (-0.03, 0.03):
                p0 = (x, BODY_H - 0.015, side * 0.05 + dz)
                p1 = (x, TRAY_Y + 0.02, side * TRAY_Z + dz)
                parts.append(bar(p0, p1, 0.014, 0.004, M["paint"]))
                parts += [rivet(p0, M["chrome"]), rivet(p1, M["chrome"])]
        # The handle's end post, from the inner arms' pivots up to the grip.
        parts.append(box((0.004, HANDLE_Y - BODY_H + 0.02, 0.018), (x, (HANDLE_Y + BODY_H) / 2 - 0.005, 0), M["paint"], bevel=0.0015, segments=1))
        parts.append(rivet((x, BODY_H - 0.01, 0), M["chrome"]))
    # The carrying handle: a tube along the top, worn bare where hands hold it.
    parts.append(cyl(0.011, W - 0.02, (0, HANDLE_Y, 0), "x", M["paint"], verts=10))
    parts.append(cyl(0.0115, 0.12, (0, HANDLE_Y, 0), "x", M["rubber"], verts=10))
    return parts


def contents(M):
    """Things in the box the player never uses: a wire brush in the body, sockets in the front tray. (The rag, a
    subdivided cube that read as a grey blob at game size, was taken out in release 0.11.1.)"""
    parts = []
    # A wire brush lying across the body.
    handle = box((0.16, 0.014, 0.024), (0.08, BODY_H - 0.03, 0.025), M["wood"], bevel=0.005, segments=1)
    bristles = box((0.06, 0.016, 0.02), (0.03, BODY_H - 0.045, 0.025), M["wire"])
    for piece in (handle, bristles):
        rotate_about(piece, "y", 12, (0.08, 0, 0.025))
    parts += [handle, bristles]
    # Three sockets standing in the front tray, a fourth lying in its end compartment.
    for i, x in enumerate((-0.15, -0.125, -0.1)):
        s = cyl(0.009 + 0.0015 * i, 0.022, (x, TRAY_Y + WALL + 0.011, TRAY_Z), "y", M["chrome"], verts=10)
        cut(s, [cyl(0.0055 + 0.0012 * i, 0.03, (x, TRAY_Y + 0.03, TRAY_Z), "y", M["chrome"], verts=6)])
        parts.append(s)
    parts.append(cyl(0.01, 0.024, (0.13 + 0.015, TRAY_Y + WALL + 0.01, TRAY_Z - 0.01), "z", M["chrome"], verts=10))
    return parts


# Where the tools rest in the back tray (glTF), and their axes: see the module docstring.
FLOOR = TRAY_Y + WALL
SLOT_POSES = {
    "slot_spanner": ((-0.07, FLOOR + 0.003, -TRAY_Z - 0.02), (1, 0, 0), (0, 0, -1), (0, 1, 0)),
    "slot_screwdriver": ((0.09, FLOOR + 0.0132, -TRAY_Z + 0.02), (0, 0, 1), (0, 1, 0), (-1, 0, 0)),
}

# glTF axes from Blender axes: gl = C @ bl.
C = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))


def slot_matrix(name):
    """The slot's world matrix in Blender axes, from its glTF position and axes."""
    pos, x, y, z = SLOT_POSES[name]
    r_gl = Matrix(((x[0], y[0], z[0]), (x[1], y[1], z[1]), (x[2], y[2], z[2])))
    return Matrix.Translation(Vector(common.gl(*pos))) @ (C.inverted() @ r_gl @ C).to_4x4()


def place_slots(parent):
    """Puts each slot empty under the toolbox at its pose. The parent's matrix must be current, so update first."""
    bpy.context.view_layer.update()
    for name in SLOTS:
        empty = bpy.data.objects.get(name)
        if empty is None:
            empty = bpy.data.objects.new(name, None)
            empty.empty_display_type = "ARROWS"
            empty.empty_display_size = 0.03
            common.ensure_collection("toolbox").objects.link(empty)
        empty.parent = parent
        empty.matrix_parent_inverse = Matrix.Identity(4)
        empty.matrix_world = slot_matrix(name)
    bpy.context.view_layer.update()


def smooth_orm(orm):
    """Softens the baked occlusion and roughness (a 3 x 3 box blur, twice): the sampling noise in them compresses badly and
    pushed the file over its 200 KB budget, and reads as grain at the size the toolbox is seen."""
    h, w = orm.shape[:2]
    for ch, _ in ((0, 1), (1, 1), (0, 2), (1, 2)):
        padded = np.pad(orm[:, :, ch], 1, mode="edge")
        orm[:, :, ch] = sum(padded[dy : dy + h, dx : dx + w] for dy in range(3) for dx in range(3)) / 9.0
    return orm


def model():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    M = materials()
    pieces = body_parts(M) + tray_parts(M, 1) + tray_parts(M, -1) + arm_parts(M) + contents(M)
    obj = join(pieces, "toolbox", common.ensure_collection("toolbox"))
    target = Vector((0, 0, 0))
    obj.data.transform(Matrix.Translation(obj.location - target))
    obj.location = target
    place_slots(obj)
    tris = common.triangle_count(obj)
    print(f"Toolbox: {tris} triangles (budget {BUDGET['triangles']})")
    if tris > BUDGET["triangles"]:
        common.fail(f"The toolbox has {tris} triangles, over its budget of {BUDGET['triangles']}.")
    return obj


def lookdev():
    """The game's light for match renders: its environment map, key sun and tone mapping (as scaffold.py does)."""
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
    plane = bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "ground"
    ground.data.materials.append(mat("ground", "#2a2723", 0.0, 0.9))


def build():
    model()
    import texture  # noqa: E402  (reused baker)

    texture.bake_groups({"toolbox": (BUDGET["texturePx"], ["toolbox"])}, os.path.join(DIR, "textures"), orm_filter=smooth_orm)
    lookdev()
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print(f"Saved {BLEND}")


def preview(out_path):
    model()
    lookdev()
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.angle_y = math.radians(30)
    scene.collection.objects.link(cam)
    scene.camera = cam
    for i, (az, polar) in enumerate(((1.0, 0.95), (2.4, 1.0), (-0.6, 0.7))):
        d = 1.1
        pos = (d * math.sin(polar) * math.sin(az), 0.12 + d * math.cos(polar), d * math.sin(polar) * math.cos(az))
        cam.location = common.gl(*pos)
        cam.rotation_euler = (Vector(common.gl(0, 0.12, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = out_path.replace(".png", f"-{i}.png")
        bpy.ops.render.render(write_still=True)
        print(f"Rendered {scene.render.filepath}")


def export():
    errors = []
    obj = bpy.data.objects.get("toolbox")
    if obj is None:
        common.fail("No object named toolbox; run toolbox.py -- build first.")
    slots = []
    for n in SLOTS:
        e = bpy.data.objects.get(n)
        if e is None or e.parent is not obj:
            errors.append(f"No empty {n} under the toolbox.")
        else:
            slots.append(e)
    tris = common.triangle_count(obj)
    if tris > BUDGET["triangles"]:
        errors.append(f"The toolbox has {tris} triangles, over its budget of {BUDGET['triangles']}.")
    if not any(s.material and s.material.name.startswith("baked_") for s in obj.material_slots):
        errors.append("The toolbox is not baked; run toolbox.py -- build.")
    if errors:
        for e in errors:
            print(f"error: {e}")
        sys.exit(1)
    place_slots(obj)  # the poses come from this script, so a tuned slot needs no rebake
    bpy.ops.object.select_all(action="DESELECT")
    for o in (obj, *slots):
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
    print(f"Validated the toolbox: {tris} triangles. Exported {EXPORT} ({os.path.getsize(EXPORT) / 1000:.1f} KB)")


a = common.args() or ["build"]
mode = a[0]
if mode == "build":
    build()
elif mode == "preview":
    preview(os.path.abspath(a[1] if len(a) > 1 else os.path.join(DIR, "match", "preview.png")))
elif mode == "export":
    export()
else:
    common.fail(f"Unknown mode {mode}: use build, preview or export.")
