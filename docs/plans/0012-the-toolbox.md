---
id: 0012
title: The toolbox, and the hand fetching and returning its tools
status: proposed
date: 2026-10-11
adrs: [0001, 0004, 0007, 0010, 0012, 0013, 0014, 0020, 0021]
branch: plan/0012-the-toolbox
---

# 0012. The toolbox, and the hand fetching and returning its tools

## Goal

A worn metal mechanic's toolbox sits on the ground beside the generator, lid open, with the spanner and the screwdriver in it. When the player loosens a part that has fasteners, the hand leaves the pointer, goes to the toolbox, picks up the right tool, undoes the fasteners, frees the part, puts the tool back in the toolbox and returns to the pointer. Putting a part back runs the same trip. The toolbox is scenery only. Nothing changes in the rules or the score.

## ADRs relied on

- **0021** decides all of it: the toolbox on the ground, inside the default view and clear of the machine; scenery that cannot be picked and never blocks the pointer; its budget (3,000 triangles, 200 KB, one 1024 px texture set, its own file next to the tools); the fallback to "just off screen" if the file is missing; the fetch, use, return sequence; a tool change at the toolbox when a part's fasteners need different tools; the view can still turn and zoom during the sequence; a new loosen waits until the sequence is done; before the cord is pulled, fasteners are done up quickly with no trip.
- **0020**: fasteners, the spanner and screwdriver, and the loosen and put-back gestures, built by plan 0011. This plan only changes where the tool comes from and goes back to.
- **0001**: tools are not a feature to choose, buy or lose. The hand always takes the right tool by itself. ADR 0021 restates that this exclusion stands.
- **0004**: no new action; the trip costs only its time.
- **0007**: the sequence is the same for every part apart from its own fasteners and motion, so it hints nothing about the fault. A part that cannot come off yet still shows nothing.
- **0010**: the toolbox and the sequence live in `render`; nothing in `core`.
- **0012, 0013**: Blender 4.5 by script, our own materials, a match image against reference photos of real toolboxes (reference only, never committed).
- **0014**: the toolbox's own budget is outside the machine's 60,000 triangles; the frame rate must hold at 30 fps at 4x CPU throttle.

## Exploration summary

Plan 0011 (branch `plan/0011-bolts-and-tools`, commit `e8dacc3`) already fetches the tool from `toolSource()` in `game/src/render/view.ts`, a point just off screen at the lower left, carries it to the first fastener in 0.3 s, and takes it back there in 0.3 s. `tools/blender/tools.py` makes `tools.glb` (spanner and screwdriver, 1,160 triangles, 48.6 KB). `tools/pipeline/budgets.json` holds the tools budget; `check.ts` and `assets.mjs` export and check it. The ground comes from `render/ground.ts`, sized from `machine.size`. The camera frames the machine; the uncommitted drop fix (release 0.9.3, branch `fix/drop-reliability`) changes that framing so the machine sits above the tray and pull cord, so the toolbox must be placed against the new framing. Today `loosening` is a set and several parts could loosen at once.

Risks: on a 360 by 640 screen the default view has little room beside the machine; a toolbox that is too small to read is pointless and one that is too big crowds the machine. The hand's trip to the toolbox from a view turned to the back must not pass through the machine (the collision check from `fix/hand-collision` applies).

## Simpler readings chosen

1. **Where.** The toolbox sits on the ground to the front left of the machine, turned about 20 degrees to face the default camera, close enough that it is fully in the default view on 360 by 640 and 390 by 844 with the tray at its largest. It is a fixed object in the scene, so it turns with the machine when the view turns. If it cannot fit fully in view at 360 by 640, it may be cropped at the screen edge, but its open lid and the tools in it must show.
2. **What.** A red-painted steel cantilever toolbox, about 450 by 220 by 200 mm, lid open, with chipped paint, rust at the edges and grease, plus a few loose things inside that are not tools the player uses (a rag, a few sockets, a wire brush) so it reads as a working box. Made by `tools/blender/toolbox.py`, textured with the machine's baker, exported to `game/public/hand/toolbox.glb`. One node `toolbox`, plus two empty nodes `slot_spanner` and `slot_screwdriver` where each tool rests.
3. **Tools at rest.** When not in the hand, each tool lies in its slot in the toolbox, visible. Today they are hidden when not in use.
4. **The trip.** The hand goes from the pointer to the toolbox, takes the tool out of its slot, carries it to the first fastener, undoes the fasteners as plan 0011 does, puts the tool back in its slot, and comes back to the pointer. Travel time scales with distance: 0.35 s at the default view, at most 0.6 s. If a part needs a second tool, the hand goes back to the toolbox between fasteners. The path from the toolbox to the machine goes over, not through, the machine, using the existing collision check.
5. **During the sequence.** The view can still turn and zoom. Pointer input that would start a new loosen, carry or put-back is ignored until the sequence ends (simpler than queuing it). The clock runs.
6. **Before the cord is pulled.** Unchanged from plan 0011: fasteners go back quickly, with no trip.
7. **Fallbacks.** No `toolbox.glb`: the tools come from just off screen as now. No `tools.glb`: the fingers turn the fasteners, as now, with no trip.

## Steps

1. **Budgets.** `tools/pipeline/budgets.json` gains `toolbox` (3,000 triangles, 200,000 bytes, 1024 px). `game/tests/pipeline.test.ts` covers it.
2. **Model.** `tools/blender/toolbox.py` builds the toolbox with its slots; `tools/blender/texture.py` bakes it; `tools/pipeline/assets.mjs` and `tools/pipeline/check.ts` export, optimise, check (one `toolbox` node, the two slot nodes, budget) and copy `game/public/hand/toolbox.glb`. Match image against reference photos. `assets/hand/STATUS.md` and `assets/hand/LICENCE.md` gain the toolbox (our own work).
3. **Pure motion.** `game/src/render/motion.ts`: the trip's timing (travel time from distance, the order of fetch, use, change, return) as a pure function. Tests in `game/tests/render.test.ts`: four bolts with one tool make one trip; mixed bolts and screws change tool once at the toolbox; travel time stays within 0.35 to 0.6 s; a part without fasteners makes no trip.
4. **In the game.** `game/src/render/model.ts` loads `toolbox.glb`; `game/src/render/view.ts` places it, puts the tools in their slots, replaces `toolSource()` with the slot positions, plays the trip on loosen and put-back, and ignores new loosen, carry and put-back input until it ends. The toolbox is excluded from picking and from the pointer's hit tests.
5. **Browser check.** `tools/verify/phone-play.ts` checks at 390 by 844 and 360 by 640 that the toolbox is in the default view and does not overlap the machine's screen rectangle; loosens the alternator cover and checks the hand reaches the toolbox, holds the spanner at the bolts, and the spanner is back in its slot afterwards; a second loosen during the sequence is ignored; all six faults still solve; the forced walk-out still works; no console errors; at least 30 fps at 4x CPU throttle. `npm run verify:drop` still passes 96 of 96.
6. **Notes.** `docs/design/animation.md` gains the trip; release note `docs/releases/0.11.0.md`; the phone preview republished.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` checks the toolbox within 3,000 triangles and 200 KB.
- `npm run verify:phone` and `npm run verify:drop` pass as in step 5.
- The owner looks on the phone.

## Depends on

Plan 0011 merged into `main`, and the drop fix (release 0.9.3) merged, because the toolbox is placed against its framing.

## Release note line

Added: a mechanic's toolbox beside the generator. Loosening a bolted part, the hand fetches the spanner or screwdriver from the toolbox, undoes the fasteners and puts the tool back (plan 0012, ADR 0021).
