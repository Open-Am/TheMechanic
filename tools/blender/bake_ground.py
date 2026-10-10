"""Bakes the ground contact shadow from the assembled machine (plan 0005 step 6, ADR 0014).

    node tools/run-blender.mjs tools/blender/bake_ground.py --blend assets/gen950/blend/gen950.blend

Renders the machine straight down with an orthographic camera into a transparent image, takes its coverage, blurs it
into a soft shadow, and writes assets/gen950/export/ground.png: black with the shadow in the alpha channel. The image
spans 3 times the machine's longest side, the same span as the game's ground plane (game/src/render/ground.ts).
"""

import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
PX = 256  # the shadow is soft; 256 px over about 1.1 m is plenty and stays far inside 64 KB
SPAN_FACTOR = 3.0
STRENGTH = 0.62  # matches GROUND.shadowAlpha in the game
BLUR_M = 0.03  # blur radius in metres

machine = common.load_machine()
span = max(machine["size"][0], machine["size"][2]) * SPAN_FACTOR
scene = bpy.context.scene

# Only the machine renders: hide the reference collection (ground, lights) and the world.
reference = bpy.data.collections["reference"]
hidden = []
for obj in [o for o in reference.objects if o is not None]:
    if not obj.hide_render:
        obj.hide_render = True
        hidden.append(obj)

cam_data = bpy.data.cameras.new("cam_ground")
cam_data.type = "ORTHO"
cam_data.ortho_scale = span
cam = bpy.data.objects.new("cam_ground", cam_data)
scene.collection.objects.link(cam)
cam.location = (0, 0, 2)
cam.rotation_euler = (0, 0, 0)  # looking straight down -Z; image up is Blender +Y, which is glTF -Z (the back)
scene.camera = cam

out_dir = common.EXPORT_DIR
os.makedirs(out_dir, exist_ok=True)
raw_path = os.path.join(out_dir, "_ground_coverage.png")
scene.render.resolution_x = scene.render.resolution_y = PX
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = raw_path
bpy.ops.render.render(write_still=True)

img = bpy.data.images.load(raw_path)
pixels = np.array(img.pixels[:], dtype=np.float32).reshape(PX, PX, 4)
coverage = pixels[:, :, 3]


def blur(a, radius_px):
    """Separable Gaussian blur."""
    sigma = max(1.0, radius_px / 2)
    r = int(radius_px * 1.5) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    padded = np.pad(a, r, mode="constant")
    a = np.apply_along_axis(lambda m: np.convolve(m, k, mode="valid"), 0, padded)
    a = np.apply_along_axis(lambda m: np.convolve(m, k, mode="valid"), 1, a)
    return a


shadow = np.clip(blur(coverage, BLUR_M / span * PX) * STRENGTH, 0, 1)
result = np.zeros((PX, PX, 4), dtype=np.float32)
result[:, :, 3] = shadow
out_img = bpy.data.images.new("ground", PX, PX, alpha=True)
out_img.pixels = result.ravel().tolist()
out_path = os.path.join(out_dir, "ground.png")
out_img.filepath_raw = out_path
out_img.file_format = "PNG"
out_img.save()
os.remove(raw_path)

for obj in hidden:
    obj.hide_render = False
bpy.data.objects.remove(cam, do_unlink=True)
print(f"Baked {out_path}: {PX} px over {span:.3f} m, {os.path.getsize(out_path) / 1000:.1f} KB")
