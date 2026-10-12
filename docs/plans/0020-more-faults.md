---
id: 0020
title: Six more faults, and three new parts to carry them
status: approved
date: 2026-10-12
adrs: [0001, 0003, 0004, 0005, 0007, 0012, 0013, 0014, 0020, 0029, 0030]
branch: plan/0020-more-faults
---

# 0020. Six more faults, and three new parts to carry them

## Goal

The generator has three more removable parts (fuel cap, in-line fuel filter, ignition coil), modelled and in the GLB, and `faults.json` has twelve faults, each with a difficulty and a clue line for every check. Free play and the daily draw from all twelve. Every new item is marked unverified for the mechanic.

Approved by the owner in advance on 2026-10-12, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.").

The owner pre-approved the new faults on 2026-10-12 by choosing "Build all four directions". This plan stays `proposed` until the owner or the coordinator marks it approved after ADR 0030 is accepted.

## ADRs relied on

- **0030** decides all of it: the three parts, where they sit, their `requires`, motions and draft fasteners; the two `requires` entries added to `fuel_tank` and `fuel_tap`; `hiddenBy` for the coil; the triangle allocation; `difficulty`; the six faults, their text and clues; the reworded `runs_no_output` line.
- **0001**: twelve faults and fifteen parts in place of six and twelve, through ADR 0030.
- **0003**: ids added, none changed; the validator checks the new field.
- **0029**: the `clues` field and its validation (plan 0019); `fuel_flow` gains two needs.
- **0004, 0007**: no rule change; new parts follow the same removal rules and give no hint.
- **0005**: the daily's hash runs over twelve faults; its method is unchanged.
- **0020**: the new parts loosen by motion type with their fasteners; fasteners are still not parts.
- **0012, 0013, 0014**: Blender 4.5 by script, our own materials, within the machine's budget.

## Exploration summary

Done by Claude (Opus) reading the code on 2026-10-12. The machine has 12 parts in `game/public/machines/gen950/machine.json`, four base pieces, and fasteners on six parts. `tools/blender/model.py` (458 lines) builds every part by script with `shapes.py` and `texture.py`; `validate.py` and `export.py` check names and export; `tools/pipeline/check.ts` `checkModel()` checks one node per part and fastener and the per-part allocation from `tools/pipeline/budgets.json` (53,000 of 60,000 allocated). `render/placeholders.ts` draws parts from the data when the GLB lacks them. `core/daily.ts` `dailyFaultId()` indexes over the fault list. `app/faults.ts` `pickFault()` picks uniformly. `tools/play/play.ts` and the two browser checks loop over every fault. `docs/open-questions.md` already lists the doubts the research raised.

Risks: where the coil and filter really sit is unknown, so the model is a guess the mechanic may undo; the coil behind the recoil starter may be hard to see and reach (the capacitor already is, per the open questions); the browser checks take longer with twelve faults; today's daily changes on the day this ships (ADR 0030 accepts it).

## Simpler readings chosen

1. The fuel filter is a short clear cylinder on a stub from the tap's outlet, under the hose's end, so the hose comes off first and the tap after it.
2. The fuel cap is a separate node on the tank's top; the tank's mesh gets a filler neck under it.
3. The coil is a small black block with two bolts on the engine side behind the recoil starter's housing, in reach once the starter is off; no plug lead is modelled.
4. `difficulty` is added to the six existing faults with ADR 0030's levels in the same step as the new faults.
5. The model parts (steps 1 and 2) can be built before plan 0019 lands; the new faults (step 4) wait for its `clues` validator.

## Steps

1. **Data for the parts.** `machine.json`: `fuel_cap`, `fuel_filter`, `ignition_coil` with `name`, `does`, `inspectOk`, `placeholder`, `explode`, `motion`, the coil's two draft bolts; `fuel_tank.requires` gains `fuel_cap`, `fuel_tap.requires` gains `fuel_filter`; the coil's `hiddenBy`. `budgets.json` allocation for the three. Tests in `validate.test.ts` and `reducer.test.ts` (the new removal orders).
2. **Model.** `tools/blender/model.py` builds the three parts and the tank's filler neck; `validate.py` requires them; `npm run assets` re-bakes, exports and checks `model.glb`; match images against reference photos (none committed, ADR 0013). `assets/gen950/STATUS.md`.
3. **Difficulty.** `core/types.ts` and `core/validate.ts`: `difficulty` 1 to 3, required. `faults.json`: levels for the six existing faults. Tests.
4. **The six faults.** `faults.json`: the six from ADR 0030 with complaint, symptom, culprit, `inspectBad`, `fix`, `difficulty`, `clues` written out as player text, `verified: false`. `machine.json`: `fuel_flow` needs gain `fuel_cap` and `fuel_filter`. `ui/strings.ts`: the `runs_no_output` line reworded. Tests in `reducer.test.ts`, `score.test.ts` and `daily.test.ts` load the shipped data, so every fault is solved by its removal order and the daily picks from twelve.
5. **Text-mode player.** `tools/play/play.ts` solves all twelve.
6. **Browser checks.** `tools/verify/phone-play.ts` and `drop-play.ts`: all twelve faults solved; the three new parts loosen, carry and go back; the coil can be reached once the starter is off; the tank needs the cap off. Both under the shared lock, one after the other.
7. **Notes.** `docs/open-questions.md` gains the doubts of ADR 0030; `docs/design/modelling-brief.md` the three parts; release note `docs/releases/0.19.0.md`.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build` and `npm run size` pass.
- `npm run assets` checks the three new nodes within their allocation and the machine within 60,000 triangles and 5 MB.
- `npm run play` solves all twelve faults.
- `npm run verify:phone` and then `npm run verify:drop` pass under the shared lock, with no console errors and at least 30 fps at 4x CPU throttle.
- The owner looks on the phone.

## Depends on

Steps 1 and 2 (the model parts) can start at once. Steps 3 to 7 need plan 0019's validator and `clues`, and are merged right after plan 0019. Plans 0021 to 0023 follow.

## Release note line

Added: six more faults (a blocked fuel cap vent, a blocked fuel filter, a stuck float, a broken recoil spring, a weak capacitor and a failed ignition coil) and three new parts (fuel cap, fuel filter, ignition coil), all unverified drafts for the mechanic (plan 0020, ADR 0030).
