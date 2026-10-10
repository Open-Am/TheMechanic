"""Shared modelling helpers for the Blender scripts (plan 0005, plan 0006): materials, primitives in glTF
coordinates, outlines, booleans and joining. Imported by block.py and model.py.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

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


# ---- Outlines, prisms and booleans (plan 0006) ----

def hull(points):
    """Convex hull of 2D points, counter-clockwise (Andrew's monotone chain)."""
    pts = sorted(set((round(x, 6), round(y, 6)) for x, y in points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def circle_points(cx, cy, r, n=32, start=0.0, end=2 * math.pi):
    return [(cx + r * math.cos(start + (end - start) * i / n), cy + r * math.sin(start + (end - start) * i / n)) for i in range(n + 1)]


def rounded_rect_points(x0, y0, x1, y1, r, n=6):
    pts = []
    for cx, cy, a0 in ((x1 - r, y1 - r, 0), (x0 + r, y1 - r, math.pi / 2), (x0 + r, y0 + r, math.pi), (x1 - r, y0 + r, 3 * math.pi / 2)):
        pts += circle_points(cx, cy, r, n, a0, a0 + math.pi / 2)
    return pts


def prism(outline, plane, near, far, material, bevel=0.0, segments=3):
    """Extrudes a 2D outline into a solid.

    plane 'zy': outline points are (glTF z, glTF y), extruded along glTF x from `near` to `far`.
    plane 'xy': points are (x, y), extruded along z. plane 'xz': points are (x, z), extruded along y.
    """
    def to_gl(u, v, w):
        if plane == "zy":
            return (w, v, u)
        if plane == "xy":
            return (u, v, w)
        return (u, w, v)  # 'xz'

    mesh = bpy.data.meshes.new("prism")
    bm = bmesh.new()
    a = [bm.verts.new(common.gl(*to_gl(u, v, near))) for u, v in outline]
    b = [bm.verts.new(common.gl(*to_gl(u, v, far))) for u, v in outline]
    n = len(outline)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([a[i], a[j], b[j], b[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("prism", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return _finish(obj, material)


def cut(target, cutters):
    """Boolean difference of every cutter from target, applied; the cutters are deleted."""
    for c in cutters:
        mod = target.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = c
        c.hide_set(True)
        bpy.ops.object.select_all(action="DESELECT")
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(c, do_unlink=True)
    return target


def add(target, others):
    """Boolean union of others into target, applied; the others are deleted."""
    for o in others:
        mod = target.modifiers.new("add", "BOOLEAN")
        mod.operation = "UNION"
        mod.solver = "EXACT"
        mod.object = o
        o.hide_set(True)
        bpy.ops.object.select_all(action="DESELECT")
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(o, do_unlink=True)
    return target
