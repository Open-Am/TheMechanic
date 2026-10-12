"""Exports the `parts` and `base` collections to assets/gen950/export/model.glb (plan 0005 step 6).

    node tools/run-blender.mjs tools/blender/export.py --blend assets/gen950/blend/gen950.blend

Each part and base object becomes a root node named exactly its ID; each fastener (plan 0011) a child node of its
part, named by its id. Y up, modifiers applied, no cameras or lights.
Compression and texture resizing happen afterwards in tools/pipeline/optimise.mjs.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
out = os.path.join(common.EXPORT_DIR, "model.glb")
os.makedirs(common.EXPORT_DIR, exist_ok=True)

bpy.ops.object.select_all(action="DESELECT")
count = 0
for name in ("parts", "base", "fasteners"):
    if name not in bpy.data.collections:
        continue  # a model made before plan 0011 has no fasteners
    for obj in bpy.data.collections[name].objects:
        obj.select_set(True)
        count += 1

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_extras=False,
    export_materials="EXPORT",
    export_texcoords=True,
    export_normals=True,
)
print(f"Exported {count} objects to {out} ({os.path.getsize(out) / 1000:.1f} KB)")
