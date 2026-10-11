---
id: 0009
title: A MakeHuman hand, and the hand turns the machine
status: proposed
date: 2026-10-11
adrs: [0007, 0008, 0010, 0012, 0013, 0014, 0015, 0016]
branch: plan/0009-makehuman-hand
---

# 0009. A MakeHuman hand, and the hand turns the machine

## Goal

The mechanic's hand is remade from a MakeHuman body: a sculpted, properly proportioned right hand and forearm of a Lagos mechanic, with knuckles, tendons and finger pads in the shape, posed with MakeHuman's own hand skeleton into an open hand, a grip and a fingertip pinch. Small parts such as the spark plug get the pinch instead of a fist closing around air. When the player drags to rotate the view, the hand comes in, takes hold of the base frame and turns the machine with the drag, lets go when the drag ends, and changes its hold hand over hand on a long turn. The hand stays within its budget and the game plays as before.

## ADRs relied on

- **0016** (proposed with this plan) approves MakeHuman for the hand, says how its version and licences are recorded, keeps textures our own, writes down the hand's file contract, and adds the rotation hold.
- **0015** sets the hand's budget (4,000 triangles, 400 KB, one 1024 px texture set) and when it acts; 0016 adds rotation to that.
- **0013** sets the realism target, the photo comparison, and that textures are made by us.
- **0007**: the rotation hand holds only the frame and looks the same whatever part the drag started on; a blocked pull and a tap still show no hand.
- **0008**: part motion is unchanged; the hand follows it.
- **0012**: Blender 4.5; MPFB runs inside it and is recorded like other tools.
- **0014**: frame-rate budget holds with the hand on screen during rotation.
- **0010**: everything new is in `render`; `core` and `app` do not change.

## Exploration summary

A Haiku agent read the ADRs and design notes: showing the hand during rotation goes beyond ADR 0015's "visible only while it acts", so it needs ADR 0016; no ADR yet defines the hand's GLB file; nothing records MakeHuman licences. A second Haiku agent installed MPFB 2.0.18 from extensions.blender.org (GPL-3.0-or-later, a build tool only) and the MakeHuman system assets pack, CC0 variant (every one of its 94 items is marked CC0 in its metadata; the base mesh file says CC0 since September 2020), then made a test human headless: 19,158 vertices, a 137-bone rig that includes finger bones, and an EEVEE render. These go in ADR 0016's history once it is accepted. In the code, the camera orbits a still machine (`render/orbit.ts`), and a drag becomes a rotation in `render/view.ts` through `classify` in `render/gesture.ts`. The hand rig (`render/handrig.ts`) is placed with pure maths in `render/handpose.ts`. Because the machine stays still and the camera moves, a hand fixed to the frame in the world moves with the machine on screen, which is what makes it look like the hand is turning it.

## Simpler readings chosen

1. **Shape from MakeHuman, texture from us.** The body is made in MPFB as an adult Nigerian man in his thirties with a working build (African ethnic setting, muscular, average weight). Only the right hand and forearm are kept. The skin and sleeve are baked by `texture.py` with the profiles the current hand uses (dark brown skin, lighter palms, grease, no dust on skin), plus a normal map baked from MakeHuman's higher-resolution, subdivided hand so knuckle creases and tendons survive the cut to 4,000 triangles.
2. **Poses as morph targets, not a skeleton in the game.** MakeHuman's finger bones pose the hand in Blender; each pose is saved as a morph target (`grip`, `pinch`) and the skeleton is not shipped. The game keeps blending morphs as it does now. One file, no skinning cost on the phone.
3. **Pinch for small parts.** A part whose size is under a set threshold (about 45 mm across: the spark plug, plug cap, fuel tap, capacitor) gets `pinch`; the rest get `grip`. The threshold is a constant in `handpose.ts`.
4. **Sleeve.** MakeHuman's clothing images are not shipped (ADR 0016). The rolled work-shirt sleeve stays our own, fitted to the new forearm, with the same faded blue cloth.
5. **Where the hand holds the frame.** The machine has no tube frame (`docs/open-questions.md`): `base_frame` is the die-cast base, rubber mounts and body shell. The hand holds the edge of the base, at the point nearest the camera, shifted towards the right of the screen where the forearm comes in from. The hold point is fixed in the world while the drag lasts, so the machine and the hand turn together on screen. The forearm is re-aimed each frame so it always runs off the bottom right of the screen.
6. **Hand over hand.** When the hold point has turned more than 70 degrees away from the camera since it was taken, or goes behind the machine, the hand lets go and takes a new hold at the new nearest point: release 0.12 s, reach 0.18 s, the same timings as a pull.
7. **When it comes and goes.** The hand comes in once the drag has become a rotation (after 8 px, the tap slop), so a tap never shows it. Two fingers (zoom) hide it. Lifting the finger releases and withdraws it. A pull or put-back takes the hand over.
8. **Hands-on removal comes next.** ADR 0017 (proposed) would have the part follow the finger, so the hand would take hold when the drag starts rather than reaching in first. If it is accepted, the next plan reworks the hand's timing for pulls; the model, the pinch and the rotation hold built here stay.
9. **Fallback.** If `hand.glb` is missing, rotation works as now with no hand.

## Steps

1. **Record the tool.** After ADR 0016 is accepted: its history gets the MPFB version, the asset pack version and their addresses. `assets/hand/LICENCE.md` lists every MakeHuman item the hand uses and its licence. `docs/reference/visual-references.md` notes the MakeHuman source.
2. **Model.** `tools/blender/hand_mh.py -- build`: makes the MPFB body with the settings above, poses the fingers with its rig for open, grip and pinch, keeps the right hand and forearm, bakes the normal map from the subdivided hand, decimates to budget, fits the sleeve, saves the poses as `grip` and `pinch`, sets the origin and axes of the hand file contract, bakes the texture, and saves `assets/hand/blend/hand.blend` (Git LFS). The old `hand.py` stays in the history only; `npm run assets` uses the new script.
3. **Checks.** `tools/pipeline/check.ts` checks the hand file contract of ADR 0016 (root name, `grip` required, other morph names allowed, budgets). Tests for the new checks.
4. **Compare.** Match images of the open, gripping and pinching hand against the reference photos, at least two rounds, recorded in `assets/hand/STATUS.md`.
5. **Pinch in the game.** `handpose.ts` picks `grip` or `pinch` from the part's size; `handrig.ts` blends the chosen morph. Tests for the choice.
6. **Rotation hold.** `handpose.ts` gains the pure parts: the hold point on the edge of the base for a camera position, when to change hold, and the forearm direction. `handrig.ts` gains `holdFrame(...)`, `followFrame(...)` and reuses `release()`. `view.ts` calls them when a drag becomes a rotation, on each rotation move, and on finger up or a second finger. Tests for the pure parts, including that the hold point is never on a removable part and that the hand is the same whatever the drag started on.
7. **Design note and verify.** `docs/design/animation.md` gains the rotation hold and pinch. `npm run verify:phone` gains a rotation drag with a screenshot of the hand on the frame, checks the hand is gone after the finger lifts, that a tap shows no hand, and that a rotation started on a blocked part looks the same as one started on empty space; it still solves all six faults.
8. **Release note.** `docs/releases/0.8.0.md`. Republish the phone preview.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` builds and checks the hand within 4,000 triangles and 400 KB.
- `npm run verify:phone` solves all six faults with no console errors; its screenshots show the hand gripping mid-pull, pinching the spark plug, and holding the frame during a rotation; a tap and a blocked pull show no hand; the hand is gone after a rotation ends.
- `assets/hand/STATUS.md` records the new hand as `textured`, with match images and what still differs; `assets/hand/LICENCE.md` records every MakeHuman item used. The owner looks on the phone and decides whether the hand is believable enough to approve.

## Release note line

Changed: the mechanic's hand is remade from a MakeHuman body, and pinches small parts with its fingertips (plan 0009, ADR 0016). Added: the hand takes hold of the frame and turns the machine when you rotate the view (plan 0009, ADR 0016).
