"""Renders the look-development scene from a camera (plan 0005).

    node tools/run-blender.mjs tools/blender/render.py --blend assets/gen950/blend/gen950.blend -- <out.png> [camera] [width height]

Default camera is cam_game, the game's default view. Used for checking the model and for match images.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
a = common.args()
if not a:
    common.fail("Usage: render.py -- <out.png> [camera] [width height]")
out = os.path.abspath(a[0])
camera = a[1] if len(a) > 1 else "cam_game"
scene = bpy.context.scene
cam = bpy.data.objects.get(camera)
if cam is None:
    common.fail(f"No camera named {camera}")
scene.camera = cam
if len(a) > 3:
    scene.render.resolution_x, scene.render.resolution_y = int(a[2]), int(a[3])
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.render.render(write_still=True)
print(f"Rendered {out}")
