"""The mechanic's hand (plan 0008, ADR 0015).

    node tools/run-blender.mjs tools/blender/hand.py -- build     # model, grip morph, bake, save assets/hand/blend/hand.blend
    node tools/run-blender.mjs tools/blender/hand.py -- export    # validate and export assets/hand/export/hand.glb

A real-size right hand and forearm of a Lagos mechanic, in a worn work-shirt sleeve. Palm down, fingers pointing -Z,
forearm running +Z (glTF axes). The origin is the grip point, the space the curled fingers close around, so the game
places the origin at the part it grips.

How it is made, with no outside tool: a joint skeleton with real radii is turned into a smooth body by Blender's Skin
and Subdivision modifiers, decimated to budget, then given nails and a sleeve. The grip is one morph target, "grip":
each finger joint rotates smoothly about its own axis (distal joints first), so the open and gripping hands share one
mesh. Proportions: adult hand about 190 mm long, palm about 85 mm wide, middle finger about 80 mm.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from shapes import box, cyl, join, mat  # noqa: E402

common.check_version()
HAND_DIR = os.path.join(common.ROOT, "assets", "hand")
BLEND = os.path.join(HAND_DIR, "blend", "hand.blend")
EXPORT = os.path.join(HAND_DIR, "export", "hand.glb")
NAME = "mechanic_hand"
BUDGET_TRIANGLES = common.BUDGETS["hand"]["triangles"]

V = Vector

# ---- The skeleton, glTF metres ----

WRIST = V((0.0, 0.0, 0.07))
FOREARM_MID = V((0.0, 0.002, 0.19))
FOREARM_END = V((0.0, 0.004, 0.34))
# Knuckle (MCP) positions; palm faces -Y, thumb on -X.
MCP = {
    "index": V((-0.029, 0.0, -0.016)),
    "middle": V((-0.009, 0.001, -0.021)),
    "ring": V((0.010, 0.0, -0.018)),
    "little": V((0.027, -0.002, -0.010)),
}
# Subdivision shrinks a skin-modifier body by about a quarter, so every radius is scaled up to land on real sizes
# (round 2: the first hand's fingers came out mannequin-thin).
SHRINK = 1.3
# (proximal, middle, distal) lengths, the knuckle radius, and a small sideways spread; each segment tapers.
FINGER = {
    "index": ((0.039, 0.023, 0.019), 0.0102 * SHRINK, -0.06),
    "middle": ((0.043, 0.027, 0.020), 0.0106 * SHRINK, -0.015),
    "ring": ((0.040, 0.025, 0.019), 0.0100 * SHRINK, 0.03),
    "little": ((0.031, 0.019, 0.017), 0.0086 * SHRINK, 0.08),
}
# The thumb starts low at the base of the palm and lies forward along the index side, slightly under the palm
# (round 2: the first thumb stuck up from the palm).
THUMB = [V((-0.020, -0.012, 0.050)), V((-0.040, -0.020, 0.020)), V((-0.050, -0.022, -0.004)), V((-0.054, -0.022, -0.024))]
THUMB_RADII = [r * SHRINK for r in (0.0150, 0.0118, 0.0105, 0.0092)]

# Grip angles in degrees: MCP, PIP, DIP for fingers; CMC opposition, MCP, IP for the thumb.
GRIP = {"index": (48, 62, 34), "middle": (52, 66, 36), "ring": (54, 68, 38), "little": (58, 72, 40)}
THUMB_GRIP = (28, 30, 32)
# The grip point: the space the curled fingers close around. It becomes the origin.
GRIP_POINT = V((-0.004, -0.03, -0.04))


def finger_chain(name):
    base = MCP[name]
    lengths, r0, spread = FINGER[name]
    d = V((math.sin(spread) * 0.2, -0.04, -1.0)).normalized()
    pts = [base]
    for length in lengths:
        pts.append(pts[-1] + d * length)
    radii = [r0 + 0.001, r0 * 0.9, r0 * 0.8, r0 * 0.7]
    return pts, radii


# ---- Build ----

def skin_body():
    """Palm, fingers, thumb and forearm from a joint skeleton, through Skin and Subdivision."""
    verts, radii, edges = [], [], []

    def add(p, r):
        verts.append(p)
        radii.append(r)
        return len(verts) - 1

    end = add(FOREARM_END, 0.036 * SHRINK)
    mid = add(FOREARM_MID, 0.031 * SHRINK)
    wrist = add(WRIST, 0.023 * SHRINK)
    edges += [(end, mid), (mid, wrist)]
    for name in MCP:
        pts, rr = finger_chain(name)
        prev = wrist
        for p, r in zip(pts, rr):
            i = add(p, r)
            edges.append((prev, i))
            prev = i
    prev = wrist
    for p, r in zip(THUMB, THUMB_RADII):
        i = add(p, r)
        edges.append((prev, i))
        prev = i

    mesh = bpy.data.meshes.new("hand_skeleton")
    mesh.from_pydata([common.gl(*p) for p in verts], edges, [])
    obj = bpy.data.objects.new("hand_skeleton", mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    skin = obj.modifiers.new("skin", "SKIN")
    skin.branch_smoothing = 0.6
    for i, r in enumerate(radii):
        sv = mesh.skin_vertices[0].data[i]
        sv.radius = (r, r)
        sv.use_root = i == end
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    bpy.ops.object.modifier_apply(modifier="skin")
    bpy.ops.object.modifier_apply(modifier="sub")
    # A palm is flatter than the tubes it is built from: squash it top to bottom around its middle.
    me = obj.data
    for v in me.vertices:
        g = V((v.co.x, v.co.z, -v.co.y))  # Blender -> glTF
        if -0.03 < g.z < 0.075:
            w = 1.0 - abs((g.z - 0.022) / 0.053) ** 2
            g.y = g.y * (1.0 - 0.32 * max(0.0, w))
            v.co = V(common.gl(g.x, g.y, g.z))
    return obj


def decimate(obj, target):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    tris = common.triangle_count(obj)
    if tris > target:
        mod = obj.modifiers.new("dec", "DECIMATE")
        mod.ratio = target / tris
        bpy.ops.object.modifier_apply(modifier="dec")
    return obj


def nails(M):
    pieces = []
    for name in MCP:
        pts, rr = finger_chain(name)
        d = (pts[3] - pts[2]).normalized()
        c = pts[2] + (pts[3] - pts[2]) * 0.62 + V((0, rr[3] * 0.82, 0))
        n = box((rr[3] * 1.5, 0.0016, (pts[3] - pts[2]).length * 0.62), tuple(c), M["nail"], bevel=0.0007)
        pieces.append(n)
    tc = THUMB[2] + (THUMB[3] - THUMB[2]) * 0.6 + V((0, THUMB_RADII[3] * 0.8, 0))
    pieces.append(box((0.0135, 0.0016, 0.012), tuple(tc), M["nail"], bevel=0.0007))
    return pieces


def sleeve(M):
    """A loose, rolled work-shirt sleeve: a tube with soft folds, wider than the forearm."""
    pieces = [cyl(0.05, 0.16, (0.0, 0.003, 0.262), "z", M["cloth"], verts=24)]
    for z, r in ((0.183, 0.054), (0.2, 0.052), (0.235, 0.053), (0.275, 0.052), (0.315, 0.053)):
        pieces.append(cyl(r, 0.012, (0.0, 0.003, z), "z", M["cloth"], verts=24))
    return pieces


# ---- Grip morph ----

def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def chain_param(p, pts):
    """Distance from p to the polyline pts, and arc length of its projection (negative before the first point)."""
    best, s_best, acc = 1e9, 0.0, 0.0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        L = ab.length
        t = (p - a).dot(ab) / (L * L)
        tc = t if i == 0 else max(0.0, t)
        tc = min(1.0, tc) if i < len(pts) - 2 else tc
        q = a + ab * tc
        d = (p - q).length
        if d < best:
            best, s_best = d, acc + tc * L
        acc += L
    return best, s_best


def rotate_about(p, pivot, axis, degrees):
    return Matrix.Rotation(math.radians(degrees), 3, axis) @ (p - pivot) + pivot


def grip_positions(coords):
    """The gripping position of every vertex (glTF coords in, glTF coords out)."""
    chains = {}
    for name in MCP:
        pts, _ = finger_chain(name)
        d = (pts[-1] - pts[0]).normalized()
        axis = V((0, 1, 0)).cross(d).normalized()
        cums = [0.0]
        for i in range(3):
            cums.append(cums[-1] + (pts[i + 1] - pts[i]).length)
        chains[name] = (pts, cums, [axis] * 3, GRIP[name])
    td = (THUMB[3] - THUMB[1]).normalized()
    t_axis = V((0.35, 1.0, 0.0)).normalized().cross(td).normalized()
    t_cums = [0.0]
    for i in range(3):
        t_cums.append(t_cums[-1] + (THUMB[i + 1] - THUMB[i]).length)

    out = []
    for p in coords:
        candidates = [(chain_param(p, chains[n][0])[0], n) for n in chains]
        candidates.append((chain_param(p, THUMB)[0], "thumb"))
        _, owner = min(candidates)
        q = p.copy()
        if owner == "thumb":
            _, s = chain_param(p, THUMB)
            joints = [(THUMB[2], t_axis, THUMB_GRIP[2], t_cums[2]), (THUMB[1], t_axis, THUMB_GRIP[1], t_cums[1]), (THUMB[0], V((0, 0, 1)), THUMB_GRIP[0], t_cums[0] + 0.012)]
        else:
            pts, cums, axes, angles = chains[owner]
            _, s = chain_param(p, pts)
            joints = [(pts[2], axes[2], angles[2], cums[2]), (pts[1], axes[1], angles[1], cums[1]), (pts[0], axes[0], angles[0], cums[0])]
        for pivot, axis, angle, at in joints:  # distal first, each about its own original pivot
            f = smoothstep(at - 0.006, at + 0.006, s)
            if f > 0:
                q = rotate_about(q, pivot, axis, angle * f)
        out.append(q)
    return out


def add_grip_morph(obj):
    me = obj.data
    obj.shape_key_add(name="Basis")
    key = obj.shape_key_add(name="grip")
    coords = [V((v.co.x, v.co.z, -v.co.y)) for v in me.vertices]
    for kp, g in zip(key.data, grip_positions(coords)):
        kp.co = V(common.gl(g.x, g.y, g.z))
    key.value = 0.0


# ---- Scene ----

def lookdev():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.exposure = math.log2(common.LOOKDEV["exposure"])
    world = bpy.data.worlds.new("lookdev")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = common.LOOKDEV["environment_strength"]
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(common.ENV_PATH)
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    sun = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    sun.data.energy = common.LOOKDEV["key_energy"]
    d = V(common.gl(*common.KEY_DIRECTION)).normalized()
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    common.ensure_collection("reference").objects.link(sun)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    hand_col = common.ensure_collection("hand")
    lookdev()
    M = {
        "skin": mat("skin", "#5b3a29", 0.0, 0.55),
        "nail": mat("nail", "#b48f80", 0.0, 0.35),
        "cloth": mat("cloth", "#4a6688", 0.0, 0.9),
    }
    body = skin_body()
    body.data.materials.append(M["skin"])
    decimate(body, BUDGET_TRIANGLES - 1100)
    obj = join([body, *nails(M), *sleeve(M)], NAME, hand_col)
    # join() put the origin at the bounds centre. Bring the mesh back to skeleton (world) coordinates, so the grip
    # morph can use the joint positions, then move the origin to the grip point, shape key included.
    obj.data.transform(Matrix.Translation(obj.location))
    obj.location = (0, 0, 0)
    add_grip_morph(obj)
    obj.data.transform(Matrix.Translation(-V(common.gl(*GRIP_POINT))), shape_keys=True)
    tris = common.triangle_count(obj)
    print(f"Hand: {tris} triangles (budget {BUDGET_TRIANGLES})")

    import texture  # noqa: E402  (reused baker)

    texture.bake_groups({"hand": (1024, [NAME])}, os.path.join(HAND_DIR, "textures"))
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print(f"Saved {BLEND}")


def export():
    obj = bpy.data.objects.get(NAME)
    errors = []
    if obj is None:
        common.fail(f"No object named {NAME}; run hand.py -- build first.")
    if not obj.data.shape_keys or "grip" not in obj.data.shape_keys.key_blocks:
        errors.append("The hand has no 'grip' shape key.")
    tris = common.triangle_count(obj)
    if tris > BUDGET_TRIANGLES:
        errors.append(f"The hand has {tris} triangles, over its budget of {BUDGET_TRIANGLES}.")
    if errors:
        for e in errors:
            print(f"error: {e}")
        sys.exit(1)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    os.makedirs(os.path.dirname(EXPORT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=EXPORT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_morph=True,
        export_morph_normal=True,
    )
    print(f"Validated the hand: {tris} triangles, grip morph present. Exported {EXPORT} ({os.path.getsize(EXPORT) / 1000:.1f} KB)")


mode = (common.args() or ["build"])[0]
if mode == "build":
    build()
elif mode == "export":
    export()
else:
    common.fail(f"Unknown mode {mode}: use build or export.")
