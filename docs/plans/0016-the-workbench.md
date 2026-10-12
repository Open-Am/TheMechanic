---
id: 0016
title: The generator on a workbench, the customer across it
status: proposed
date: 2026-10-12
adrs: [0004, 0007, 0010, 0012, 0013, 0014, 0015, 0020, 0021, 0025]
branch: plan/0016-the-workbench
---

# 0016. The generator on a workbench, the customer across it

## Goal

The generator stands on a worn wooden workbench. The camera is at a standing mechanic's eye level on the near side, and there is room across the bench for the customer (placed by plan 0015). A sideways drag turns the generator on the bench instead of moving the camera round it. The machine's shadow is baked onto the bench top and the toolbox stands on the bench's left end. Nothing changes in the rules or the score.

## ADRs relied on

- **0025** decides all of it: the bench and its budget (3,000 triangles, 300 KB, one 1024 px set) and fallback; the camera (about 1.6 m, about 12 degrees down, generator about 60 percent of the width at 390 by 844, never under 40 percent on shorter screens, a 1.76 m head clearing the timer); turning the generator on the bench; the shadow on the bench top; the toolbox on the bench's left end; the customer's spot.
- **0020**: loosening, carrying, the held spot under the pointer while turning; only what a non-carry drag turns changes.
- **0021**: the toolbox and its trips; only where it stands changes.
- **0014**: budgets, lighting and the baked shadow's budget; only where the shadow is baked changes.
- **0015**: the customer stands across the bench; plan 0015 does that.
- **0004, 0007, 0010**: no rule, log or hint changes; scenery and camera in `render`.
- **0012, 0013**: Blender 4.5 by script; our own materials; reference photos never committed.

## Exploration summary

Mock-up renders on 2026-10-12 (`C:/Users/write/AppData/Local/Temp/oa-table/`, script `work/table_scene.py`, not in the repository) found a framing that works: camera 1.60 m high, 12.4 degrees down, 2.06 m from the generator's centre, generator 60 percent of the width at 390 by 844, a 1.65 m customer 0.35 m behind the far edge visible from head to waist. At 360 by 640 the camera stands back to 2.38 m and the generator is 43 percent wide. Today the camera orbits the machine (`render/orbit.ts`: azimuth, polar, `DEFAULT_ORBIT`, `turnToward`, `frameAbove`), the ground and its baked shadow come from `render/ground.ts` and `tools/blender/bake_ground.py`, and the toolbox is placed by `groundPlace()`. The hand's collision check, the toolbox trip and the arm's reach all use the camera; they must be re-checked. The browser checks (`tools/verify/phone-play.ts`, `drop-play.ts`) assume the orbit and the current framing.

Risks: turning the machine instead of the camera changes how lighting falls on it as it turns (the key light stays put), which may look better or worse; the flatter view shows less of the top, so parts on top may be harder to reach; the hand reaching across a bench at a different angle may need its own tuning.

## Simpler readings chosen

1. **The bench is static scenery** in its own GLB, not part of the machine model, so the machine's data contract and asset are unchanged.
2. **Turning:** the machine group turns about its upright axis through its centre; the camera does not move sideways. Up-and-down drags change the camera's height and tilt within limits (from the default to about 35 degrees down), so the player can look at the top. The existing "held spot stays under the pointer" solver is reused with the machine's yaw and the camera's tilt as its two variables.
3. **Framing** is computed, not hand-set: a pure function gives the camera distance and tilt that put the generator at the target width and its lowest point above the controls, then backs off on short screens until the head line clears the timer, never below 40 percent width.
4. **Shadow:** `bake_ground.py` bakes onto a plane at the bench top's height, the bench model carries its own baked ambient occlusion, and the floor beyond keeps a plain fade.
5. **Toolbox:** on the bench's left end, its open tray towards the camera, cut by the left screen edge as today; the arm's reach from the lower left is kept.

## Steps

1. **Budgets and the bench model.** `tools/pipeline/budgets.json` gains `bench`; `tools/blender/bench.py` builds it; `npm run assets` exports, optimises, checks (one `bench` node, budget) and copies `game/public/scene/bench.glb`. Tests in `game/tests/pipeline.test.ts`. Match image against reference photos of roadside workbenches. `assets/scene/STATUS.md`, `LICENCE.md`.
2. **Shadow on the bench.** `bake_ground.py` bakes the contact shadow at the bench-top height; the ground in `render/ground.ts` becomes the floor beyond the bench.
3. **Pure camera and turning.** `render/orbit.ts` (or a new `render/stage.ts`): the default framing function, the machine-yaw turn with the held-spot solver, the tilt limits. Tests in `game/tests/render.test.ts`: width at 390 by 844 within 55 to 65 percent; never under 40 percent at 360 by 640; a 1.76 m head line under the timer; a sideways drag turns the machine and leaves the camera's sideways position unchanged; the held spot stays under the pointer as the turn allows; turning all the way round returns to the start.
4. **In the game.** `render/view.ts` mounts the bench, puts the machine on it, uses the new framing and turning, places the toolbox on the bench's left end, keeps picking, the hand, loosening, carrying, the toolbox trip and the arm's reach working. `render/model.ts` loads `bench.glb` and counts it in the loading progress; fallback box if missing.
5. **Browser checks.** `tools/verify/phone-play.ts` and `drop-play.ts` re-tuned for the new framing and turning: everything they check today still holds (all six faults, walk-out, daily, share, loading, sounds, tools, toolbox, hidden hand), plus: the bench is in the default view under the machine; the generator's width share at 390 by 844 and 360 by 640; a sideways drag turns the machine, not the camera; the toolbox is on the bench's left end with its tools in view. Screenshots at both sizes. Both checks run on a quiet machine and both must pass.
6. **Notes.** `docs/design/interface.md` and `animation.md` describe the bench, the camera and turning; release note `docs/releases/0.15.0.md`; the phone preview republished.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` checks the bench within its budget and the re-baked shadow within 64 KB.
- `npm run verify:phone` and `npm run verify:drop` pass as in step 5, with no console errors and at least 30 fps at 4x CPU throttle.
- The owner looks on the phone.

## Depends on

The sound branch (plan 0013's stand-in sounds) merged first, since both touch `view.ts` and the browser checks. Plan 0015's game steps follow this plan.

## Release note line

Changed: the generator now stands on a roadside workbench, seen from a standing mechanic's eye level, with room for the customer across the bench. Dragging turns the generator on the bench (plan 0016, ADR 0025).
