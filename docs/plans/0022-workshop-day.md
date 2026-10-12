---
id: 0022
title: A workshop day of five customers, with reputation
status: approved
date: 2026-10-12
adrs: [0001, 0004, 0005, 0007, 0010, 0015, 0024, 0026, 0030, 0031, 0032]
branch: plan/0022-workshop-day
---

# 0022. A workshop day of five customers, with reputation

## Goal

The start screen offers a workshop day beside free play and the daily. A day is five customers in a row, chosen by the player's reputation, with a screen between customers and an end-of-day screen. Reputation (0 to 100, shown as stars) and the streak carry from day to day. A day in progress survives a reload, and a round cut off by a reload counts as a walk-out. The day's records and the `clean_day` and `customers_100` badges work.

Approved by the owner in advance on 2026-10-12, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.").

The owner pre-approved the gamification proposal on 2026-10-12 by choosing "Build all four directions". This plan stays `proposed` until the owner or the coordinator marks it approved after ADR 0032 is accepted.

## ADRs relied on

- **0032** decides all of it: the mode, five customers, jobs chosen at the start of a day, no fault twice, leaving and coming back, reputation and its changes, the bands, the streak, the clean day, the end-of-day screen, the saved `workshop` section.
- **0031**: the v2 shape and its `workshop` section and records (`bestDay`, `longestStreak`, `customersServed`); `clean_day` and `customers_100`.
- **0030**: each fault's `difficulty`, which the bands draw on.
- **0001**: a third mode, through ADR 0032.
- **0004, 0015, 0026**: each customer is an ordinary round, with its own log, patience, arrival and ending.
- **0024**: the unfinished-record pattern, reused for the round under way.
- **0005, 0007**: the daily and its fairness untouched; nothing about a day hints at a fault.
- **0010**: day logic pure in `core` where it can be, the day's state machine in `app`.

## Exploration summary

Done by Claude (Opus) reading the code on 2026-10-12. `app/round.ts` `createGame()` runs one round at a time: `newRound(choice?)` picks free play (`pickFault`, `pickCustomer` in `app/faults.ts`) or a daily `RoundChoice`; `arrive()`, `begin()`, `propose()`, `tick()`; `RoundRecord.mode` is `free`, `daily` or `practice`. `ui/index.ts` `mountUi()` owns the screens (`showScreen`, `newRound`, `afterEnding`) and the start screen (`ui/start.ts`) has a daily and a free-play button. `game/public/customers.json` has three customers (patience 750, 550, 400). After plan 0021 the saved value has a `workshop` section with defaults. The browser checks start rounds from the start screen and walk through endings.

Risks: `newRound` and the start screen grow a third path; a day's state must stay consistent across a reload mid-round and across two tabs; with three customers the day repeats faces; a 5-round browser check is slow.

## Simpler readings chosen

1. The day is a small state machine in `app/workshop.ts` that calls the existing `Game` for each round with a new `RoundChoice` kind (`{ kind: "workshop", faultId, customerId }`), so `round.ts` changes little.
2. Pure rules in `core/workshop.ts`: `reputationAfter(rep, score)`, `bandFor(rep)`, `pickJobs(faults, customers, band, random)`, `streakAfter`, `isCleanDay`.
3. Stars on the bench are a DOM row in the HUD, not a 3D object, for now.
4. The between-customers screen is the result screen with a "Next customer" button that continues the day, and a line for the streak and reputation.
5. Continuing a day happens from the start screen only ("Continue day 3 · customer 4 of 5"); the start screen replaces the "Workshop day" button with it.
6. In two tabs, the last tab to save wins for the `workshop` section (plan 0021 reading 2); not guarded further.

## Steps

1. **Core rules.** `core/workshop.ts` and constants (start 30, +3, +2, +1, −1, −8, bands 35 and 70, patience limits 550). Tests in `game/tests/workshop.test.ts`: each change, clamping, bands, five distinct faults from the band's pool, no customer twice in a row, the same random gives the same jobs.
2. **App.** `app/workshop.ts`: start, continue, record each round (saving `current` unfinished when its timer starts, replacing it at the end), the walk-out on reload, end of day with records and badges. `app/round.ts`: the workshop `RoundChoice` and `RoundRecord.mode`. Tests in `app.test.ts`, including a reload mid-round.
3. **Saving.** `platform/local/progress.ts` reads and writes `workshop` and `workshop.today`. Tests in `platform.test.ts`.
4. **Interface.** `ui/strings.ts`; `ui/start.ts`: Workshop day or Continue; `ui/workshop.ts` (new): the between-customers line and the end-of-day screen; the stars row in the HUD; `ui/index.ts` wiring. Tests in `ui.test.ts` for the pure helpers (stars from reputation, the summary text).
5. **Browser checks.** `tools/verify/phone-play.ts`: a full day of five (with the diagnostic solver for speed), reputation and stars change, the streak, the end-of-day screen, a reload mid-round counts a walk-out and the day continues, the daily and free play unchanged. `drop-play.ts` re-run. Both under the shared lock, one after the other.
6. **Notes.** `docs/design/interface.md`; release note `docs/releases/0.21.0.md`.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build` and `npm run size` pass.
- `npm run verify:phone` and then `npm run verify:drop` pass under the shared lock, with no console errors and at least 30 fps at 4x CPU throttle, as in step 5.
- The owner plays a day on the phone.

## Depends on

Plans 0019, 0020 and 0021 merged first (difficulty, the v2 shape and its records). Plan 0023 builds on this plan's day and screens.

## Release note line

Added: the workshop day, five customers in a row chosen by your reputation, with a streak and an end-of-day screen; reputation carries from day to day (plan 0022, ADR 0032).
