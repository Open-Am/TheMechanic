"""Applies the game's lighting to the Blender file's look-development scene (ADR 0014, plan 0006).

    node tools/run-blender.mjs tools/blender/lookdev.py --blend assets/gen950/blend/gen950.blend

Sets the world to the game's environment map at the game's HDR intensity, the key sun from the game's direction,
Khronos PBR Neutral at the game's exposure. Run it after changing LIGHTING in game/src/render/lighting.ts, so match
renders keep judging the model under the light the player sees.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
L = common.LOOKDEV
scene = bpy.context.scene
scene.view_settings.view_transform = "Khronos PBR Neutral"
scene.view_settings.look = "None"
scene.view_settings.exposure = math.log2(L["exposure"])

world = scene.world
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Strength"].default_value = L["environment_strength"]

sun = bpy.data.objects.get("key")
if sun is None:
    common.fail("No 'key' light; run scaffold.py first.")
sun.data.energy = L["key_energy"]
d = Vector(common.gl(*common.KEY_DIRECTION)).normalized()
sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()

bpy.ops.wm.save_mainfile()
print(f"Look-development: environment {L['environment_strength']}, key {L['key_energy']}, exposure {L['exposure']}")
