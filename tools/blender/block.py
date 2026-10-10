"""Blocks out every part and base piece at real size from the references (plan 0005 step 4).

    node tools/run-blender.mjs tools/blender/block.py --blend assets/gen950/blend/gen950.blend [-- <id> <id> ...]

With no IDs it rebuilds everything. An object being rebuilt is deleted first; others are left alone.
Status after this script is `blocked`: real size and silhouette, in place, named right. Not finished.

Sizes come from docs/reference/visual-references.md. Layout, facing the control panel (front, +Z in glTF):
recoil starter on the right (+X), alternator end on the left (-X), cylinder, spark plug and muffler at the back,
blue tank on top. All positions below are glTF metres (Y up, origin at the base centre on the ground);
common.gl converts them to Blender.

Prints a JSON line "BOUNDS {...}" with each object's centre and size in glTF axes, used to keep the placeholders
in machine.json in step with the model.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()

# ---- Materials (modelling brief starting values) ----

_materials = {}


def mat(name, hex_colour, metallic=0.0, roughness=0.6):
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    h = hex_colour.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    bsdf.inputs["Base Color"].default_value = (*linear, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    m.diffuse_color = (*linear, 1)
    _materials[name] = m
    return m


def materials():
    return {
        "tank_paint": mat("tank_paint", "#2456b4", 0.0, 0.42),
        "black_plastic": mat("black_plastic", "#1b1b1b", 0.0, 0.62),
        "black_steel": mat("black_steel", "#1f1f21", 0.2, 0.55),
        "rubber": mat("rubber", "#121212", 0.0, 0.85),
        "cast_aluminium": mat("cast_aluminium", "#a7a8aa", 1.0, 0.52),
        "engine_aluminium": mat("engine_aluminium", "#8a8f94", 1.0, 0.58),
        "bright_metal": mat("bright_metal", "#c9c9c4", 1.0, 0.3),
        "zinc": mat("zinc", "#b9b39a", 1.0, 0.35),
        "brass": mat("brass", "#b08d57", 1.0, 0.35),
        "exhaust": mat("exhaust", "#26262a", 0.6, 0.72),
        "slot": mat("slot", "#0a0a0a", 0.0, 0.9),
        "ceramic": mat("ceramic", "#ece8df", 0.0, 0.22),
        "foam": mat("foam", "#d9c27a", 0.0, 0.92),
        "capacitor": mat("capacitor", "#e8e2cf", 0.0, 0.5),
        "socket_blue": mat("socket_blue", "#2f6fc9", 0.0, 0.5),
        "label": mat("label", "#d8d6cf", 0.0, 0.7),
        "switch_red": mat("switch_red", "#b3261e", 0.0, 0.4),
    }


# ---- Primitive helpers, in glTF coordinates ----

def _finish(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def box(size, centre, material, bevel=0.0, segments=2):
    """A box of size (sx, sy, sz) centred at `centre`, glTF axes. Optional bevel on every edge."""
    sx, sy, sz = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=common.gl(*centre))
    obj = bpy.context.active_object
    obj.scale = (sx, sz, sy)  # glTF (x, y, z) sizes are Blender (x, z, y)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = min(bevel, min(size) / 2 - 1e-4)
        mod.segments = segments
        mod.limit_method = "NONE"
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return _finish(obj, material)


def cyl(radius, length, centre, axis, material, verts=24, tilt=None):
    """A cylinder along a glTF axis ('x', 'y' or 'z'). `tilt` = (blender_axis, degrees) rotates it further."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=length, location=common.gl(*centre))
    obj = bpy.context.active_object
    if axis == "x":
        obj.rotation_euler = (0, math.radians(90), 0)
    elif axis == "z":
        obj.rotation_euler = (math.radians(90), 0, 0)
    if tilt:
        rot = list(obj.rotation_euler)
        rot["XYZ".index(tilt[0])] += math.radians(tilt[1])
        obj.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return _finish(obj, material)


def tube(points, radius, material, resolution=6):
    """A round tube along a path of glTF points (a hose, a handle)."""
    curve = bpy.data.curves.new("tube", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, p in zip(spline.bezier_points, points):
        bp.co = common.gl(*p)
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    spline.resolution_u = resolution
    obj = bpy.data.objects.new("tube", curve)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    return _finish(obj, material)


def rotate_about(obj, gl_axis, degrees, pivot):
    """Rotates an object's mesh about a glTF axis through a glTF pivot point."""
    bl_axis = {"x": "X", "y": "Z", "z": "Y"}[gl_axis]
    sign = -1 if gl_axis == "z" else 1
    from mathutils import Matrix

    p = Vector(common.gl(*pivot))
    m = Matrix.Translation(p) @ Matrix.Rotation(math.radians(degrees * sign), 4, bl_axis) @ Matrix.Translation(-p)
    obj.data.transform(obj.matrix_world.inverted() @ m @ obj.matrix_world)
    return obj


def join(objs, name, collection):
    """Joins pieces into one object named `name`, origin at its bounds centre, transforms applied."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    # Smooth shading with an angle limit keeps hard edges hard and round things round.
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(35))
    return obj


# ---- The parts ----

def build(M):
    """Returns {object_id: (collection_name, [pieces])}."""
    o = {}

    # Fuel tank: the blue shell that is also the lid, about 330 x 279 mm in plan, 127 mm deep, with handle and cap.
    tank = [
        box((0.33, 0.115, 0.279), (0.0, 0.2805, 0.0), M["tank_paint"], bevel=0.028, segments=4),
        box((0.336, 0.012, 0.285), (0.0, 0.224, 0.0), M["tank_paint"], bevel=0.004),  # rolled lip at the bottom edge
        cyl(0.036, 0.012, (0.0, 0.344, 0.035), "y", M["tank_paint"], verts=32),  # filler neck
        cyl(0.034, 0.012, (0.0, 0.354, 0.035), "y", M["bright_metal"], verts=32),  # filler cap
        tube([(-0.105, 0.336, -0.06), (-0.098, 0.368, -0.06), (0.0, 0.374, -0.06), (0.098, 0.368, -0.06), (0.105, 0.336, -0.06)], 0.011, M["black_plastic"]),
    ]
    o["fuel_tank"] = ("parts", tank)

    # Recoil starter: black pressed-steel cover on the right, about 290 x 200 mm, radial vents, T-handle at the front.
    rc = (0.176, 0.14, -0.01)
    recoil = [
        box((0.05, 0.20, 0.29), (0.15, 0.14, 0.0), M["black_steel"], bevel=0.02, segments=3),
        cyl(0.09, 0.012, rc, "x", M["black_steel"], verts=40),
    ]
    for i in range(18):
        slot = box((0.004, 0.034, 0.006), (0.183, rc[1] + 0.058, rc[2]), M["slot"])
        rotate_about(slot, "x", i * 20, rc)
        recoil.append(slot)
    recoil += [
        cyl(0.004, 0.03, (0.19, 0.105, 0.125), "x", M["rubber"], verts=8),  # cord
        cyl(0.01, 0.075, (0.207, 0.105, 0.125), "z", M["black_plastic"], verts=12),  # T-handle
    ]
    o["recoil_starter"] = ("parts", recoil)

    # Muffler: black steel box about 160 x 110 mm at the back, with a slotted heat shield and an outlet.
    mf = [
        box((0.15, 0.11, 0.05), (-0.07, 0.11, -0.12), M["exhaust"], bevel=0.008),
        box((0.155, 0.115, 0.004), (-0.07, 0.11, -0.148), M["exhaust"], bevel=0.0015),
        cyl(0.012, 0.025, (-0.155, 0.075, -0.12), "x", M["exhaust"], verts=16),
    ]
    for row in range(3):
        for col in range(5):
            mf.append(box((0.018, 0.008, 0.003), (-0.125 + col * 0.027, 0.08 + row * 0.03, -0.1505), M["slot"]))
    o["muffler"] = ("parts", mf)

    # Alternator end cover: raw die-cast disc on the left with a cross of four slots.
    ac = (-0.17, 0.135, -0.005)
    acov = [
        cyl(0.086, 0.018, ac, "x", M["cast_aluminium"], verts=40),
        box((0.004, 0.11, 0.012), (-0.18, ac[1], ac[2]), M["slot"]),
        box((0.004, 0.012, 0.11), (-0.18, ac[1], ac[2]), M["slot"]),
    ]
    o["alternator_cover"] = ("parts", acov)

    # Capacitor: a round cream can inside the alternator end, behind the cover (location unconfirmed).
    cap = [
        cyl(0.017, 0.05, (-0.14, 0.135, 0.0), "z", M["capacitor"], verts=16),
        box((0.004, 0.006, 0.004), (-0.146, 0.135, 0.027), M["brass"]),
        box((0.004, 0.006, 0.004), (-0.134, 0.135, 0.027), M["brass"]),
    ]
    o["capacitor"] = ("parts", cap)

    # Air filter cover: the lower front door, black plastic with two bolts.
    door = [
        box((0.17, 0.075, 0.006), (0.06, 0.085, 0.159), M["black_plastic"], bevel=0.003),
        cyl(0.007, 0.006, (0.0, 0.085, 0.164), "z", M["zinc"], verts=6),
        cyl(0.007, 0.006, (0.12, 0.085, 0.164), "z", M["zinc"], verts=6),
        box((0.03, 0.012, 0.002), (0.035, 0.085, 0.1625), M["slot"]),
    ]
    o["air_filter_cover"] = ("parts", door)

    # Air filter: a foam block behind the door.
    o["air_filter"] = ("parts", [box((0.10, 0.05, 0.02), (0.07, 0.085, 0.142), M["foam"], bevel=0.004)])

    # Carburetor: aluminium body, round float bowl, flange, brass inlet.
    carb = [
        box((0.045, 0.04, 0.035), (0.03, 0.095, 0.115), M["cast_aluminium"], bevel=0.004),
        cyl(0.017, 0.022, (0.03, 0.064, 0.115), "y", M["bright_metal"], verts=24),
        box((0.044, 0.03, 0.004), (0.03, 0.095, 0.101), M["cast_aluminium"]),
        cyl(0.003, 0.016, (0.0, 0.105, 0.115), "x", M["brass"], verts=8),
    ]
    o["carburetor"] = ("parts", carb)

    # Fuel tap: cast silver body under the tank at the front left, with an ON/OFF lever.
    tap = [
        box((0.025, 0.03, 0.025), (-0.06, 0.2, 0.125), M["bright_metal"], bevel=0.003),
        box((0.03, 0.004, 0.012), (-0.06, 0.2, 0.14), M["bright_metal"]),
        cyl(0.004, 0.014, (-0.06, 0.18, 0.125), "y", M["bright_metal"], verts=8),
    ]
    o["fuel_tap"] = ("parts", tap)

    # Fuel hose: black rubber, about 6 mm bore, from the tap down to the carburetor's brass inlet.
    o["fuel_hose"] = ("parts", [tube([(-0.06, 0.174, 0.125), (-0.056, 0.14, 0.132), (-0.045, 0.108, 0.13), (-0.02, 0.1, 0.122), (-0.006, 0.105, 0.115)], 0.0055, M["rubber"])])

    # Spark plug: 14 mm plug, about 80 mm, leaning up and back out of the head, under the tank's rear overhang.
    tilt = ("X", -45)
    sp = [
        cyl(0.0105, 0.012, (0.06, 0.196, -0.141), "y", M["bright_metal"], verts=6, tilt=tilt),  # hex
        cyl(0.007, 0.03, (0.06, 0.212, -0.157), "y", M["ceramic"], verts=16, tilt=tilt),  # insulator
    ]
    o["spark_plug"] = ("parts", sp)

    # Plug cap: black rubber boot on the end of the plug.
    o["plug_cap"] = ("parts", [cyl(0.011, 0.03, (0.06, 0.228, -0.173), "y", M["rubber"], verts=16, tilt=tilt)])

    # ---- Base: never comes off ----

    frame = [box((0.30, 0.012, 0.24), (0.0, 0.04, 0.0), M["black_steel"], bevel=0.004)]
    for x in (-0.13, 0.13):
        for z in (-0.1, 0.1):
            frame.append(cyl(0.018, 0.034, (x, 0.017, z), "y", M["rubber"], verts=16))
    o["base_frame"] = ("base", frame)

    o["base_alternator"] = (
        "base",
        [
            cyl(0.085, 0.11, (-0.105, 0.135, -0.005), "x", M["cast_aluminium"], verts=40),
            box((0.09, 0.03, 0.15), (-0.105, 0.05, -0.005), M["cast_aluminium"], bevel=0.005),
        ],
    )

    engine = [
        box((0.16, 0.14, 0.17), (0.04, 0.12, 0.005), M["engine_aluminium"], bevel=0.012),
        cyl(0.038, 0.06, (0.05, 0.15, -0.11), "z", M["engine_aluminium"], verts=24),
        box((0.11, 0.055, 0.08), (0.05, 0.185, -0.11), M["black_plastic"], bevel=0.008),
    ]
    for i in range(6):
        engine.append(cyl(0.056, 0.004, (0.05, 0.15, -0.084 - i * 0.01), "z", M["engine_aluminium"], verts=24))
    o["base_engine"] = ("base", engine)

    panel = [
        box((0.18, 0.09, 0.06), (0.06, 0.17, 0.126), M["black_plastic"], bevel=0.004),
        box((0.18, 0.085, 0.006), (0.06, 0.085, 0.098), M["black_plastic"]),
        box((0.18, 0.006, 0.06), (0.06, 0.045, 0.126), M["black_plastic"]),
        box((0.006, 0.085, 0.06), (-0.027, 0.085, 0.126), M["black_plastic"]),
        box((0.006, 0.085, 0.06), (0.147, 0.085, 0.126), M["black_plastic"]),
        box((0.045, 0.045, 0.006), (0.0, 0.17, 0.158), M["socket_blue"], bevel=0.004),
        box((0.05, 0.04, 0.002), (0.06, 0.177, 0.157), M["label"]),
        cyl(0.005, 0.004, (0.06, 0.145, 0.157), "z", M["switch_red"], verts=12),
        box((0.014, 0.022, 0.006), (0.12, 0.185, 0.158), M["switch_red"], bevel=0.002),
        box((0.03, 0.008, 0.003), (0.12, 0.15, 0.157), M["slot"]),
    ]
    o["base_panel"] = ("base", panel)
    return o


def main():
    machine = common.load_machine()
    part_ids, base_ids = common.object_ids(machine)
    wanted = common.args() or part_ids + base_ids
    unknown = [w for w in wanted if w not in part_ids + base_ids]
    if unknown:
        common.fail(f"Unknown IDs: {', '.join(unknown)}")

    for name in wanted:
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)

    M = materials()
    spec = build(M)
    missing = [i for i in part_ids + base_ids if i not in spec]
    if missing:
        common.fail(f"No block-out for: {', '.join(missing)}")

    bounds = {}
    for name in wanted:
        col_name, pieces = spec[name]
        obj = join(pieces, name, bpy.data.collections[col_name])
        # Bounds in glTF axes: Blender (x, y, z) -> glTF (x, z, -y).
        corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        xs = [c.x for c in corners]
        ys = [c.z for c in corners]
        zs = [-c.y for c in corners]
        bounds[name] = {
            "centre": [round((min(v) + max(v)) / 2, 4) for v in (xs, ys, zs)],
            "size": [round(max(v) - min(v), 4) for v in (xs, ys, zs)],
            "triangles": common.triangle_count(obj),
        }
    # Leave nothing stray behind from helpers.
    for obj in list(bpy.context.scene.collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.wm.save_mainfile()
    print("BOUNDS " + json.dumps(bounds))
    total = sum(b["triangles"] for b in bounds.values())
    print(f"Blocked {len(wanted)} objects, {total} triangles.")


main()
