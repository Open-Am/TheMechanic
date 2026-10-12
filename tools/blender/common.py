"""Shared helpers for the Blender scripts (ADR 0012, plan 0005). Run inside Blender 4.5 LTS, never with system Python.

Coordinates: the game and glTF use metres, Y up, front +Z. Blender uses Z up with the front facing -Y.
The glTF exporter (export_yup) maps Blender (x, y, z) to glTF (x, z, -y), so a glTF point [x, y, z] is
Blender (x, -z, y). gl() does that conversion.
"""

import json
import os
import sys

import bpy

REQUIRED_VERSION = (4, 5)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MACHINE_ID = "gen950"
MACHINE_JSON = os.path.join(ROOT, "game", "public", "machines", MACHINE_ID, "machine.json")
ASSET_DIR = os.path.join(ROOT, "assets", MACHINE_ID)
BLEND_PATH = os.path.join(ASSET_DIR, "blend", f"{MACHINE_ID}.blend")
EXPORT_DIR = os.path.join(ASSET_DIR, "export")
MATCH_DIR = os.path.join(ASSET_DIR, "match")
ENV_PATH = os.path.join(ROOT, "game", "public", "env", "workshop.hdr")

COLLECTIONS = ("parts", "base", "reference")

# Budgets and the triangle allocation, shared with tools/pipeline/check.ts (ADR 0014, modelling brief).
with open(os.path.join(ROOT, "tools", "pipeline", "budgets.json"), encoding="utf-8") as _f:
    BUDGETS = json.load(_f)
TRIANGLE_BUDGET = BUDGETS["triangles"]
ALLOCATION = BUDGETS["allocation"]

# The three-quarter view of the old orbit camera, kept for match renders and the tray pictures (thumbnails.ts). Since
# plan 0016 the game's camera stands at a mechanic's eye over the workbench (game/src/render/stage.ts) and the machine
# starts turned to the same three-quarter view (DEFAULT_YAW = -azimuth), seen about 12 degrees down instead of 26.
GAME_CAMERA = {"fov_deg": 40.0, "azimuth": 0.55, "polar": 1.12, "aspect": 390 / 844}
# Key light direction, matching LIGHTING.key.direction in game/src/render/lighting.ts (glTF axes).
KEY_DIRECTION = (0.6, 1.4, 1.0)
# Look-development lighting, matching LIGHTING in game/src/render/lighting.ts: hdrIntensity, exposure, and the key
# light (the game uses 1.4; Blender suns are in W/m^2, scaled by eye to match).
LOOKDEV = {"environment_strength": 1.25, "exposure": 0.9, "key_energy": 4.2}


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def check_version():
    found = tuple(bpy.app.version[:2])
    if found != REQUIRED_VERSION:
        fail(f"Blender {REQUIRED_VERSION[0]}.{REQUIRED_VERSION[1]} is required (ADR 0012); found {bpy.app.version_string}.")


def args():
    """Arguments after '--' on the Blender command line."""
    argv = sys.argv
    return argv[argv.index("--") + 1 :] if "--" in argv else []


def load_machine():
    with open(MACHINE_JSON, encoding="utf-8") as f:
        return json.load(f)


def object_ids(machine):
    """Every object the model must contain: part IDs and base piece IDs."""
    return [p["id"] for p in machine["parts"]], [b["id"] for b in machine["base"]]


def gl(x, y, z):
    """glTF (Y up, front +Z) to Blender (Z up, front -Y)."""
    return (x, -z, y)


def ensure_collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def triangle_count(obj):
    """Triangles in the evaluated mesh, after modifiers."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    try:
        mesh.calc_loop_triangles()
        return len(mesh.loop_triangles)
    finally:
        obj.evaluated_get(depsgraph).to_mesh_clear()
