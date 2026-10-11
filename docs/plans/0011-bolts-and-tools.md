---
id: 0011
title: Bolts and screws, and the spanner and screwdriver in the hand
status: approved
date: 2026-10-11
adrs: [0003, 0004, 0007, 0010, 0012, 0013, 0014, 0020]
branch: plan/0011-bolts-and-tools
---

# 0011. Bolts and screws, and the spanner and screwdriver in the hand

## Goal

The parts that are held on by bolts, screws or nuts show them as their own pieces, and loosening a part undoes them one by one: the hand picks up a spanner or a screwdriver, turns each fastener out until it stands proud of its hole, then frees the part. When the part is carried to the tray its fasteners go with it; when it is put back, the hand does them up again. Fasteners are in `machine.json` and in the model, checked by the validator and the asset check. Nothing changes in the rules or the score.

Approved by the owner on 2026-10-11, who wrote "I am also approving the plan so that we can proceed [...] Plan 11 is approved."

## ADRs relied on

- **0020** decides all of it: fasteners are part of how a part comes off, not parts; the `fasteners` field (`id`, `kind`, `position`, `axis`); one model node per fastener named by its id; they come out during the loosening animation, never by a gesture; they go with the part and are done up on put-back and before the cord is pulled; a spanner or screwdriver in the hand, visuals only, one `tools.glb` of at most 100 KB and 2,000 triangles.
- **0003**: the machine data contract, which ADR 0020 extends with `fasteners`; ids are never changed without an ADR.
- **0004**: no new action; the core sees `remove` and `install` as now; loosening costs only its time.
- **0007**: a part that cannot come off shows no fastener moving, as it shows no loosening now.
- **0010**: fastener data and validation in `core`, the animation in `render`.
- **0012, 0013**: Blender 4.5 by script; the tools made to the realism standard, checked against reference photos, no outside images.
- **0014**: fasteners count towards the machine's 60,000 triangles and 5 MB; the frame rate holds.

## Exploration summary

The ADRs were summarised by Haiku agents earlier on 2026-10-11 and ADR 0020 restates what this plan needs. In the code: `tools/blender/model.py` already draws some fasteners into the part meshes (four bolts on the alternator cover, two bolts with washers on the air filter door, the carburettor's bowl bolt, the tank handle's screws, the fuel tap lever's screws); the recoil cover has four bolt ears but no bolts; the tank, muffler and carburettor flange have none. `texture.py` bakes one atlas per group of named objects. The asset check counts root nodes against the part and base ids. The loosening animation (`render/motion.ts` `loosePose`, `render/view.ts` `loosen`) frees a part by its motion type. `docs/open-questions.md` lists the fasteners as unknown for every part; the reference notes give "three or four bolt ears" on the recoil cover, "tank lid screws out and lifts off whole" (Benco video, about 2:40 to 3:40), muffler "bolted with it to the cylinder", carburettor flange "two holes about 37 mm apart".

## Simpler readings chosen

1. **The draft fasteners** (all marked unverified, each doubt added to `docs/open-questions.md` for the mechanic):

| Part | Fasteners | Kind | From |
| --- | --- | --- | --- |
| `fuel_tank` | 4, two on each side flange | screw | Benco video: the tank lid screws off; the listing shows bolt holes in two side flanges |
| `recoil_starter` | 4, one in each bolt ear | bolt | reference: three or four bolt ears; the model has four |
| `muffler` | 2 nuts on the exhaust studs, 2 bolts through the heat shield | nut, bolt | reference: square exhaust flange with two studs; the shield is bolted with the muffler |
| `carburetor` | 2, on the flange studs | nut | reference: two-hole flange, holes about 37 mm apart |
| `alternator_cover` | 4 | bolt | the model's four bolts |
| `air_filter_cover` | 2 | bolt | the model's two door bolts (its motion stays `unclip`: the door rocks off its clip once the bolts are out) |

The fuel tap's lever screws, the tank handle's screws and the carburettor's bowl bolt hold other things on, so they stay part of their part. The fuel hose, plug cap, spark plug, air filter and capacitor have none (the capacitor's mounting is unconfirmed).

2. **One source for positions.** `machine.json` holds each fastener's `position` and `axis`; `model.py` draws the fasteners there, from the data, instead of the hard-coded bolts it has now. Fasteners are separate Blender objects parented to their part, so the exported model has each as a child node of its part, named by its id, and moves with it.
3. **The loosening sequence.** For a part with fasteners: the hand takes the tool (spanner for bolts and nuts, screwdriver for screws), visits each fastener in turn and turns it out, 2 turns backing out 8 mm in 0.25 s each, then puts the tool away and frees the part by its motion type in 0.3 s (shorter than without fasteners, since the fasteners did the work). Four bolts take about 1.4 s in all. A part without fasteners loosens as now.
4. **Tools.** `tools.glb` holds two nodes, `spanner` (a 10 mm open-ended spanner, about 130 mm, chrome with worn grip) and `screwdriver` (a Phillips screwdriver, about 180 mm, a yellow and black plastic handle), each with its origin at its tip and its handle along +Z, so the hand's grip closes on the handle. Made by `tools/blender/tools.py`, textured with the machine's baker. If `tools.glb` is missing, the hand turns the fasteners with its fingers.
5. **Doing up again.** On a put-back, after the part is home, the hand turns each fastener back in, 0.15 s each. Before the cord is pulled, loose parts' fasteners go back in with them, quickly.
6. **Placeholders.** With no model, fasteners are drawn as small grey cylinders at their positions, so the game still plays with placeholders.

## Steps

1. **Data contract.** `core/types.ts` gains the `Fastener` type and the optional `fasteners` field; `core/validate.ts` checks every field, unique ids across the machine written `<part id>.<name>`, `kind` one of `bolt`, `screw`, `nut`, a unit `axis`. Tests in `tests/validate.test.ts`, on the shipped data.
2. **The draft fasteners** in `game/public/machines/gen950/machine.json`, and the open questions.
3. **Model.** `model.py` draws the fasteners from the data as separate objects parented to their parts (hex bolt with washer, Phillips pan-head screw, hex nut on a stud end), removes the old hard-coded ones on those parts, and `texture.py` bakes them with their part's group; `validate.py` and `check.ts` check one node per fastener, named by its id, under its part, within the triangle budget. Re-bake, re-export, and match images of the parts with their fasteners.
4. **Tools model.** `tools/blender/tools.py` builds the spanner and screwdriver, `npm run assets` exports, optimises, checks (two nodes, 2,000 triangles, 100 KB, one 1024 px texture set) and copies `game/public/hand/tools.glb`. `assets/hand/STATUS.md` gains the tools; licences in `assets/hand/LICENCE.md` (our own work).
5. **Pure motion.** `render/motion.ts`: a fastener's pose as it turns out (turns and back-out by kind) and its sequence over a part's loosening (when each fastener starts, the tool, the total time). Tests: every fastener ends proud, the order is stable, the total time for four bolts is under 1.5 s, a part without fasteners keeps today's timing.
6. **In the game.** `render/view.ts` plays the sequence during `loosen` with the hand moving fastener to fastener holding the tool; reverses it on put-back and before the cord is pulled; fastener nodes move with their part when carried. `render/model.ts` loads `tools.glb`; `render/handrig.ts` holds a tool at its grip.
7. **Browser check.** `npm run verify:phone` loosens the alternator cover and checks its four fasteners stand proud and the hand holds the spanner, carries it to the tray and back on with its fasteners done up, and still solves all six faults and the forced walk-out, with the hand staying out of the machine.
8. **Design notes and release note.** `docs/design/animation.md` gains the fastener sequence; `docs/releases/0.10.0.md`; the phone preview republished.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` checks the machine with its fastener nodes within 60,000 triangles and 5 MB, and the tools within 2,000 triangles and 100 KB.
- `npm run verify:phone` passes as in step 7, with no console errors and at least 30 fps at 4x CPU throttle in headless Edge.
- `assets/gen950/STATUS.md` records the fasteners per part with what still differs; the counts are marked unverified until the mechanic checks them. The owner looks on the phone.

## Release note line

Added: bolts, screws and nuts on the parts that have them. Loosening a part, the hand takes a spanner or screwdriver and turns each one out before the part comes free; they go with the part and are done up again when it goes back (plan 0011, ADR 0020).
