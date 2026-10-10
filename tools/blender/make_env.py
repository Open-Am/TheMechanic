"""Shrinks an equirectangular HDR environment to fit the ADR 0014 budget (400 KB).

    node tools/run-blender.mjs tools/blender/make_env.py -- <source.hdr> <width> [<out.hdr>]

Writes Radiance RGBE (.hdr), width x width/2. Default output: game/public/env/workshop.hdr.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
a = common.args()
if len(a) < 2:
    common.fail("Usage: make_env.py -- <source.hdr> <width> [<out.hdr>]")
source, width = a[0], int(a[1])
out = a[2] if len(a) > 2 else common.ENV_PATH

img = bpy.data.images.load(source)
if not img.is_float:
    common.fail(f"{source} is not a float image.")
img.scale(width, width // 2)
os.makedirs(os.path.dirname(out), exist_ok=True)
img.filepath_raw = out
img.file_format = "HDR"
img.save()
size = os.path.getsize(out)
print(f"Wrote {out}: {width} x {width // 2}, {size / 1000:.1f} KB")
if size > 400_000:
    common.fail(f"{out} is {size / 1000:.1f} KB, over the 400 KB budget (ADR 0014). Use a smaller width.")
