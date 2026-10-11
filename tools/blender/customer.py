"""The 3D customers, one file per look, from MakeHuman bodies (plan 0015, ADRs 0015, 0020 and 0023).

    node tools/run-blender.mjs tools/blender/customer.py -- build [look ...]           # body, clothes, rig, clips, bake; saves assets/customers/blend/<look>.blend
    node tools/run-blender.mjs tools/blender/customer.py -- preview <dir> [look ...]   # the same without baking, renders front, three-quarter, game view and clip strips
    node tools/run-blender.mjs tools/blender/customer.py -- render <dir> [look ...]    # renders the baked .blend files the same way, for match images
    node tools/run-blender.mjs tools/blender/customer.py -- export [look ...]          # validates and exports assets/customers/export/<look>.glb

The looks come from game/public/customers.json; with no look named, every look there is built.

Needs the MPFB add-on and the MakeHuman system assets pack (CC0), installed for the user that runs Blender (ADR 0016
history, ADR 0020). What ships from MakeHuman: the base mesh (its body and its eye helper spheres) with its macro
targets, and the CC0 "game_engine" skeleton and its weights. Clothes, head tie, cap, every texture and every animation
clip are made here and are the project's own work. MakeHuman's images, clothes, hair and proxies are not used.
Licences: assets/customers/LICENCE.md.

How a person is made:
  1. MPFB makes the body from the look's macro settings (sex, age, weight, muscle, height; African), kept near average
     so no feature is exaggerated (ADR 0015: real everyday Lagos people, never caricatures), and adds the game_engine
     rig (53 joints).
  2. The body's own surface becomes the fitted clothes: each vertex is given a zone from the bone that moves it most
     and its height (top, bottom, skin, hair), and clothed zones are smoothed and pushed out along their normals by the
     cloth's thickness. Loose garments (a wrapper, the long kaftan's skirt) are lofted tubes fitted round the body and
     weighted between the pelvis and the legs; the legs inside them are removed. A cap or a head tie is shaped on the
     head.
  3. The mesh is decimated to the budget, keeping more of the face and less of the hands, and its weights are limited
     to four joints per vertex.
  4. The clips of plan 0015 reading 5 are keyframed on the skeleton by aiming bones in character space.
  5. Skin, cloth and eyes are procedural materials (wax print of our own design, plain cloth, denim, skin with brows
     and hairline drawn by position) baked by texture.py into one 1024 px set.
Bones and clips are named after the look: bones <look>_<bone> (an underscore, because three.js strips dots from node
names) and clips <look>.<clip>. The armature, the file's one root node, is customer_<look>.
"""

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()
CUSTOMERS_JSON = os.path.join(common.ROOT, "game", "public", "customers.json")
DIR = os.path.join(common.ROOT, "assets", "customers")
MPFB = "bl_ext.user_default.mpfb"
BUDGET = common.BUDGETS["customers"]
TRI_TARGET = int(os.environ.get("CUSTOMER_TRIS", str(int(BUDGET["trianglesPerLook"] * 0.95))))
FPS = 30
V = Vector


def blend_path(look):
    return os.path.join(DIR, "blend", f"{look}.blend")


def export_path(look):
    return os.path.join(DIR, "export", f"{look}.glb")


# ---- The people (plan 0015 reading 3) ----
# MakeHuman macros, 0..1. Age 0.5 is 25 years and 1.0 is 90 (so 0.69 is about 50 and 0.73 about 55). Weight and
# muscle 0.5 are average. Everything stays near the middle: these are ordinary people, not types.

LOOKS = {
    "woman_market": {
        "macro": {"gender": 0.0, "age": 0.69, "muscle": 0.42, "weight": 0.74, "proportions": 0.5, "height": 0.36, "cupsize": 0.55, "firmness": 0.4},
        "skin": "#5a3826",
        "top": {"kind": "blouse", "sleeve": ("upperarm", 0.95), "neck": 0.055, "thickness": 0.01, "loose": 0.008, "hem": "hip", "taper": -0.05, "sleeve_flare": 0.35},
        "bottom": None,
        "skirt": {"top": "waist", "bottom": "ankle", "flare": 0.015, "margin": 0.018, "material": "wrapper"},
        "head": "headtie",
        "hair": None,
        "feet": "slippers",
        "materials": {
            "top": {"kind": "print", "palette": ["#1e2a5e", "#d9a21f", "#c2451c", "#efdfba"], "scale": 9.0},
            "wrapper": {"kind": "print", "palette": ["#1e2a5e", "#d9a21f", "#c2451c", "#efdfba"], "scale": 9.0},
            "headwear": {"kind": "print", "palette": ["#2f5d3a", "#e0b54a", "#a9331f", "#f1e6c8"], "scale": 14.0},
            "strap": {"kind": "fabric", "colour": "#5a3a22", "roughness": 0.6},
        },
        "stride": 16,
    },
    "man_kaftan": {
        "macro": {"gender": 1.0, "age": 0.73, "muscle": 0.48, "weight": 0.58, "proportions": 0.5, "height": 0.34, "cupsize": 0.5, "firmness": 0.5},
        "skin": "#4b2e20",
        "top": {"kind": "kaftan", "sleeve": ("lowerarm", 0.9), "neck": 0.04, "thickness": 0.01, "loose": 0.012, "hem": "hip", "taper": -0.12, "sleeve_flare": 0.6},
        "bottom": {"kind": "trousers", "thickness": 0.008, "hem": 0.025, "hem_radius": 0.068},
        "skirt": {"top": "hip", "bottom": "shin", "flare": 0.06, "margin": 0.03, "material": "top"},
        "head": "cap",
        "hair": {"front": 0.07, "grey": 0.35},
        "beard": True,
        "feet": "sandals",
        "materials": {
            "top": {"kind": "fabric", "colour": "#93a9ba", "roughness": 0.8},
            "bottom": {"kind": "fabric", "colour": "#8ea4b5", "roughness": 0.8},
            "headwear": {"kind": "cap", "colour": "#e4d9c1", "pattern": "#7a2a24"},
            "strap": {"kind": "fabric", "colour": "#4a2c1a", "roughness": 0.55},
        },
        "stride": 22,
    },
    "man_young": {
        "macro": {"gender": 1.0, "age": 0.5, "muscle": 0.55, "weight": 0.4, "proportions": 0.5, "height": 0.38, "cupsize": 0.5, "firmness": 0.5},
        "skin": "#5c3a27",
        "top": {"kind": "tshirt", "sleeve": ("upperarm", 0.48), "neck": 0.03, "thickness": 0.007, "loose": 0.004, "hem": "belt", "taper": 0.07, "sleeve_flare": 0.12},
        "bottom": {"kind": "jeans", "thickness": 0.006, "hem": 0.015, "hem_radius": 0.058},
        "skirt": None,
        "head": None,
        "hair": {"front": 0.06, "grey": 0.0},
        "feet": "slides",
        "materials": {
            "top": {"kind": "fabric", "colour": "#9b2d29", "roughness": 0.85},
            "bottom": {"kind": "denim", "colour": "#2e4566", "roughness": 0.85},
            "strap": {"kind": "fabric", "colour": "#161616", "roughness": 0.5},
        },
        "stride": 26,
    },
}

CLIPS = ("idle", "arrive", "waiting", "annoyed", "annoyed_idle", "failed_pull", "pleased", "leaving")
BASE_BONES = ("Root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head")


def looks_from_json():
    with open(CUSTOMERS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return [c["look"] for c in data["customers"]]


# ---- MakeHuman ----

def enable_mpfb():
    if MPFB not in bpy.context.preferences.addons:
        try:
            bpy.ops.preferences.addon_enable(module=MPFB)
        except Exception as e:  # noqa: BLE001
            common.fail(f"The MPFB add-on could not be enabled ({e}). Install it for this user (ADR 0016 history, ADR 0020).")
    from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
    from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402

    return HumanService, TargetService


def make_body(spec):
    HumanService, TargetService = enable_mpfb()
    macro = TargetService.get_default_macro_info_dict()
    macro.update(spec["macro"])
    macro["race"] = {"african": 1.0, "asian": 0.0, "caucasian": 0.0}
    body = HumanService.create_human(macro_detail_dict=macro)
    rig = HumanService.add_builtin_rig(body, "game_engine")
    return body, rig


def group_weights(obj, names):
    idx = {g.index: g.name for g in obj.vertex_groups}
    wanted = set(names)
    return [sum(g.weight for g in v.groups if idx.get(g.group) in wanted) for v in obj.data.vertices]


def bake_shape(body):
    """Applies MakeHuman's targets to the mesh and drops the helper mask, so the vertices are the shaped body."""
    for m in list(body.modifiers):
        if m.type == "MASK":
            body.modifiers.remove(m)
    if body.data.shape_keys:
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)


# ---- Landmarks ----

class Body:
    """Rest-pose landmarks of the body, in Blender world coordinates (the rig is at the origin, the person faces -Y)."""

    def __init__(self, body, rig):
        self.rig = rig
        # Cached by the bones' MakeHuman names, so they still answer after the bones are renamed for the look.
        heads = {b.name: rig.matrix_world @ b.head_local for b in rig.data.bones}
        tails = {b.name: rig.matrix_world @ b.tail_local for b in rig.data.bones}
        h = lambda b: heads[b]  # noqa: E731
        t = lambda b: tails[b]  # noqa: E731
        self.head, self.tail = h, t
        self.z_ankle = (h("foot_l").z + h("foot_r").z) / 2
        self.z_knee = (h("calf_l").z + h("calf_r").z) / 2
        self.z_hipjoint = (h("thigh_l").z + h("thigh_r").z) / 2
        self.z_pelvis = h("pelvis").z
        self.z_waist = h("spine_02").z
        self.z_belt = (h("spine_01").z + h("pelvis").z) / 2 + 0.02
        self.z_hip = self.z_hipjoint - 0.02
        self.z_neck = h("neck_01").z
        self.z_chest = h("spine_03").z + 0.04
        self.neck_y = h("neck_01").y
        self.z_head = h("head").z
        self.head_top = max(v.co.z for v in body.data.vertices)
        eyes = []
        for side in ("l", "r"):
            w = group_weights(body, [f"helper-{side}-eye"])
            pts = [v.co for v, wi in zip(body.data.vertices, w) if wi > 0.5]
            eyes.append(sum(pts, V()) / len(pts))
        self.eyes = eyes  # left (+X) then right
        self.eye_z = (eyes[0].z + eyes[1].z) / 2
        self.eye_y = (eyes[0].y + eyes[1].y) / 2
        head_pts = [v.co for v in body.data.vertices if v.co.z > self.z_neck + 0.06]
        self.head_centre = V((0.0, sum(p.y for p in head_pts) / len(head_pts), (self.eye_z + self.head_top) / 2 - 0.01))
        self.head_front = min(p.y for p in head_pts)
        self.head_back = max(p.y for p in head_pts)
        self.z_shin = self.z_ankle + (self.z_knee - self.z_ankle) * 0.45
        print(
            f"Landmarks: ankle {self.z_ankle:.3f} knee {self.z_knee:.3f} hip {self.z_hip:.3f} belt {self.z_belt:.3f} waist {self.z_waist:.3f} "
            f"neck {self.z_neck:.3f} eyes {self.eye_z:.3f} top {self.head_top:.3f}"
        )

    def level(self, name):
        return {"waist": self.z_waist + 0.02, "hip": self.z_hip, "belt": self.z_belt, "ankle": self.z_ankle + 0.05, "shin": self.z_shin, "knee": self.z_knee}[name]


# ---- Zones ----

ARM = {"upperarm": 0, "lowerarm": 1}
TORSO = {"pelvis", "spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r"}
LEGS = {"thigh_l", "thigh_r", "calf_l", "calf_r"}
FEET = {"foot_l", "foot_r", "ball_l", "ball_r"}


def dominant_bones(body, bone_names):
    idx = {g.index: g.name for g in body.vertex_groups}
    names = set(bone_names)
    out = []
    for v in body.data.vertices:
        best, bw = None, 0.0
        for g in v.groups:
            n = idx.get(g.group)
            if n in names and g.weight > bw:
                best, bw = n, g.weight
        out.append(best)
    return out


def along(body_lm, bone, p):
    a, b = body_lm.head(bone), body_lm.tail(bone)
    d = b - a
    return (p - a).dot(d) / d.length_squared


def classify(body, lm, spec, dom):
    """A zone for every vertex: skin, top, bottom, hidden (removed: inside a loose garment), feet, eye, lips, nail."""
    eyes = [a > 0.5 or b > 0.5 for a, b in zip(group_weights(body, ["helper-l-eye"]), group_weights(body, ["helper-r-eye"]))]
    lips = group_weights(body, ["lips"])
    nails = group_weights(body, ["fingernails", "toenails"])
    top, bottom, skirt = spec["top"], spec["bottom"], spec["skirt"]
    hem_top = lm.level(top["hem"]) if top else None
    sleeve_bone, sleeve_t = top["sleeve"] if top else (None, 0)
    skirt_top = lm.level(skirt["top"]) if skirt else None
    skirt_bottom = lm.level(skirt["bottom"]) if skirt else None
    zones = []
    for v, d, e, li, na in zip(body.data.vertices, dom, eyes, lips, nails):
        p = v.co
        z = "skin"
        if e:
            z = "eye"
        elif li > 0.5:
            z = "lips"
        elif na > 0.5:
            z = "nail"
        elif d is None:
            z = "skin"
        elif d in FEET or (d in ("calf_l", "calf_r") and p.z < lm.z_ankle + 0.02):
            z = "feet"
        else:
            base = d[:-2] if d.endswith(("_l", "_r")) else d
            in_top = False
            if top:
                front = max(0.0, min(1.0, (lm.neck_y - p.y) / 0.07))
                neckline = lm.z_neck + 0.015 - (top["neck"] + 0.015) * front
                if d in TORSO and p.z < neckline and (d != "pelvis" or p.z > hem_top):
                    in_top = True
                elif base in ARM:
                    rank = ARM[base]
                    t = along(lm, d, p)
                    if rank < ARM[sleeve_bone] or (rank == ARM[sleeve_bone] and t < sleeve_t):
                        in_top = True
                elif d == "neck_01" and p.z < neckline:
                    in_top = True
            if in_top:
                z = "top"
            elif bottom and (d in LEGS or d == "pelvis") and p.z > lm.z_ankle + bottom["hem"]:
                z = "bottom"
            if skirt and (d in LEGS or d == "pelvis") and skirt_bottom + 0.07 < p.z < skirt_top - 0.06 and z != "top":
                z = "hidden"
        zones.append(z)
    return zones


# ---- Shaping the body ----

def neighbours(me):
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    return nb


def smooth(co, nb, mask, iterations, factor=0.5):
    """Laplacian smoothing of the masked vertices; the rest stay put."""
    co = co.copy()
    idx = np.nonzero(mask)[0]
    for _ in range(iterations):
        avg = np.array([co[nb[i]].mean(axis=0) if nb[i] else co[i] for i in idx])
        co[idx] = co[idx] * (1 - factor) + avg * factor
    return co


def vertex_normals(me, co):
    me.vertices.foreach_set("co", co.ravel())
    me.update()
    n = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("normal", n)
    return n.reshape(-1, 3)


def ramp(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def radial_profile(theta, r, bins=48):
    """The largest radius in each of `bins` directions, gaps filled from their neighbours."""
    k = ((theta + math.pi) / (2 * math.pi) * bins).astype(int) % bins
    prof = np.full(bins, np.nan)
    for b in range(bins):
        sel = r[k == b]
        if len(sel):
            prof[b] = sel.max()
    good = ~np.isnan(prof)
    if not good.any():
        return np.zeros(bins), k
    idx = np.arange(bins)
    prof = np.interp(idx, idx[good], prof[good], period=bins)
    prof = (np.roll(prof, 1) + 2 * prof + np.roll(prof, -1)) / 4
    return prof, k


def drape_torso(co, mask, lm, top, z_hem):
    """Cloth hangs from the chest: below the chest no vertex sits closer to the body's axis than the chest did in its
    direction (narrowing by `taper` towards the hem, or flaring if negative). Belly and hips that stand out stay."""
    z_chest = lm.z_chest
    cy = float(co[mask & (np.abs(co[:, 2] - z_chest) < 0.03), 1].mean())
    d = co[:, :2] - np.array([0.0, cy])
    r = np.linalg.norm(d, axis=1)
    theta = np.arctan2(d[:, 1], d[:, 0])
    band = mask & (np.abs(co[:, 2] - z_chest) < 0.035)
    prof, k = radial_profile(theta[band], r[band])
    _, kall = radial_profile(theta, r)
    s = np.clip((z_chest - co[:, 2]) / max(0.05, z_chest - z_hem), 0.0, 1.0)
    target = prof[kall] * (1.0 - top["taper"] * s)
    w = ramp(0.0, 0.25, s) * (co[:, 2] < z_chest)
    grow = mask & (r < target)
    scale = np.where(grow, 1.0 + (target / np.maximum(r, 1e-6) - 1.0) * w, 1.0)
    co[:, 0] = d[:, 0] * scale
    co[:, 1] = cy + d[:, 1] * scale
    return co


def drape_tube(co, mask, a, b, r_of_s, s_from=0.0, inner_x=None):
    """Pushes the masked vertices out from the line a->b to at least r_of_s(s) (s 0..1 along the line), so a sleeve or
    a trouser leg hangs as a tube rather than following the muscle. inner_x keeps a leg from crossing the middle."""
    a, b = np.array(a), np.array(b)
    ax = b - a
    L2 = float(ax @ ax)
    s = np.clip(((co - a) @ ax) / L2, 0.0, 1.0)
    foot = a + s[:, None] * ax
    rad = co - foot
    r = np.linalg.norm(rad, axis=1)
    target = r_of_s(s) * ramp(s_from, s_from + 0.12, s)
    grow = mask & (r < target)
    co[grow] = foot[grow] + rad[grow] / np.maximum(r[grow], 1e-6)[:, None] * target[grow][:, None]
    if inner_x is not None:
        side = np.sign(inner_x)
        bad = mask & (co[:, 0] * side < abs(inner_x))
        co[bad, 0] = inner_x
    return co


def drape_limb(co, mask, a, b, s_ref, r_of, s_from, pct, inner_x=None):
    """A sleeve or trouser leg hanging as a tube: its axis runs through the centres of the limb's slices near the top
    and near the end (not the bone, which sits off-centre in the flesh), and its radius at s_ref is a percentile of
    the limb's own radius there, so a buttock or a deltoid does not blow it up."""
    a, b = np.array(a), np.array(b)
    ab = b - a
    sv = ((co - a) @ ab) / float(ab @ ab)

    def centre(s0):
        sel = mask & (np.abs(sv - s0) < 0.04)
        return co[sel].mean(axis=0) if sel.any() else a + ab * s0

    c0, c1 = centre(s_ref), centre(0.85)
    axis = (c1 - c0) / np.linalg.norm(c1 - c0)
    a2 = c0 - axis * (s_ref * np.linalg.norm(ab))
    b2 = a2 + axis * np.linalg.norm(ab)
    band = mask & (np.abs(sv - s_ref) < 0.04)
    if not band.any():
        return co
    rad = np.linalg.norm(np.cross(co[band] - c0, axis), axis=1)
    r0 = float(np.percentile(rad, pct))
    return drape_tube(co, mask, a2, b2, lambda s: r_of(s, r0), s_from=s_from, inner_x=inner_x)


def shape_clothes(body, lm, spec, zones, dom):
    """Shapes the clothed zones: cloth hangs from the chest, sleeves and trouser legs hang as tubes, the body's detail
    is smoothed away under it, and everything clothed is pushed out by the cloth's thickness. A head tie is shaped on
    the head; men's short hair is a couple of millimetres of lift over the scalp."""
    me = body.data
    nb = neighbours(me)
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    z = np.array(zones)
    d = np.array([x or "" for x in dom])
    offset = np.zeros(len(co))
    top, bottom = spec["top"], spec["bottom"]
    if top:
        m = z == "top"
        co = smooth(co, nb, m, 6 if top["loose"] > 0.01 else 3)
        torso = m & np.isin(d, list(TORSO | {"neck_01"}))
        co = drape_torso(co, torso, lm, top, lm.level(top["hem"]))
        for side in ("l", "r"):
            arm = m & np.isin(d, [f"upperarm_{side}", f"lowerarm_{side}"])
            a, b = lm.head(f"upperarm_{side}"), lm.tail(f"lowerarm_{side}")
            co = drape_limb(co, arm, a, b, 0.22, lambda s, r0, f=top["sleeve_flare"]: r0 * (1.0 + f * s), s_from=0.12, pct=80)
        offset[m] = top["thickness"]
        h = (co[:, 2] - lm.z_hip) / max(0.01, lm.z_neck - lm.z_hip)
        tm = torso & (h < 0.9)
        offset[tm] += top["loose"] * np.clip(1.0 - np.abs(h[tm] - 0.35) * 1.4, 0.2, 1.0)
    if bottom:
        m = z == "bottom"
        co = smooth(co, nb, m, 2)
        for side, sx in (("l", 1.0), ("r", -1.0)):
            leg = m & np.isin(d, [f"thigh_{side}", f"calf_{side}"])
            a, b = lm.head(f"thigh_{side}"), lm.head(f"foot_{side}")
            r_hem = bottom["hem_radius"]
            co = drape_limb(co, leg, a, b, 0.22, lambda s, r0, r1=r_hem: np.maximum(r0 + (r1 - r0) * (s - 0.22) / 0.78, r1), s_from=0.22, pct=70, inner_x=0.004 * sx)
        offset[m] = bottom["thickness"]
    clothed = (z == "top") | (z == "bottom")
    co = smooth(co, nb, clothed, 2, 0.4)
    # Hems: a step half the cloth's thickness where cloth meets skin.
    for i in np.nonzero(clothed)[0]:
        if any(z[j] in ("skin", "feet") for j in nb[i]):
            offset[i] *= 0.5
    head = spec["head"]
    if head == "headtie":
        tie = headtie_mask(co, lm, zones)
        centre = np.array(lm.head_centre)
        dv = co - centre
        r = np.linalg.norm(dv, axis=1, keepdims=True)
        u = dv / np.maximum(r, 1e-6)
        lift = 0.012 + 0.016 * np.clip(u[:, 2], 0, 1) + 0.022 * np.clip(u[:, 1], 0, 1) * np.clip(u[:, 2] + 0.3, 0, 1)
        co = smooth(co, nb, tie > 0, 4)
        co = co + u * (lift * tie)[:, None]
        for i in np.nonzero(tie > 0)[0]:
            zones[i] = "headwear"
    if spec["hair"]:
        hm = hair_mask(co, lm, spec["hair"]["front"], zones)
        normals = vertex_normals(me, co)
        co = co + normals * (0.0022 * hm)[:, None]
    normals = vertex_normals(me, co)
    co = co + normals * offset[:, None]
    me.vertices.foreach_set("co", co.ravel())
    me.update()


def headtie_mask(co, lm, zones):
    """1 for head vertices under the head tie: above a line that runs from just over the brows at the front, over the
    tops of the ears, to the nape."""
    front = lm.eye_z + 0.03
    back = lm.z_head + 0.02
    span = lm.head_back - lm.head_front
    out = np.zeros(len(co))
    for i, p in enumerate(co):
        if zones[i] not in ("skin",) or p[2] < lm.z_neck + 0.05:
            continue
        s = (p[1] - lm.head_front) / span
        line = front + (back - front) * min(1.0, max(0.0, s)) ** 0.8
        if p[2] > line:
            out[i] = 1.0
    return out


def hair_mask(co, lm, front_above_eyes, zones):
    """1 for scalp vertices (short hair): above a hairline from the forehead, over the ears, to the nape."""
    front = lm.eye_z + front_above_eyes
    back = lm.z_head + 0.03
    span = lm.head_back - lm.head_front
    out = np.zeros(len(co))
    for i, p in enumerate(co):
        if zones[i] != "skin" or p[2] < lm.z_neck + 0.06:
            continue
        s = (p[1] - lm.head_front) / span
        side = abs(p[0]) / 0.08
        line = front + (back - front) * min(1.0, max(0.0, s)) ** 0.7 - 0.015 * min(1.0, side) * (1 - abs(s - 0.5))
        if p[2] > line:
            out[i] = 1.0
    return out


def remove_vertices(body, keep):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v, k in zip(bm.verts, keep) if not k], context="VERTS")
    bm.to_mesh(body.data)
    bm.free()


# ---- Loose garments and headwear ----

def loft(rings, close_top=False, lip=None):
    """A tube through rings of points (each ring a list of Vectors, the same count), optionally with a turned-in lip
    at the bottom so the hem has thickness."""
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    if lip is not None:
        last = rings[-1]
        cx = sum((p.x for p in last), 0.0) / len(last)
        cy = sum((p.y for p in last), 0.0) / len(last)
        inner = [bm.verts.new(V((cx + (p.x - cx) * (1 - lip / max(1e-6, math.hypot(p.x - cx, p.y - cy))), cy + (p.y - cy) * (1 - lip / max(1e-6, math.hypot(p.x - cx, p.y - cy))), p.z + 0.012))) for p in last]
        vr.append(inner)
    n = len(rings[0])
    for a, b in zip(vr, vr[1:]):
        for j in range(n):
            jn = (j + 1) % n
            bm.faces.new((a[j], a[jn], b[jn], b[j]))
    if close_top:
        top = vr[0]
        c = bm.verts.new(sum((v.co for v in top), V()) / n + V((0, 0, 0.004)))
        for j in range(n):
            bm.faces.new((top[(j + 1) % n], top[j], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def mesh_object(bm, name, material_name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj["zone"] = material_name
    return obj


def envelope(co, z0, z1):
    """Centre and half-extents (x, y) of the vertices between heights z0 and z1."""
    sel = co[(co[:, 2] >= z0) & (co[:, 2] <= z1)]
    if len(sel) == 0:
        return None
    cx = 0.0
    cy = float((sel[:, 1].min() + sel[:, 1].max()) / 2)
    return cx, cy, float(np.abs(sel[:, 0] - cx).max()), float(np.abs(sel[:, 1] - cy).max())


def build_skirt(body, lm, spec):
    """A wrapper or a kaftan's skirt: rings fitted round the hips and legs from the top level down, never narrower
    than the ring above by more than the cloth allows, flaring towards the hem."""
    sk = spec["skirt"]
    z_top, z_bot = lm.level(sk["top"]), lm.level(sk["bottom"])
    co = np.array([v.co[:] for v in body.data.vertices])
    seg, levels = 28, 14
    rings, prev = [], None
    for k in range(levels + 1):
        s = k / levels
        z = z_top + (z_bot - z_top) * s
        env = envelope(co, z - 0.03, z + 0.03)
        cx, cy, ax, ay = env if env else prev
        ax += sk["margin"] + sk["flare"] * s ** 1.5
        ay += sk["margin"] * 0.8 + sk["flare"] * 0.6 * s ** 1.5
        if prev:
            ax = max(ax, prev[2] - 0.004)
            ay = max(ay, prev[3] - 0.004)
        prev = (cx, cy, ax, ay)
        ring = []
        for j in range(seg):
            t = 2 * math.pi * j / seg
            c, si = math.cos(t), math.sin(t)
            # A superellipse, a little squarer than an ellipse, as cloth over two legs hangs.
            ex = 2 / 2.4
            x = cx + ax * math.copysign(abs(c) ** ex, c)
            y = cy + ay * math.copysign(abs(si) ** ex, si)
            fold = 1 + 0.02 * math.sin(5 * t + 1.3 * s) * s
            ring.append(V((cx + (x - cx) * fold, cy + (y - cy) * fold, z)))
        rings.append(ring)
    obj = mesh_object(loft(rings, lip=0.008), "skirt", sk["material"])
    # Weights: the pelvis at the top, blending into each leg by side as it goes down.
    groups = {}
    for name in ("pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"):
        groups[name] = obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        p = v.co
        f = min(1.0, max(0.0, (lm.z_hipjoint - p.z) / max(0.05, lm.z_hipjoint - lm.z_knee))) * 0.85
        g = min(1.0, max(0.0, (lm.z_knee - p.z) / max(0.05, lm.z_knee - lm.z_ankle))) * 0.6
        wl = min(1.0, max(0.0, 0.5 + p.x / 0.16))
        groups["pelvis"].add([v.index], 1 - f, "REPLACE")
        for side, w in (("l", wl), ("r", 1 - wl)):
            if f * w * (1 - g) > 0:
                groups[f"thigh_{side}"].add([v.index], f * w * (1 - g), "REPLACE")
            if f * w * g > 0:
                groups[f"calf_{side}"].add([v.index], f * w * g, "REPLACE")
    return obj


def build_cap(body, lm):
    """A soft round cap (fila/kufi) on the crown: rings fitted to the head at the cap's line, a slight taper, a domed top."""
    co = np.array([v.co[:] for v in body.data.vertices])
    base = lm.eye_z + 0.045
    height = 0.085
    seg = 32
    c = lm.head_centre
    sel = co[(co[:, 2] > base - 0.005) & (co[:, 2] < base + 0.005)]
    rings = []
    for k in range(7):
        s = k / 6
        z = base + height * s - 0.012 * (1 - abs(2 * s - 1)) * 0  # straight sides
        ring = []
        for j in range(seg):
            t = 2 * math.pi * j / seg
            d = V((math.cos(t), math.sin(t), 0))
            # The head's radius in this direction at the cap line, plus the cloth.
            r = max((V((p[0] - c.x, p[1] - c.y, 0)).dot(d) for p in sel), default=0.08) + 0.006
            r *= 1 - 0.06 * s
            ring.append(V((c.x + d.x * r, c.y + d.y * r, z + 0.012 * math.sin(t) * (1 - s) * 0.0)))
        rings.append(ring)
    rings.reverse()  # top first, so the top is closed
    obj = mesh_object(loft(rings, close_top=True, lip=0.006), "cap", "headwear")
    g = obj.vertex_groups.new(name="head")
    g.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    return obj


def build_knot(lm):
    """The head tie's knot and tucked ends at the back of the head."""
    bm = bmesh.new()
    c = lm.head_centre
    for dx, dy, dz, sx, sy, sz in ((0.0, 0.085, 0.045, 0.05, 0.035, 0.04), (0.03, 0.095, 0.02, 0.035, 0.025, 0.03), (-0.028, 0.092, 0.07, 0.03, 0.025, 0.028)):
        m = Matrix.Translation(c + V((dx, dy, dz))) @ Matrix.Diagonal((sx, sy, sz, 1))
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=1.0, matrix=m)
    obj = mesh_object(bm, "knot", "headwear")
    g = obj.vertex_groups.new(name="head")
    g.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    return obj


# ---- Materials ----

def lin(hex_colour):
    h = hex_colour.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


class Nodes:
    def __init__(self, m):
        self.t = m.node_tree
        self.n = self.t.nodes

    def link(self, a, b):
        self.t.links.new(a, b)

    def new(self, kind, **inputs):
        node = self.n.new(kind)
        for k, v in inputs.items():
            self.set(node.inputs[k], v)
        return node

    def set(self, sock, v):
        if isinstance(v, (int, float)):
            sock.default_value = v
        elif isinstance(v, tuple):
            sock.default_value = (*v, 1.0) if len(v) == 3 and len(sock.default_value) == 4 else v
        else:
            self.link(v, sock)

    def math(self, op, a, b=None, clamp=False):
        mn = self.new("ShaderNodeMath")
        mn.operation = op
        mn.use_clamp = clamp
        self.set(mn.inputs[0], a)
        if b is not None:
            self.set(mn.inputs[1], b)
        return mn.outputs[0]

    def smoothstep(self, lo, hi, x):
        mr = self.new("ShaderNodeMapRange", Value=x)
        mr.interpolation_type = "SMOOTHSTEP"
        mr.inputs["From Min"].default_value = lo
        mr.inputs["From Max"].default_value = hi
        return mr.outputs["Result"]

    def mix(self, fac, a, b):
        mx = self.n.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        self.set(mx.inputs["Factor"], fac)
        self.set(mx.inputs[6], a)
        self.set(mx.inputs[7], b)
        return mx.outputs[2]

    def vec(self, op, a, b=None):
        vm = self.new("ShaderNodeVectorMath")
        vm.operation = op
        self.set(vm.inputs[0], a)
        if b is not None:
            self.set(vm.inputs[1], b)
        return vm.outputs["Value"] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else vm.outputs["Vector"]

    def noise(self, pos, scale, detail=4.0, rough=0.55):
        nz = self.new("ShaderNodeTexNoise", Scale=scale, Detail=detail, Roughness=rough)
        self.link(pos, nz.inputs["Vector"])
        return nz.outputs["Fac"]


def author_factory(look, lm):
    """The look's procedural materials, in texture.py's authoring contract, keyed by material name."""
    spec = LOOKS[look]
    eyes = [tuple(e) for e in lm.eyes]

    def author(name, group, image):
        m = bpy.data.materials.new(f"{name}@{group}")
        m.use_nodes = True
        N = Nodes(m)
        N.n.clear()
        out = N.new("ShaderNodeOutputMaterial")
        bsdf = N.new("ShaderNodeBsdfPrincipled")
        N.link(bsdf.outputs["BSDF"], out.inputs["Surface"])
        attr = N.new("ShaderNodeAttribute")
        attr.attribute_type = "GEOMETRY"
        attr.attribute_name = "rest"
        pos = attr.outputs["Vector"]
        ao = N.new("ShaderNodeAmbientOcclusion", Distance=0.03)
        crevice = N.math("SUBTRACT", 1.0, ao.outputs["AO"], clamp=True)
        geo = N.new("ShaderNodeNewGeometry")
        sep = N.new("ShaderNodeSeparateXYZ")
        N.link(pos, sep.inputs["Vector"])
        nsep = N.new("ShaderNodeSeparateXYZ")
        N.link(geo.outputs["Normal"], nsep.inputs["Vector"])
        colour, rough, bump_strength = None, 0.6, 0.1
        mspec = spec["materials"].get(name, {})
        kind = mspec.get("kind", name)

        if name in ("skin", "feet", "lips", "nail"):
            base = lin(spec["skin"])
            mott = N.noise(pos, 38.0, 5.0)
            colour = N.mix(N.math("MULTIPLY", N.smoothstep(0.35, 0.65, mott), 0.25), base, tuple(c * 1.25 for c in base))
            colour = N.mix(N.math("MULTIPLY", crevice, 1.4, clamp=True), colour, tuple(c * 0.45 for c in base))
            rough = N.math("ADD", 0.56, N.math("MULTIPLY", N.noise(pos, 90.0), 0.12))
            bump_strength = 0.08
            if name == "skin":
                colour, hair_mask = draw_face(N, pos, sep, colour, lm, eyes, spec)
                rough = N.math("ADD", rough, N.math("MULTIPLY", hair_mask, 0.32))
            if name == "lips":
                colour = N.mix(0.6, colour, tuple(c * 0.75 for c in lin("#6a3b33")))
                rough = 0.38
            if name == "nail":
                colour = N.mix(0.55, colour, lin("#b89a8a"))
                rough = 0.35
            if name == "feet":
                colour, rough = draw_footwear(N, pos, sep, colour, rough, lm, spec)
        elif name == "eye":
            colour, rough = draw_eye(N, pos, eyes)
            bump_strength = 0.0
        elif kind == "print":
            colour = wax_print(N, pos, mspec["palette"], mspec["scale"])
            colour = N.mix(N.math("MULTIPLY", crevice, 1.1, clamp=True), colour, (0.02, 0.02, 0.03))
            rough = 0.75
            bump_strength = 0.12
        elif kind in ("fabric", "denim", "cap"):
            base = lin(mspec["colour"])
            var = N.smoothstep(0.3, 0.7, N.noise(pos, 22.0, 6.0))
            colour = N.mix(N.math("MULTIPLY", var, 0.18), base, tuple(c * 1.25 for c in base))
            if kind == "denim":
                fade = N.smoothstep(0.45, 0.75, N.noise(pos, 6.0, 3.0))
                colour = N.mix(N.math("MULTIPLY", fade, 0.45), colour, tuple(min(1, c * 1.9 + 0.03) for c in base))
                twill = N.new("ShaderNodeTexWave", Scale=180.0, Distortion=2.0)
                N.link(pos, twill.inputs["Vector"])
                colour = N.mix(N.math("MULTIPLY", twill.outputs["Fac"], 0.1), colour, tuple(c * 0.7 for c in base))
            if kind == "cap":
                dots = N.new("ShaderNodeTexVoronoi", Scale=70.0)
                N.link(pos, dots.inputs["Vector"])
                stitch = N.math("LESS_THAN", dots.outputs["Distance"], 0.16)
                colour = N.mix(N.math("MULTIPLY", stitch, 0.8), colour, lin(mspec["pattern"]))
            colour = N.mix(N.math("MULTIPLY", crevice, 1.3, clamp=True), colour, tuple(c * 0.4 for c in base))
            rough = mspec.get("roughness", 0.8)
            bump_strength = 0.1
        elif name == "sole":
            colour, rough = lin("#2a2522"), 0.8
        else:
            colour, rough = (0.5, 0.0, 0.5), 0.5  # unknown: magenta, so it is seen
        N.set(bsdf.inputs["Base Color"], colour)
        N.set(bsdf.inputs["Roughness"], rough)
        bsdf.inputs["Metallic"].default_value = 0.0
        if name in ("skin", "feet", "lips", "nail"):
            bsdf.inputs["Specular IOR Level"].default_value = 0.32
        if isinstance(colour, tuple):
            rgb = N.new("ShaderNodeRGB")
            rgb.outputs[0].default_value = (*colour, 1.0)
            colour = rgb.outputs[0]
            N.link(colour, bsdf.inputs["Base Color"])
        reroute = N.n.new("NodeReroute")
        reroute.name = "BASECOLOR"
        N.link(colour, reroute.inputs[0])
        metal = N.n.new("NodeReroute")
        metal.name = "METALLIC"
        val = N.new("ShaderNodeValue")
        val.outputs[0].default_value = 0.0
        N.link(val.outputs[0], metal.inputs[0])
        if bump_strength > 0:
            bump = N.new("ShaderNodeBump", Strength=bump_strength, Distance=0.0006)
            N.link(N.noise(pos, 260.0, 3.0), bump.inputs["Height"])
            N.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
        if image is not None:
            img = N.n.new("ShaderNodeTexImage")
            img.name = "BAKE_TARGET"
            img.image = image
            N.n.active = img
        return m

    return author


def ellipse_mask(N, pos, centre, rx, rz, arch, front_y):
    """1 inside a soft arched ellipse in the X-Z plane around `centre`, on the front of the face only."""
    d = N.vec("SUBTRACT", pos, centre)
    s = N.new("ShaderNodeSeparateXYZ")
    N.link(d, s.inputs["Vector"])
    x = N.math("DIVIDE", s.outputs["X"], rx)
    zz = N.math("DIVIDE", N.math("SUBTRACT", s.outputs["Z"], N.math("MULTIPLY", N.math("MULTIPLY", s.outputs["X"], s.outputs["X"]), arch)), rz)
    r = N.math("ADD", N.math("MULTIPLY", x, x), N.math("MULTIPLY", zz, zz))
    inside = N.math("SUBTRACT", 1.0, N.smoothstep(0.55, 1.0, r))
    front = N.math("LESS_THAN", s.outputs["Y"], front_y)
    return N.math("MULTIPLY", inside, front)


def draw_face(N, pos, sep, colour, lm, eyes, spec):
    """Brows, and for the men short hair, drawn by position on the rest-pose body, so they stay sharp in the bake."""
    brow_colour = lin("#17100c")
    masks = []
    for e in eyes:
        side = 1 if e[0] > 0 else -1
        centre = (e[0] + side * 0.004, e[1] - 0.004, e[2] + 0.021)
        masks.append(ellipse_mask(N, pos, centre, 0.021, 0.0042, -2.5, 0.006))
    brows = N.math("MAXIMUM", masks[0], masks[1])
    hairy = N.smoothstep(0.3, 0.7, N.noise(pos, 400.0, 2.0))
    colour = N.mix(N.math("MULTIPLY", brows, N.math("ADD", 0.55, N.math("MULTIPLY", hairy, 0.35))), colour, brow_colour)
    hair = spec.get("hair")
    hair_mask = 0.0
    if hair:
        front = lm.eye_z + hair["front"]
        back = lm.z_head + 0.03
        span = lm.head_back - lm.head_front
        s = N.math("DIVIDE", N.math("SUBTRACT", sep.outputs["Y"], lm.head_front), span)
        s = N.math("POWER", N.math("MAXIMUM", N.math("MINIMUM", s, 1.0), 0.0), 0.7)
        line = N.math("ADD", front, N.math("MULTIPLY", s, back - front))
        above = N.smoothstep(-0.003, 0.004, N.math("SUBTRACT", sep.outputs["Z"], line))
        above = N.math("MULTIPLY", above, N.math("GREATER_THAN", sep.outputs["Z"], lm.z_neck + 0.06))
        hair_col = N.mix(N.math("MULTIPLY", N.smoothstep(0.4, 0.8, N.noise(pos, 300.0, 3.0)), hair["grey"]), lin("#0a0807"), lin("#8c8680"))
        grain = N.smoothstep(0.25, 0.75, N.noise(pos, 900.0, 2.0, 0.8))
        hair_mask = N.math("MULTIPLY", above, N.math("ADD", 0.84, N.math("MULTIPLY", grain, 0.16)))
        colour = N.mix(hair_mask, colour, hair_col)
        if spec.get("beard"):
            # A short, neat, greying beard along the jaw and chin, and a moustache.
            jaw = ellipse_mask(N, pos, (0.0, lm.head_front + 0.03, lm.eye_z - 0.085), 0.06, 0.03, 4.0, lm.head_front + 0.07)
            moustache = ellipse_mask(N, pos, (0.0, lm.head_front + 0.01, lm.eye_z - 0.058), 0.024, 0.006, 6.0, lm.head_front + 0.03)
            beard = N.math("MAXIMUM", jaw, moustache)
            colour = N.mix(N.math("MULTIPLY", beard, N.math("ADD", 0.45, N.math("MULTIPLY", hairy, 0.35))), colour, hair_col)
            hair_mask = N.math("MAXIMUM", hair_mask, beard)
    return colour, hair_mask


def draw_eye(N, pos, eyes):
    """Sclera, a dark brown iris and the pupil, by angle from each eye's forward direction."""
    left = N.math("GREATER_THAN", _x(N, pos), 0.0)
    cl = N.new("ShaderNodeCombineXYZ", X=eyes[0][0], Y=eyes[0][1], Z=eyes[0][2]).outputs[0]
    cr = N.new("ShaderNodeCombineXYZ", X=eyes[1][0], Y=eyes[1][1], Z=eyes[1][2]).outputs[0]
    mx = N.n.new("ShaderNodeMix")
    mx.data_type = "VECTOR"
    N.link(left, mx.inputs["Factor"])
    N.link(cr, mx.inputs[4])
    N.link(cl, mx.inputs[5])
    d = N.vec("NORMALIZE", N.vec("SUBTRACT", pos, mx.outputs[1]))
    f = N.vec("DOT_PRODUCT", d, (0.0, -1.0, 0.0))
    iris = N.smoothstep(math.cos(math.radians(30)), math.cos(math.radians(26)), f)
    pupil = N.smoothstep(math.cos(math.radians(13)), math.cos(math.radians(10)), f)
    colour = N.mix(iris, lin("#d9cbb6"), lin("#2b1910"))
    colour = N.mix(pupil, colour, (0.01, 0.008, 0.007))
    return colour, 0.12


def _x(N, pos):
    s = N.new("ShaderNodeSeparateXYZ")
    N.link(pos, s.inputs["Vector"])
    return s.outputs["X"]


def draw_footwear(N, pos, sep, colour, rough, lm, spec):
    """Slippers, slides or sandals: a sole under the foot and a strap over the forefoot."""
    sole_c = lin("#2a2522") if spec["feet"] != "slippers" else lin("#3d2a1f")
    strap_c = lin(spec["materials"]["strap"]["colour"])
    sole = N.math("SUBTRACT", 1.0, N.smoothstep(0.012, 0.018, sep.outputs["Z"]))
    ball_y = lm.head("ball_l").y
    a, b = (ball_y + 0.0, ball_y + 0.05) if spec["feet"] != "sandals" else (ball_y + 0.015, ball_y + 0.045)
    band = N.math("MULTIPLY", N.smoothstep(a - 0.004, a + 0.004, sep.outputs["Y"]), N.math("SUBTRACT", 1.0, N.smoothstep(b - 0.004, b + 0.004, sep.outputs["Y"])))
    strap = N.math("MULTIPLY", band, N.smoothstep(0.016, 0.022, sep.outputs["Z"]))
    colour = N.mix(strap, colour, strap_c)
    colour = N.mix(sole, colour, sole_c)
    return colour, rough


def wax_print(N, pos, palette, scale):
    """A wax print of our own design: rings round scattered centres (a dot, a ring, a band), a second motif in
    alternate cells, and the fine crackle that wax-resist dyeing leaves, on a ground colour."""
    bg, a, b, c = (lin(h) for h in palette)
    vor = N.new("ShaderNodeTexVoronoi", Scale=scale, Randomness=0.85)
    N.link(pos, vor.inputs["Vector"])
    dist = vor.outputs["Distance"]
    ramp1 = N.new("ShaderNodeValToRGB")
    ramp1.color_ramp.interpolation = "CONSTANT"
    els = ramp1.color_ramp.elements
    stops = [(0.0, c), (0.12, a), (0.2, bg), (0.25, b), (0.36, c), (0.41, bg)]
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[1][0], (*stops[1][1], 1)
    for p, col in stops[2:]:
        e = els.new(p)
        e.color = (*col, 1)
    N.link(dist, ramp1.inputs["Fac"])
    ramp2 = N.new("ShaderNodeValToRGB")
    ramp2.color_ramp.interpolation = "CONSTANT"
    els2 = ramp2.color_ramp.elements
    stops2 = [(0.0, b), (0.16, c), (0.22, a), (0.33, bg)]
    els2[0].position, els2[0].color = stops2[0][0], (*stops2[0][1], 1)
    els2[1].position, els2[1].color = stops2[1][0], (*stops2[1][1], 1)
    for p, col in stops2[2:]:
        e = els2.new(p)
        e.color = (*col, 1)
    N.link(dist, ramp2.inputs["Fac"])
    cell = N.new("ShaderNodeSeparateColor")
    N.link(vor.outputs["Color"], cell.inputs["Color"])
    alt = N.math("GREATER_THAN", cell.outputs["Red"], 0.5)
    colour = N.mix(alt, ramp1.outputs["Color"], ramp2.outputs["Color"])
    crackle = N.new("ShaderNodeTexVoronoi", Scale=scale * 9.0)
    crackle.feature = "DISTANCE_TO_EDGE"
    N.link(pos, crackle.inputs["Vector"])
    lines = N.math("LESS_THAN", crackle.outputs["Distance"], 0.03)
    colour = N.mix(N.math("MULTIPLY", lines, 0.35), colour, bg)
    worn = N.smoothstep(0.4, 0.8, N.noise(pos, 30.0, 4.0))
    return N.mix(N.math("MULTIPLY", worn, 0.12), colour, (0.6, 0.55, 0.5))


# ---- Assembling a person ----

MATERIAL_ORDER = ("skin", "feet", "lips", "nail", "eye", "top", "bottom", "wrapper", "headwear")


def build_person(look, preview=False):
    spec = LOOKS[look]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.render.fps = FPS
    body, rig = make_body(spec)
    bake_shape(body)
    lm = Body(body, rig)
    bone_names = [b.name for b in rig.data.bones]
    dom = dominant_bones(body, bone_names)
    zones = classify(body, lm, spec, dom)

    # Keep the body and the eye spheres; drop every other helper, and the legs inside a loose garment.
    skin = group_weights(body, ["body"])
    keep = [(s > 0.5 or z == "eye") and z != "hidden" for s, z in zip(skin, zones)]
    shape_clothes(body, lm, spec, zones, dom)
    # The eyes follow the head only.
    eye_idx = [i for i, z in enumerate(zones) if z == "eye"]
    for g in body.vertex_groups:
        g.remove(eye_idx)
    body.vertex_groups["head"].add(eye_idx, 1.0, "REPLACE")
    # Per-vertex zone, carried through the delete as an attribute, for the materials.
    zone_ids = {n: i for i, n in enumerate(MATERIAL_ORDER)}
    zone_ids["hidden"] = zone_ids["skin"]
    attr = body.data.attributes.new("zone", "INT", "POINT")
    attr.data.foreach_set("value", [zone_ids.get(z, 0) for z in zones])
    remove_vertices(body, keep)

    extras = []
    if spec["skirt"]:
        extras.append(build_skirt(body, lm, spec))
    if spec["head"] == "cap":
        extras.append(build_cap(body, lm))
    if spec["head"] == "headtie":
        extras.append(build_knot(lm))
    for o in extras:
        a = o.data.attributes.new("zone", "INT", "POINT")
        a.data.foreach_set("value", [zone_ids[o["zone"]]] * len(o.data.vertices))

    # Join the garments into the body.
    bpy.ops.object.select_all(action="DESELECT")
    for o in extras:
        o.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    if extras:
        bpy.ops.object.join()
    body.name = f"{look}_body"
    body.data.name = f"{look}_body"

    # Materials by zone.
    for n in MATERIAL_ORDER:
        body.data.materials.append(bpy.data.materials.new(n))
    zone_v = np.zeros(len(body.data.vertices), dtype=np.int32)
    body.data.attributes["zone"].data.foreach_get("value", zone_v)
    for poly in body.data.polygons:
        vals = [zone_v[i] for i in poly.vertices]
        poly.material_index = max(set(vals), key=vals.count)
        poly.use_smooth = True
    body.data.attributes.remove(body.data.attributes["zone"])

    decimate(body, lm)
    clean_weights(body, bone_names)

    # Name the joints after the look, and the armature as the file's root.
    rig.name = f"customer_{look}"
    rig.data.name = f"customer_{look}"
    for b in rig.data.bones:
        b.name = f"{look}_{b.name}"
    tris = common.triangle_count(body)
    print(f"{look}: {tris} triangles (budget {BUDGET['trianglesPerLook']}), {len(rig.data.bones)} joints (budget {BUDGET['jointsPerLook']})")
    if tris > BUDGET["trianglesPerLook"]:
        common.fail(f"{look} has {tris} triangles, over the budget of {BUDGET['trianglesPerLook']}.")

    # The rest positions, for the procedural materials (Object coordinates would swim when the skeleton moves).
    rest = body.data.attributes.new("rest", "FLOAT_VECTOR", "POINT")
    co = np.zeros(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get("co", co)
    rest.data.foreach_set("vector", co)

    author = author_factory(look, lm)
    for i, slot in enumerate(body.material_slots):
        used = any(p.material_index == i for p in body.data.polygons)
        if used:
            slot.material = author(slot.material.name, "preview", None) if preview else slot.material
    remove_unused_slots(body)

    Clips(rig, look, lm, spec).make_all()
    return body, rig, lm, author


def remove_unused_slots(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.material_slot_remove_unused()


def decimate(body, lm):
    """Collapses the mesh to the triangle target, keeping the face and head densest and the hands lightest."""
    me = body.data
    me.calc_loop_triangles()
    total = len(me.loop_triangles)
    if total <= TRI_TARGET:
        return
    bm = bmesh.new()
    bm.from_mesh(me)
    head = [v for v in bm.verts if v.co.z > lm.z_neck + 0.03]
    hands = [v for v in bm.verts if abs(v.co.x) > 0.36 and v.co.z < lm.z_neck - 0.15]
    bm.free()
    n_tri_head = sum(1 for t in me.loop_triangles if all(me.vertices[i].co.z > lm.z_neck + 0.03 for i in t.vertices))
    n_tri_hands = sum(1 for t in me.loop_triangles if all(abs(me.vertices[i].co.x) > 0.36 and me.vertices[i].co.z < lm.z_neck - 0.15 for i in t.vertices))
    head_ratio, hand_ratio = 0.62, 0.3
    rest = total - n_tri_head - n_tri_hands
    left = TRI_TARGET - n_tri_head * head_ratio - n_tri_hands * hand_ratio
    body_ratio = max(0.15, min(1.0, left / max(1, rest)))
    print(f"Decimate: {total} triangles; head {n_tri_head} x {head_ratio}, hands {n_tri_hands} x {hand_ratio}, the rest {rest} x {body_ratio:.2f}")

    def run(select, ratio):
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="VERT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        for v in me.vertices:
            v.select = select(v.co)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.decimate(ratio=ratio)
        bpy.ops.object.mode_set(mode="OBJECT")

    def is_head(c):
        return c.z > lm.z_neck + 0.03

    def is_hand(c):
        return abs(c.x) > 0.36 and c.z < lm.z_neck - 0.15

    run(lambda c: is_head(c), head_ratio)
    run(lambda c: is_hand(c), hand_ratio)
    run(lambda c: not is_head(c) and not is_hand(c), body_ratio)
    me.calc_loop_triangles()
    # A final pass over everything if the selections' borders left it over target.
    if len(me.loop_triangles) > TRI_TARGET:
        run(lambda c: True, TRI_TARGET / len(me.loop_triangles) * 0.995)
    del head, hands


def clean_weights(body, bone_names):
    """Only joints as vertex groups, at most four per vertex, normalised (glTF skins take four)."""
    for g in list(body.vertex_groups):
        if g.name not in bone_names:
            body.vertex_groups.remove(g)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")


# ---- Clips (plan 0015 reading 5) ----

def n3(x, y, z):
    return V((x, y, z)).normalized()


# Character space: +X is the person's left, -Y their front, +Z up.
X, Y, Z = V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))


class Poser:
    """Poses a skeleton by aiming bones in character space ('aim': the bone points this way, then twists by degrees)
    and turning them about character axes ('rot'), parents first, and returns each bone's local rotation."""

    def __init__(self, rig, look):
        self.rig = rig
        self.prefix = f"{look}_"
        self.bones = rig.data.bones
        self.rest = {b.name: b.matrix_local.to_3x3() for b in self.bones}
        order, seen = [], set()

        def visit(b):
            if b.name in seen:
                return
            if b.parent:
                visit(b.parent)
            seen.add(b.name)
            order.append(b.name)

        for b in self.bones:
            visit(b)
        self.order = order
        self.palm = {}
        for side in ("l", "r"):
            h = lambda n: self.bones[self.prefix + n].head_local  # noqa: E731
            across = h(f"index_01_{side}") - h(f"pinky_01_{side}")
            fwd = h(f"middle_01_{side}") - h(f"hand_{side}")
            n = across.cross(fwd).normalized()
            sx = 1 if side == "l" else -1
            if n.dot(V((-sx, 0, -1))) < 0:
                n = -n
            self.palm[side] = n

    def solve(self, pose):
        posed, basis = {}, {}
        for name in self.order:
            b = self.bones[name]
            short = name[len(self.prefix):]
            R_rest = self.rest[name]
            if b.parent:
                P = posed[b.parent.name] @ self.rest[b.parent.name].inverted() @ R_rest
            else:
                P = R_rest.copy()
            R = P.copy()
            for op in pose.get(short, ()):
                if op[0] == "aim":
                    d = V(op[1]).normalized()
                    cur = (R @ V((0, 1, 0))).normalized()
                    R = cur.rotation_difference(d).to_matrix() @ R
                    if len(op) > 2 and op[2]:
                        R = Matrix.Rotation(math.radians(op[2]), 3, d) @ R
                elif op[0] == "rot":
                    R = Matrix.Rotation(math.radians(op[2]), 3, V(op[1])) @ R
                elif op[0] == "curl":
                    side = short[-1]
                    along_rest = (R_rest @ V((0, 1, 0))).normalized()
                    axis_rest = along_rest.cross(self.palm[side]).normalized()
                    axis_now = (P @ R_rest.inverted()) @ axis_rest
                    R = Matrix.Rotation(math.radians(op[1]), 3, axis_now) @ R
            posed[name] = R
            basis[name] = (P.inverted() @ R).to_quaternion()
        return basis


def mirror(d):
    return (-d[0], d[1], d[2])


def arms(left_upper, left_lower, left_hand=None, right=None, twist=(0, 0)):
    """Both arms; the right mirrors the left unless given."""
    p = {"upperarm_l": [("aim", left_upper)], "lowerarm_l": [("aim", left_lower, twist[0])]}
    if left_hand:
        p["hand_l"] = [("aim", left_hand)]
    if right is None:
        right = (mirror(left_upper), mirror(left_lower), mirror(left_hand) if left_hand else None, twist[1] if len(twist) > 1 else twist[0])
    ru, rl, rh, rt = right
    p["upperarm_r"] = [("aim", ru)]
    p["lowerarm_r"] = [("aim", rl, rt)]
    if rh:
        p["hand_r"] = [("aim", rh)]
    return p


def merge(*poses):
    out = {}
    for p in poses:
        for k, v in p.items():
            out[k] = list(out.get(k, [])) + list(v)
    return out


def fingers(curl):
    p = {}
    for side in ("l", "r"):
        for f, extra in (("index", 0), ("middle", 4), ("ring", 8), ("pinky", 12)):
            for j, share in ((1, 0.8), (2, 1.0), (3, 0.7)):
                p[f"{f}_0{j}_{side}"] = [("curl", (curl + extra) * share)]
        p[f"thumb_02_{side}"] = [("curl", curl * 0.4)]
    return p


# Relaxed arms at the sides, elbows soft, hands hanging with the palms towards the thighs.
RELAXED = merge(arms(n3(0.16, 0.02, -1), n3(0.1, -0.16, -1), n3(0.06, -0.12, -1)), fingers(18))
CROSSED = merge(
    arms(n3(0.32, -0.42, -0.85), n3(-0.95, -0.22, 0.22), n3(-0.9, -0.25, 0.1), right=(n3(-0.36, -0.3, -0.88), n3(0.95, -0.3, 0.18), n3(0.9, -0.2, 0.25), 0)),
    fingers(35),
)
HIPS = merge(arms(n3(0.62, 0.22, -0.75), n3(-0.55, -0.15, -0.55), n3(-0.3, -0.1, -0.9)), fingers(25))


class Clips:
    def __init__(self, rig, look, lm, spec):
        self.rig, self.look, self.lm, self.spec = rig, look, lm, spec
        self.poser = Poser(rig, look)
        self.prefix = f"{look}_"
        self.root = self.prefix + "Root"
        self.pelvis = self.prefix + "pelvis"

    def key_pose(self, action, frame, pose, root=None, pelvis=(0, 0, 0)):
        basis = self.poser.solve(pose)
        rig = self.rig
        for name, q in basis.items():
            pb = rig.pose.bones[name]
            pb.rotation_mode = "QUATERNION"
            prev = self._last.get(name)
            if prev is not None and prev.dot(q) < 0:
                q = -q
            self._last[name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=name)
        # Root: a turn about the vertical and a move across the ground, in character space.
        turn, move = root or (0.0, (0, 0, 0))
        rb = rig.pose.bones[self.root]
        R0 = rb.bone.matrix_local.to_3x3()
        rb.rotation_quaternion = (R0.inverted() @ Matrix.Rotation(math.radians(turn), 3, Z) @ R0).to_quaternion()
        rb.location = R0.inverted() @ V(move)
        rb.keyframe_insert("rotation_quaternion", frame=frame, group=self.root)
        rb.keyframe_insert("location", frame=frame, group=self.root)
        pp = rig.pose.bones[self.pelvis]
        Pp = pp.bone.matrix_local.to_3x3()
        pp.location = Pp.inverted() @ V(pelvis)
        pp.keyframe_insert("location", frame=frame, group=self.pelvis)

    def clip(self, name, keys, loop=False):
        """keys: (seconds, pose, root, pelvis). Makes the action <look>.<name> and puts it on its own NLA track."""
        rig = self.rig
        rig.animation_data_create()
        action = bpy.data.actions.new(f"{self.look}.{name}")
        rig.animation_data.action = action
        self._last = {}
        for t, pose, *rest in keys:
            root = rest[0] if rest else None
            pelvis = rest[1] if len(rest) > 1 else (0, 0, 0)
            self.key_pose(action, round(t * FPS), pose, root, pelvis)
        end = round(keys[-1][0] * FPS)
        action.use_frame_range = True
        action.frame_start, action.frame_end = 0, end
        action.use_cyclic = loop
        action.use_fake_user = True
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 0, action)
        strip.mute = False
        track.mute = True
        rig.animation_data.action = None
        return action

    def make_all(self):
        R = RELAXED
        breathe_in = {"spine_02": [("rot", X, -1.2)], "spine_03": [("rot", X, -1.0)], "clavicle_l": [("rot", Y, -1.5)], "clavicle_r": [("rot", Y, 1.5)]}
        shift_r = {"pelvis": [("rot", Y, -2.0)], "spine_01": [("rot", Y, 1.4)], "head": [("rot", Z, -3.0), ("rot", Y, 1.0)]}
        shift_l = {"pelvis": [("rot", Y, 2.0)], "spine_01": [("rot", Y, -1.4)], "head": [("rot", Z, 2.5), ("rot", Y, -1.0)]}
        legs_straight = {"thigh_l": [("aim", n3(0.02, 0.0, -1))], "thigh_r": [("aim", n3(-0.02, 0.0, -1))], "calf_l": [("aim", n3(0.0, 0.03, -1))], "calf_r": [("aim", n3(0.0, 0.03, -1))]}
        base = merge(R, legs_straight)
        self.clip("idle", [
            (0.0, base),
            (1.0, merge(base, breathe_in, shift_r), None, (-0.012, 0, 0)),
            (2.0, base),
            (3.0, merge(base, breathe_in, shift_l), None, (0.012, 0, 0)),
            (4.0, base),
        ], loop=True)

        nod = {"head": [("rot", X, 12)], "neck_01": [("rot", X, 4)]}
        wave_up = merge(R, legs_straight, {"upperarm_r": [("aim", n3(-0.55, -0.45, -0.25))], "lowerarm_r": [("aim", n3(-0.15, -0.35, 1), -60)], "hand_r": [("aim", n3(-0.1, -0.25, 1))]})
        self.clip("arrive", [
            (0.0, base),
            (0.3, merge(wave_up, nod)),
            (0.55, wave_up),
            (0.8, merge(base, {"head": [("rot", X, 4)]})),
            (1.0, base),
        ])

        look_down = {"head": [("rot", X, 22), ("rot", Z, 10)], "neck_01": [("rot", X, 8)]}
        wrist = merge(R, legs_straight, {"upperarm_l": [("aim", n3(0.22, -0.3, -0.93))], "lowerarm_l": [("aim", n3(-0.5, -0.72, 0.48), 70)], "hand_l": [("aim", n3(-0.55, -0.7, 0.45))]})
        self.clip("waiting", [
            (0.0, base),
            (0.4, merge(wrist, look_down)),
            (1.1, merge(wrist, look_down, {"head": [("rot", Z, 2)]})),
            (1.5, base),
        ])

        crossed = merge(CROSSED, legs_straight, {"head": [("rot", Y, 3)]})
        mid = merge(arms(n3(0.25, -0.3, -0.9), n3(-0.4, -0.6, -0.4), n3(-0.3, -0.5, -0.5)), legs_straight)
        self.clip("annoyed", [
            (0.0, base),
            (0.45, mid),
            (1.0, crossed),
        ])

        tap_up = {"foot_r": [("rot", X, -14)], "ball_r": [("rot", X, 6)]}
        self.clip("annoyed_idle", [
            (0.0, crossed),
            (0.25, merge(crossed, tap_up)),
            (0.5, crossed),
            (0.75, merge(crossed, tap_up)),
            (1.0, merge(crossed, {"head": [("rot", Z, -4)], "spine_02": [("rot", X, -1)]})),
            (1.25, merge(crossed, tap_up)),
            (1.5, crossed),
            (1.75, merge(crossed, tap_up)),
            (2.0, crossed),
        ], loop=True)

        hips = merge(HIPS, legs_straight)
        self.clip("failed_pull", [
            (0.0, base),
            (0.3, hips),
            (0.45, merge(hips, {"head": [("rot", Z, 16)]})),
            (0.62, merge(hips, {"head": [("rot", Z, -16)]})),
            (0.78, merge(hips, {"head": [("rot", Z, 12)]})),
            (0.92, merge(hips, {"head": [("rot", X, 6)]})),
            (1.2, base),
        ])

        clap_in = merge(arms(n3(0.12, -0.55, -0.83), n3(-0.55, -0.8, 0.2), n3(-0.5, -0.8, 0.3), twist=(80, -80)), legs_straight, fingers(8))
        clap_out = merge(arms(n3(0.2, -0.5, -0.84), n3(-0.2, -0.9, 0.25), n3(-0.15, -0.9, 0.3), twist=(80, -80)), legs_straight, fingers(8))
        self.clip("pleased", [
            (0.0, base),
            (0.2, merge(clap_out, nod)),
            (0.35, merge(clap_in, {"head": [("rot", X, 2)]})),
            (0.5, merge(clap_out, nod)),
            (0.65, merge(clap_in, {"head": [("rot", X, 2)]})),
            (0.85, merge(clap_in, {"head": [("rot", X, 5)]})),
        ])

        stride = self.spec["stride"]

        def step(lead, s):
            """A walking pose with the `lead` leg forward, s 0..1 how far into the stride."""
            other = "r" if lead == "l" else "l"
            a = math.radians(stride)
            fwd, back = n3(0, -math.sin(a), -math.cos(a)), n3(0, math.sin(a * 0.8), -math.cos(a * 0.8))
            pose = {
                f"thigh_{lead}": [("aim", fwd)],
                f"calf_{lead}": [("aim", n3(0, -math.sin(a * 0.3), -1))],
                f"thigh_{other}": [("aim", back)],
                f"calf_{other}": [("aim", n3(0, math.sin(a * 2.2), -math.cos(a * 2.2)))],
                f"upperarm_{lead}": [("aim", n3(0.14 if lead == 'l' else -0.14, 0.25, -1))],
                f"upperarm_{other}": [("aim", n3(0.14 if other == 'l' else -0.14, -0.3, -1))],
                f"lowerarm_{other}": [("aim", n3(0.08 if other == 'l' else -0.08, -0.55, -1))],
                "spine_02": [("rot", Z, 4 if lead == "l" else -4)],
            }
            return merge(R, pose)

        turn = 90.0
        speed = 1.25  # m/s
        keys = [(0.0, base), (0.3, merge(base, {"head": [("rot", Z, 25)]}), (turn * 0.6, (0, 0, 0)))]
        t, x, lead = 0.45, 0.12, "l"
        while t <= 1.6 + 1e-6:
            keys.append((t, step(lead, 0), (turn, (x, 0, 0)), (0, 0, -0.012)))
            t2 = t + 0.18
            if t2 <= 1.6:
                keys.append((t2, merge(R, legs_straight), (turn, (x + speed * 0.18, 0, 0)), (0, 0, 0.012)))
            lead = "r" if lead == "l" else "l"
            x += speed * 0.36
            t += 0.36
        if keys[-1][0] < 1.6:
            keys.append((1.6, merge(R, legs_straight), (turn, (x, 0, 0))))
        self.clip("leaving", keys)
        print(f"{self.look}: clips {', '.join(CLIPS)}")


# ---- Scene and renders ----

def lookdev(flat_background=None):
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
    if flat_background:
        flat = nt.nodes.new("ShaderNodeBackground")
        flat.inputs["Color"].default_value = (*lin(flat_background), 1)
        lp = nt.nodes.new("ShaderNodeLightPath")
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
        nt.links.new(bg.outputs["Background"], mix.inputs[1])
        nt.links.new(flat.outputs["Background"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    else:
        nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    sun = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    sun.data.energy = common.LOOKDEV["key_energy"]
    d = V(common.gl(*common.KEY_DIRECTION)).normalized()
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)
    return sun


def ground(size=8.0, colour="#3a3530"):
    me = bpy.data.meshes.new("ground")
    s = size / 2
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    obj = bpy.data.objects.new("ground", me)
    m = bpy.data.materials.new("ground")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*lin(colour), 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    me.materials.append(m)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def camera(name="cam"):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def aim_camera(cam, at, target):
    cam.location = at
    cam.rotation_euler = (V(target) - V(at)).to_track_quat("-Z", "Y").to_euler()


def render_to(path, w, h):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def set_clip(rig, look, clip, frame):
    """Plays one clip on the skeleton at a frame (the others stay muted)."""
    action = bpy.data.actions.get(f"{look}.{clip}")
    rig.animation_data.action = action
    bpy.context.scene.frame_set(frame)


def strip(paths, out):
    """Joins images side by side into one."""
    imgs = [bpy.data.images.load(p) for p in paths]
    h = imgs[0].size[1]
    rows = [np.array(i.pixels[:], dtype=np.float32).reshape(i.size[1], i.size[0], 4) for i in imgs]
    gap = np.ones((h, 4, 4), dtype=np.float32)
    parts = []
    for r in rows:
        parts += [r, gap]
    combined = np.concatenate(parts[:-1], axis=1)
    img = bpy.data.images.new("strip", combined.shape[1], h, alpha=True)
    img.pixels = combined.ravel().tolist()
    img.filepath_raw = out
    img.file_format = "PNG"
    img.save()
    for i in imgs:
        bpy.data.images.remove(i)
    for p in paths:
        os.remove(p)


def game_spot():
    """Where plan 0015 reading 7 puts the customer for the default camera: behind the machine as seen and to its
    right, about 0.6 m behind its back edge, facing the camera. Returns (Blender position, turn about Z in radians).
    An approximation for these renders; the game works it out in render/customerpose.ts (plan 0015 step 7)."""
    sx, sy, sz = common.load_machine()["size"]
    a = common.GAME_CAMERA["azimuth"]
    back = (-math.sin(a), -math.cos(a))  # glTF x, z: away from the camera
    right = (math.cos(a), -math.sin(a))
    half = abs(sx / 2 * math.sin(a)) + abs(sz / 2 * math.cos(a))
    d, r = half + 0.6 + 0.1, 0.35
    gx, gz = back[0] * d + right[0] * r, back[1] * d + right[1] * r
    return V(common.gl(gx, 0.0, gz)), a


def game_camera(cam, aspect=390 / 844):
    """The game's default camera (render/view.ts, orbit.ts): orbiting the machine's centre at azimuth 0.55 and polar
    1.12, at the distance that fits the machine's bounding sphere in the narrower field of view, no controls cover."""
    sx, sy, sz = common.load_machine()["size"]
    radius = math.sqrt(sx * sx + sy * sy + sz * sz) / 2
    fov_y = math.radians(common.GAME_CAMERA["fov_deg"])
    fov_x = 2 * math.atan(math.tan(fov_y / 2) * aspect)
    dist = radius * 1.15 / math.sin(min(fov_x, fov_y) / 2)
    a, p = common.GAME_CAMERA["azimuth"], common.GAME_CAMERA["polar"]
    target = (0.0, sy / 2, 0.0)
    pos = (target[0] + dist * math.sin(p) * math.sin(a), target[1] + dist * math.cos(p), target[2] + dist * math.sin(p) * math.cos(a))
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = fov_y
    aim_camera(cam, V(common.gl(*pos)), V(common.gl(*target)))
    return V(common.gl(*pos))


def append_machine():
    """The generator from its .blend, for the game-view render."""
    path = common.BLEND_PATH
    if not os.path.exists(path):
        print(f"warning: no {path}; the game view is rendered without the machine")
        return []
    machine = common.load_machine()
    parts, base = common.object_ids(machine)
    wanted = set(parts) | set(base)
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in wanted]
    for o in dst.objects:
        if o is not None:
            bpy.context.scene.collection.objects.link(o)
    return [o for o in dst.objects if o is not None]


def renders(look, rig, body, out_dir, tag):
    """Front, three-quarter and default game view of the person in the idle clip's first frame, and a strip of each
    clip from a three-quarter view."""
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.eevee.taa_render_samples = 32
    lookdev(flat_background="#1b1c1e")
    ground()
    cam = camera()
    cam.data.lens = 70
    top = 1.75
    set_clip(rig, look, "idle", 0)
    views = {
        "front": (V((0.0, -4.6, 1.0)), V((0, 0, 0.85))),
        "three-quarter": (V((2.9, -3.6, 1.15)), V((0, 0, 0.85))),
        "face": (V((0.35, -1.25, 1.55)), V((0, 0, 1.5 if top else 1.5))),
    }
    for view, (at, target) in views.items():
        if view == "face":
            cam.data.lens = 85
            head = rig.matrix_world @ rig.pose.bones[f"{look}_head"].head
            target = head + V((0, 0, 0.07))
            at = target + V((0.35, -1.35, 0.02))
        else:
            cam.data.lens = 70
        aim_camera(cam, at, target)
        render_to(os.path.join(out_dir, f"{look}-{view}{tag}.png"), 600 if view != "face" else 500, 900 if view != "face" else 500)

    # Clip strips.
    if os.environ.get("CUSTOMER_FAST"):
        CLIPS_TO_RENDER = ()
    else:
        CLIPS_TO_RENDER = CLIPS
    cam.data.lens = 70
    aim_camera(cam, V((2.9, -3.6, 1.15)), V((0, 0, 0.85)))
    for clip in CLIPS_TO_RENDER:
        action = bpy.data.actions[f"{look}.{clip}"]
        start, end = int(action.frame_range[0]), int(action.frame_range[1])
        frames = [round(start + (end - start) * k / 4) for k in range(5)]
        paths = []
        if clip == "leaving":
            aim_camera(cam, V((1.4, -5.2, 1.2)), V((0.9, 0, 0.85)))
            cam.data.lens = 50
        for f in frames:
            set_clip(rig, look, clip, f)
            p = os.path.join(out_dir, f"_{look}-{clip}-{f}.png")
            render_to(p, 300, 450)
            paths.append(p)
        strip(paths, os.path.join(out_dir, f"{look}-clip-{clip}{tag}.png"))
    set_clip(rig, look, "idle", 0)

    # The default game view, with the machine.
    machine = append_machine()
    spot, turn = game_spot()
    rig.location = spot
    rig.rotation_euler = (0, 0, turn)
    game_camera(cam)
    render_to(os.path.join(out_dir, f"{look}-game{tag}.png"), 780, 1688)
    # The same camera position turned up until the head is in frame: how big the person reads at the game's distance.
    # The default view itself does not show the head (see assets/customers/STATUS.md).
    cam_pos = game_camera(cam)
    head = rig.matrix_world @ rig.pose.bones[f"{look}_head"].tail
    fov = math.radians(common.GAME_CAMERA["fov_deg"])
    look_dir = (cam.matrix_world.to_3x3() @ V((0, 0, -1))).normalized()
    to_head = (head - cam_pos)
    horiz = math.hypot(to_head.x, to_head.y)
    top_angle = math.atan2(-look_dir.z, math.hypot(look_dir.x, look_dir.y)) - fov / 2
    top_z = cam_pos.z - math.tan(top_angle) * horiz
    print(f"{look}: head top at {head.z:.2f} m, {horiz:.2f} m from the game camera (height {cam_pos.z:.2f} m); the default view's top edge is {top_z:.2f} m above the ground there")
    pitch = math.atan2(head.z + 0.12 - cam_pos.z, horiz) - fov / 2 + 0.02
    yaw = math.atan2(to_head.y, to_head.x)
    tgt = cam_pos + V((math.cos(yaw) * math.cos(pitch + 0.0), math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
    centre = rig.matrix_world.translation * 0.35 + V(common.gl(0.0, 0.19, 0.0)) * 0.65
    dirh = (centre - cam_pos)
    yaw = math.atan2(dirh.y, dirh.x)
    aim_camera(cam, cam_pos, cam_pos + V((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))))
    render_to(os.path.join(out_dir, f"{look}-game-tilted{tag}.png"), 780, 1688)
    for o in machine:
        bpy.data.objects.remove(o, do_unlink=True)
    rig.location = (0, 0, 0)
    rig.rotation_euler = (0, 0, 0)
    print(f"{look}: renders in {out_dir}")


# ---- Modes ----

def build(looks, preview_dir=None):
    for look in looks:
        body, rig, lm, author = build_person(look, preview=bool(preview_dir))
        if preview_dir:
            renders(look, rig, body, preview_dir, "")
            continue
        import texture  # noqa: E402

        rig.data.pose_position = "REST"
        texture.bake_groups({look: (BUDGET["texturePx"], [body.name])}, os.path.join(DIR, "textures"), author=author, layout=lambda objs: layout_uvs(objs, lm))
        rig.data.pose_position = "POSE"
        for img in bpy.data.images:
            if img.name.startswith(look):
                img.name = f"{look}_{img.name[len(look) + 1:]}"
        os.makedirs(os.path.dirname(blend_path(look)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=blend_path(look))
        print(f"Saved {blend_path(look)}")


def layout_uvs(objects, lm):
    """One atlas: the head and face get about twice the texture density of the body, as they are what is looked at."""
    obj = objects[0]
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    head = lambda p: p.co.z > lm.z_neck + 0.02  # noqa: E731
    me = obj.data
    for select_head in (True, False):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="FACE")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        for poly in me.polygons:
            poly.select = all(head(me.vertices[i]) for i in poly.vertices) == select_head
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.003, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        if all(head(me.vertices[i]) for i in poly.vertices):
            for li in poly.loop_indices:
                uv[li].uv = uv[li].uv * 1.45
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def render_baked(looks, out_dir):
    for look in looks:
        bpy.ops.wm.open_mainfile(filepath=blend_path(look))
        rig = bpy.data.objects[f"customer_{look}"]
        body = bpy.data.objects[f"{look}_body"]
        renders(look, rig, body, out_dir, "-baked")


def validate(look):
    errors = []
    rig = bpy.data.objects.get(f"customer_{look}")
    body = bpy.data.objects.get(f"{look}_body")
    if rig is None or body is None:
        return [f"No customer_{look} armature or {look}_body mesh; run customer.py -- build {look} first."]
    tris = common.triangle_count(body)
    if tris > BUDGET["trianglesPerLook"]:
        errors.append(f"{look} has {tris} triangles, over {BUDGET['trianglesPerLook']}.")
    if len(rig.data.bones) > BUDGET["jointsPerLook"]:
        errors.append(f"{look} has {len(rig.data.bones)} joints, over {BUDGET['jointsPerLook']}.")
    for clip in CLIPS:
        if bpy.data.actions.get(f"{look}.{clip}") is None:
            errors.append(f"{look} has no clip {look}.{clip}.")
    for img in bpy.data.images:
        if img.size[0] > BUDGET["texturePx"] or img.size[1] > BUDGET["texturePx"]:
            errors.append(f"Image {img.name} is {img.size[0]} x {img.size[1]}, over {BUDGET['texturePx']} px.")
    if any(not s.material or not s.material.name.startswith("baked_") for s in body.material_slots):
        errors.append(f"{look} is not baked; run customer.py -- build {look}.")
    return errors


def export(looks):
    for look in looks:
        bpy.ops.wm.open_mainfile(filepath=blend_path(look))
        errors = validate(look)
        if errors:
            for e in errors:
                print(f"error: {e}")
            sys.exit(1)
        rig = bpy.data.objects[f"customer_{look}"]
        body = bpy.data.objects[f"{look}_body"]
        rig.animation_data.action = None
        for o in bpy.data.objects:
            o.select_set(o in (rig, body))
        bpy.context.view_layer.objects.active = rig
        out = export_path(look)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=False,
            export_cameras=False,
            export_lights=False,
            export_extras=False,
            export_materials="EXPORT",
            export_skins=True,
            export_all_influences=False,
            export_def_bones=False,
            export_morph=False,
            export_animations=True,
            export_animation_mode="ACTIONS",
            export_anim_single_armature=True,
            export_force_sampling=True,
            export_optimize_animation_size=True,
            export_reset_pose_bones=True,
            export_frame_step=1,
        )
        print(f"Validated {look}: {common.triangle_count(body)} triangles, {len(rig.data.bones)} joints, {len(CLIPS)} clips. Exported {out} ({os.path.getsize(out) / 1000:.1f} KB)")


def main():
    a = common.args()
    mode = a[0] if a else "build"
    named = a[1:] if mode in ("build", "export") else a[2:]
    for look in named:
        if look not in LOOKS:
            common.fail(f"Unknown look {look}; known: {', '.join(LOOKS)}")
    if mode == "build":
        build(a[1:] or looks_from_json())
    elif mode == "preview":
        out = a[1] if len(a) > 1 else os.path.join(DIR, "match", "preview")
        build(a[2:] or looks_from_json(), preview_dir=out)
    elif mode == "render":
        out = a[1] if len(a) > 1 else os.path.join(DIR, "match")
        render_baked(a[2:] or looks_from_json(), out)
    elif mode == "export":
        export(a[1:] or looks_from_json())
    else:
        common.fail(f"Unknown mode {mode}: use build, preview, render or export.")


main()
