---
id: 0021
title: Badges and personal records, and the second saved format
status: approved
date: 2026-10-12
adrs: [0005, 0007, 0010, 0022, 0024, 0031]
branch: plan/0021-badges-and-records
---

# 0021. Badges and personal records, and the second saved format

## Goal

The game saves under `openam.scores.v2`, in the shape ADR 0031 designs for badges, records, the workshop day and earnings. The player earns local badges, sees them with their personal records from a Badges button on the start screen, sees a new badge or record on the result screen, and the scored daily's share text names a badge earned that round. The workshop, wallet and tools sections exist with their defaults, ready for plans 0022 and 0023.

Approved by the owner in advance on 2026-10-12, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.").

The owner pre-approved the gamification proposal on 2026-10-12 by choosing "Build all four directions". This plan stays `proposed` until the owner or the coordinator marks it approved after ADR 0031 is accepted.

## ADRs relied on

- **0031** decides all of it: the v2 key and shape, defaults inside v2, no migration, the extra `StoredResult` fields, bests from the standard kit only, the nine badges and their rules, the records, where they show, the share line.
- **0022**: replaced in format by 0031; its storage-failing and no-migration rules still hold.
- **0024**: the unfinished daily record carries over unchanged into v2.
- **0005**: the share text gains one optional line; the daily itself is unchanged.
- **0007**: badge descriptions never name a fault's bad part.
- **0010**: badge rules and records pure in `core`; saving in `platform`; screens in `ui`.

## Exploration summary

Done by Claude (Opus) reading the code on 2026-10-12. `game/src/platform/local/scores.ts` holds `SCORES_KEY = "openam.scores.v1"`, `parseSaved()`, `better()`, `dayRecord()` and `createScoreStore()`, which merges storage into memory on every call and writes the whole value. `platform/local/storage.ts` has `safeStorage()` and the separate `openam.muted` key. `platform/interfaces/index.ts` defines `StoredResult` and `ScoreStore`. `app/daily.ts` `recordResult()` and `recordUnfinished()` save; `app/round.ts` builds the `StoredResult` in `stored()`. `ui/start.ts`, `ui/result.ts`, `ui/format.ts` (`shareText`, `shareOffered`) and `ui/strings.ts` (`SHARE`, `TEMPLATES`) show results. Tests: `platform.test.ts`, `daily.test.ts`, `ui.test.ts`.

Risks: the store merges another tab's data on every read, so badges and records need the same merge rule (union of badges, max or min of records); a daily streak needs consecutive days, which the `daily` map already gives; plans 0022 and 0023 must not need a third key, so every section needs a default from the start.

## Simpler readings chosen

1. One store object for everything under the key: `ScoreStore` grows into `ProgressStore` with read and update methods for each section, one implementation in `platform/local/progress.ts` (renamed from `scores.ts`).
2. Merging with another tab: badges are a union (earliest `at` kept); `customersServed` and `longestStreak` take the larger; `fastestFix` the smaller; `best` and `daily` as now. The workshop, wallet and tools sections take the stored value as it is (one tab plays a day at a time).
3. `every_fault` reads only `records.fixedFaults`, not `best`, so workshop fixes with bought tools count too. Merging two tabs takes the union.
4. The daily streak counts back from today's day number through `daily`; a day with no fixed scored record breaks it.
5. Badge names are short English for now ("First fix", "Quick hands", "No wrong parts", "Every fault", "Seven days", "Hundred customers", "Clean day", "First tool", "Full kit"), for the owner to put into Pidgin.

## Steps

1. **Core badge and record rules.** `core/badges.ts` (new): `BADGE_IDS`, `badgesEarned(before, round)`, `recordsAfter(before, round)`, `dailyStreak(daily, day)`; constants in `core/constants.ts` (30 s, 7 days, 100 customers). Tests in `game/tests/badges.test.ts` for each badge, never twice, never from practice, and records.
2. **The v2 store.** `platform/interfaces/index.ts`: `StoredResult` gains `mode`, `customerId`, `kit`; `ProgressStore`. `platform/local/progress.ts`: key `openam.scores.v2`, `parseSaved()` with per-section defaults, the merge rules, bests only from an empty kit; the v1 key never read. Tests in `platform.test.ts`: bad JSON, wrong `v`, a missing or broken section reads as its default with the rest kept, blocked storage keeps memory, a v1 value is ignored.
3. **App.** `app/round.ts` and `app/daily.ts` fill the new fields, call the rules at the end of a round, save, and report new badges and records in `RoundRecord`. Tests in `app.test.ts` and `daily.test.ts`.
4. **Interface.** `ui/strings.ts`: badge names, descriptions, how to earn, record labels, the share line; `ui/badges.ts` (new): the Badges screen; `ui/start.ts`: the Badges button; `ui/result.ts`: new badge and record lines; `ui/format.ts` `shareText()` with the optional line. Tests in `ui.test.ts`, including the share text with and without a badge.
5. **Browser checks.** `tools/verify/phone-play.ts`: a fresh browser earns `first_fix` and sees it on the result and the Badges screen; the share text of a scored daily that earns a badge has four lines; a reload keeps badges; a v1 value in storage is ignored. `drop-play.ts` re-run. Both under the shared lock, one after the other.
6. **Notes.** `docs/design/interface.md`; release note `docs/releases/0.20.0.md`, saying old bests are not carried over.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build` and `npm run size` pass.
- `npm run verify:phone` and then `npm run verify:drop` pass under the shared lock, with no console errors and at least 30 fps at 4x CPU throttle, as in step 5.
- The owner looks on the phone.

## Depends on

Plans 0019 and 0020 merged first (the score with checks, twelve faults for `every_fault`). Plans 0022 and 0023 build on the v2 shape this plan writes.

## Release note line

Added: local badges and personal records, shown from the start screen; a scored daily's share text names a badge earned that day. Changed: results are saved in a new format, so earlier bests are not carried over (plan 0021, ADR 0031).
