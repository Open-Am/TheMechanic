"""The mechanic's hand, from a MakeHuman body (plan 0009, ADRs 0015 and 0016).

    node tools/run-blender.mjs tools/blender/hand.py -- build     # body, poses, cut, sleeve, bake; saves assets/hand/blend/hand.blend
    node tools/run-blender.mjs tools/blender/hand.py -- export    # validate and export assets/hand/export/hand.glb

Needs the MPFB add-on and the MakeHuman system assets pack (CC0), installed for the user that runs Blender (ADR 0016
history). The shipped hand uses only MakeHuman's CC0 base mesh and rig; skin and cloth are baked by texture.py, never
MakeHuman's images (ADR 0016). Licences: assets/hand/LICENCE.md.

How it is made: MPFB makes an adult Nigerian man in his thirties with a working build. Its own skeleton poses the right
hand three ways: open (relaxed), grip (closed around a bar about 30 mm thick) and pinch (thumb tip to index tip). The
right hand and forearm are cut out of the body, keeping MakeHuman's topology, so every pose has the same vertices and
becomes a morph target. A rolled work-shirt sleeve hides the cut. The hand file contract (ADR 0016): one node named
mechanic_hand, origin at the grip point, fingers along -Z, palm facing -Y, forearm along +Z (glTF axes), metres.
The pinch point is stored on the node as the custom property pinch_point (glTF axes), exported as glTF extras.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
from shapes import join, mat  # noqa: E402

common.check_version()
HAND_DIR = os.path.join(common.ROOT, "assets", "hand")
BLEND = os.path.join(HAND_DIR, "blend", "hand.blend")
EXPORT = os.path.join(HAND_DIR, "export", "hand.glb")
NAME = "mechanic_hand"
BUDGET_TRIANGLES = common.BUDGETS["hand"]["triangles"]
MPFB = "bl_ext.user_default.mpfb"
COARSE = int(os.environ.get("HAND_COARSE", "20"))  # degrees between thumb search samples; larger is faster for tuning

V = Vector

# ---- The person ----

# MakeHuman macros, 0..1. Age 0.5 is 25 years and 1.0 is 90, so 0.58 is about 35. A muscular, average-weight man.
MACRO = {"gender": 1.0, "age": 0.58, "muscle": 0.72, "weight": 0.5, "proportions": 0.5, "height": 0.5, "cupsize": 0.5, "firmness": 0.5}
RACE = {"african": 1.0, "asian": 0.0, "caucasian": 0.0}
# Working hands: slightly thicker fingers, a stronger forearm.
EXTRA_TARGETS = {"r-hand-fingers-diameter-incr": 0.35, "r-lowerarm-muscle-incr": 0.4}

# ---- The poses, degrees ----
# Fingers 2..5 (index..little): flexion at MCP, PIP, DIP, then how far (0..1) the finger closes its spread towards the
# middle finger. The thumb is solved for each pose so its tip reaches a target (see Hand.solve_thumb).
OPEN = {2: (16, 22, 10, 0.5), 3: (18, 24, 12, 0.0), 4: (20, 27, 13, 0.5), 5: (22, 30, 15, 0.45)}
GRIP = {2: (66, 92, 55, 0.7), 3: (70, 96, 58, 0.0), 4: (72, 98, 60, 0.7), 5: (76, 100, 62, 0.6)}
PINCH = {2: (48, 58, 28, 0.3), 3: (52, 70, 38, 0.0), 4: (60, 82, 46, 0.5), 5: (68, 90, 50, 0.5)}
# Thumb targets, as the distance in metres its tip (bone end) should be from a point on the index finger:
# open, resting beside the index knuckle; grip, over the index finger's middle bone; pinch, pad to pad with the index tip.
THUMB_TARGETS = {"open": ("finger2-1.R", 0.0, 0.045), "grip": ("finger2-2.R", 0.5, 0.022), "pinch": ("finger2-3.R", 1.0, 0.017)}

# ---- The cut and the sleeve, metres from the wrist towards the elbow ----
CUT = 0.155
SLEEVE_FROM = 0.075
SLEEVE_TO = 1.2  # forearm and upper arm: long enough to always run off the screen, to a body just out of view
ARM_GROUPS = ("lowerarm01.R", "lowerarm02.R", "wrist.R")


def fingers_of(name):
    return name.startswith("finger") or name.startswith("metacarpal")


# ---- MakeHuman ----

def enable_mpfb():
    if MPFB not in bpy.context.preferences.addons:
        try:
            bpy.ops.preferences.addon_enable(module=MPFB)
        except Exception as e:  # noqa: BLE001
            common.fail(f"The MPFB add-on could not be enabled ({e}). Install it for this user (ADR 0016).")
    from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
    from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402

    return HumanService, TargetService


def make_body():
    HumanService, TargetService = enable_mpfb()
    macro = TargetService.get_default_macro_info_dict()
    macro.update(MACRO)
    macro["race"] = dict(RACE)
    body = HumanService.create_human(macro_detail_dict=macro)
    for target, weight in EXTRA_TARGETS.items():
        path = TargetService.target_full_path(target)
        if path:
            TargetService.load_target(body, path, weight=weight, name=target)
        else:
            print(f"warning: MakeHuman target {target} not found; skipped")
    rig = HumanService.add_builtin_rig(body, "default")
    for m in body.modifiers:
        if m.type == "MASK":
            m.show_viewport = False  # keep every vertex, so indices match across poses
    return body, rig


def bone_head(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].head


def bone_tail(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].tail


def evaluated_coords(body):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    coords = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return coords


def group_weights(body, names):
    idx = {g.index: g.name for g in body.vertex_groups}
    wanted = set(names)
    out = []
    for v in body.data.vertices:
        out.append(sum(g.weight for g in v.groups if idx.get(g.group) in wanted))
    return out


# ---- Posing ----

class Hand:
    """The rest-pose frame of the right hand, for posing: palm normal and finger curl axes, in armature space."""

    def __init__(self, body, rig, rest):
        self.rig = rig
        nails = group_weights(body, ["fingernails"])
        pts = [c for c, w in zip(rest, nails) if w > 0.5 and c.x < 0]
        nail_centre = sum(pts, V()) / len(pts)
        joints = sum((bone_head(rig, f"finger{i}-3.R") for i in range(2, 6)), V()) / 4
        self.forward = (bone_head(rig, "finger3-1.R") - bone_head(rig, "wrist.R")).normalized()
        across = bone_head(rig, "finger2-1.R") - bone_head(rig, "finger5-1.R")  # index knuckle minus little knuckle
        palm = across.cross(self.forward).normalized()
        if palm.dot(nail_centre - joints) > 0:  # the nails are on the back of the hand
            palm = -palm
        self.palm = palm  # out of the palm

    def set_rotation(self, bone, axis_world, degrees):
        pb = self.rig.pose.bones[bone]
        rest = (self.rig.matrix_world @ pb.bone.matrix_local).to_3x3()
        axis_local = (rest.inverted() @ axis_world).normalized()
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Matrix.Rotation(math.radians(degrees), 4, axis_local).to_quaternion()

    def curl_axis(self, bone):
        pb = self.rig.pose.bones[bone]
        rest = self.rig.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3()
        along = (rest @ V((0, 1, 0))).normalized()
        axis = along.cross(self.palm).normalized()  # rotating the tail about this axis moves it towards the palm
        return axis

    def reset(self):
        for pb in self.rig.pose.bones:
            if fingers_of(pb.name) and pb.name.endswith(".R"):
                pb.rotation_mode = "QUATERNION"
                pb.rotation_quaternion = (1, 0, 0, 0)

    def along(self, bone):
        pb = self.rig.pose.bones[bone]
        return (self.rig.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3() @ V((0, 1, 0))).normalized()

    def pose_fingers(self, fingers):
        middle = self.along("finger3-1.R")
        for i, (mcp, pip, dip, close) in fingers.items():
            base = f"finger{i}-1.R"
            q_curl = None
            for j, a in enumerate((mcp, pip, dip), start=1):
                self.set_rotation(f"finger{i}-{j}.R", self.curl_axis(f"finger{i}-{j}.R"), a)
                if j == 1:
                    q_curl = self.rig.pose.bones[base].rotation_quaternion.copy()
            if close > 0:
                d = self.along(base)
                axis = d.cross(middle)
                if axis.length > 1e-6:
                    self.set_rotation(base, axis.normalized(), math.degrees(d.angle(middle)) * close)
                    pb = self.rig.pose.bones[base]
                    pb.rotation_quaternion = pb.rotation_quaternion @ q_curl

    def pose_thumb(self, angles):
        """angles: (about the palm normal, about the hand's forward axis, flexion of the thumb's three bones)."""
        a_palm, a_fwd, f1, f2, f3 = angles
        q = (Matrix.Rotation(math.radians(a_palm), 3, self.palm) @ Matrix.Rotation(math.radians(a_fwd), 3, self.forward)).to_quaternion()
        self.set_rotation("finger1-1.R", self.curl_axis("finger1-1.R"), f1)
        pb = self.rig.pose.bones["finger1-1.R"]
        rest = (self.rig.matrix_world @ pb.bone.matrix_local).to_3x3().to_quaternion()
        pb.rotation_quaternion = rest.inverted() @ q @ rest @ pb.rotation_quaternion
        self.set_rotation("finger1-2.R", self.curl_axis("finger1-2.R"), f2)
        self.set_rotation("finger1-3.R", self.curl_axis("finger1-3.R"), f3)

    def pose(self, fingers, thumb):
        self.reset()
        self.pose_fingers(fingers)
        self.pose_thumb(thumb)
        bpy.context.view_layer.update()

    def solve_thumb(self, fingers, target):
        """Coordinate descent on the thumb's five angles, so its tip lands the given distance from a point on the
        index finger, with a small cost on every angle so the thumb takes the most natural way there."""
        bone, share, dist = target
        self.reset()
        self.pose_fingers(fingers)
        bpy.context.view_layer.update()
        h, t = bone_head(self.rig, bone), bone_tail(self.rig, bone)
        goal = h + (t - h) * share
        limits = [(-70, 70), (-30, 100), (-50, 60), (-40, 80), (-40, 80)]

        def cost(x):
            self.pose_thumb(x)
            bpy.context.view_layer.update()
            d = (bone_tail(self.rig, "finger1-3.R") - goal).length
            return abs(d - dist) + 0.00004 * sum(abs(v) for v in x), d

        # A coarse search first, so the descent does not settle in the first dip it finds.
        best, d, x = None, None, None
        for a in range(limits[0][0], limits[0][1] + 1, COARSE):
            for b in range(limits[1][0], limits[1][1] + 1, COARSE):
                for c in range(limits[2][0], limits[2][1] + 1, COARSE):
                    for f in (0, 30):
                        y = [a, b, c, f, f]
                        cy, dy = cost(y)
                        if best is None or cy < best:
                            best, d, x = cy, dy, y
        for step in (10, 5, 2, 1):
            improved = True
            while improved:
                improved = False
                for i in range(5):
                    for sgn in (1, -1):
                        y = list(x)
                        y[i] = min(limits[i][1], max(limits[i][0], y[i] + sgn * step))
                        c, dd = cost(y)
                        if c < best - 1e-7:
                            best, d, x, improved = c, dd, y, True
        print(f"Thumb {tuple(round(v) for v in x)}: tip {d * 1000:.1f} mm from its target (aim {dist * 1000:.0f} mm)")
        return tuple(x)


# ---- Cutting out the hand ----

def keep_mask(body, rig, rest):
    """Right hand and forearm vertices: weighted to the forearm, wrist or hand bones, up to CUT from the wrist."""
    names = [g.name for g in body.vertex_groups if g.name in ARM_GROUPS or (fingers_of(g.name) and g.name.endswith(".R"))]
    w = group_weights(body, names)
    skin = group_weights(body, ["body"])
    wrist = bone_head(rig, "wrist.R")
    up = (bone_head(rig, "lowerarm01.R") - wrist).normalized()  # towards the elbow
    keep = []
    for co, wi, si in zip(rest, w, skin):
        keep.append(wi > 0.5 and si > 0.5 and (co - wrist).dot(up) < CUT)
    return keep, wrist, up


def hand_mesh(body, keep, poses):
    """A new mesh of the kept vertices and the faces wholly inside them, with one coordinate list per pose."""
    old_to_new = {}
    for i, k in enumerate(keep):
        if k:
            old_to_new[i] = len(old_to_new)
    nails = group_weights(body, ["fingernails"])
    faces, nail_face = [], []
    for p in body.data.polygons:
        if all(keep[i] for i in p.vertices):
            faces.append([old_to_new[i] for i in p.vertices])
            nail_face.append(all(nails[i] > 0.5 for i in p.vertices))
    order = sorted(old_to_new, key=old_to_new.get)
    coords = {name: [c[i] for i in order] for name, c in poses.items()}
    return faces, nail_face, coords


def frame_matrix(palm, up, grip_point):
    """World (Blender) to the hand file's frame: forearm along +Z glTF (Blender -Y), palm facing -Y glTF (Blender -Z)."""
    arm = up  # forearm, towards the elbow
    dorsal = (-palm - arm * (-palm).dot(arm)).normalized()  # back of the hand -> Blender +Z (glTF +Y)
    fingers = -arm  # -> Blender +Y (glTF -Z)
    side = fingers.cross(dorsal)  # -> Blender +X
    rot = Matrix((side, fingers, dorsal))  # rows: each world vector's component on Blender X, Y, Z
    return rot.to_4x4() @ Matrix.Translation(-grip_point)


def grip_centre(rig):
    """The bar the gripping fingers close around: a circle fitted through each finger's joints, averaged."""
    centres, radii = [], []
    for i in range(2, 6):
        pts = [bone_head(rig, f"finger{i}-1.R"), bone_head(rig, f"finger{i}-2.R"), bone_head(rig, f"finger{i}-3.R"), bone_tail(rig, f"finger{i}-3.R")]
        c, r = circle_through(pts[1], pts[2], pts[3])
        centres.append(c)
        radii.append(r)
    c = sum(centres, V()) / len(centres)
    print(f"Grip: joints on a circle of about {sum(radii) / len(radii) * 1000:.0f} mm radius around the bar")
    return c


def circle_through(a, b, c):
    ab, ac = b - a, c - a
    n = ab.cross(ac)
    if n.length < 1e-9:
        return (a + c) / 2, (c - a).length / 2
    centre = a + (ac.length_squared * n.cross(ab) + ab.length_squared * ac.cross(n)) / (2 * n.length_squared)
    return centre, (centre - a).length


# The sleeve's profile from its open end up the arm: (metres along the arm, radius added to the arm's). The open end
# is rolled back on itself, so the cloth shows a thick lip and a rolled cuff, then folds loosely up the arm.
SLEEVE_PROFILE = [
    (0.003, -0.004), (-0.002, -0.001), (0.0, 0.004), (0.004, 0.008), (0.018, 0.009), (0.032, 0.008), (0.037, 0.004),
    (0.045, 0.006), (0.075, 0.009), (0.11, 0.007), (0.15, 0.010), (0.2, 0.008), (0.33, 0.010), (0.55, 0.014), (0.8, 0.020), (SLEEVE_TO - SLEEVE_FROM, 0.026),
]
SLEEVE_SEGMENTS = 16
SLEEVE_LIP_GAP = 0.0015  # metres between the cuff's inner lip and the arm


def build_sleeve(coords_open, wrist, M):
    """A loose, rolled work-shirt sleeve over the cut, sized to the forearm, with folds. Closed, so the hand is never
    seen hollow (the owner, 2026-10-11): the cuff's inner lip hugs the arm, so there is no gap to see into, and the far
    end is capped. Coordinates are Blender's in the hand frame: the forearm runs along Blender -Y from the wrist."""
    band = [p for p in coords_open if SLEEVE_FROM - 0.01 < wrist.y - p.y < CUT]
    cx = sum(p.x for p in band) / len(band)
    cz = sum(p.z for p in band) / len(band)
    radius = max(math.hypot(p.x - cx, p.z - cz) for p in band)

    def arm_radius(along, t):
        """How far the arm reaches from the sleeve's axis in direction t, near `along` from the wrist."""
        near = [p for p in coords_open if abs((wrist.y - p.y) - along) < 0.008]
        best = 0.0
        for p in near:
            a = math.atan2(p.z - cz, p.x - cx)
            if abs(math.atan2(math.sin(a - t), math.cos(a - t))) < math.pi / SLEEVE_SEGMENTS * 1.5:
                best = max(best, math.hypot(p.x - cx, p.z - cz))
        return best or radius

    bm = bmesh.new()
    rings = []
    for k, (along, dr) in enumerate(SLEEVE_PROFILE):
        y = wrist.y - (SLEEVE_FROM + along)
        ring = []
        for j in range(SLEEVE_SEGMENTS):
            t = 2 * math.pi * j / SLEEVE_SEGMENTS
            # Cloth is never a perfect circle: a few soft folds that drift around the arm from ring to ring.
            wobble = 1 + 0.045 * math.sin(3 * t + 1.7 * k) + 0.025 * math.sin(5 * t + 0.9 * k)
            r = (radius + dr) * (wobble if k > 2 else 1.0)
            if k == 0:  # the inner lip lies on the arm, closing the cuff
                r = arm_radius(SLEEVE_FROM + along, t) + SLEEVE_LIP_GAP
            elif k == 1:
                r = (arm_radius(SLEEVE_FROM + SLEEVE_PROFILE[0][0], t) + SLEEVE_LIP_GAP + radius + dr) / 2
            ring.append(bm.verts.new((cx + r * math.cos(t), y, cz + r * math.sin(t))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(SLEEVE_SEGMENTS):
            jn = (j + 1) % SLEEVE_SEGMENTS
            bm.faces.new((a[j], a[jn], b[jn], b[j]))
    end = rings[-1]
    centre = bm.verts.new((sum(v.co.x for v in end) / len(end), end[0].co.y, sum(v.co.z for v in end) / len(end)))
    for j in range(SLEEVE_SEGMENTS):
        bm.faces.new((end[j], end[(j + 1) % SLEEVE_SEGMENTS], centre))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("sleeve")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M["cloth"])
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new("sleeve", me)
    bpy.context.scene.collection.objects.link(obj)
    print(f"Sleeve: over a forearm of {radius * 1000:.0f} mm radius")
    return [obj]


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


def to_gl(p):
    return V((p.x, p.z, -p.y))


def build(preview_dir=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    body, rig = make_body()
    rest = evaluated_coords(body)
    hand = Hand(body, rig, rest)

    poses, tips = {}, {}
    for name, fingers in (("open", OPEN), ("grip", GRIP), ("pinch", PINCH)):
        hand.pose(fingers, hand.solve_thumb(fingers, THUMB_TARGETS[name]))
        poses[name] = evaluated_coords(body)
        if name == "grip":
            grip_point = grip_centre(rig)
        if name == "pinch":
            tips["pinch"] = (bone_tail(rig, "finger1-3.R") + bone_tail(rig, "finger2-3.R")) / 2

    keep, wrist, up = keep_mask(body, rig, rest)
    faces, nail_face, coords = hand_mesh(body, keep, poses)
    to_frame = frame_matrix(hand.palm, up, grip_point)
    # Measured on MPFB 2.0.18, the hand of the bones named .R comes out of this frame as a left hand (thumb on the
    # right), so the frame mirrors left to right; faces are reversed to keep them facing out. The check below fails
    # the build if a later MPFB changes this.
    to_frame = Matrix.Scale(-1, 4, V((1, 0, 0))) @ to_frame
    faces = [list(reversed(f)) for f in faces]
    for name in coords:
        coords[name] = [to_frame @ c for c in coords[name]]
    wrist_f = to_frame @ wrist
    pinch_gl = to_gl(to_frame @ tips["pinch"])
    # A right hand, palm down, fingers away from the viewer has its thumb on the left (-X) and its nails up (+Y).
    hand.pose(OPEN, (0, 0, 0, 0, 0))
    thumb = to_gl(to_frame @ bone_tail(rig, "finger1-3.R"))
    little = to_gl(to_frame @ bone_head(rig, "finger5-1.R"))
    nails = sum((to_gl(to_frame @ c) for c, w in zip(rest, group_weights(body, ["fingernails"])) if w > 0.5 and c.x < 0), V())
    print(f"Check: thumb x {thumb.x * 1000:.0f} mm, little knuckle x {little.x * 1000:.0f} mm, nails y {nails.y:.3f}")
    if not (thumb.x < little.x and nails.y > 0):
        common.fail("The hand came out mirrored or upside down: its thumb must be on the left and its nails on top.")

    # The body is no longer needed.
    for o in (body, rig):
        bpy.data.objects.remove(o, do_unlink=True)

    hand_col = common.ensure_collection("hand")
    lookdev()
    M = {
        "skin": mat("skin", "#5b3a29", 0.0, 0.55),
        "nail": mat("nail", "#b48f80", 0.0, 0.35),
        "cloth": mat("cloth", "#3b5272", 0.0, 0.9),
    }
    me = bpy.data.meshes.new("hand_body")
    me.from_pydata(coords["open"], [], faces)
    me.materials.append(M["skin"])
    me.materials.append(M["nail"])
    for poly, is_nail in zip(me.polygons, nail_face):
        poly.material_index = 1 if is_nail else 0
        poly.use_smooth = True
    me.validate()
    # Close the forearm's cut end, so the arm is solid even if it is seen inside the sleeve. Faces only: the vertices,
    # and so the morph targets, are unchanged.
    bm = bmesh.new()
    bm.from_mesh(me)
    n_verts = len(bm.verts)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    assert len(bm.verts) == n_verts
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    body_obj = bpy.data.objects.new("hand_body", me)
    hand_col.objects.link(body_obj)

    sleeve = build_sleeve(coords["open"], wrist_f, M)
    obj = join([body_obj, *sleeve], NAME, hand_col)
    # join() put the origin at the bounds centre; bring the origin back to the grip point.
    obj.data.transform(Matrix.Translation(obj.location))
    obj.location = (0, 0, 0)
    obj.data.set_sharp_from_angle(angle=math.radians(70))  # skin stays smooth even where fingers meet the palm

    # Morph targets: the hand body's vertices come first in the joined mesh (join keeps the active object's first).
    n_body = len(coords["open"])
    obj.shape_key_add(name="Basis")
    for name in ("grip", "pinch"):
        key = obj.shape_key_add(name=name)
        for i in range(n_body):
            key.data[i].co = coords[name][i]
        key.value = 0.0
    check_body_first(obj, coords["open"])
    obj["pinch_point"] = [round(c, 5) for c in pinch_gl]
    set_tip_point(obj)
    tris = common.triangle_count(obj)
    print(f"Hand: {tris} triangles (budget {BUDGET_TRIANGLES}); pinch point {obj['pinch_point']}")
    if tris > BUDGET_TRIANGLES and not preview_dir:
        common.fail(f"The hand has {tris} triangles, over its budget of {BUDGET_TRIANGLES}.")

    if preview_dir:
        preview(obj, preview_dir)
        return

    import texture  # noqa: E402  (reused baker)

    texture.bake_groups({"hand": (1024, [NAME])}, os.path.join(HAND_DIR, "textures"))
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    print(f"Saved {BLEND}")


def preview(obj, out_dir):
    """Quick untextured renders of each pose from the game's usual angle and from the side, for tuning."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = 640
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    views = {"top": V(common.gl(0.12, 0.30, -0.30)), "side": V(common.gl(-0.45, 0.02, -0.02)), "front": V(common.gl(0.02, -0.05, -0.45))}
    target = V(common.gl(0.0, 0.0, 0.06))
    keys = obj.data.shape_keys.key_blocks
    for pose in ("open", "grip", "pinch"):
        for k in ("grip", "pinch"):
            keys[k].value = 1.0 if k == pose else 0.0
        for view, at in views.items():
            cam.location = at
            cam.rotation_euler = (target - at).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = os.path.join(out_dir, f"{pose}-{view}.png")
            bpy.ops.render.render(write_still=True)
    print(f"Previews in {out_dir}")


def set_tip_point(obj):
    """The open hand's fingertips, for the hovering hand (ADR 0020): its most forward vertex (fingers point -Z, glTF)."""
    base = obj.data.shape_keys.key_blocks["Basis"].data if obj.data.shape_keys else obj.data.vertices
    tip = max(base, key=lambda v: v.co.y)  # Blender +Y is glTF -Z
    obj["tip_point"] = [round(tip.co.x, 5), round(tip.co.z, 5), round(-tip.co.y, 5)]


def check_body_first(obj, open_coords):
    """join() must have kept the hand body's vertices first, in order, for the morph targets to line up."""
    for i in (0, len(open_coords) // 2, len(open_coords) - 1):
        if (obj.data.vertices[i].co - open_coords[i]).length > 1e-5:
            common.fail("The joined mesh does not start with the hand body's vertices; the morph targets would not line up.")


def export():
    obj = bpy.data.objects.get(NAME)
    errors = []
    if obj is None:
        common.fail(f"No object named {NAME}; run hand.py -- build first.")
    keys = obj.data.shape_keys.key_blocks if obj.data.shape_keys else {}
    for k in ("grip", "pinch"):
        if k not in keys:
            errors.append(f"The hand has no '{k}' shape key.")
    if "pinch_point" not in obj:
        errors.append("The hand has no pinch_point property.")
    tris = common.triangle_count(obj)
    if tris > BUDGET_TRIANGLES:
        errors.append(f"The hand has {tris} triangles, over its budget of {BUDGET_TRIANGLES}.")
    set_tip_point(obj)
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
        export_extras=True,
        export_materials="EXPORT",
        export_morph=True,
        export_morph_normal=True,
    )
    print(f"Validated the hand: {tris} triangles, grip and pinch morphs present. Exported {EXPORT} ({os.path.getsize(EXPORT) / 1000:.1f} KB)")


mode = (common.args() or ["build"])[0]
if mode == "build":
    build()
elif mode == "preview":
    build(preview_dir=(common.args() + [os.path.join(HAND_DIR, "match", "preview")])[1])
elif mode == "export":
    export()
else:
    common.fail(f"Unknown mode {mode}: use build, preview or export.")
