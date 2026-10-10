"""Models parts towards the real machine (plan 0006, docs/design/modelling-brief.md).

    node tools/run-blender.mjs tools/blender/model.py --blend assets/gen950/blend/gen950.blend [-- <id> <id> ...]

Replaces the named objects (default: every part this script knows) with detailed versions: real outlines from the
references, pressed and cast forms, cut slots, bevels on every hard edge. Objects it does not know keep their block-out
from block.py. Positions follow the block-out, so machine.json placeholders stay in step.

What each part is based on is noted beside it. Status after this script is at most `modelled`; that needs a match
image too (ADR 0013). Prints "BOUNDS {...}" like block.py.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from shapes import add, box, circle_points, cut, cyl, hull, join, mat, materials, prism, rotate_about, rounded_rect_points, tube  # noqa: E402

common.check_version()


def bevelled(obj, width, segments=2, angle=35):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def disc(radius, thickness, centre, axis, material, verts=40, bevel=0.0):
    return bevelled(cyl(radius, thickness, centre, axis, material, verts=verts), bevel) if bevel else cyl(radius, thickness, centre, axis, material, verts=verts)


# ---- Recoil starter ----
# References: recoil_starter/*.jpg (290 x 200 mm cover, 180 mm vent ring, 83 mm reel), whole/tg950-*.
# A glossy black pressed-steel shell shaped like a rounded wedge: tall and round at the front around the reel,
# lower towards the back. A ring of 28 radial slots around a raised hub, four bolt ears, a T-handle by the reel.

def recoil_starter(M):
    dome = (0.04, 0.14)  # (z, y) of the reel centre
    outline = hull(circle_points(dome[0], dome[1], 0.1, 40) + rounded_rect_points(-0.145, 0.07, 0.0, 0.212, 0.026))
    shell = prism(outline, "zy", 0.122, 0.162, M["black_steel"], bevel=0.012, segments=3)
    # Open the shell where the vent ring is, so the slots show the reel behind.
    cut(shell, [cyl(0.084, 0.06, (0.16, dome[1], dome[0]), "x", M["slot"], verts=48)])

    ring = disc(0.088, 0.01, (0.165, dome[1], dome[0]), "x", M["black_steel"], verts=56, bevel=0.003)
    slots = []
    for i in range(28):
        s = box((0.03, 0.022, 0.0055), (0.165, dome[1] + 0.068, dome[0]), M["slot"])
        rotate_about(s, "x", i * 360 / 28, (0.165, dome[1], dome[0]))
        slots.append(s)
    cut(ring, slots)

    hub = disc(0.05, 0.012, (0.17, dome[1], dome[0]), "x", M["black_steel"], verts=40, bevel=0.005)
    reel = disc(0.082, 0.012, (0.152, dome[1], dome[0]), "x", mat("reel_plastic", "#d8cba8", 0.0, 0.55), verts=40)
    back = disc(0.084, 0.004, (0.143, dome[1], dome[0]), "x", M["slot"], verts=40)

    pieces = [shell, ring, hub, reel, back]
    for z, y in ((-0.13, 0.205), (-0.13, 0.077), (0.115, 0.232), (0.06, 0.045)):
        pieces.append(box((0.004, 0.022, 0.022), (0.124, y, z), M["black_steel"], bevel=0.003))
        pieces.append(cyl(0.0055, 0.006, (0.127, y, z), "x", M["zinc"], verts=6))
    # T-handle on its cord, just in front of the vent ring.
    pieces.append(cyl(0.0035, 0.03, (0.172, 0.13, 0.135), "x", M["rubber"], verts=8))
    grip = bevelled(box((0.022, 0.07, 0.018), (0.19, 0.13, 0.142), M["black_plastic"]), 0.006, 3)
    pieces.append(grip)
    return pieces


# ---- Fuel tank ----
# References: fuel_tank/*.jpg (330 x 279 mm, 127 mm deep), whole/tg950-*, wear/tiger-*-ipaja.
# A shallow pressed-steel lid with nearly straight sides, tight top edges and a flared lip; the top is pressed into
# raised panels separated by grooves. Big silver filler cap in the middle; an upright loop handle screwed at both ends.

def fuel_tank(M):
    plan = rounded_rect_points(-0.165, -0.1425, 0.165, 0.1425, 0.03, 6)
    shell = prism(plan, "xz", 0.245, 0.33, M["tank_paint"], bevel=0.014, segments=4)
    # Pressed grooves on the top, 2.5 mm deep: one across the width, one down the middle behind the handle.
    grooves = [
        box((0.27, 0.006, 0.006), (0.0, 0.3305, 0.012), M["tank_paint"]),
        box((0.006, 0.006, 0.11), (0.0, 0.3305, -0.09), M["tank_paint"]),
        box((0.006, 0.006, 0.06), (-0.11, 0.3305, 0.085), M["tank_paint"]),
        box((0.006, 0.006, 0.06), (0.11, 0.3305, 0.085), M["tank_paint"]),
    ]
    cut(shell, grooves)
    lip = prism(rounded_rect_points(-0.169, -0.1465, 0.169, 0.1465, 0.032, 6), "xz", 0.243, 0.252, M["tank_paint"], bevel=0.003, segments=2)

    neck = disc(0.044, 0.01, (0.0, 0.334, 0.06), "y", M["tank_paint"], verts=48, bevel=0.003)
    cap = disc(0.039, 0.013, (0.0, 0.344, 0.06), "y", M["bright_metal"], verts=48, bevel=0.003)
    knurls = []
    for i in range(24):
        k = box((0.004, 0.009, 0.003), (0.0, 0.344, 0.06 + 0.039), M["bright_metal"])
        rotate_about(k, "y", i * 15, (0.0, 0.344, 0.06))
        knurls.append(k)
    handle = tube([(-0.09, 0.33, -0.03), (-0.09, 0.358, -0.03), (-0.078, 0.374, -0.03), (0.078, 0.374, -0.03), (0.09, 0.358, -0.03), (0.09, 0.33, -0.03)], 0.012, M["black_plastic"], resolution=8)
    pads = [bevelled(box((0.03, 0.008, 0.03), (x, 0.333, -0.03), M["black_plastic"]), 0.003) for x in (-0.09, 0.09)]
    screws = [cyl(0.004, 0.003, (x, 0.3375, -0.03), "y", M["zinc"], verts=8) for x in (-0.09, 0.09)]
    return [shell, lip, neck, cap, *knurls, handle, *pads, *screws]


# ---- Muffler ----
# References: muffler/*.jpg (about 162 x 156 mm), wear/tiger-*-ipaja.
# A rounded black steel can with a flat heat shield over it: two columns of four pressed louvre slots, two bolt
# dimples. An angled inlet pipe with a two-slot flange towards the cylinder, and a spout at the far corner.

def muffler(M):
    can = bevelled(box((0.15, 0.11, 0.045), (-0.07, 0.12, -0.115), M["exhaust"]), 0.012, 3)
    shield = prism(rounded_rect_points(-0.149, 0.063, 0.009, 0.178, 0.008, 4), "xy", -0.141, -0.1445, M["exhaust"], bevel=0.0012, segments=1)
    cutters, hoods = [], []
    for col in (-0.11, -0.03):
        for row in range(4):
            y = 0.085 + row * 0.025
            cutters.append(box((0.044, 0.006, 0.02), (col, y, -0.143), M["slot"]))
            hoods.append(bevelled(box((0.048, 0.006, 0.004), (col, y + 0.005, -0.1465), M["exhaust"]), 0.0018, 2))
    cut(shield, cutters)
    dimples = [disc(0.007, 0.003, (x, 0.1225, -0.146), "z", M["exhaust"], verts=16, bevel=0.0012) for x in (-0.11, -0.03)]
    pipe = tube([(0.002, 0.13, -0.11), (0.018, 0.14, -0.106), (0.03, 0.15, -0.1)], 0.011, M["exhaust"], resolution=6)
    flange = bevelled(box((0.004, 0.032, 0.062), (0.033, 0.15, -0.1), M["exhaust"]), 0.002)
    spout = cyl(0.011, 0.02, (-0.152, 0.078, -0.118), "x", M["exhaust"], verts=16)
    mesh = disc(0.009, 0.002, (-0.163, 0.078, -0.118), "x", M["slot"], verts=16)
    return [can, shield, *hoods, *dimples, pipe, flange, spout, mesh]


# ---- Alternator end cover ----
# References: alternator_cover/*, whole/tg950-blue-black-with-alternator-cover-*.
# A raw die-cast aluminium end plate: a cross of four recessed slots around a centre boss, four bolts, and the
# green-yellow earth wire bolted at the top.

def alternator_cover(M):
    c = (-0.171, 0.135, -0.01)
    plate = disc(0.086, 0.016, c, "x", M["cast_aluminium"], verts=56, bevel=0.004)
    slots = []
    for angle in (0, 90, 180, 270):
        s = box((0.012, 0.036, 0.009), (c[0] - 0.008, c[1] + 0.045, c[2]), M["slot"])
        rotate_about(s, "x", angle, c)
        slots.append(s)
    cut(plate, slots)
    boss = disc(0.02, 0.008, (c[0] - 0.01, c[1], c[2]), "x", M["cast_aluminium"], verts=32, bevel=0.002)
    pieces = [plate, boss]
    for angle in (45, 135, 225, 315):
        b = cyl(0.0055, 0.005, (c[0] - 0.009, c[1] + 0.072, c[2]), "x", M["zinc"], verts=6)
        rotate_about(b, "x", angle, c)
        pieces.append(b)
    wire = mat("earth_wire", "#7fa63a", 0.0, 0.6)
    pieces.append(tube([(c[0] - 0.009, c[1] + 0.081, c[2] + 0.01), (c[0] - 0.012, c[1] + 0.084, c[2] + 0.03), (c[0] - 0.006, c[1] + 0.07, c[2] + 0.06)], 0.0022, wire, resolution=6))
    return pieces


BUILDERS = {
    "recoil_starter": ("parts", recoil_starter),
    "fuel_tank": ("parts", fuel_tank),
    "muffler": ("parts", muffler),
    "alternator_cover": ("parts", alternator_cover),
}


# ---- Spark plug and cap ----
# References: spark_plug/*, plug_cap/*, wear/tiger-*-ipaja (the plug leans up and back out of the shroud).
# A 14 mm plug about 80 mm long: steel hex and threaded body, white ribbed insulator, terminal nut.
# The cap is a right-angle black rubber boot on an HT lead that runs back down into the shroud.

PLUG_TILT = ("X", -45)
PLUG_DIR = (0.0, math.sqrt(0.5), -math.sqrt(0.5))  # glTF direction of the plug's axis, out of the head


def along(base, distance):
    return (base[0] + PLUG_DIR[0] * distance, base[1] + PLUG_DIR[1] * distance, base[2] + PLUG_DIR[2] * distance)


PLUG_BASE = (0.06, 0.188, -0.133)


def spark_plug(M):
    pieces = [
        cyl(0.006, 0.012, along(PLUG_BASE, 0.0), "y", M["bright_metal"], verts=12, tilt=PLUG_TILT),  # thread, showing
        cyl(0.0105, 0.01, along(PLUG_BASE, 0.011), "y", M["bright_metal"], verts=6, tilt=PLUG_TILT),  # hex
        cyl(0.0095, 0.002, along(PLUG_BASE, 0.0175), "y", M["bright_metal"], verts=24, tilt=PLUG_TILT),  # crimp
    ]
    for i in range(4):
        pieces.append(cyl(0.0068 - i * 0.0004, 0.004, along(PLUG_BASE, 0.022 + i * 0.0045), "y", M["ceramic"], verts=16, tilt=PLUG_TILT))
    pieces.append(cyl(0.0055, 0.012, along(PLUG_BASE, 0.044), "y", M["ceramic"], verts=16, tilt=PLUG_TILT))
    pieces.append(cyl(0.0035, 0.006, along(PLUG_BASE, 0.053), "y", M["bright_metal"], verts=8, tilt=PLUG_TILT))  # terminal
    return pieces


def plug_cap(M):
    end = along(PLUG_BASE, 0.05)
    boot = bevelled(cyl(0.011, 0.03, end, "y", M["rubber"], verts=16, tilt=PLUG_TILT), 0.003)
    elbow = disc(0.0105, 0.022, along(PLUG_BASE, 0.066), "x", M["rubber"], verts=16, bevel=0.003)
    lead = tube([(0.072, 0.236, -0.18), (0.095, 0.232, -0.176), (0.115, 0.215, -0.16), (0.115, 0.2, -0.145)], 0.0035, M["rubber"], resolution=6)
    return [boot, elbow, lead]


# ---- Carburetor ----
# References: carburetor/* (two-hole flange with holes about 37 mm apart, 16 mm bore, round float bowl).

def carburetor(M):
    c = (-0.075, 0.108, 0.117)
    body = bevelled(box((0.042, 0.036, 0.034), c, M["cast_aluminium"]), 0.004, 2)
    bore = disc(0.011, 0.012, (c[0], c[1] + 0.002, c[2] + 0.018), "z", M["cast_aluminium"], verts=20, bevel=0.002)
    cut(bore, [cyl(0.008, 0.02, (c[0], c[1] + 0.002, c[2] + 0.02), "z", M["slot"], verts=16)])
    bowl = disc(0.017, 0.022, (c[0], c[1] - 0.03, c[2]), "y", M["bright_metal"], verts=28, bevel=0.003)
    bolt = cyl(0.004, 0.006, (c[0], c[1] - 0.044, c[2]), "y", M["bright_metal"], verts=6)
    drain = cyl(0.002, 0.008, (c[0] + 0.016, c[1] - 0.034, c[2]), "x", M["brass"], verts=8)
    flange = bevelled(box((0.056, 0.024, 0.004), (c[0], c[1], c[2] - 0.019), M["cast_aluminium"]), 0.002)
    inlet = tube([(c[0] - 0.021, c[1] + 0.004, c[2]), (c[0] - 0.028, c[1] + 0.004, c[2]), (c[0] - 0.034, c[1] + 0.003, c[2])], 0.0028, M["brass"], resolution=4)
    choke = bevelled(box((0.03, 0.003, 0.008), (c[0] + 0.012, c[1] + 0.02, c[2] + 0.008), M["zinc"]), 0.001)
    screws = [cyl(0.0018, 0.012, (c[0] + dx, c[1] + 0.008, c[2] + 0.02), "z", M["brass"], verts=8) for dx in (-0.012, 0.012)]
    return [body, bore, bowl, bolt, drain, flange, inlet, choke, *screws]


# ---- Fuel tap ----
# References: fuel_tap/* (65 to 77 mm long, cast body, ON/OFF lever on two screws, side barb, strainer inside the tank).

def fuel_tap(M):
    c = (-0.172, 0.228, 0.11)
    body = bevelled(box((0.02, 0.028, 0.022), c, M["bright_metal"]), 0.003, 2)
    nut = cyl(0.011, 0.006, (c[0], c[1] + 0.016, c[2]), "y", M["bright_metal"], verts=6)
    lever = bevelled(box((0.003, 0.01, 0.034), (c[0] - 0.012, c[1] + 0.002, c[2] + 0.006), M["bright_metal"]), 0.0012)
    pivot = cyl(0.004, 0.004, (c[0] - 0.011, c[1] + 0.002, c[2]), "x", M["zinc"], verts=8)
    barb = cyl(0.0035, 0.016, (c[0], c[1] - 0.021, c[2]), "y", M["brass"], verts=8)
    return [body, nut, lever, pivot, barb]


# ---- Fuel hose ----

def fuel_hose(M):
    path = [(-0.172, 0.2, 0.11), (-0.176, 0.165, 0.118), (-0.172, 0.13, 0.122), (-0.15, 0.113, 0.12), (-0.113, 0.112, 0.117)]
    hose = tube(path, 0.0055, M["rubber"], resolution=8)
    clips = [disc(0.0068, 0.004, (-0.172, 0.197, 0.11), "y", M["zinc"], verts=12), disc(0.0068, 0.004, (-0.116, 0.112, 0.117), "x", M["zinc"], verts=12)]
    return [hose, *clips]


# ---- Capacitor ----
# References: capacitor/* and the Benco no-voltage video (a round cream can). Location unconfirmed.

def capacitor(M):
    c = (-0.14, 0.135, -0.01)
    can = disc(0.017, 0.046, c, "z", M["capacitor"], verts=24, bevel=0.002)
    cap_end = disc(0.0172, 0.004, (c[0], c[1], c[2] + 0.024), "z", M["black_plastic"], verts=24, bevel=0.001)
    terminals = [box((0.003, 0.006, 0.008), (c[0] + dx, c[1], c[2] + 0.03), M["brass"]) for dx in (-0.006, 0.006)]
    stud = cyl(0.0035, 0.008, (c[0], c[1], c[2] - 0.027), "z", M["zinc"], verts=8)
    return [can, cap_end, *terminals, stud]


# ---- Air filter and its cover ----
# References: air_filter/gg950-manual-img15 (a notched foam block), air_filter_cover/* and whole/sodifer-* (the lower door).

def air_filter_cover(M):
    door = prism(rounded_rect_points(-0.15, 0.056, 0.1, 0.144, 0.006, 3), "xy", 0.155, 0.161, M["black_plastic"], bevel=0.0025, segments=2)
    cutters = [cyl(0.0045, 0.02, (x, 0.1, 0.16), "z", M["slot"], verts=12) for x in (-0.075, -0.06)]
    cutters.append(bevelled(box((0.045, 0.014, 0.008), (0.07, 0.1, 0.162), M["slot"]), 0.003))
    cut(door, cutters)
    bolts = [cyl(0.0075, 0.005, (x, 0.1, 0.1635), "z", M["zinc"], verts=6) for x in (-0.1, 0.03)]
    washers = [cyl(0.009, 0.0015, (x, 0.1, 0.1615), "z", M["zinc"], verts=16) for x in (-0.1, 0.03)]
    return [door, *bolts, *washers]


def air_filter(M):
    foam = bevelled(box((0.1, 0.05, 0.02), (-0.06, 0.1, 0.142), M["foam"]), 0.006, 3)
    cut(foam, [bevelled(box((0.02, 0.016, 0.03), (-0.01, 0.124, 0.142), M["foam"]), 0.003)])
    return [foam]


# ---- Base pieces ----

def base_frame(M):
    pieces = [bevelled(box((0.3, 0.012, 0.24), (0.0, 0.052, 0.0), M["black_steel"]), 0.004)]
    for x in (-0.13, 0.13):
        for z in (-0.105, 0.105):
            pieces.append(disc(0.023, 0.038, (x, 0.022, z), "y", M["rubber"], verts=24, bevel=0.005))
            pieces.append(cyl(0.006, 0.012, (x, 0.046, z), "y", M["zinc"], verts=6))
    # Cast mounting post at the front right corner, between the panel and the recoil cover (Tiger photo).
    pieces.append(bevelled(box((0.012, 0.16, 0.014), (0.118, 0.13, 0.148), M["cast_aluminium"]), 0.004))
    return pieces


def base_alternator(M):
    c = (-0.105, 0.135, -0.01)
    housing = disc(0.085, 0.11, c, "x", M["cast_aluminium"], verts=48, bevel=0.004)
    ribs = [disc(0.087, 0.004, (c[0] + dx, c[1], c[2]), "x", M["cast_aluminium"], verts=48) for dx in (-0.03, 0.0, 0.03)]
    rim = bevelled(box((0.012, 0.18, 0.18), (-0.158, c[1], c[2]), M["cast_aluminium"]), 0.012, 3)
    cut(rim, [cyl(0.075, 0.03, (-0.158, c[1], c[2]), "x", M["slot"], verts=48)])
    feet = bevelled(box((0.09, 0.03, 0.16), (c[0], 0.062, c[2]), M["cast_aluminium"]), 0.006)
    return [housing, *ribs, rim, feet]


def base_engine(M):
    crank = bevelled(box((0.15, 0.15, 0.17), (0.035, 0.13, 0.005), M["engine_aluminium"]), 0.012, 3)
    cylinder = disc(0.038, 0.05, (0.055, 0.15, -0.105), "z", M["engine_aluminium"], verts=24)
    fins = [disc(0.054, 0.003, (0.055, 0.15, -0.085 - i * 0.008), "z", M["engine_aluminium"], verts=24) for i in range(5)]
    # The black plastic shroud covers the cylinder at the back; the plug leans out through a notch at its top.
    shroud = bevelled(box((0.125, 0.15, 0.06), (0.06, 0.135, -0.118), M["black_plastic"]), 0.012, 3)
    cut(shroud, [bevelled(box((0.03, 0.04, 0.05), (0.06, 0.2, -0.13), M["slot"]), 0.006)])
    studs = [cyl(0.0045, 0.006, (0.06 + dx, 0.135 + dy, -0.149), "z", M["zinc"], verts=6) for dx, dy in ((-0.045, -0.05), (0.045, -0.05))]
    return [crank, cylinder, *fins, shroud, *studs]


def base_panel(M):
    upper = prism(rounded_rect_points(-0.165, 0.155, 0.115, 0.245, 0.008, 3), "xy", 0.095, 0.155, M["black_plastic"], bevel=0.005, segments=2)
    walls = [
        box((0.28, 0.105, 0.006), (-0.025, 0.1025, 0.098), M["black_plastic"]),
        box((0.28, 0.006, 0.06), (-0.025, 0.055, 0.125), M["black_plastic"]),
        box((0.006, 0.105, 0.06), (-0.162, 0.1025, 0.125), M["black_plastic"]),
        box((0.006, 0.105, 0.06), (0.112, 0.1025, 0.125), M["black_plastic"]),
    ]
    socket = disc(0.024, 0.006, (-0.11, 0.2, 0.157), "z", M["black_steel"], verts=32, bevel=0.002)
    cut(socket, [cyl(0.0035, 0.02, (-0.11 + dx, 0.2, 0.16), "z", M["slot"], verts=8) for dx in (-0.01, 0.01)])
    label = box((0.075, 0.06, 0.0015), (-0.025, 0.205, 0.1555), M["label"])
    breaker = disc(0.005, 0.005, (-0.05, 0.168, 0.157), "z", M["switch_red"], verts=16, bevel=0.0015)
    switch_frame = bevelled(box((0.022, 0.03, 0.004), (0.065, 0.215, 0.1565), M["black_steel"]), 0.002)
    rocker = bevelled(box((0.014, 0.022, 0.006), (0.065, 0.215, 0.159), M["switch_red"]), 0.002)
    choke = box((0.04, 0.008, 0.003), (0.065, 0.175, 0.1565), M["slot"])
    choke_lever = bevelled(box((0.008, 0.012, 0.01), (0.075, 0.175, 0.16), M["zinc"]), 0.002)
    return [upper, *walls, socket, label, breaker, switch_frame, rocker, choke, choke_lever]


BUILDERS.update({
    "spark_plug": ("parts", spark_plug),
    "plug_cap": ("parts", plug_cap),
    "carburetor": ("parts", carburetor),
    "fuel_tap": ("parts", fuel_tap),
    "fuel_hose": ("parts", fuel_hose),
    "capacitor": ("parts", capacitor),
    "air_filter_cover": ("parts", air_filter_cover),
    "air_filter": ("parts", air_filter),
    "base_frame": ("base", base_frame),
    "base_alternator": ("base", base_alternator),
    "base_engine": ("base", base_engine),
    "base_panel": ("base", base_panel),
})

def main():
    wanted = common.args() or list(BUILDERS)
    unknown = [w for w in wanted if w not in BUILDERS]
    if unknown:
        common.fail(f"model.py has no builder for: {', '.join(unknown)}. Known: {', '.join(BUILDERS)}")
    M = materials()
    bounds = {}
    for name in wanted:
        old = bpy.data.objects.get(name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        col_name, builder = BUILDERS[name]
        obj = join(builder(M), name, bpy.data.collections[col_name])
        corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        xs, ys, zs = [c.x for c in corners], [c.z for c in corners], [-c.y for c in corners]
        bounds[name] = {
            "centre": [round((min(v) + max(v)) / 2, 4) for v in (xs, ys, zs)],
            "size": [round(max(v) - min(v), 4) for v in (xs, ys, zs)],
            "triangles": common.triangle_count(obj),
        }
        print(f"Modelled {name}: {bounds[name]['triangles']} triangles (allocation {common.ALLOCATION.get(name)})")
    for obj in list(bpy.context.scene.collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.wm.save_mainfile()
    print("BOUNDS " + json.dumps(bounds))


main()
