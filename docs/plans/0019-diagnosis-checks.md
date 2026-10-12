---
id: 0019
title: Diagnosis checks before and while taking parts off
status: approved
date: 2026-10-12
adrs: [0003, 0004, 0007, 0010, 0013, 0014, 0015, 0018, 0021, 0027, 0029]
branch: plan/0019-diagnosis-checks
---

# 0019. Diagnosis checks before and while taking parts off

## Goal

The player can do six checks (listen, look at the smoke, read the plug, spark test, fuel flow, volts test) from a Check button beside Pull cord. Each check is logged, costs a few seconds of score and patience, and shows a line about the engine taken from the fault's data. The hand fetches a tester from the toolbox for the tests. A clean job (fixed, no wrong parts, no failed pulls) earns a bonus. The six existing faults get their clue lines.

Approved by the owner in advance on 2026-10-12, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.").

The owner pre-approved the gamification proposal on 2026-10-12 by choosing "Build all four directions". This plan stays `proposed` until the owner or the coordinator marks it approved after ADR 0029 is accepted.

## ADRs relied on

- **0029** decides all of it: the six checks and their needs, costs, once per round and not after the fix; `checks` in `machine.json`; `clues` in `faults.json` with schema 2; the `check` action and its refusals; the score with `checkSeconds` and `cleanBonus`; checks costing patience; the Check button, greyed checks, the notes; the testers model and its budget; listen and look playing the symptom.
- **0003**: the data contract that 0029 extends; no existing id or field changes.
- **0004**: the reducer, replay and score stay pure folds over the log; a new type is added, none changed.
- **0007**: greyed checks say only what is visible; blocked parts still say nothing. Not contradicted: the checks' needs are visible facts.
- **0010**: checks reach the interface only through `app.resultOf`; layers as now.
- **0015**: ADR 0029 changes its "only action that costs patience" sentence; the rest stands.
- **0018, 0027**: existing sound moments and the pull animation reused; the ordinary pull stays the same for every fault.
- **0021, 0013, 0014**: the testers come from the toolbox, made by script in Blender, within their own budget and the frame rate.

## Exploration summary

Done by Claude (Opus) reading the code on 2026-10-12. `game/src/core/types.ts` has `ACTION_TYPES` (`remove`, `inspect`, `fix`, `install`, `pull`), `RoundState` and `RefusalReason`; `core/reducer.ts` `apply()` switches on the type and takes an optional customer; `core/score.ts` `scoreState()` computes the total; `core/patience.ts` `walkOutTime()` subtracts only failed pulls; `core/constants.ts` holds every number; `core/validate.ts` validates machine, faults and customers. `app/round.ts` `propose()` emits per type and owns `conditionOf` and `fixLabel`; `app/moments.ts` plays sounds. `ui/index.ts` mounts the controls (Pull cord, tray, card), `ui/card.ts` is the inspect card, `ui/result.ts` the breakdown, `ui/strings.ts` all text. `render/view.ts` (1,910 lines) runs the toolbox trip (`tripPlan` in `render/motion.ts`, `toolFor` in `render/handpose.ts`) and the pull and cough of plan 0018. `tools/blender/tools.py` makes `tools.glb`; `tools/pipeline/check.ts` has `--tools`. `tools/play/play.ts` solves every fault from a log. `tools/verify/phone-play.ts` and `drop-play.ts` play every fault in headless Edge.

Risks: the controls row is already full on a 360 px phone; the check animations must not make `view.ts` harder to follow; the spark plug's `inspectOk` contradicts some plug readings (ADR 0029 says to reword it); plan 0018 (the pull on screen) must land first, since listen and look reuse it.

## Simpler readings chosen

1. One action type, `check`, with a `checkId` field, rather than six types. ADR 0029 says so; noted because "new action types" in the proposal could read either way.
2. The check costs are fixed per check (listen 3, smoke 3, plug 2, spark 4, fuel 3, volts 4 seconds). `apply()` takes an optional round setup `{ customer?, kit? }`; the kit is always empty until plan 0023.
3. The notes list is a small panel opened from the Check sheet, not a permanent strip, to save screen height.
4. Listen and look play the pull, then the symptom's ending (no fire; fires and dies after about 1.5 s; runs, then the hand presses the switch). Volts plays the hand holding the bulb lead to the socket while the engine runs about 1.5 s. Spark plays the pull with a spark (or none) at the tester. Fuel plays fuel running (or dripping) into the bottle. Each under 1.5 s and skippable by a tap.
5. Faults whose plug reading is "wet" or "sooty" keep that only in the check's line; the spark plug's `inspectOk` becomes "Electrodes are sound. The gap is right." (wording change).
6. `faults.json` moves to schema 2; the validator accepts only schema 2, since the shipped data is the only data.

## Steps

1. **Core types and validator.** `core/types.ts`: `CHECK_IDS`, `CheckId`, `checks` on `Machine` (`off`, `on`, `allOn`, `tool`), `clues` on `Fault`, the `check` action with `checkId`, `checksDone` in `RoundState`, the three refusals. `core/validate.ts`: every check present with known parts; every fault has a non-empty clue for every check; schema 2. Tests in `game/tests/validate.test.ts`.
2. **Data.** `game/public/machines/gen950/machine.json` gains `checks` (needs as ADR 0029); `faults.json` gains `clues` for the six faults (drafted from the research and the existing `inspectBad` lines, `verified: false`), schema 2; the spark plug's `inspectOk` reworded. Doubts added to `docs/open-questions.md`.
3. **Reducer, patience and score.** `core/reducer.ts` applies `check`; `core/rules.ts` gains `checkPossible()`; `core/constants.ts` gains `CHECK_SECONDS` and `CLEAN_BONUS`; `core/patience.ts` subtracts check costs; `core/score.ts` adds `checkSeconds`, `clean`, the bonus and the floor at 0; `ScoreBreakdown` gains `checkSeconds` and `clean`. Tests in `reducer.test.ts`, `patience.test.ts`, `score.test.ts`: each check's needs; once only; refused after the fix; patience drains by the cost; a log with checks replays to the same state and score; the clean bonus only when fixed with no wrong parts and no failed pulls; never below 0.
4. **App.** `app/round.ts`: `propose({ type: "check", checkId })`, a `checked` event, `resultOf(checkId)`, `checksPossible()`; `app/moments.ts` plays the moments for each check. Tests in `app.test.ts`, including that `resultOf` is the only path to clue text.
5. **Text-mode player.** `tools/play/play.ts` prints the clues and solves every fault with a check first.
6. **Testers model.** `tools/blender/testers.py` builds the old-plug spark gap, the test bulb on a lead and the clear bottle; `tools/pipeline/budgets.json` gains `testers` (2,000 triangles, 100 KB, 512 px); `tools/pipeline/check.ts --testers`; `npm run assets` builds `game/public/hand/testers.glb`; their slots in the toolbox in `tools/blender/toolbox.py` if needed. `assets/tools/` with a `STATUS.md` and `LICENCE.md`. Tests in `pipeline.test.ts`.
7. **Interface.** `ui/strings.ts`: check names, needs, the Check button, notes, the breakdown's Checks and Clean job rows; `ui/checks.ts` (new): the sheet and the notes; `ui/card.ts` shows a result; `ui/result.ts` the new rows; `ui/index.ts` wires them. Pure helpers tested in `ui.test.ts`.
8. **Render.** `render/view.ts` and `render/motion.ts`: the hand's trip for a tester (reusing `tripPlan`), the six short animations, the skip. `render/model.ts` loads `testers.glb` and counts it in loading. Pure timing tested in `render.test.ts`.
9. **Diagnostic mode.** `diagnostic/overlay.ts` lists checks possible now and their results.
10. **Browser checks.** `tools/verify/phone-play.ts`: every check on at least one fault, a greyed check and its needs text, once only, the result card and notes, patience dropping by the cost, the clean bonus on the result, every fault still solved; `drop-play.ts` unchanged in substance but re-run. Both under the shared lock (`mkdir C:/Users/write/AppData/Local/Temp/open-am-check.lock` before each, removed after), one after the other.
11. **Notes.** `docs/design/interface.md` and `animation.md`; release note `docs/releases/0.18.0.md`; `npm run docs:check -- --fix`.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build` and `npm run size` (under 350 KB) pass.
- `npm run assets` checks `testers.glb` within its budget.
- `npm run play` solves every fault, with checks.
- `npm run verify:phone` and then `npm run verify:drop` pass under the shared lock, with no console errors and at least 30 fps at 4x CPU throttle, as in step 10.
- The owner looks on the phone.

## Depends on

Plan 0018 (the pull on screen) merged first. Plan 0020's model parts can be built at the same time on its own branch. Plan 0020's game logic builds on this plan's validator and `clues` and is merged right after it. Plans 0021, 0022 and 0023 follow.

## Build record

Built by Claude (Opus) on branch `plan/0019-diagnosis-and-faults` (with plan 0020's game logic), 2026-10-12, before plan 0018 merged. The owner's instruction for this branch: everything except the Blender modelling, which waits for plan 0018's branch (it edits `gen950.blend`).

Readings added while building:

7. `apply()` keeps its optional `customer` argument; the `{ customer?, kit? }` setup waits for plan 0023, the first plan with a kit. Nothing reads a kit before then.
8. An unknown `checkId` is refused as `check_unavailable`: ADR 0029 names only three refusals.
9. Sounds are one-shots only: listen, smoke and volts play `cord` then `fail` (`no_start`) or `start` (every other symptom); the spark test `cord` alone; plug and fuel nothing. A check never starts the engine's loop (ADR 0028), so "fires and dies" and "runs" sound the same until plan 0018; the clue line says which.
10. The render shows no check animation yet (the pull of plan 0018 and the testers model are not here). A check that runs the engine presses loose parts home, as a pull does. Nothing else moves.
11. The result shows on the inspect card (`card.openResult`), with a "Notes (n)" button; the notes are a second view of the Check sheet.
12. A development-only `?faults=a,b,c` list (main.ts, `GameDeps.faultOrder`) lets `verify:phone` play every fault once in a fixed order instead of by luck.

Steps done: 1 to 5, 7, 9, 10 (as far as the render goes), 11. Pending: step 6 (the testers model, with the Blender work), step 8's tester trip and check animations (need plan 0018 and the testers), and the owner's look on the phone.

## Release note line

Added: six diagnosis checks (listen, look at the smoke, read the plug, spark test, fuel flow, volts test) from a Check button; each costs a few seconds and shows what the engine does; a clean job earns a bonus (plan 0019, ADR 0029).
