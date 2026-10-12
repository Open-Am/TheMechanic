"""Bakes the machine's contact shadow on the bench top from the assembled machine (plan 0005 step 6, ADR 0014; since
plan 0016 and ADR 0025 it lies on the workbench's top, not the ground).

    node tools/run-blender.mjs tools/blender/bake_ground.py --blend assets/gen950/blend/gen950.blend

Renders the machine straight down with an orthographic camera into a transparent image twice: all of it, and only what
lies within CONTACT_M of its base (the feet and the bottom of the frame, which touch the bench top). Each coverage is
blurred and the two are combined: a wide soft shadow under the whole machine and a darker, tighter one where it stands.
Writes assets/gen950/export/ground.png: black with the shadow in the alpha channel. The image spans SPAN_FACTOR times
the machine's longest side, the same span as the game's shadow plane (SHADOW_SPAN in game/src/render/ground.ts), small
enough to stay on the bench top however the machine is turned.
"""

import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
PX = 256  # the shadow is soft; 256 px over about 0.6 m is plenty and stays far inside 64 KB
SPAN_FACTOR = 1.6  # matches SHADOW_SPAN in game/src/render/ground.ts
STRENGTH = 0.55  # the wide shadow under the whole machine
BLUR_M = 0.035  # its blur radius in metres
CONTACT_M = 0.03  # height above the base that counts as touching the bench
CONTACT_STRENGTH = 0.8
CONTACT_BLUR_M = 0.012

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
CAM_Z = 2.0
cam.location = (0, 0, CAM_Z)
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


def coverage(clip_start):
    """The machine's coverage seen from above, of what lies below CAM_Z - clip_start (Blender Z, the base at 0)."""
    cam_data.clip_start = clip_start
    cam_data.clip_end = CAM_Z + 1.0
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(raw_path)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(PX, PX, 4)[:, :, 3].copy()
    bpy.data.images.remove(img)
    return a


whole = coverage(0.01)
base = coverage(CAM_Z - CONTACT_M)


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


soft = np.clip(blur(whole, BLUR_M / span * PX) * STRENGTH, 0, 1)
contact = np.clip(blur(base, CONTACT_BLUR_M / span * PX) * CONTACT_STRENGTH, 0, 1)
shadow = 1 - (1 - soft) * (1 - contact)  # the two together, never darker than either alone allows
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
