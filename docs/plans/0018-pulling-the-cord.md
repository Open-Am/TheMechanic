---
id: 0018
title: The mechanic pulls the cord on screen, and the engine runs
status: proposed
date: 2026-10-12
adrs: [0003, 0004, 0007, 0010, 0013, 0014, 0018, 0020, 0025, 0026, 0027]
branch: plan/0018-pulling-the-cord
---

# 0018. The mechanic pulls the cord on screen, and the engine runs

## Goal

Pressing Pull cord shows the mechanic's hand pulling the recoil starter's handle and the rope paying out. When the fault is fixed the engine catches, the generator shakes and puffs exhaust and keeps running until the customer pays and carries it off. When it is not fixed it coughs, puffs dark smoke and dies. Nothing changes in the rules, the log or the score.

## ADRs relied on

- **0027** decides all of it: the pull, the turn to the starter, the start and run, the cough, the handle and rope nodes, the shake and exhaust sprites, the skip.
- **0020**: the hand, its grip and the doing-up of loose parts before the pull.
- **0018**: the `cord`, `start` and `fail` moments land on the animation.
- **0026**: the paying and leaving follows the run, carrying a running generator.
- **0025**: the generator turns on the bench.
- **0003, 0013, 0014**: the model contract gains the two child nodes; our own modelling; within budgets and the frame rate.
- **0004, 0007, 0010**: no log or rule change; same animation for every fault; all in `render`.

## Exploration summary

`tools/blender/model.py` builds the recoil starter with its handle as part of the part's mesh. `export.py`, `validate.py` and `check.ts` already handle child nodes under a part (fasteners). `render/view.ts` handles the pull today by pressing loose parts home and firing the moments; `app/round.ts` emits `pulled` before the cord moment. Plans 0016 and 0017 change the scene and the round's ending and must land first.

## Simpler readings chosen

1. The rope is one thin cylinder node scaled along its length between the housing's outlet and the handle; no physics.
2. The pull is a fixed hand path relative to the starter (out about 40 cm along the starter's axis, a slight upward arc), whatever the view; the generator first turns on the bench by the shortest way until the starter faces the camera within 40 degrees, then turns back after the round only if the player turns it.
3. The exhaust is 6 to 10 sprites from one 128 px texture, spawned at the muffler outlet's position (a new empty node `muffler.outlet` in the model, under the muffler part).
4. The engine's running shake is a small random-walk offset and roll on the machine group at about 25 Hz with an amplitude of 1.5 mm, eased in and out.

## Steps

1. **Model.** `model.py` splits the handle into `recoil_starter.handle`, adds `recoil_starter.rope` and the empty `muffler.outlet`; `validate.py`, `export.py` and `check.ts` require them; re-bake and re-export (`npm run assets`); tests in `game/tests/pipeline.test.ts`; match image of the starter.
2. **Pure timing.** `render/motion.ts`: the pull's timeline (turn, grip, pull, release), the start and run, the cough; the rope's length at each moment; the shake. Tests.
3. **In the game.** `render/view.ts` plays the pull, the run or the cough, the sprites (`render/exhaust.ts`), the skip, and hands over to ADR 0026's ending; the `cord`, `start` and `fail` moments are timed to it. `ui` waits for it before the result.
4. **Browser checks.** `tools/verify/phone-play.ts`: the handle travels out and back and the rope stretches with it; a failed pull coughs and the round goes on; the winning pull runs, shakes and puffs, then the customer leaves, then the result; the skip works; all six faults and everything else pass. Both checks on a quiet machine.
5. **Notes.** `docs/design/animation.md`; release note `docs/releases/0.17.0.md`; the phone preview republished.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` checks the new nodes within the machine's budget.
- `npm run verify:phone` and `npm run verify:drop` pass as in step 4, at least 30 fps at 4x CPU throttle with the exhaust showing.
- The owner looks on the phone.

## Depends on

Plans 0016 (the workbench), 0015's game steps and 0017 (the customer's endings), merged first.

## Release note line

Added: pulling the cord shows the mechanic's hand pulling the starter; a fixed generator starts, shakes and smokes and keeps running, and a faulty one coughs and dies (plan 0018, ADR 0027).
