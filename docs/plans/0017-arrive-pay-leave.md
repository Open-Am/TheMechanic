---
id: 0017
title: The customer brings the generator, and pays or storms off with it
status: approved
date: 2026-10-12
adrs: [0004, 0005, 0007, 0010, 0013, 0015, 0020, 0025, 0026]
branch: plan/0017-arrive-pay-leave
---

# 0017. The customer brings the generator, and pays or storms off with it

## Goal

Each round opens with the customer carrying the generator to the bench and setting it down; the timer starts when it lands. A fixed round ends with the customer paying the mechanic with folded naira notes and walking off happily with the running generator. A walk-out ends with the customer snatching the generator and storming off. Each can be skipped with a tap. Nothing changes in the rules, the log or the score.

Approved by the owner on 2026-10-12, who wrote "i accept adr 26 and plan 17".

## ADRs relied on

- **0026** decides all of it: the three animations, their lengths, the skip, the timer starting when the generator lands, the whole generator carried away, payment as an animation only.
- **0015**: the customers, their skeletons, clips and budgets; patience and the walk-out.
- **0025**: the bench, the camera and where the customer stands.
- **0005**: the daily stays fair because the arrival costs no time.
- **0004, 0007**: no new action, no hint; the endings depend only on the outcome.
- **0010**: animation in `render`; the round start moment in `app` (when the timer starts).
- **0013, 0020**: our own clips and props; the mechanic's hand takes the notes with the existing rig.

## Exploration summary

Written before plans 0015 and 0016 are built; the steps name the files those plans create. Today `app/round.ts` starts the clock on Start; `ui/index.ts` waits 1,600 ms after a walk-out and 900 ms after a fix before the result screen; `customer.py` builds and keyframes clips per look. The machine is one group in `render/view.ts` that plan 0016 puts on the bench.

## Simpler readings chosen

1. The timer start moves from "Start pressed" to "generator landed": `app` gets a `begin()` called by `main.ts` when render reports the landing (or at once when render has no customer), so `core` and the log are unchanged; the first logged time is still zero.
2. The result screen waits for render's "ending done" (or the skip), with a fallback timeout of 4 s so a missing customer file never blocks it.
3. On a walk-out, removed and loose parts snap back on silently in the first 0.3 s while the customer reaches, and the tray empties; this is visual only (the log keeps the round as it was).
4. The notes are one small prop (under 300 triangles) in each customer's file.

## Steps

1. **Clips and prop.** `tools/blender/customer.py` keyframes `arrive`, `pay_leave` and `storm_off` for each look, with hand targets for carrying the generator (its handle) and the notes prop; `checkCustomer` requires the new clips. Renders of each clip as strips for the owner.
2. **Pure timing.** `render/customerpose.ts`: the timeline of each animation (when the generator lands, when the notes change hands, when the customer is off screen), the skip, and where the generator is at each moment. Tests.
3. **App.** `app/round.ts` `begin()`; the timer and patience start on it. Tests: the clock does not run during the arrival; a skipped arrival begins at once; the daily is unchanged; a round with no customer begins at Start.
4. **In the game.** `render/view.ts` plays the arrival (machine group carried, then set on the bench), the endings (machine group lifted and carried off; on a walk-out, parts snap home first), the mechanic's hand taking the notes, and the skip on tap; `ui/index.ts` waits for the ending.
5. **Browser checks.** `tools/verify/phone-play.ts`: the timer reads 0:00 until the generator lands; a tap skips the arrival; a fixed round shows the notes passing and the customer leaving before the result; the forced walk-out shows the storm-off and a whole generator leaving; each ending can be skipped; all six faults, the daily and everything else still pass. Both checks on a quiet machine.
6. **Notes.** `docs/design/animation.md`; release note `docs/releases/0.16.0.md`; the phone preview republished.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` checks each customer with the new clips within budget.
- `npm run verify:phone` and `npm run verify:drop` pass as in step 5.
- The owner looks at the three animations on the phone.

## Depends on

Plan 0016 (the workbench) and plan 0015's game steps, merged first.

## Release note line

Added: the customer brings the generator to the bench at the start, pays and leaves happily when it is fixed, or storms off with it when they run out of patience (plan 0017, ADR 0026).
