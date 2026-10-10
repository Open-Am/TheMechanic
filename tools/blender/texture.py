"""Bakes materials and Lagos wear into texture atlases (plan 0006, modelling brief "Textures", "Materials", "Wear").

    node tools/run-blender.mjs tools/blender/texture.py --blend assets/gen950/blend/gen950.blend

Run after model.py (or block.py): it expects each object to carry the modelling materials by name (tank_paint,
black_plastic, ...). For each texture group it:
  1. lays out one shared UV atlas for the group's objects;
  2. gives every material a procedural surface with wear: chipped paint on edges, dust in crevices and on upward
     faces, scuffed plastic, rust and soot on the exhaust, fine pressed or cast texture in the normal;
  3. bakes base colour, roughness, metallic, ambient occlusion and normal with Cycles;
  4. packs occlusion, roughness and metallic into one ORM image, and replaces the materials with image-based ones
     the glTF exporter writes as standard PBR textures.

Groups and sizes follow the modelling brief and ADR 0014: one 2048 px atlas for the large exterior, 1024 px for the
small parts. Images are written to assets/gen950/textures/ and packed into the .blend.
"""

import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()

GROUPS = {
    "exterior": (2048, ["fuel_tank", "recoil_starter", "muffler", "alternator_cover", "air_filter_cover", "base_frame", "base_alternator", "base_engine", "base_panel"]),
    "small": (1024, ["carburetor", "fuel_tap", "fuel_hose", "air_filter", "spark_plug", "plug_cap", "capacitor"]),
}
TEX_DIR = os.path.join(common.ASSET_DIR, "textures")

# Wear profile per modelling material: (profile, metal under chips or None, dust amount 0..1).
PROFILES = {
    "tank_paint": ("paint", "#6b5a4a", 0.55),
    "black_steel": ("paint", "#55504a", 0.5),
    "black_plastic": ("plastic", None, 0.6),
    "rubber": ("plain", None, 0.5),
    "cast_aluminium": ("metal", None, 0.55),
    "engine_aluminium": ("metal", None, 0.7),
    "bright_metal": ("metal", None, 0.3),
    "zinc": ("metal", None, 0.4),
    "brass": ("metal", None, 0.3),
    "exhaust": ("exhaust", None, 0.4),
    "slot": ("plain", None, 0.0),
    "ceramic": ("plain", None, 0.25),
    "foam": ("plain", None, 0.8),
    "capacitor": ("plastic", None, 0.4),
    "socket_blue": ("plastic", None, 0.3),
    "label": ("label", None, 0.4),
    "switch_red": ("plastic", None, 0.3),
    "reel_plastic": ("plastic", None, 0.3),
    "earth_wire": ("plain", None, 0.2),
}
DUST = (0.36, 0.31, 0.25)  # Lagos laterite dust, linear-ish, reddish brown
RUST = (0.32, 0.12, 0.04)
SOOT = (0.02, 0.018, 0.016)


def srgb_to_linear(hex_colour):
    h = hex_colour.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# ---- Step 1: atlas UVs ----

def layout_uvs(objects):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


# ---- Step 2: authoring materials with wear ----

def link(tree, a, b):
    tree.links.new(a, b)


def authoring(base_name, group, image):
    """A Cycles material for baking: the base look from the modelling material plus procedural wear."""
    src = bpy.data.materials[base_name]
    bsdf_src = src.node_tree.nodes["Principled BSDF"]
    base = tuple(bsdf_src.inputs["Base Color"].default_value)[:3]
    metallic = bsdf_src.inputs["Metallic"].default_value
    rough = bsdf_src.inputs["Roughness"].default_value
    profile, under, dust_amount = PROFILES.get(base_name, ("plain", None, 0.3))

    m = bpy.data.materials.new(f"{base_name}@{group}")
    m.use_nodes = True
    t = m.node_tree
    n = t.nodes
    n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    link(t, bsdf.outputs["BSDF"], out.inputs["Surface"])
    coord = n.new("ShaderNodeTexCoord")

    def noise(scale, detail=6.0, rough_=0.6):
        nz = n.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = scale
        nz.inputs["Detail"].default_value = detail
        nz.inputs["Roughness"].default_value = rough_
        link(t, coord.outputs["Object"], nz.inputs["Vector"])
        return nz.outputs["Fac"]

    def math_node(op, a, b=None, clamp=True):
        mn = n.new("ShaderNodeMath")
        mn.operation = op
        mn.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                mn.inputs[i].default_value = v
            else:
                link(t, v, mn.inputs[i])
        return mn.outputs[0]

    def ramp(fac, lo, hi):
        mr = n.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = lo
        mr.inputs["From Max"].default_value = hi
        link(t, fac, mr.inputs["Value"])
        return mr.outputs["Result"]

    def mix_rgb(fac, a, b):
        mx = n.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        if isinstance(fac, (int, float)):
            mx.inputs["Factor"].default_value = fac
        else:
            link(t, fac, mx.inputs["Factor"])
        for sock, v in ((mx.inputs[6], a), (mx.inputs[7], b)):
            if isinstance(v, tuple):
                sock.default_value = (*v, 1.0)
            else:
                link(t, v, sock)
        return mx.outputs[2]

    # Masks: crevices (ambient occlusion), upward faces, edges (bevel normal against true normal).
    ao = n.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.02
    crevice = math_node("SUBTRACT", 1.0, ao.outputs["AO"])
    geo = n.new("ShaderNodeNewGeometry")
    sep = n.new("ShaderNodeSeparateXYZ")
    link(t, geo.outputs["Normal"], sep.inputs["Vector"])
    up = ramp(sep.outputs["Z"], 0.4, 1.0)
    bevel = n.new("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = 0.0025
    dot = n.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    link(t, bevel.outputs["Normal"], dot.inputs[0])
    link(t, geo.outputs["Normal"], dot.inputs[1])
    edge = ramp(math_node("SUBTRACT", 1.0, dot.outputs["Value"]), 0.002, 0.04)

    big = noise(6.0, 4.0)
    fine = noise(60.0, 8.0)
    variation = ramp(fine, 0.35, 0.65)

    # Base colour with slight variation.
    colour = mix_rgb(math_node("MULTIPLY", variation, 0.12), base, tuple(c * 0.75 for c in base))
    metal_out = metallic
    rough_out = rough

    if profile == "paint":
        chips = math_node("MULTIPLY", edge, ramp(big, 0.45, 0.6))
        chips = math_node("GREATER_THAN", chips, 0.35)
        colour = mix_rgb(chips, colour, srgb_to_linear(under))
        rusty = math_node("MULTIPLY", chips, ramp(noise(25.0), 0.5, 0.7))
        colour = mix_rgb(rusty, colour, RUST)
        rough_out = math_node("ADD", math_node("MULTIPLY", chips, 0.35), rough)
    elif profile == "plastic":
        scuff = math_node("MULTIPLY", edge, ramp(big, 0.4, 0.7))
        colour = mix_rgb(math_node("MULTIPLY", scuff, 0.5), colour, tuple(min(1, c + 0.08) for c in base))
        faded = math_node("MULTIPLY", up, 0.25)
        colour = mix_rgb(faded, colour, tuple(min(1, c * 1.6 + 0.03) for c in base))
        rough_out = math_node("ADD", math_node("MULTIPLY", scuff, 0.2), rough)
    elif profile == "metal":
        grime = math_node("MULTIPLY", crevice, 1.5)
        colour = mix_rgb(grime, colour, tuple(c * 0.35 for c in base))
        rough_out = math_node("ADD", math_node("MULTIPLY", variation, 0.15), rough)
    elif profile == "exhaust":
        rust = ramp(math_node("ADD", math_node("MULTIPLY", big, 0.7), math_node("MULTIPLY", up, 0.4)), 0.35, 0.7)
        colour = mix_rgb(rust, colour, RUST)
        soot = math_node("MULTIPLY", crevice, ramp(noise(14.0), 0.4, 0.8))
        colour = mix_rgb(soot, colour, SOOT)
        metal_out = math_node("MULTIPLY", math_node("SUBTRACT", 1.0, rust), metallic)
        rough_out = math_node("ADD", math_node("MULTIPLY", rust, 0.25), rough)
    elif profile == "label":
        lines = n.new("ShaderNodeTexWave")
        lines.wave_type = "BANDS"
        lines.bands_direction = "Z"
        lines.inputs["Scale"].default_value = 180.0
        link(t, coord.outputs["Object"], lines.inputs["Vector"])
        text = math_node("MULTIPLY", math_node("GREATER_THAN", lines.outputs["Fac"], 0.75), math_node("GREATER_THAN", fine, 0.42))
        colour = mix_rgb(text, colour, (0.03, 0.03, 0.03))

    # Dust over everything that faces up or sits in a crevice, broken up by noise.
    if dust_amount > 0:
        dust = math_node("MULTIPLY", math_node("ADD", math_node("MULTIPLY", crevice, 1.2), math_node("MULTIPLY", up, 0.5)), ramp(big, 0.3, 0.75))
        dust = math_node("MULTIPLY", dust, dust_amount)
        colour = mix_rgb(dust, colour, DUST)
        rough_out = math_node("ADD", math_node("MULTIPLY", dust, 0.4), rough_out) if not isinstance(rough_out, float) else math_node("ADD", math_node("MULTIPLY", dust, 0.4), rough_out)
        if isinstance(metal_out, float):
            metal_out = math_node("MULTIPLY", math_node("SUBTRACT", 1.0, dust), metal_out)
        else:
            metal_out = math_node("MULTIPLY", math_node("SUBTRACT", 1.0, dust), metal_out)

    link(t, colour, bsdf.inputs["Base Color"])
    colour_node = n.new("NodeReroute")
    colour_node.name = "BASECOLOR"
    link(t, colour, colour_node.inputs[0])
    for name, value in (("Roughness", rough_out), ("Metallic", metal_out)):
        if isinstance(value, float):
            bsdf.inputs[name].default_value = value
        else:
            link(t, value, bsdf.inputs[name])

    # Fine surface: orange peel on paint, casting grain on metal, mould grain on plastic.
    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = {"paint": 0.05, "metal": 0.12, "plastic": 0.06, "exhaust": 0.18}.get(profile, 0.04)
    bump.inputs["Distance"].default_value = 0.0004
    link(t, noise(220.0, 4.0), bump.inputs["Height"])
    link(t, bump.outputs["Normal"], bsdf.inputs["Normal"])

    # A reroute carrying metallic, for the metallic bake through emission.
    metal_node = n.new("NodeReroute")
    metal_node.name = "METALLIC"
    if isinstance(metal_out, float):
        v = n.new("ShaderNodeValue")
        v.outputs[0].default_value = metal_out
        link(t, v.outputs[0], metal_node.inputs[0])
    else:
        link(t, metal_out, metal_node.inputs[0])

    img = n.new("ShaderNodeTexImage")
    img.name = "BAKE_TARGET"
    img.image = image
    n.active = img
    return m


# ---- Step 3: baking ----

def new_image(name, size, non_color):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    return img


def set_targets(objects, image):
    for o in objects:
        for slot in o.material_slots:
            node = slot.material.node_tree.nodes.get("BAKE_TARGET")
            node.image = image
            slot.material.node_tree.nodes.active = node


def bake(objects, kind, image, samples=1, **kw):
    set_targets(objects, image)
    scene = bpy.context.scene
    scene.cycles.samples = samples
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.bake(type=kind, margin=6, use_clear=True, **kw)


def bake_through_emission(objects, image, reroute):
    """Bakes a value by routing a named reroute (BASECOLOR, METALLIC) through emission for one EMIT bake.

    Base colour goes this way too: Cycles' diffuse colour pass is weighted by (1 - metallic), so it bakes metals
    nearly black (found on the filler cap, plan 0006)."""
    saved = []
    for o in objects:
        for slot in o.material_slots:
            t = slot.material.node_tree
            out = next(x for x in t.nodes if x.type == "OUTPUT_MATERIAL")
            old = out.inputs["Surface"].links[0].from_socket
            em = t.nodes.new("ShaderNodeEmission")
            t.links.new(t.nodes[reroute].outputs[0], em.inputs["Color"])
            t.links.new(em.outputs["Emission"], out.inputs["Surface"])
            saved.append((t, out, old, em))
    bake(objects, "EMIT", image)
    for t, out, old, em in saved:
        t.links.new(old, out.inputs["Surface"])
        t.nodes.remove(em)


def pixels(img):
    return np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)


# ---- Step 4: final materials ----

def final_material(group, base_img, orm_img, normal_img):
    m = bpy.data.materials.get(f"baked_{group}") or bpy.data.materials.new(f"baked_{group}")
    m.use_nodes = True
    t = m.node_tree
    n = t.nodes
    n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    t.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    base = n.new("ShaderNodeTexImage")
    base.image = base_img
    t.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    orm = n.new("ShaderNodeTexImage")
    orm.image = orm_img
    sep = n.new("ShaderNodeSeparateColor")
    t.links.new(orm.outputs["Color"], sep.inputs["Color"])
    t.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    t.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = n.new("ShaderNodeTexImage")
    nm.image = normal_img
    nmap = n.new("ShaderNodeNormalMap")
    t.links.new(nm.outputs["Color"], nmap.inputs["Color"])
    t.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    # Occlusion through the glTF exporter's settings group.
    group_name = "glTF Material Output"
    gt = bpy.data.node_groups.get(group_name)
    if gt is None:
        gt = bpy.data.node_groups.new(group_name, "ShaderNodeTree")
        gt.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gnode = n.new("ShaderNodeGroup")
    gnode.node_tree = gt
    t.links.new(sep.outputs["Red"], gnode.inputs["Occlusion"])
    return m


def main():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.bake.margin = 6
    os.makedirs(TEX_DIR, exist_ok=True)

    for group, (size, names) in GROUPS.items():
        objects = [bpy.data.objects[nm] for nm in names if bpy.data.objects.get(nm)]
        for o in objects:
            if any(s.material and s.material.name.startswith("baked_") for s in o.material_slots):
                common.fail(f"'{o.name}' is already textured. Run model.py (or block.py) first to rebuild it.")
        print(f"[{group}] {len(objects)} objects, {size} px")
        layout_uvs(objects)

        target = new_image(f"{group}_target", size, False)
        made = {}
        for o in objects:
            for slot in o.material_slots:
                base_name = slot.material.name.split("@")[0]
                if base_name not in made:
                    made[base_name] = authoring(base_name, group, target)
                slot.material = made[base_name]

        base_img = new_image(f"{group}_basecolor", size, False)
        bake_through_emission(objects, base_img, "BASECOLOR")
        rough_img = new_image(f"{group}_rough", size, True)
        bake(objects, "ROUGHNESS", rough_img)
        metal_img = new_image(f"{group}_metal", size, True)
        bake_through_emission(objects, metal_img, "METALLIC")
        ao_img = new_image(f"{group}_ao", size, True)
        bake(objects, "AO", ao_img, samples=24)
        normal_img = new_image(f"{group}_normal", size, True)
        bake(objects, "NORMAL", normal_img, normal_space="TANGENT")

        orm = np.ones((size, size, 4), dtype=np.float32)
        orm[:, :, 0] = pixels(ao_img)[:, :, 0]
        orm[:, :, 1] = pixels(rough_img)[:, :, 0]
        orm[:, :, 2] = pixels(metal_img)[:, :, 0]
        orm_img = new_image(f"{group}_orm", size, True)
        orm_img.pixels = orm.ravel().tolist()

        for img in (base_img, orm_img, normal_img):
            img.filepath_raw = os.path.join(TEX_DIR, f"{img.name}.png")
            img.file_format = "PNG"
            img.save()
            img.pack()
        for img in (rough_img, metal_img, ao_img, target):
            bpy.data.images.remove(img)

        final = final_material(group, base_img, orm_img, normal_img)
        for o in objects:
            o.data.materials.clear()
            o.data.materials.append(final)
        for m in list(made.values()):
            bpy.data.materials.remove(m)
        print(f"[{group}] baked")

    bpy.ops.wm.save_mainfile()
    print("Textured all groups.")


main()
