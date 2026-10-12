---
id: 0015
title: The 3D customer
status: approved
date: 2026-10-11
adrs: [0005, 0007, 0010, 0012, 0013, 0014, 0015, 0020, 0021, 0023]
branch: plan/0015-the-3d-customer
---

# 0015. The 3D customer

## Goal

The round's customer stands in the scene, behind the generator and to its right, so the default view on a portrait phone shows their head and upper body above the machine without hiding any part, the toolbox or the tray. There are three people, one for each `look` in `game/public/customers.json`: Mama Ngozi (`woman_market`), Alhaji Musa (`man_kaftan`) and Tunde (`man_young`). Each is made from a MakeHuman body in Blender by script, dressed and textured with our own materials, rigged, and animated. They stand and breathe while they wait, check the time when patience falls to half, cross their arms and tap a foot when it is nearly gone, react to a failed pull, nod when the engine starts, and turn and walk off when they leave. They never react to anything done to a part. The patience rule, the walk-out and the score do not change.

Approved by the owner on 2026-10-11, who wrote "Plan 12, 15 and adr 22 is approved."

Revised after approval on 2026-10-11, from the owner's answer on how customers download: "Progressive download. As the user is playing the first customer, the next download." Each customer is now its own file, and the next one downloads while the current round is played (readings 2, 9 and 10, steps 2, 4, 6, 8 and 9). The revision was approved by the owner on 2026-10-11, who wrote "1. All approved  2. B".

Revised after review on 2026-10-12. The owner looked at the three people and at where they stand, and wrote "Go with your recommendations in 1 and 2". The first recommendation: approve Mama Ngozi (`woman_market`) and Tunde (`man_young`); Alhaji Musa (`man_kaftan`) gets a second pass. The second: "A. Stand further back — about 2.5 to 3 m behind the machine, so the whole person fits small at the top of the screen. The machine keeps its size." Reading 7 is changed to that. Working the distance out from the default camera showed that no distance makes the whole person fit while the camera stays as it is; reading 7 says why and what would, and steps 7 to 9 wait for the owner's answer.

## ADRs relied on

- **0015** decides all of it: the 3D customer behind and beside the machine with their upper body in the default view and no part hidden; an idle loop and a short animation for each moment (checking a watch, arms crossed, tapping a foot, walking off, nodding); reactions follow the meter only (time passing, a failed pull, nearly out, leaving, pleased), never a removal; the customer can never be picked and taps pass through; characters read as real Lagos people, never caricatures, and the owner approves each one; animation licences are recorded beside each file; the budget of 1.5 MB, 15,000 triangles and one 1024 px texture set per customer, and one customer per round; `render` draws the customer, `core` and `app` keep the rule. The patience rule, `customers.json`, the meter and the lines were built by plan 0007 and are not changed.
- **0020** restates what stays from ADR 0016 (superseded): MPFB is an approved tool for the customer as well as the hand; only CC0 material, or material whose licence only asks for credit, is shipped; every MakeHuman item used is listed in `assets/<model>/LICENCE.md`; MakeHuman gives the shape and textures are our own; a MakeHuman image needs the owner's approval of that image. ADR 0016's text was what first approved MPFB for the customer.
- **0007**: the customer shows nothing about the fault. Their animations come only from the clock and the cord, the same for every fault and every part.
- **0013**: the realism target, the comparison against reference photos, reference photos of people kept out of git and never used as textures.
- **0014**: the frame rate must hold at 30 fps at 4x CPU throttle with the customer, the hand and the toolbox on screen.
- **0012**: Blender 4.5, scripts that find Blender through `BLENDER`, `.blend` files in Git LFS.
- **0010**: the customer is drawn in `render`; `app` gains one read-only field; `core` and `ui` do not change.
- **0021**: the toolbox sits front left of the machine; the customer must stay clear of it.

- **0023** (proposed): each customer is its own file, the first round's customer downloads with the machine, and the next round's customer downloads in the background during the round. Nothing waits on it. It replaces ADR 0010's "no request after load" paragraph.
- **0005**: the daily's customer is the day's customer, so it is known ahead.

No accepted ADR is contradicted once ADR 0023 is accepted.

## Exploration summary

Done by Claude (Opus) in one pass, without a separate small-model agent.

- `game/public/customers.json` (plan 0007) holds three customers with `look` values `woman_market`, `man_kaftan` and `man_young`. Nothing reads `look` yet; `validateCustomers` only checks it is a non-empty string. Patience is 750, 550 and 400 seconds since the drop and patience fix.
- `app/round.ts` picks the round's customer in `newRound()` and exposes `customerName`, `patience()` and the events `patience` (mood `waiting` at 50 percent, `annoyed` at 20 percent, from `core/constants.ts`), `left`, `pulled` (with `started`) and `ended`. It does not expose the customer's `look`.
- `ui/index.ts` shows the meter and the speech line, and opens the result screen 900 ms after `ended` and 1,600 ms after `left`. Those delays set how long the pleased nod and the walk-off can be seen.
- `render/model.ts` loads `model.glb`, the environment, the ground shadow and `hand/hand.glb` at startup, each optional. It returns only `gltf.scene`, so animation clips would be dropped today. `main.ts` loads everything before the first round; ADR 0010 says nothing is fetched after that.
- `render/view.ts` frames the camera on the machine (`fitDistance` from the machine's radius) and orbits the camera round a still machine. The hand keeps out of the machine with a ray check against the machine's meshes.
- The hand was made by `tools/blender/hand.py` with MPFB 2.0.18 and the CC0 system assets pack. Its poses are morph targets; no skeleton ships. `assets/hand/LICENCE.md` is the model for a licence file. `tools/pipeline/budgets.json`, `check.ts` (`checkHand`) and `assets.mjs` export, optimise, check and copy the hand. `assets/*/reference/` and `assets/*/match/` are already git-ignored.
- `tools/verify/phone-play.ts` plays all six faults at 390 by 844 through the dev hook `window.__openAmDevRender`, and forces a walk-out with `?patience=5`.
- Plan 0012 (proposed) places the toolbox front left and fixed in the world, so it turns with the machine.

Risks: three dressed, rigged and animated people in 1.5 MB is tight (see reading 2). A skinned mesh costs more per frame than the morph-target hand. A person is far harder to make believable than a machine, and a face that reads wrong reads as a caricature, which ADR 0015 forbids. At phone size from the default view the customer's head is small, so build, clothing, colour and posture carry most of the realism.

## Simpler readings chosen

1. **One person per look.** Three distinct people, one for each `look`, not one body with swapped clothes: a market woman, an older man in a kaftan and a young man read as different people only if their bodies differ. Each is its own MPFB body with its own skeleton and clips.
2. **One file per person, downloaded one round ahead (ADR 0023).** Each person is its own file, `game/public/customers/<look>.glb`, within ADR 0015's budget (1.5 MB, 15,000 triangles, one 1024 px texture set). The first round's customer downloads with the machine, behind the briefing. When a round starts, `app` picks the next round's customer at once (free play) or knows it (the daily, ADR 0005), and `render` downloads that person in the background. A person already downloaded is kept in memory for the session and not downloaded again. Only the round's person is shown and animated.
3. **Who they are.** All plainly dressed, everyday people, with MakeHuman's sliders near average so no feature is exaggerated:
   - `woman_market`: a woman of about 50, fuller build, in a wrapper and blouse of a wax-print pattern we design ourselves, and a head tie.
   - `man_kaftan`: a man of about 55, average build, in a plain long kaftan over trousers, with a cap.
   - `man_young`: a man of about 25, slim, in a plain or football-style T-shirt with no real club, brand or badge, jeans and slides.
   Clothes, head tie and cap are modelled by our script on the body; the CC0 pack's hair, eyes, eyebrows and teeth meshes may be used. All textures are baked from our own procedural materials (ADR 0013, ADR 0020); no MakeHuman image ships.
4. **Skeleton.** Unlike the hand, the customers ship a skeleton, because walking off and crossing arms cannot be done with a few morphs. MPFB's game-engine rig (fewer bones, no finger chains) if its licence is CC0, otherwise MakeHuman's default rig with the finger and face bones removed. At most 64 joints per person, a constant in `check.ts`.
5. **Animations are ours.** Keyframed by the build script in Blender, the same poses applied to each skeleton. No motion capture or downloaded animation, so every clip's licence is "the project's own work". Clips per person, named `<look>.<clip>`:

   | Clip | When | Length |
   | --- | --- | --- |
   | `idle` | Waiting, loops: breathing, a slow weight shift | 4 s loop |
   | `arrive` | Round starts (`started`): a small nod and lifted hand | 1 s, then `idle` |
   | `waiting` | `patience`, mood `waiting`: looks at a wrist or phone | 1.5 s, then `idle` |
   | `annoyed` | `patience`, mood `annoyed`: crosses arms | 1 s, then `annoyed_idle` |
   | `annoyed_idle` | Nearly out of patience, loops: arms crossed, foot tapping | 2 s loop |
   | `failed_pull` | `pulled` with `started` false: hands to hips, head shakes | 1.2 s, then back to the current loop |
   | `pleased` | `ended` (the engine started): nods, a small clap or thumbs up | under 0.9 s, held |
   | `leaving` | `left`: turns away and walks off to the right | 1.6 s, then hidden |

   No other event moves the customer. `removed`, `installed`, `inspected`, `fixed`, `refused`, loosening, carrying, hovering and turning the view do nothing to them. Their head does not follow the hand or any part.
6. **When patience runs out.** ADR 0015 says the customer takes the generator and leaves. The simpler reading: in 3D they turn and walk off without lifting the machine, inside the 1,600 ms before the result screen, which already says they took the generator. Animating someone carrying the machine away would need the machine group handed to a skinned hand, for no gain in play. ADR 0007 is kept: the walk-off is the same for every fault.
7. **Where they stand.** On the ground behind the machine and to its right, about 2.5 to 3 m behind it (the owner's choice of 2026-10-12, which replaced 0.6 m behind its back edge), outside the toolbox's ground circle, facing the camera. The distance is measured from the machine's centre along the camera's line of sight, with the customer 0.35 m to the right of that line. Their spot is worked out from the camera's turn round the machine (its azimuth), not fixed in the world, so the customer always stays behind the machine as seen from any turn: at 2.5 m and more they are about 2 m farther from the camera than the machine's far side, at every azimuth. The player turns the machine with the hand; a customer who swung round in front of it would hide parts. The machine keeps its size: the camera's framing does not change. A soft drawn shadow sits under their feet, part of the customer group.

   **The whole person does not fit at the default camera, at any distance.** Worked out on 2026-10-12 from `render/view.ts` and `render/orbit.ts` on `main`: azimuth 0.55, polar 1.12, 40 degrees vertical, 2.12 m from the machine's centre on 390 by 844 (1.75 m on 360 by 640), and `frameAbove` moving the picture up by half the about 134 CSS px the pull cord and the empty tray cover (67 px; worked out from the stylesheet, not measured in a browser). The camera is 1.11 m above the ground on 390 by 844 (0.95 m on 360 by 640) and looks down 26 degrees; with the picture moved up, the top edge of the screen looks down about 9 degrees. Nothing higher than the camera can be on screen, whatever the distance, and the people are 1.57 to 1.80 m tall with the cap. At the top edge of the screen the view reaches only this high above the ground where the customer stands:

   | Behind the machine's centre | 390 by 844 | 360 by 640 |
   | --- | --- | --- |
   | 0.83 m (the old spot) | 0.69 m | 0.54 m |
   | 2.5 m | 0.43 m | 0.25 m |
   | 2.75 m | 0.39 m | 0.21 m |
   | 3.0 m | 0.35 m | 0.16 m |

   So at 2.5 to 3 m only the feet and shins show, small, at the top of the screen, under the timer and the meter on 360 by 640. Standing back makes less of the person visible, not more. No setting of the camera's own tilt fixes it either: even at the steepest the limits allow (polar 1.55, the camera 0.23 m up and nearly level), the head clears the HUD on both sizes only from about 5 to 6 m back, and then the feet are behind the machine. The whole person fits only if the default view itself changes, which is the owner's call. Options for the owner, none built: (a) aim the default camera higher, above the machine, so the machine sits lower on the screen with the customer above it, which needs a new framing rule and costs room above the controls; (b) a small picture of the customer drawn by a second camera in a corner of the screen, which may need ADR 0015 superseding since it says the customer stands in the scene; (c) start each round looking at the customer and settle onto the machine; (d) keep 0.6 m and accept that only the lower half shows. Until the owner chooses, the renders use 2.75 m, the middle of the range, and steps 7 to 9 wait.
8. **Never picked.** The customer is on its own Three.js layer, left out of picking, the pointer's hit tests, the hand's collision check and the hover. A tap or drag on the customer is a tap or drag on empty space, so it turns the machine.
9. **Approval before release.** ADR 0015: the owner approves each character. A look's file reaches `game/public/customers/` on `main` only once the owner sets it to `approved` in `assets/customers/STATUS.md`. The branch and the phone preview carry all three for the owner to judge. A look that is not approved has no file, and its customer plays without a 3D figure.
10. **Fallback.** A person's file is missing, fails, or has not arrived when their round starts: the round starts anyway with the meter and the lines and no figure, and the figure appears if the file arrives during the round, already in the pose for the current patience. Patience and the walk-out never wait for it (ADR 0023). No customers at all: no figure, as now.
11. **Lines unchanged.** The draft Pidgin lines and the speech bubble stay as plan 0007 left them. The customer's mouth does not move.

## Needs an ADR first

- ADR 0023 (proposed) for the per-person files and the download one round ahead. Steps 1, 3 and 5 (licences, modelling, comparison) do not depend on it.
- Voices or sounds for the customer. ADR 0018 does not cover them. Not in this plan.

## Steps

1. **Tools and licences.** Check MPFB 2.0.18 and the CC0 system assets pack are still installed, as recorded in ADR 0016's history; if a version changes, add a history line to ADR 0020. Read the licence of every MPFB item the customers will use: base mesh, macro targets, the rig, hair, eyes, eyebrows, teeth. Write `assets/customers/LICENCE.md` from `assets/hand/LICENCE.md`'s pattern, one row per item, plus "the project's own work" for clothes, textures and every animation clip. Anything not CC0, or credit-only, or unclear, is not used. Gather reference photos of everyday Lagos dress (wrapper and blouse with head tie, kaftan and cap, young men's casual wear) into `assets/customers/reference/` (git-ignored) and catalogue their links in a new "The customers" section of `docs/reference/visual-references.md`. Photos of identifiable people are used only for clothing, colour and build, never for a face.
2. **Budgets.** `tools/pipeline/budgets.json` gains `customers`: `trianglesPerLook` 15000, `bytesPerLook` 1500000, `texturePx` 1024, `jointsPerLook` 64. `game/tests/pipeline.test.ts` covers it.
3. **Model.** `tools/blender/customer.py -- build [look ...]` reads the looks from `game/public/customers.json` (all of them by default; the release build names only the approved ones) and, for each: makes the MPFB body with the settings in reading 3, adds the rig of reading 4, models the clothes, head tie or cap on the body, adds the CC0 hair and eye meshes, bakes skin, cloth and eyes with `tools/blender/texture.py` into one 1024 px set, decimates to budget, keyframes the clips of reading 5, prefixes bone and clip names with the look, and saves `assets/customers/blend/<look>.blend` (Git LFS). `-- preview <dir>` renders each person front and three-quarter, and a strip of each clip, without baking.
4. **Export and check.** `tools/pipeline/assets.mjs` exports, optimises (`optimise.mjs`) and checks each person's file. `tools/pipeline/check.ts` gains `checkCustomer`: one root `customer_<look>` for a `look` in `customers.json`, and nothing else; within 15,000 triangles and 64 joints; every image within 1024 px; every clip of reading 5 present; the file within 1.5 MB. It copies each file to `game/public/customers/<look>.glb`. Tests in `game/tests/pipeline.test.ts` for each check, including a missing clip, an extra node and a look over budget.
5. **Compare.** Match images of each person, standing and from the default game view, against the reference photos, at least two rounds, recorded in `assets/customers/STATUS.md` with the status, triangle count, size and what still differs.
6. **App.** `game/src/app/round.ts` gains `customerLook: string | null` on `Game`, the round's `look`, and `nextCustomerLook: string | null`, the next round's, chosen when a round starts; `newRound` then uses that customer. Tests: `customerLook` follows the picked customer; the next round's customer is the one announced; the daily's next customer is the next day's only if the next round is that daily, otherwise free play's pick; both are null without customers.
7. **Pure render parts.** `game/src/render/customerpose.ts`: the customer's ground spot and facing from the camera's azimuth and the machine's size; and `clipFor(event)`, which maps game events to clips as in reading 5 and returns nothing for every other event. Tests in `game/tests/render.test.ts`: the spot is always farther from the camera than the machine's far side, at any azimuth; it stays outside the toolbox's circle; `clipFor` returns nothing for `removed`, `installed`, `inspected`, `fixed` and `refused`, and the same clip for every part and fault.
8. **In the game.** `game/src/render/model.ts` keeps the clips: `loadModel` returns the scene and its animations, and `game/src/main.ts` loads the first round's customer with the machine. A new `game/src/render/customer.ts` keeps a small cache of downloaded people by look, downloads `customers/<nextCustomerLook>.glb` in the background when a round starts, shows only the round's look, plays its clips with one `AnimationMixer`, places it each frame from `customerpose.ts`, and keeps it off the picking layer, out of the hand's collision check and out of the hover. `game/src/render/view.ts` mounts it, listens to `started`, `patience`, `pulled`, `ended` and `left`, and updates it each frame. The dev hook gains `customer()`: the look, the playing clip, whether it is shown, its projected screen box and its nearest distance from the camera.
9. **Browser check.** `tools/verify/phone-play.ts`, at 390 by 844 and 360 by 640: the customer is shown in the default view with the head inside the screen, below the HUD and above the machine; the customer's nearest point is farther from the camera than the machine's farthest point at the default view and after turns of 90, 180 and 270 degrees; its screen box does not overlap the toolbox's or the tray's; a tap on the customer picks nothing and a drag there turns the machine; `idle` plays at the start; loosening and removing a part does not change the clip; a failed pull plays `failed_pull`; solving plays `pleased`; the forced walk-out (`?patience=5`) plays `annoyed` then `leaving` before the result screen; with one person's file renamed away, and with the next person's download delayed past the round's start (DevTools network throttling on that file), all six faults still solve, the figure appears when the delayed file arrives, and there are no console errors; the next round's file is requested during the round, not at its start; all six faults solve with the customer present; no console errors; at least 30 fps at 4x CPU throttle with the customer, hand and toolbox on screen. Screenshots of each person in the default view and of the walk-off.
10. **Notes.** `docs/design/animation.md` gains the customer's clips and when they play. Release note `docs/releases/0.14.0.md` names the looks that are approved and the status of the others. Republish the phone preview.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass.
- `npm run assets` builds and checks each person's file: within 15,000 triangles, 64 joints and 1.5 MB, every image within 1024 px, every clip present.
- `npm run verify:phone` passes every check in step 9.
- `assets/customers/LICENCE.md` lists every MakeHuman item used with its licence and every clip as our own work. `assets/customers/STATUS.md` records each person's status and match images.
- The owner looks at each person on the phone and sets each one `approved` or says what is wrong. Only approved people ship in 0.14.0.

## Depends on

- Plan 0012 (the toolbox) merged into `main`, because the customer's spot and the browser check are placed against the toolbox and the framing it is placed against.
- Plan 0011 merged, which plan 0012 depends on.
- The owner's approval of this plan, and of each character before it ships.

## Release note line

Added: the customer stands behind the generator while you work, waits, gets impatient as their patience runs down, reacts to a failed pull, nods when the engine starts, and walks off if they run out of patience (plan 0015, ADR 0015).
