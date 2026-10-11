---
id: 0013
title: Sound and vibration
status: approved
date: 2026-10-11
adrs: [0002, 0004, 0007, 0010, 0012, 0014, 0018, 0020, 0021, 0022, 0023]
branch: plan/0013-sound-and-vibration
---

# 0013. Sound and vibration

## Goal

The game makes the sounds ADR 0018 lists, and on phones that support it, vibrates with them. A fastener or an unscrewed part clicks once per turn. A part that gives makes the sound of its kind. A part dropped on the tray clunks. A part put back seats with a click. The cord pull, a failed start and the engine start each have a sound. The sounds are short mono Ogg Opus recordings, 250 KB at most in all. They load after the round starts, and the first tap ("Start") unlocks them. A mute button on the working screen turns off sound and vibration, and the phone remembers the choice. A blocked part stays silent and still. Until the owner records the real machine, the sounds are CC0 stand-ins. Every file's source and licence is listed. Nothing changes in the rules or the score.

Approved by the owner on 2026-10-11, who wrote "1. All approved  2. B" (in answer to a request to accept ADRs 0023 and 0024 and approve plans 0013, 0014 and 0015).

## ADRs relied on

- **0018** decides all of it: the table of moments, sounds and vibrations; nothing for a blocked part; recordings only, either the owner's or the mechanic's own or released as CC0, each listed in `game/public/audio/LICENCE.md`; mono Ogg Opus, 250 KB in all, loaded after the round starts; the Web Audio API and `navigator.vibrate` with no new dependency; the mute button, remembered, sound on by default; the first tap unlocks audio; `Audio` grows to the list of moments plus a vibrate call; `app` plays the moments that come from accepted actions; `render` passes the finger's moments to `main.ts` through a callback.
- **0020**: the turn and gives moments now come from the loosening animation (double tap, double click or G). The put-back does the fasteners up. A part that cannot come off shows nothing.
- **0021**: the toolbox trip changes where the tool comes from, not when a fastener turns. Before the cord is pulled, fasteners are done up quickly with no trip.
- **0002**: no new package. Limit 6 says audio needs a first tap and storage can be wiped. Web Audio and `navigator.vibrate` are built into the browser.
- **0004**: no new action. Sound and vibration cost nothing and are not logged.
- **0007**: sound and vibration never add information the picture does not show. The press on any part stays silent, and the same for every part.
- **0010**: `Audio` stays in `platform`. `render` never imports `platform`. `main.ts` wires them. ADR 0023 (proposed) replaces its "no request after load" paragraph and allows the sounds to download after Start, never holding up play.
- **0023** (proposed): the sounds may download after Start; a missing or late sound plays nothing.
- **0022**: the mute setting is not a score; ADR 0018 itself decides it is remembered, under its own key `openam.muted`.
- **0012**: Blender 4.5 is the approved tool. Its sound mixdown encodes the sounds, so no new tool is needed.
- **0014**: ADR 0018 adds a 250 KB sound budget to ADR 0014's table. The frame rate must still hold.

## Exploration summary

Explored by Claude (Opus) on 2026-10-11.

`game/src/platform/local/audio.ts` plays `HTMLAudioElement`s passed in by name, for the three names `remove`, `fail` and `start` only. `main.ts` passes none, so it plays nothing. `game/src/platform/interfaces/index.ts` has `SoundName = "remove" | "fail" | "start"` and `Audio { play(name) }`. `app/round.ts` plays `remove` on an accepted remove and `start` or `fail` on a pull. It also plays `fail` when the customer walks out, a moment ADR 0018 does not list. No sound files ship (`game/public` has no `audio` folder). There is no vibration code, no mute control, no budget check for sound and no audio unlock. `platform/local` has no storage yet: the best scores (`ScoreStore`) are not built, so there are no storage fallbacks to share.

On `plan/0011-bolts-and-tools` (commit `e8dacc3`), `render/view.ts` has the moments this plan needs:
- `loosen` runs `fastenerSteps` (each fastener turns `FASTEN.turns` = 2 turns in 0.25 s), then the freeing step (`FASTEN.freeSeconds`, or `LOOSEN.seconds[type]` without fasteners).
- `animateRemove` runs on `removed`.
- `animateInstall` runs a drift, then the motion in reverse, then each fastener back in (0.15 s each).
- `pressHome` runs on `pulled`.

There is no cord animation in `render`. The pull is a button in `ui`. In `machine.json` on that branch: `fuel_tap` and `spark_plug` are `unscrew`; `fuel_hose` and `plug_cap` are `pull`; `air_filter_cover` and `capacitor` are `unclip`; `carburetor`, `recoil_starter`, `muffler` and `alternator_cover` are `unbolt`; `fuel_tank` is `lift`; `air_filter` is `slide`. `ui/index.ts` builds the working screen (`hud`: timer, patience meter, speech, controls). `tools/verify/phone-play.ts` drives Edge or Chrome over the DevTools protocol and reads dev-only hooks on `window`. `tools/pipeline/budgets.json` holds the budgets that `check.ts` reads. `docs/open-questions.md` already says the cord, failed start and engine are CC0 stand-ins until the owner records the real machine.

Risks:
- Ogg Opus does not decode in Safari before iOS 17 or so. Those players hear nothing, which ADR 0018 allows.
- Sound bugs on Android browsers show up only on real phones.
- Freesound needs a sign-in to download originals.
- Blender's mixdown might not write mono Opus in background mode. Step 3 checks this first.

## Simpler readings chosen

1. **The moments and their names.** `Audio`'s `SoundName` becomes `Moment`, ten names, one file each in `game/public/audio/<moment>.ogg`:

| Moment | When | Who plays it | Vibration (ms) |
| --- | --- | --- | --- |
| `turn` | each whole turn of a fastener or an `unscrew` part, coming out or going in | `render` callback | none |
| `give-unbolt` | an `unbolt` part starts its freeing step | `render` callback | 15 |
| `give-unclip` | an `unclip` part starts its freeing step | `render` callback | 15 |
| `give-pull` | a `pull` part starts its freeing step | `render` callback | 15 |
| `give-scrape` | a `slide` or `lift` part starts its freeing step | `render` callback | 15 |
| `land` | a `remove` is accepted (the part is dropped on the tray) | `app` | none |
| `seat` | a part put back reaches home, before its fasteners go in | `render` callback | 15 |
| `cord` | a `pull` is accepted | `app` | none |
| `fail` | after the cord, when the engine does not start | `app` | 40 |
| `start` | after the cord, when the engine starts | `app` | 60, 40, 60, 40, 80 (280 in all) |

   - An `unscrew` part has no give sound. ADR 0018 lists no give sound for it, and its turns already click.
   - An unknown motion type plays as `slide`, so it scrapes.
   - `land` is one clunk for every part, not a metal one and a plastic one. One file is simpler.
   - The sound file decides the clunk.
2. **Seat comes from `render`.** The put-back is an accepted `install`, but the part only seats about a second later, at the end of its animation. A sound must match the picture, so `render` reports `seat` through the same callback as the finger's moments. `app` plays nothing on `install`.
3. **Cord, then the outcome.** `app` plays `cord` at once and `fail` or `start` after `CORD_SECONDS` (0.6 s, the trimmed length of the cord file). The vibration waits the same time. `Audio.play` takes an optional delay in seconds, so `app` needs no timer of its own.
4. **The walk-out is silent.** ADR 0018's table has no walk-out moment, so `app` stops playing `fail` when the customer leaves.
5. **Pressing home before the cord is silent.** `pressHome` turns no fastener on screen, and the cord sound plays at the same moment.
6. **Clicks per turn.** A pure function in `render/motion.ts` counts the whole turns crossed between two tween progresses. Two turns per fastener give two clicks in 0.25 s. An `unscrew` part clicks for the share of its turns done while loosening (`LOOSEN.unscrewShare`), and again for its turns in reverse when put back.
7. **The vibration table lives in `app`.** `app/moments.ts` holds the table above as data, and one function `playMoment(audio, moment, delay)` that calls `audio.play` and, where the table has a pattern, `audio.vibrate`. `app` uses it for its own moments. `main.ts` passes the render callback to it. The `Audio` interface keeps the two calls ADR 0018 names (`play` and `vibrate`) plus `setMuted`, `unlock` and `load`.
8. **Unlock.** `main.ts` listens on `window` for `click` and `keydown` and calls `audio.unlock()` until the `AudioContext` is running. The first such tap in practice is "Start". Before that, `play` does nothing.
9. **Loading.** On the first `started` event, `main.ts` fetches the ten files once and hands each `ArrayBuffer` to `audio.load(name, buffer)`. `platform` decodes it. A missing file, a failed fetch or a failed decode leaves that moment silent and logs one warning in development only. Nothing is fetched before Start. Files are not fetched again on later rounds.
10. **Mute.** A small speaker button sits at the top right of the working screen, next to the timer. When muted it shows a slashed speaker. It is at least 44 px square, with `aria-pressed` and a label from `strings.ts`.
    - Muted means no sound and no `navigator.vibrate` call at all.
    - The choice is stored under `openam.muted` through `platform/local/storage.ts`. That is a new helper: `localStorage` in try/catch, falling back to memory for the session. ADR 0018 says "the same storage fallbacks as the best scores", but the best scores are not built yet. This helper is written so `ScoreStore` can reuse it later.
    - The hand withdraws over the button, as over any button (ADR 0020).
11. **CC0 only.** ADR 0018 allows the owner's or the mechanic's own recordings, or CC0. A later sentence would also tolerate a licence that only asks for credit. The owner chose CC0 only on 2026-10-11 ("4. A"), recorded in ADR 0018's history.
    - Stand-ins come from Freesound (freesound.org), filtered to "Creative Commons 0", one sound per moment.
    - Each file is credited anyway in `game/public/audio/LICENCE.md`: moment, Freesound page URL, author, licence `CC0 1.0`, date fetched, trim used.
    - No sound with any other third-party licence is used, and none is made up in code.
12. **Encoding.** `assets/audio/sounds.json` lists, per moment, its source file, source URL, trim start and end, fade in and out, and gain. `tools/blender/audio.py` uses Blender 4.5's sound mixdown to write each file trimmed, mono, 48 kHz, Ogg Opus at 32 to 48 kbps. `npm run audio` runs it and then the budget check.
    - The downloaded sources go in `assets/audio/source/`. That folder is listed in `.gitignore`, so the sources are not committed. Re-encoding means downloading them again from the URLs in `sounds.json`.
    - This keeps ADR 0012's Git LFS rule as it is, since that rule covers only `.blend` files and textures.
13. **The budget check.** `budgets.json` gains `audioBytes: 250000`. A pure `checkAudio` in `tools/pipeline/check.ts` checks the files in `game/public/audio`:
    - each is Ogg (`OggS`) with an `OpusHead` of channel count 1;
    - every moment has a file and there are no extra files;
    - the total is at most 250,000 bytes;
    - every file has a row in `LICENCE.md` whose licence is `CC0 1.0` or `own recording`.

    `game/tests/pipeline.test.ts` runs the same check on the shipped folder, so `npm test` catches a bad commit without Blender.

## Steps

1. **Interface and platform.** In `game/src/platform/interfaces/index.ts`, `SoundName` becomes `Moment` with the ten names, and `Audio` becomes `play(moment, delaySeconds?)`, `vibrate(pattern)`, `setMuted(muted)`, `unlock()` and `load(moment, data)`. `game/src/platform/local/audio.ts` is rewritten on Web Audio:
   - one `AudioContext`, created on `unlock()` and resumed there;
   - a decoded buffer per moment;
   - each play starts a fresh source node at `currentTime + delay`;
   - `navigator.vibrate` only if it exists and is not muted, delayed with `setTimeout`;
   - every failure is swallowed.

   The context and `navigator` are injected so the module tests without a browser. Add `game/src/platform/local/storage.ts`. Tests in `game/tests/platform.test.ts`, with a fake context:
   - nothing plays before unlock, while muted, or for a missing or undecodable moment;
   - a delay schedules at the right time;
   - vibrate is skipped when muted or unsupported;
   - storage falls back to memory when `localStorage` throws.
2. **The moments in `app`.** Add `game/src/app/moments.ts`, holding the table, `giveMoment(motionType)` and `playMoment`. In `game/src/app/round.ts`:
   - an accepted remove plays `land`;
   - an accepted pull plays `cord`, then `fail` or `start` after `CORD_SECONDS`;
   - the walk-out plays nothing.

   Tests in `game/tests/app.test.ts`:
   - the table matches ADR 0018's (which moments vibrate; 15 and 40 ms; the start pattern under 300 ms);
   - `giveMoment` maps every motion type, with `unscrew` mapping to none and unknown types to `give-scrape`;
   - a refused action plays nothing;
   - a blocked removal plays nothing;
   - the walk-out plays nothing.

   Existing tests that expect `remove` change to `land`.
3. **Sounds.** Check first that `tools/blender/audio.py` can write a mono Ogg Opus file with Blender 4.5 in background mode. If it cannot, stop and ask the owner before adding any other tool, such as ffmpeg (ADR 0012).
   - Search Freesound with the CC0 filter. Write two or three candidates per moment, with their URLs, in `assets/audio/STATUS.md`.
   - Claude gives the owner a shortlist of CC0 Freesound links, two or three per moment. The owner listens, picks one per moment and downloads the originals into `assets/audio/source/`, since Freesound needs a sign-in. The owner chose this on 2026-10-11 ("3. A").
   - Fill `assets/audio/sounds.json`, encode with `npm run audio` (new script in `package.json`, `tools/pipeline/audio.mjs`), and commit the ten `.ogg` files with `game/public/audio/LICENCE.md`.
   - Add `assets/audio/source/` to `.gitignore`.
   - Aim for well under the budget: about 60 KB in all, with the engine start the longest at about 2.5 s.
4. **Budget check.** Add `audioBytes` to `tools/pipeline/budgets.json`. Add `checkAudio` to `tools/pipeline/check.ts`, run by `npm run audio`. Tests in `game/tests/pipeline.test.ts`:
   - the shipped folder passes;
   - made-up byte arrays fail for each rule: stereo, not Opus, over budget, missing licence row, non-CC0 licence, extra file, missing moment.
5. **Moments from `render`.** In `game/src/render/view.ts`, add `onMoment(fn)` to `RenderView`. The `Moment` type is imported from `app/moments.ts`, which re-exports it, so `render` never imports `platform`.
   - `fastenerSteps` and the fastener steps in `animateInstall` report `turn` at each whole turn.
   - The freeing step in `loosen` reports the part's give moment as it starts.
   - The `unscrew` freeing and its reverse in `animateInstall` report `turn` per whole turn.
   - `animateInstall` reports `seat` when the motion in reverse ends.
   - `loosen` on a part that cannot come off returns before any of this, as now.

   `game/src/render/motion.ts` gains `turnsCrossed(turns, from, to)`. Tests in `game/tests/render.test.ts`: two turns give two clicks over a whole fastener step, none are counted twice across frames, and the reverse counts the same.
6. **Wiring in `main.ts`.**
   - Create the audio with the stored mute state.
   - Add the unlock listeners.
   - On the first `started`, fetch the files with `import.meta.env.BASE_URL` and load them.
   - Pass `view.onMoment((m) => playMoment(audio, m))`.
   - Pass `sound: { muted, setMuted }` to `mountUi`; `setMuted` sets the audio and stores the choice.
   - In development only, expose `window.__openAmDevAudio` with a log of moments asked for and whether each was audible, and the context state.
7. **Mute button.** In `game/src/ui/index.ts`, add the button to `hud`, built in `game/src/ui/dom.ts` as an inline SVG speaker with and without a slash. Its labels go in `game/src/ui/strings.ts` (`soundOn: "Sound on"`, `soundOff: "Sound off"`) and its style in `game/src/ui/styles.css`. `UiOptions` gains `sound`. Without it, there is no button. Tests in `game/tests/ui.test.ts` for the pure part: the label and pressed state for each mute value.
8. **Browser check.** `tools/verify/phone-play.ts`:
   - Records `navigator.vibrate` calls through `Page.addScriptToEvaluateOnNewDocument`.
   - Before Start: no request under `/audio/` (resource timing), and the context is not running.
   - After Start: ten files fetched, at most 250 KB transferred, all decoded, and the context running.
   - Double tapping a part that cannot come off yet logs no moment and no vibration.
   - Loosening `alternator_cover` logs 8 `turn` and one `give-unbolt`, and vibrates once for 15 ms.
   - Loosening `spark_plug` logs `turn` and no give.
   - Dropping on the tray logs `land`. Putting back logs `seat`, vibrates 15 ms, and logs the fasteners' turns.
   - A failed pull logs `cord` then `fail`, and vibrates 40 ms.
   - The winning pull logs `cord` then `start`, and vibrates under 300 ms in all.
   - Muting, then reloading, keeps the button muted. While muted, every moment is logged as not audible and nothing vibrates.
   - All six faults still solve, the forced walk-out is silent, there are no console errors, and the game holds at least 30 fps at 4x CPU throttle.
9. **Notes.**
   - `docs/design/animation.md` gains when each moment fires.
   - `docs/design/interface.md` gains the mute button.
   - `docs/open-questions.md`: the sound line names the stand-in files, and a new line notes Safari's Opus support.
   - `AGENTS.md`'s command table gains `npm run audio`.
   - Write the release note `docs/releases/0.12.0.md` and republish the phone preview.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build` and `npm run size` pass. `npm run audio` encodes and checks the ten files within 250 KB.
- `npm run verify:phone` passes as in step 8.
- `game/public/audio/LICENCE.md` lists every shipped file with its Freesound URL, author and `CC0 1.0`, and has no other licence in it. `assets/audio/STATUS.md` marks every sound as a stand-in until the owner records the real machine.
- No new entry in `package.json` dependencies or devDependencies.
- The owner plays a round on an Android phone with sound on and checks:
  - they hear and feel each moment;
  - a blocked part is silent;
  - mute holds after a reload;
  - nothing plays before Start.

## Depends on

Plan 0011 merged into `main`. The turn and give moments hook into its fastener sequence (`fastenerSteps`, the freeing step and the put-back in `render/view.ts`), which is not on `main` yet. Plan 0012 (the toolbox) is not needed. If it merges first, the hooks stay on the same fastener steps and only the trip around them changes.

## Unclear in ADR 0018 (for the owner)

- Settled on 2026-10-11: CC0 only ("4. A"); the owner downloads from Claude's shortlist ("3. A"); loading after Start is covered by ADR 0023 (proposed).
- **The storage fallbacks.** ADR 0018 says "the same storage fallbacks as the best scores", but the best scores are not built yet. This plan writes the helper they will share.
- **Readings that would each be a one-line answer from the owner:**
  - the walk-out is now silent, where today it plays `fail`;
  - `unscrew` parts give no give sound;
  - `land` is one clunk for every part;
  - fasteners click going in as well as coming out.

## Release note line

Added: sound and vibration. Fasteners click as they turn, parts crack, snap, pop or scrape as they give, clunk into the tray and click home. The cord, a failed start and the engine start each have a sound. A mute button turns both off and is remembered. Sounds are CC0 stand-ins until the real machine is recorded, each listed in `game/public/audio/LICENCE.md` (plan 0013, ADR 0018). Version 0.12.0.
