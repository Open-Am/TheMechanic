"""Makes a match image: a render of the model from a reference photo's angle, beside the photo (ADR 0013, modelling brief).

    node tools/run-blender.mjs tools/blender/match.py --blend assets/gen950/blend/gen950.blend -- \
        <reference image> <out.png> <azimuth> <polar> <fov_deg> [<target height in m> | only=<object id> [key=<shape key>:<value>]]

With only=<id>, every other object except the part's children (its fasteners) is hidden and the camera frames them, for matching a single part
against a product photo. The azimuth and polar are then measured around the part.

Angles are in radians, measured like the game camera: azimuth 0 looks at the front (+Z), positive turns towards the
right side (+X); polar is from straight up. The camera orbits the machine's centre and frames it to fit the photo's
aspect. The camera angle is set by eye to the photo; the image records what still differs.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
a = common.args()
if len(a) < 5:
    common.fail("Usage: match.py -- <reference> <out.png> <azimuth> <polar> <fov_deg> [target_y]")
ref_path, out_path = os.path.abspath(a[0]), os.path.abspath(a[1])
azimuth, polar, fov_deg = float(a[2]), float(a[3]), float(a[4])
machine = common.load_machine()
sx, sy, sz = machine["size"]
extra = a[5:]
only = next((x[5:] for x in extra if x.startswith("only=")), None)
key = next((x[4:] for x in extra if x.startswith("key=")), None)  # key=<shape key>:<value>, with only=
plain = [x for x in extra if "=" not in x]
target_y = float(plain[0]) if plain else sy / 2
centre_gl = (0.0, target_y, 0.0)
radius = math.sqrt(sx * sx + sy * sy + sz * sz) / 2
hidden = []
if only:
    obj = bpy.data.objects.get(only)
    if obj is None:
        common.fail(f"No object named {only}")
    # The part's children (its fasteners, plan 0011) stay in the picture with it.
    kept = [obj, *obj.children_recursive]
    for o in bpy.data.objects:
        if o.type == "MESH" and o not in kept and not o.hide_render:
            o.hide_render = True
            hidden.append(o)
    if key and obj.data.shape_keys:
        kname, kval = key.split(":")
        obj.data.shape_keys.key_blocks[kname].value = float(kval)
    corners = [k.matrix_world @ Vector(c) for k in kept if k.type == "MESH" for c in k.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    mid = (lo + hi) / 2
    centre_gl = (mid.x, mid.z, -mid.y)
    radius = (hi - lo).length / 2

ref = bpy.data.images.load(ref_path)
rw, rh = ref.size
HEIGHT = 800
width = max(1, round(rw * HEIGHT / rh))

scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y = width, HEIGHT
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
cam_data = bpy.data.cameras.new("cam_match")
cam_data.sensor_fit = "VERTICAL"
cam_data.angle_y = math.radians(fov_deg)
cam = bpy.data.objects.new("cam_match", cam_data)
scene.collection.objects.link(cam)
fov_y = math.radians(fov_deg)
fov_x = 2 * math.atan(math.tan(fov_y / 2) * width / HEIGHT)
distance = radius * 1.1 / math.sin(min(fov_x, fov_y) / 2)
target = centre_gl
pos = (
    target[0] + distance * math.sin(polar) * math.sin(azimuth),
    target[1] + distance * math.cos(polar),
    target[2] + distance * math.sin(polar) * math.cos(azimuth),
)
cam.location = common.gl(*pos)
cam.rotation_euler = (Vector(common.gl(*target)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

render_path = out_path + ".render.png"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = render_path
bpy.ops.render.render(write_still=True)

# Side by side: photo on the left, render on the right, same height.
def pixels(img, w, h):
    if tuple(img.size) != (w, h):
        img.scale(w, h)
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)


left = pixels(ref, width, HEIGHT)
right = pixels(bpy.data.images.load(render_path), width, HEIGHT)
gap = np.ones((HEIGHT, 8, 4), dtype=np.float32)
combined = np.concatenate([left, gap, right], axis=1)
out = bpy.data.images.new("match", combined.shape[1], HEIGHT, alpha=True)
out.pixels = combined.ravel().tolist()
os.makedirs(os.path.dirname(out_path), exist_ok=True)
out.filepath_raw = out_path
out.file_format = "PNG"
out.save()
os.remove(render_path)
bpy.data.objects.remove(cam, do_unlink=True)
for o in hidden:
    o.hide_render = False
print(f"Match image {out_path} ({combined.shape[1]} x {HEIGHT})")
