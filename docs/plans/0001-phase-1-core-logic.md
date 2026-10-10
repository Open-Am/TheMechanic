---
id: 0001
title: Phase 1, core logic with no graphics
status: approved
date: 2026-10-10
adrs: [0001, 0002, 0003, 0004, 0005, 0007, 0008, 0010]
branch: plan/0001-core-logic
---

# 0001. Phase 1, core logic with no graphics

## Goal

When this plan is done, `game/` exists as a Vite and TypeScript project whose `src/core` holds the whole rule set of the game, fully tested, with no rendering and no interface. A script can play every fault to completion from an action log and print the score. The boundary test from ADR 0010 is in place from the first commit so later layers cannot drift. Nothing visual is built.

## ADRs relied on

- **0001 Scope.** Only the six faults and twelve parts of `gen950`. No extra machinery.
- **0002 Stack.** Vite, TypeScript strict, Vitest. No other packages. Hashing and the emitter are written here.
- **0003 Data contracts.** `machine.json` and `faults.json` copied verbatim from the brief, plus the validator with its five rejections.
- **0004 Round rules.** The reducer, the `necessary` set, the score formula, stars, the action log shape, and reproducibility from the log.
- **0005 Daily.** The day number in Lagos time, the pick-from-the-rest rule, and the `DailyProvider` and `ScoreStore` interfaces (interfaces only in this phase).
- **0007 Modes.** The reducer returns a typed refusal with a reason; this phase makes sure the reason exists so diagnostic mode can show it later. No feedback logic is written here.
- **0008 Motion.** The validator accepts the optional `motion` field and warns on unknown types; the data gets a `motion` for each part so Phase 2 has something to play.
- **0010 Layout.** Folder layout and the boundary test. Only `core`, `platform/interfaces` and `tests` are created in this phase; `app` starts in Phase 2.

Nothing in this plan contradicts an ADR. The brief's shake-and-hint text is ignored per ADR 0007.

## Exploration summary

Done in this session rather than by a separate small model: the repository contains no code yet, and every ADR was written in this session. Findings: the data in the brief passes the five validator rules by inspection (no cycles, every `requires` and `culprit` resolves). One open question is recorded: whether `inspect` of an installed part should be allowed. The brief says inspect happens from the tray, so the reducer refuses inspect on an installed part. Timestamps are supplied by the caller, so the reducer stays pure and the log is the only source of time.

## Steps

1. **Scaffold `game/`.** `package.json` with `dev`, `test`, `build`; `tsconfig.json` strict; `vite.config.ts`; `vitest.config.ts`; empty `src/main.ts`. Root `package.json` scripts already forward to it. Commit.
2. **Data.** `game/public/machines/gen950/machine.json` and `faults.json` from the brief, with a `motion` added to each part following the table in ADR 0008. Commit.
3. **Types.** `src/core/types.ts`: `Machine`, `Part`, `Fault`, `Symptom`, `Motion`, `Action`, `ActionType`, `RoundState`, `Refusal`, `ScoreBreakdown`. `src/core/constants.ts`: score weights, star thresholds, `DAILY_EPOCH`, Lagos offset.
4. **Validator.** `src/core/validate.ts`: `validateMachine`, `validateFaults`, returning a list of errors and warnings, never throwing. Tests for each of the five rejections and for the motion warning.
5. **Rules.** `src/core/rules.ts`: `canRemove`, `canInstall`, `necessarySet`, `blockers`. `src/core/reducer.ts`: `initialState(machine, fault)` and `apply(machine, fault, state, action)` returning `{ ok: true, state } | { ok: false, refusal }`. Refusal reasons: `blocked_by`, `not_installed`, `not_in_tray`, `dependents_installed`, `not_culprit`, `already_fixed`, `parts_missing`, `round_over`, `unknown_part`.
6. **Replay and score.** `src/core/replay.ts`: `replay(machine, fault, log)` folds `apply` and reports the first invalid action if any. `src/core/score.ts`: `score(machine, fault, log)` returns elapsed seconds, wrong parts, failed pulls, total, stars. Tests: a hand-written log per fault, a log with a wrong part, a log with a failed pull, a log with an invalid action.
7. **Daily seed.** `src/core/daily.ts`: `dayNumber(date)`, `hash(n)`, `dailyFaultId(faults, day)`. Tests: Lagos midnight boundary, never equal to the previous day across 400 consecutive days, same result on repeated calls.
8. **Interfaces.** `src/platform/interfaces.ts`: `ScoreStore`, `DailyProvider`, `Share`, `Audio`, `Clock`. No implementations in this phase.
9. **Boundary test.** `tests/boundaries.test.ts` scans every file under `src/` and asserts the import table from ADR 0010, plus no `three` and no DOM globals in `core`.
10. **Text-mode play.** `tools/play/play.ts` run with `npx vite-node` or `tsx`-free `node --experimental-strip-types`: loads the machine folder, and for each fault builds the shortest valid log, replays it, prints every step and the score. `npm run play` runs it.
11. **Docs.** `CLAUDE.md` unchanged. `AGENTS.md` commands table updated with `npm run play`. Release note `docs/releases/0.1.0.md` started with this plan's lines. Open questions updated.

Each step is one commit on `plan/0001-core-logic`.

## Done when

- `npm test` passes with every test above, run from the repository root.
- `npm run play` prints all six faults solved, with their scores, and exits 0.
- `npm run docs:check` passes.
- `tests/boundaries.test.ts` fails when a `three` import is added to a core file (checked once by hand, then reverted).
- A reviewer can read `src/core/reducer.ts` and map every rule in ADR 0004 to a line.

## Release note line

Added: the complete rule set of the game as pure TypeScript with tests, a text-mode player, and the boundary test that keeps layers apart (plan 0001, ADRs 0003, 0004, 0005, 0010).
