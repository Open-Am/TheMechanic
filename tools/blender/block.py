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
from shapes import box, cyl, join, materials, rotate_about, tube  # noqa: E402

common.check_version()

# ---- The parts ----

def build(M):
    """Returns {object_id: (collection_name, [pieces])}."""
    o = {}

    # Fuel tank: the blue shell that is also the lid, about 330 x 285 mm in plan. Only about 85 mm of it shows above the
    # body; it has nearly straight sides, tight top edges, a flared lip, an upright handle and a big silver cap.
    tank = [
        box((0.33, 0.085, 0.285), (0.0, 0.2875, 0.0), M["tank_paint"], bevel=0.016, segments=4),
        box((0.338, 0.01, 0.292), (0.0, 0.248, 0.0), M["tank_paint"], bevel=0.004),  # flared lip at the bottom edge
        cyl(0.041, 0.01, (0.0, 0.334, 0.06), "y", M["tank_paint"], verts=32),  # filler neck
        cyl(0.038, 0.014, (0.0, 0.344, 0.06), "y", M["bright_metal"], verts=32),  # filler cap
        tube([(-0.06, 0.326, -0.02), (-0.06, 0.362, -0.02), (-0.045, 0.374, -0.02), (0.045, 0.374, -0.02), (0.06, 0.362, -0.02), (0.06, 0.326, -0.02)], 0.012, M["black_plastic"]),
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
    ac = (-0.171, 0.135, -0.01)
    acov = [
        cyl(0.086, 0.018, ac, "x", M["cast_aluminium"], verts=40),
        box((0.004, 0.11, 0.012), (-0.181, ac[1], ac[2]), M["slot"]),
        box((0.004, 0.012, 0.11), (-0.181, ac[1], ac[2]), M["slot"]),
    ]
    o["alternator_cover"] = ("parts", acov)

    # Capacitor: a round cream can inside the alternator end, behind the cover (location unconfirmed).
    cap = [
        cyl(0.017, 0.05, (-0.14, 0.135, -0.01), "z", M["capacitor"], verts=16),
        box((0.004, 0.006, 0.004), (-0.146, 0.135, 0.017), M["brass"]),
        box((0.004, 0.006, 0.004), (-0.134, 0.135, 0.017), M["brass"]),
    ]
    o["capacitor"] = ("parts", cap)

    # Air filter cover: the lower front door across nearly the whole front, black plastic, two bolts, three holes.
    door = [
        box((0.25, 0.09, 0.006), (-0.025, 0.1, 0.158), M["black_plastic"], bevel=0.004),
        cyl(0.007, 0.006, (-0.1, 0.1, 0.163), "z", M["zinc"], verts=6),
        cyl(0.007, 0.006, (0.03, 0.1, 0.163), "z", M["zinc"], verts=6),
        cyl(0.005, 0.002, (-0.075, 0.1, 0.1615), "z", M["slot"], verts=12),
        cyl(0.005, 0.002, (-0.06, 0.1, 0.1615), "z", M["slot"], verts=12),
        box((0.04, 0.012, 0.002), (0.07, 0.1, 0.1615), M["slot"]),
    ]
    o["air_filter_cover"] = ("parts", door)

    # Air filter: a foam block behind the door, in front of the carburetor.
    o["air_filter"] = ("parts", [box((0.10, 0.05, 0.02), (-0.06, 0.1, 0.142), M["foam"], bevel=0.004)])

    # Carburetor: aluminium body, round float bowl, flange, brass inlet facing left towards the hose.
    carb = [
        box((0.045, 0.04, 0.035), (-0.075, 0.108, 0.117), M["cast_aluminium"], bevel=0.004),
        cyl(0.017, 0.022, (-0.075, 0.077, 0.117), "y", M["bright_metal"], verts=24),
        box((0.044, 0.03, 0.004), (-0.075, 0.108, 0.102), M["cast_aluminium"]),
        cyl(0.003, 0.016, (-0.105, 0.112, 0.117), "x", M["brass"], verts=8),
    ]
    o["carburetor"] = ("parts", carb)

    # Fuel tap: cast silver body under the tank's left front corner, lever facing out to the left (position unconfirmed).
    tap = [
        box((0.022, 0.03, 0.025), (-0.172, 0.228, 0.11), M["bright_metal"], bevel=0.003),
        box((0.004, 0.012, 0.03), (-0.185, 0.228, 0.11), M["bright_metal"]),
        cyl(0.004, 0.014, (-0.172, 0.207, 0.11), "y", M["bright_metal"], verts=8),
    ]
    o["fuel_tap"] = ("parts", tap)

    # Fuel hose: black rubber, about 6 mm bore, down the left side and into the filter compartment to the carburetor.
    o["fuel_hose"] = ("parts", [tube([(-0.172, 0.2, 0.11), (-0.176, 0.165, 0.118), (-0.172, 0.13, 0.122), (-0.15, 0.113, 0.12), (-0.113, 0.112, 0.117)], 0.0055, M["rubber"])])

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

    frame = [box((0.30, 0.012, 0.24), (0.0, 0.052, 0.0), M["black_steel"], bevel=0.004)]
    for x in (-0.13, 0.13):
        for z in (-0.105, 0.105):
            frame.append(cyl(0.022, 0.046, (x, 0.023, z), "y", M["rubber"], verts=20))
    o["base_frame"] = ("base", frame)

    o["base_alternator"] = (
        "base",
        [
            cyl(0.085, 0.11, (-0.105, 0.135, -0.01), "x", M["cast_aluminium"], verts=40),
            box((0.09, 0.03, 0.15), (-0.105, 0.062, -0.01), M["cast_aluminium"], bevel=0.005),
        ],
    )

    engine = [
        box((0.15, 0.15, 0.17), (0.035, 0.13, 0.005), M["engine_aluminium"], bevel=0.012),
        cyl(0.038, 0.06, (0.055, 0.155, -0.11), "z", M["engine_aluminium"], verts=24),
        box((0.11, 0.055, 0.08), (0.055, 0.19, -0.11), M["black_plastic"], bevel=0.008),
    ]
    for i in range(6):
        engine.append(cyl(0.056, 0.004, (0.055, 0.155, -0.084 - i * 0.01), "z", M["engine_aluminium"], verts=24))
    o["base_engine"] = ("base", engine)

    # The black panel box spans almost the whole front: upper panel with socket, label, breaker, switch and choke,
    # and the lower compartment behind the door.
    panel = [
        box((0.28, 0.09, 0.06), (-0.025, 0.2, 0.125), M["black_plastic"], bevel=0.006),
        box((0.28, 0.105, 0.006), (-0.025, 0.1025, 0.098), M["black_plastic"]),
        box((0.28, 0.006, 0.06), (-0.025, 0.055, 0.125), M["black_plastic"]),
        box((0.006, 0.105, 0.06), (-0.162, 0.1025, 0.125), M["black_plastic"]),
        box((0.006, 0.105, 0.06), (0.112, 0.1025, 0.125), M["black_plastic"]),
        cyl(0.022, 0.006, (-0.11, 0.2, 0.156), "z", M["black_steel"], verts=24),  # socket
        cyl(0.016, 0.002, (-0.11, 0.2, 0.1595), "z", M["slot"], verts=24),
        box((0.075, 0.06, 0.002), (-0.025, 0.205, 0.1555), M["label"]),
        cyl(0.004, 0.004, (-0.05, 0.168, 0.156), "z", M["switch_red"], verts=12),  # breaker reset
        box((0.016, 0.024, 0.006), (0.065, 0.215, 0.157), M["switch_red"], bevel=0.002),  # engine switch
        box((0.04, 0.008, 0.003), (0.065, 0.175, 0.1565), M["slot"]),  # choke slot
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
