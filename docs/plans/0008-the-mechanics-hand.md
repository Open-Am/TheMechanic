---
id: 0008
title: The mechanic's hand
status: proposed
date: 2026-10-11
adrs: [0007, 0008, 0010, 0012, 0013, 0014, 0015]
branch: plan/0008-mechanics-hand
---

# 0008. The mechanic's hand

## Goal

When a part comes off, the mechanic's hand reaches in from the bottom right of the screen, closes its grip on the part, carries it along its removal motion, and drops it into the tray. Putting a part back runs the same in reverse. A blocked pull shows no hand. The hand is a real-size 3D model of a Lagos mechanic's right hand and forearm, in a worn work-shirt sleeve, made in Blender by script, checked against reference photos of hands, and within the ADR 0015 budget.

## ADRs relied on

- **0015** asks for the hand, sets its budget (400 KB, 4,000 triangles, one 1024 px texture set), says it acts only on accepted pulls and put-backs, and requires the owner's approval of each character and of any outside modelling tool.
- **0013** sets the realism target and the photo-comparison check; Lagos people are shown as real people, never caricatures.
- **0007**: a blocked pull still shows nothing; the hand never hints.
- **0008**: the part's own motion stays as it is; the hand follows it.
- **0014**: lighting and budgets; the asset check enforces the hand's budget.
- **0010**: the hand lives in `render`; nothing else imports it.
- **0012**: Blender 4.5, scripts found through `BLENDER`.

## Simpler readings chosen

1. **Made by script, no new tool.** The hand is modelled in Blender with the same helpers as the generator: palm, three-segment fingers and thumb, knuckles, nails, wrist and forearm, a rolled shirt cuff. ADR 0015 needs approval only for outside tools; this uses none. A scripted hand will look carefully made rather than photographed. If the owner finds it not believable enough, the next step is the MakeHuman add-on, which needs the owner's approval first.
2. **A grip morph, not a skeleton.** The hand has two shapes, open and gripping, stored as one glTF morph target. The game blends between them. One skinned skeleton would cost more and gain little for a hand that only opens and closes.
3. **Skin and wear.** Dark brown skin, with lighter palms and nail beds, and the dust, grease in the creases and on the fingertips that a working mechanic's hand has. The sleeve is faded blue work cloth. Texture baked like the generator's, one 1024 px set.
4. **Where the hand comes from.** It enters from just outside the bottom right of the screen, so the forearm always runs off-screen, and grips the part on the side facing the camera. For a part smaller than the hand, such as the spark plug, it pinches with the fingertips.
5. **Timing.** The reach and grip take 0.18 s before the part starts its motion, and the release takes 0.12 s, so a removal is about 0.3 s longer. Input is not blocked while the hand moves (docs/design/animation.md).
6. **Separate file.** `game/public/hand/hand.glb`, loaded with the machine files at startup. If it is missing, parts move on their own as they do now.

## Steps

1. **References.** A small set of reference photos of working hands, open and gripping, for proportions, kept with the other references and catalogued in `docs/reference/visual-references.md`.
2. **Model.** `tools/blender/hand.py` builds the hand and forearm at real size (palm about 85 mm wide, middle finger about 80 mm), the grip morph, and the sleeve, into `assets/hand/blend/hand.blend` (Git LFS).
3. **Texture and export.** Bake the skin and sleeve to one 1024 px set; export `assets/hand/export/hand.glb`.
4. **Pipeline.** `npm run assets` also validates, optimises and checks the hand against its budget and copies it into the game. Tests for the new checks.
5. **Compare.** Match images of the open and gripping hand against the reference photos, at least two rounds, recorded in `assets/hand/STATUS.md`.
6. **In the game.** `game/src/render/hand.ts`: placing the hand at a part from the camera's side, the reach, grip, follow and release timeline, the reverse for put-backs, and the fallback when the file is missing. The pure parts (approach point, orientation, timeline) are tested.
7. **Design note and verify.** `docs/design/animation.md` gains the hand's timings. The browser check takes a screenshot mid-pull with the hand gripping, solves all six faults, and confirms a blocked pull shows no hand.
8. **Release note.** `docs/releases/0.7.0.md`.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run size` pass; `npm run assets` builds and checks the hand within 400 KB and 4,000 triangles.
- `npm run verify:phone` solves all six faults with the hand, no console errors, and its mid-pull screenshot shows the hand gripping the part; a blocked pull shows no hand.
- `assets/hand/STATUS.md` records the hand as `textured` with match images and what still differs. The owner decides whether it is believable enough or whether to approve an outside tool.

## Release note line

Added: the mechanic's hand reaches in, grips each part, carries it along its motion and drops it in the tray, and does the reverse to put parts back (plan 0008, ADR 0015).
