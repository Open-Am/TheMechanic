"""Builds assets/gen950/blend/gen950.blend: units, collections, and the look-development scene (plan 0005 steps 2 and 3).

    node tools/run-blender.mjs tools/blender/scaffold.py [-- --force]

Refuses to overwrite an existing .blend unless --force is given, so modelling work is never lost by accident.
Look-development matches the game (ADR 0014): the same HDR environment, the key light from the same direction,
Khronos PBR Neutral tone mapping, a ground plane for the shadow bake, and a camera matching the game's default view.
Nothing in the `reference` collection is exported.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
force = "--force" in common.args()
if os.path.exists(common.BLEND_PATH) and not force:
    common.fail(f"{common.BLEND_PATH} exists. Pass -- --force to rebuild it from scratch.")

# Start from an empty scene.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

for name in common.COLLECTIONS:
    common.ensure_collection(name)
reference = bpy.data.collections["reference"]

# Render settings: EEVEE, Khronos PBR Neutral like the game, transparent film for match images.
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.view_settings.view_transform = "Khronos PBR Neutral"
scene.view_settings.look = "None"
scene.view_settings.exposure = math.log2(common.LOOKDEV["exposure"])
scene.render.resolution_x = 780
scene.render.resolution_y = 1688
scene.render.film_transparent = False

# World: the game's environment map, at the game's environment intensity.
world = bpy.data.worlds.new("lookdev")
scene.world = world
world.use_nodes = True
nodes = world.node_tree.nodes
links = world.node_tree.links
nodes.clear()
out = nodes.new("ShaderNodeOutputWorld")
bg = nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = common.LOOKDEV["environment_strength"]
links.new(bg.outputs["Background"], out.inputs["Surface"])
if os.path.exists(common.ENV_PATH):
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(common.ENV_PATH)
    links.new(env.outputs["Color"], bg.inputs["Color"])
else:
    print(f"WARNING: {common.ENV_PATH} not found; using a grey world.")
    bg.inputs["Color"].default_value = (0.5, 0.5, 0.5, 1)

# Key light: a sun from the game's key direction (glTF axes converted to Blender).
sun_data = bpy.data.lights.new("key", "SUN")
sun_data.energy = common.LOOKDEV["key_energy"]
sun = bpy.data.objects.new("key", sun_data)
reference.objects.link(sun)
d = Vector(common.gl(*common.KEY_DIRECTION)).normalized()
sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()

# Ground plane for the shadow bake and for match renders.
bpy.ops.mesh.primitive_plane_add(size=1.2, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = "ground"
for c in ground.users_collection:
    c.objects.unlink(ground)
reference.objects.link(ground)
mat = bpy.data.materials.new("ground")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.03, 0.03, 0.03, 1)
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
ground.data.materials.append(mat)

# Camera matching the game's default view: vertical FOV 40, portrait, orbiting the machine's centre.
machine = common.load_machine()
sx, sy, sz = machine["size"]
radius = math.sqrt(sx * sx + sy * sy + sz * sz) / 2
cam_cfg = common.GAME_CAMERA
fov_y = math.radians(cam_cfg["fov_deg"])
fov_x = 2 * math.atan(math.tan(fov_y / 2) * cam_cfg["aspect"])
distance = radius * 1.15 / math.sin(min(fov_x, fov_y) / 2)
az, pol = cam_cfg["azimuth"], cam_cfg["polar"]
target_gl = (0.0, sy / 2, 0.0)
pos_gl = (
    target_gl[0] + distance * math.sin(pol) * math.sin(az),
    target_gl[1] + distance * math.cos(pol),
    target_gl[2] + distance * math.sin(pol) * math.cos(az),
)
cam_data = bpy.data.cameras.new("cam_game")
cam_data.sensor_fit = "VERTICAL"
cam_data.angle_y = fov_y
cam = bpy.data.objects.new("cam_game", cam_data)
reference.objects.link(cam)
cam.location = common.gl(*pos_gl)
look = Vector(common.gl(*target_gl)) - cam.location
cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

os.makedirs(os.path.dirname(common.BLEND_PATH), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=common.BLEND_PATH)
print(f"Saved {common.BLEND_PATH}")
