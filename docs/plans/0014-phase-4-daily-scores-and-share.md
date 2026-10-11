---
id: 0014
title: Phase 4, the daily fault, local best scores, share, loading and the frame-rate check
status: proposed
date: 2026-10-11
adrs: [0001, 0002, 0004, 0005, 0007, 0010, 0014, 0015, 0022, 0024]
branch: plan/0014-phase-4
---

# 0014. Phase 4, the daily fault, local best scores, share, loading and the frame-rate check

## Goal

The player can choose today's fault or free play. Today's fault is the same for everyone, with the same customer. The first attempt each day is scored. Later attempts that day are practice and are not scored. The result screen shows the player's best score for that fault, kept in the browser. The game keeps working when browser storage is blocked or broken. A scored daily that ends with the engine running can be shared as the three-line text in ADR 0005, through the phone's share sheet or the clipboard. While the model, environment and hand download, the player sees the start and briefing screens with a progress bar, not a blank page. `npm run verify:phone` fails when the frame rate is under the 30 fps budget, instead of only printing it. This is the brief's Phase 4. Nothing changes in the rules or the score.

## ADRs relied on

- **0005** decides most of it. Day number since `DAILY_EPOCH` in Lagos time. The fault from the seeded hash, never the previous day's. `DailyProvider` and `ScoreStore` interfaces with local implementations. One scored attempt per day, with unscored replays after it. The share text and its two routes (Web Share API, otherwise the clipboard). Every storage read and write in try/catch with a memory fallback. The selection is already built and tested in `core/daily.ts`; this plan wires it in.
- **0001**: free play and a daily fault, local best scores and a shareable text result are in the first version. Leaderboards, accounts and a backend are not, so scores stay in the browser.
- **0004**: the score and stars are a pure function of the action log. This plan stores and shows them and never computes them another way.
- **0015**: in the daily everyone gets the same customer, chosen from the same day seed (`dailyCustomerId`, already in core). A walked round uses up the scored attempt and has no stars.
- **0010**: day number and fault choice stay in `core`; the round's mode and recording a result in `app`; storage, the share sheet and the clipboard in `platform/local`; screens and strings in `ui`; only `main.ts` wires them together. `platform` may import only core types, so the local `DailyProvider` gets the day and fault functions injected from `main.ts`.
- **0014**: the 30 fps at 4x CPU throttle budget, which the browser check now enforces. The environment map is built "behind the briefing screen", which is how loading works below.
- **0007**: the daily, the scores and the loading screen show nothing about the fault or the culprit. Diagnostic mode is unchanged.
- **0002**: no new dependency. The deploy is a static build on any host, so the share link is the page's own address at run time.

No accepted ADR is contradicted. The saved score format is not decided by any ADR; see "Needs an ADR first".
- **0022** (accepted): what is saved in the browser: one key, `openam.scores.v1`, with the best result per fault and one record per day.
- **0024** (proposed): the daily attempt is used up when its timer starts, saved as an unfinished record until the round ends.

## Exploration summary

Explored by Opus on 2026-10-11, reading the files directly.

- `game/src/core/daily.ts` has `dayNumber`, `hashDay`, `dailyFaultId` and `dailyCustomerId`, tested in `game/tests/daily.test.ts` (Lagos midnight rollover, no repeat over 400 days, determinism). Nothing outside core calls them.
- `game/src/platform/interfaces/index.ts` defines `StoredResult`, `ScoreStore` (`best`, `bestDaily`, `record`, `dailyAttempted`), `DailyProvider` (`today()`) and `Share` (`share(text)` resolving to `"sheet"`, `"clipboard"` or `"none"`). None has an implementation. `platform/local/` has only `audio.ts` and `clock.ts`. `Clock.today()` already exists.
- `game/src/app/round.ts` `newRound()` always picks a random fault and customer (`app/faults.ts`). It emits `ended` and `left` with the score and log, which is where a result can be recorded.
- `game/src/main.ts` awaits the machine folder, `customers.json` and `loadRenderAssets` (model, ground shadow, environment, hand) before it mounts anything. The page is blank until all of it arrives. On a slow line that is the whole first impression. `game/index.html` has an empty `#app`.
- `game/src/ui/result.ts` says "Share arrives with the daily in Phase 4". Its only button is "Next customer". `ui/index.ts` calls `newRound()` straight into the briefing. `ui/card.ts` already has a progress bar (`.progress .fill`) to reuse for loading.
- `tools/verify/phone-play.ts` measures the frame rate at 4x CPU throttle from the diagnostic overlay and only prints it. It waits for `.briefing` at load, so a start screen will need it to tap through. Releases 0.8.0 to 0.9.1 measured 60 fps in headless Edge with software rendering, so enforcing 30 fps should pass today.
- `tools/build/size.mjs` already fails the build over 350 KB. `npm run assets` already fails over the model, environment and ground budgets. Those parts of the performance pass exist.
- `docs/design/architecture.md` already places the local `ScoreStore` (local storage with memory fallback), `DailyProvider` and `share` in `platform`.

Risks: plans 0011 and 0012 also change `main.ts` (loading `tools.glb` and `toolbox.glb`), `ui/index.ts` and `phone-play.ts`, so whichever merges second rebases. A headless browser with software rendering does not represent a low-end phone, so passing the frame-rate check is necessary, not sufficient.

## Simpler readings chosen

1. **Choosing the mode.** A start screen with two buttons: "Today's fault · Day N" and "Free play". It shows after the small data files load. "Next customer" on the result screen returns to it. That costs free play one extra tap, but it is simpler than putting the daily on the result screen too.
2. **Day number shown.** The number `dayNumber` returns, as is. 2026-10-01 is day 0, so 2026-10-11 is "Day 10".
3. **The day is fixed when the round is chosen.** A daily started before Lagos midnight and finished after it counts for the day it started.
4. **When the attempt is used up (ADR 0024).** When the daily round's timer starts. At that moment app saves the day's record with the log so far and `unfinished: true`; when the round ends, fixed or walked, the full result replaces it. A daily left unfinished (the tab closed, the phone reloaded) still counts as attempted, has no score, stars or share, and the start screen shows it as "Not finished". The owner chose this on 2026-10-11 ("1. B").
5. **Practice rounds.** Once today's attempt is used, the daily button reads "Today's fault · practice". The briefing says it is not scored. The result screen shows the score with "Not scored" and no best and no share. Practice rounds are not stored at all.
6. **Best scores.** The best is the lowest total among fixed rounds for that fault, from free play and scored dailies alike. Walked rounds never count as a best (ADR 0015: no stars, and a quick walk-out would look like a low score). The result screen shows "Best" under the total, and "New best" when this round sets it. The start screen shows today's scored result once it exists.
7. **Share text.** Exactly ADR 0005's three lines:
   - `Open Am · Day N`
   - `Fixed in Ss · W wrong part(s) · stars`
   - the URL

   `S` is the score's whole `elapsedSeconds`, always in seconds, as in the example ("38s", and "95s" rather than "1:35"). "1 wrong part", otherwise "N wrong parts". The stars come from the existing `starText`, so two stars read `★★☆`. Failed pulls are not added, because ADR 0005 does not show them. The URL is the page's origin plus the build's base path, with no query, so `?diag` never leaks.
8. **When Share shows.** Only on the result of a scored daily that ended with the engine running. ADR 0005 defines a text only for a fixed round ("Fixed in"), so free play, practice and walked rounds get no Share button. See the owner question below.
9. **Share routes.** `navigator.share` when it exists. If the player cancels the sheet (`AbortError`), nothing else happens. If it fails any other way, or does not exist, `navigator.clipboard.writeText`. If both fail, the result screen shows the text in a read-only box, selected, so it can be copied by hand. After a clipboard copy it shows "Copied".
10. **Loading.** The brief and ADR 0014 have the model and the environment load behind the briefing. Before any script runs, `index.html` shows a pulsing bar with no words, so no player text lives outside `strings.ts`. Once `machine.json`, `faults.json` and `customers.json` arrive (a few KB), the start screen and briefing show at once. The model, ground shadow, environment and hand load behind them, plus `tools.glb` and `toolbox.glb` once plans 0011 and 0012 are merged. The briefing's Start button stays disabled with a progress bar until render is mounted. Progress counts files finished out of files requested, not bytes, so no streaming reads are needed. A file that fails still counts as finished, because each one already has a fallback (placeholders, the fallback light rig, no hand). The machine data failing, or WebGL missing, still shows the existing cannot-run screen.
11. **Frame-rate check.** `phone-play.ts` fails when the measured rate is under 30 fps, and when it cannot read a rate at all. The 30 is a named constant citing ADR 0014. The measurement itself (headless, 4x throttle, while turning the camera) is unchanged.

## Needs an ADR first

- **ADR 0024 (proposed)**, when the daily attempt is used up. ADR 0022 (the saved format) is accepted, so the store writes to `localStorage` from the start.

Nothing else in this plan needs a new decision. Loading adds no data file and changes no contract. It only reports progress on the fetches `main.ts` already makes.

## Steps

1. **Daily provider.** `game/src/platform/local/daily.ts`: `createDailyProvider(clock, dayOf, faultOf)` returns `today()` as `{ day: dayOf(clock.today()), faultId: faultOf(day) }`. `main.ts` passes `dayNumber` and `(d) => dailyFaultId(faults, d)` from core, so platform imports no core functions (ADR 0010). Tests in `game/tests/platform.test.ts`: a fixed clock gives the core's day and fault. Stepping the clock past 23:00 UTC gives the next day and a different fault.
2. **Game modes in app.** `game/src/app/round.ts` gains `newRound(choice?)`. With no choice it is free play, as now. With `{ day, faultId, scored }` it uses that fault and `dailyCustomerId(customers, day)`. The `Briefing` gains `daily: { day, scored } | null`. `GameDeps` gains an optional `scores: ScoreStore`. When a scored daily's timer starts, app records it as unfinished (ADR 0024); on `ended` and `left` app records the full `StoredResult` for free play and for a scored daily, never for practice. `game/src/app/daily.ts`: `dailyStatus(provider, store)` returns `{ day, faultId, attempted, result }`. Tests in `game/tests/app.test.ts`, on the shipped data with a fake clock and an in-memory store:
   - the daily gives the same fault and customer for two games on the same day, and the next day's fault differs;
   - a round started on day N and ended after Lagos midnight is recorded for day N;
   - a fixed daily and a walked daily both use up the attempt;
   - a daily whose timer has started and that never ends uses up the attempt and is recorded as unfinished, never as a best;
   - a practice round is not recorded;
   - free play is recorded with `day: null`;
   - the recorded score equals `score()` replayed from the recorded log.
3. **Score store.** `game/src/platform/local/scores.ts`: `createScoreStore(storage)` implements `ScoreStore`. `best` ignores walked rounds and keeps the lowest total. `dailyAttempted` is true once a day has a record. It always keeps its records in memory. It writes to `localStorage` (ADR 0022) behind a `safeStorage()` helper that returns `null` if touching it throws. Every `getItem`, `setItem` and parse is in try/catch and falls back to memory. Tests in `game/tests/platform.test.ts`:
   - lowest total wins;
   - walked never becomes a best;
   - the daily attempt is remembered;
   - two stores on one fake storage see each other's records (a reload);
   - a storage that throws on every call, a `setItem` that throws a quota error, and unparseable JSON all leave a working store that keeps this session's results in memory.
4. **Share.** `game/src/platform/local/share.ts`: `createShare(nav)` implements `Share` with the routes in reading 9, taking a navigator-like object so it is tested without a browser. Tests: the sheet is used when present, a cancel returns `"none"` without touching the clipboard, another sheet error falls back to the clipboard, no sheet uses the clipboard, and both missing or failing returns `"none"`. The share text is a pure function, `shareText(day, score, url)`, in `game/src/ui/format.ts`, with its words in `game/src/ui/strings.ts`. Tests in `game/tests/ui.test.ts`: the exact ADR 0005 example (`Day 12`, 38 s, 1 wrong part, 3 stars), "0 wrong parts", "2 wrong parts", 95 s as "95s", and two stars as `★★☆`.
5. **Screens.** `game/src/ui/start.ts`: the start screen from reading 1, with today's scored result when there is one. `game/src/ui/briefing.ts` shows "Today's fault · Day N" or "Practice, not scored" for a daily. `game/src/ui/result.ts` gains rows for "Best" and "New best", "Not scored" for practice, and Share for a scored fixed daily, with "Copied" and the hand-copy box from reading 9. `ui/index.ts` routes "Next customer" to the start screen. Every new word goes in `strings.ts`. `ui` gets the daily status, the store's best and the share function as options from `main.ts`. It never imports platform.
6. **Loading.** `game/src/render/model.ts` `loadRenderAssets` takes an `onProgress(done, total)` callback and calls it as each file settles. `game/index.html` gets the wordless pulsing bar inside `#app`, replaced when the app mounts. `game/src/main.ts` is reordered: load the machine folder and customers, then mount `ui` (start screen and briefing), then load the render assets with progress passed to `ui`, then mount render. `ui`'s part pictures and hand carry reach render through functions that wait for it. `ui/briefing.ts` shows the progress bar (the card's `.progress` style) and enables Start when `main.ts` says render is ready. A dev-only `?today=<ISO time>` query, guarded by `import.meta.env.DEV` like `?patience`, sets `Clock.today` so a day change can be seen in the browser. Unit test in `game/tests/ui.test.ts` for the pure part: the progress share from `done` and `total`, including a total of 0.
7. **Frame-rate check and browser checks.** `tools/verify/phone-play.ts`:
   - taps "Free play" before each round;
   - pushes a failure when the frame rate is under `FPS_BUDGET = 30` (ADR 0014) or was not read;
   - plays one daily with `?today=` and checks the briefing names the day, the result shows Share, and Share puts the exact text on the clipboard (the headless browser has no share sheet; clipboard access is granted over the DevTools protocol);
   - reloads and checks the daily now reads "practice"; and starts a daily, reloads mid-round, and checks the daily reads "Not finished" and is not scored again (ADR 0024);
   - opens the next day with `?today=` and checks a new daily is offered;
   - reloads with `localStorage` made to throw (`Page.addScriptToEvaluateOnNewDocument`) and checks a round still plays to the result with no console errors;
   - checks the loading bar shows and Start is disabled before render is ready, with network throttling on;
   - keeps all six faults and the forced walk-out as now.
8. **Notes.** `docs/design/interface.md` gains the start screen, loading, best and share. `docs/design/architecture.md` notes the injected day functions. Release note `docs/releases/0.13.0.md`. The phone preview is republished.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build` and `npm run size` pass. `game/tests/boundaries.test.ts` passes unchanged.
- `npm run verify:phone` passes every check in step 7. It exits 1 if the frame rate is under 30 fps at 4x CPU throttle, which can be shown once by temporarily setting the budget above the measured rate.
- Unit tests show the daily works across a simulated day change, and the share text matches ADR 0005's example exactly (the brief's Phase 4 done check).
- On the phone the owner sees the start screen within a moment of opening the page on mobile data, the progress bar on the briefing, the daily once scored and then as practice, and Share opening the share sheet.

## Depends on

Nothing strictly. It touches `game/src/main.ts`, `game/src/ui/index.ts`, `game/src/render/model.ts` and `tools/verify/phone-play.ts`, which plans 0011 and 0012 also change (loading `tools.glb` and `toolbox.glb`, new browser checks). Whichever merges second rebases, and the loading progress then counts the tools and toolbox files too. Step 2's unfinished record and step 7's mid-round reload check wait for ADR 0024.

## Questions for the owner

- **Share for a walked daily, free play and practice.** ADR 0005 gives a text only for a fixed daily. The plan shows no Share button otherwise. If the owner wants one (for example `Open Am · Day 12` / `Customer walked · 2 wrong parts` / url), that is a change to ADR 0005's share text and needs a superseding ADR.
- **One extra tap in free play** (reading 1). Acceptable, or should "Next customer" go straight to another free-play round with the daily reachable from the result screen?

## Release note line

Added: today's fault, the same for everyone with the same customer, scored once a day and replayable as practice; your best score for each fault, kept in the browser even when storage is blocked; a Share button for the day's result; the start and briefing screens with a progress bar while the machine loads. The phone check now fails below 30 fps (plan 0014, ADRs 0005, 0001, 0014, 0015).
