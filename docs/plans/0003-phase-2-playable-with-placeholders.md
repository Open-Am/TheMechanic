---
id: 0003
title: Phase 2, playable with placeholders
status: done
date: 2026-10-10
adrs: [0001, 0002, 0003, 0004, 0007, 0008, 0010, 0011, 0014]
branch: plan/0003-phase-2-playable
---

# 0003. Phase 2, playable with placeholders

## Goal

A full round of `gen950` is playable in a portrait phone browser over the local network, using placeholder shapes from `machine.json`: briefing, take parts off, inspect in place and in the tray, fix, put back, pull the cord, result screen. All six faults can be solved, there are no console errors, and the JavaScript bundle is within budget. No GLB loading (Phase 3), no daily, best scores or share (Phase 4).

## ADRs relied on

- **0001 Scope.** One machine, six faults, free play only in this phase.
- **0002 Stack.** Vite, strict TypeScript, Three.js, plain DOM and CSS. Adds `three` and `@types/three`, both approved for Phase 2. Tweens, emitter and storage fallbacks written in the project. Plain message when WebGL fails.
- **0003 Data.** Placeholders built from each part's `placeholder`; base pieces never come off. Symptom text from the strings file.
- **0004 Rules.** The reducer decides; `ui` and `render` only propose. Refused actions are not logged.
- **0014 Budgets.** 350 KB gzipped JavaScript, DPR capped at 2, 30 fps at 4x CPU throttle. This plan was approved under ADR 0006, which ADR 0014 superseded on 2026-10-10 with the same budgets. Phase 2 keeps one hemisphere and one directional light, the rig ADR 0014 keeps as its fallback; the image-based lighting arrives in a later plan.
- **0007 Modes.** No visible response to a blocked tap beyond the same press acknowledgement every tap gets. Diagnostic overlay behind a build-time flag, enabled in development with `?diag`.
- **0008 Motion.** Each part's `motion` drives its removal; install plays it in reverse; defaults in one render file; unknown types fall back to `slide`.
- **0010 Layers.** `app` owns the round and emits events; `render` and `ui` never import each other; condition text only through `app.conditionOf`.
- **0011 Inspect in place.** A visible installed part can be inspected where it sits.

ADR 0005 (daily) is not used in this phase. ADR 0012 is not relied on; nothing here depends on the Node or Blender pins.

## Gestures: the owner's choice

ADR 0011 leaves the gesture to `docs/design/interface.md`. The plan first offered two options; on 2026-10-10 the owner chose a third, writing "Let the user pull to remove. To look is normal view of the part on the UI. Not a separate action." Asked to narrow it down, the owner chose:

- **Pull along the path to remove.** A drag that starts on an installed part and moves roughly along that part's removal direction (its `explode`, projected to the screen) takes it off. Any other drag rotates the camera. A blocked part does not move; the only response is the press acknowledgement every touch gets (ADR 0007, read with "pull" for "tap").
- **Looking is just looking.** On the machine there is no inspect action and no text. The player looks at the part itself. With placeholders that shows nothing about its condition; real models in Phase 3 can. The in-place `inspect` rule from ADR 0011 stays in `core` and is unused by this interface. ADR 0011 says the card "can" open in place, so this does not contradict it.
- **Condition text only in the tray.** Tapping a tray chip opens the card: name, what it does, condition, and "Fix" for the unfixed culprit. Opening it proposes `inspect`.
- **Drag the chip back to put a part on.** Dragging a chip from the tray and releasing it over the machine proposes `install`. If refused, the chip returns to the tray with no other response.

## Simpler readings chosen

Where the brief or ADRs leave a gap, this plan takes the simpler reading.

1. **Path tolerance.** A drag counts as a pull when it has moved 40 CSS px and its direction is within 45 degrees of the part's projected removal direction. When that projection is shorter than a third of its true length (the part comes straight at the camera), any direction counts, so a part facing the player can still be pulled.
2. **Fix.** The fix takes 2 s on the running clock. The card stays open with its buttons disabled; the `fix` action is logged when the 2 s end.
3. **Failed pull.** The symptom text shows again in a short banner. The round continues.
4. **Result.** Score, its breakdown, stars, and "Next customer" (a new random fault). No share button: the share format is the daily's and arrives in Phase 4.
5. **Fault choice.** `app` picks uniformly at random from an injected random function, never the same fault twice in a row.
6. **Hit volumes.** Each part gets an invisible box at least as large as 44 CSS px at the default camera distance. Movement under 8 CSS px is a tap: on a part it gives the press acknowledgement and nothing else.
7. **Orbit.** Written in the project: rotate on a one-finger drag that is not a pull, pinch to zoom, with distance and polar limits so the machine stays in frame. `OrbitControls` from `three` cannot hand a drag to the pull gesture once it has started, so it is not used.
8. **Platform.** Only `Clock` and `Audio` get local implementations now. `Audio.play` does nothing when the file is missing, and no audio ships.
9. **Diagnostic.** Imported dynamically in `main.ts` inside `if (import.meta.env.DEV && new URLSearchParams(location.search).has("diag"))`, so Vite drops it from production builds.
10. **Boundary test.** ADR 0010 gives `render` the Three.js scene, but the test treats any package import as a layer and would reject `three`. The test gains a per-layer package list: `render` may import `three`; no other layer may import any package. This tightens the test for every other layer; it weakens nothing.
11. **Budget check.** A script `tools/build/size.mjs` gzips the built JavaScript and fails over 350 KB. Run as `npm run size` after `npm run build`. It checks the build; it does not change it.

## Exploration summary

Done by a Haiku subagent on 2026-10-10. `game/src/main.ts` is empty; `platform/interfaces.ts` defines `ScoreStore`, `DailyProvider`, `Share`, `Audio` and `Clock` with no implementations; `three` is not installed; `vite.config.ts` already serves on the local network. Vitest runs in Node, so DOM and WebGL behaviour is checked by the done steps, not unit tests (no jsdom; it is not approved). The design notes `interface.md`, `animation.md` and `diagnostic-mode.md`, listed in `docs/design/README.md` as planned before Phase 2, do not exist. Brief section 6 and 8 text on shake, tint and hint is superseded by ADR 0007.

## Steps

1. **Design notes.** Write `docs/design/interface.md` (layout, colour tokens, system fonts, the card, tray chips, timer, the gestures above), `docs/design/animation.md` (motion defaults, sequencing, easing, camera, timing targets) and `docs/design/diagnostic-mode.md`.
2. **Dependencies and boundary test.** Add `three` and `@types/three`. Extend `game/tests/boundaries.test.ts` with the per-layer package list, plus a test that `ui`, `app`, `platform` and `diagnostic` cannot import `three`.
3. **app.** `game/src/app/`: `emitter.ts`, `round.ts` (the round controller: `propose`, the timer from `Clock`, the action log, `conditionOf`, events from ADR 0010) and `faults.ts` (random choice without repeats). Tests in `game/tests/app.test.ts`: every event fires once per accepted action, refusals emit `refused` and log nothing, the log replays to the same score, `conditionOf` matches `conditionText`, no fault repeats.
4. **platform.** Move the interfaces to `platform/interfaces/` as ADR 0010 shows, and add `platform/local/clock.ts` and `audio.ts`. Tests for the audio fallback.
5. **render.** `game/src/render/`: `scene.ts` (renderer, DPR cap, two lights), `placeholders.ts` (boxes and cylinders from data, hit volumes), `camera.ts` (orbit limits), `picking.ts` (walk up to a part ID), `gesture.ts` (tap, pull along the path, or rotate), `tween.ts` and `motion.ts` (the defaults file, the six types, reverse for install), and the press acknowledgement. Tests in `game/tests/render.test.ts` for the pure parts: tween easing and timing, motion defaults, the unknown-type fallback, the pull classifier (direction, tolerance, the head-on fallback).
6. **ui.** `game/src/ui/`: `strings.ts`, `briefing.ts`, `hud.ts` (timer, pull cord), `tray.ts` (chips, drag a chip back onto the machine), `card.ts` (tray only: name, does, condition, fix with its 2 s), `result.ts`, and one stylesheet. Tests in `game/tests/ui.test.ts` for the pure helpers: time and score formatting, star text, every symptom has a string.
7. **main.ts.** Load and validate the machine folder, pick a fault, construct platform and `app`, mount `render` and `ui`, show a plain message if WebGL is missing or the data is invalid.
8. **diagnostic.** `game/src/diagnostic/overlay.ts`: the last refusal reason, removable parts, fault and culprit, the live log, frame rate. Development builds only.
9. **Budget script.** `tools/build/size.mjs` and the root `size` script.
10. **Release note.** `docs/releases/0.2.0.md`.
11. **Part images in the tray.** Added on 2026-10-10 after the owner tried the phone build: "Lets try to keep the image of the part in the tray too". Each tray chip shows a small rendered picture of its part beside the name. `render` draws each part alone into a small offscreen target once and caches it; `main.ts` hands that function to `ui`, so `ui` still never imports `render` (ADR 0010). The same code will picture the real models in Phase 3.

## Done when

- `npm test`, `npm run typecheck` and `npm run docs:check` pass, and the boundary test still covers every layer.
- `npm run build` succeeds and `npm run size` reports under 350 KB gzipped.
- In Chromium with a portrait phone viewport, an agent plays all six faults to the engine starting, with no console errors, and saves a screenshot of the briefing, the working screen, an open tray card and the result screen. Pulls are driven by synthetic pointer events along each part's path.
- A production build contains no diagnostic code (search the built JavaScript for the overlay's marker string).
- The frame rate holds 30 fps at 4x CPU throttle in Chromium devtools. Reported as measured, or as not measured if the tool is unavailable.
- The owner opens the dev server from a real phone on the local network and plays a round. This is the owner's check; the agent reports it as pending until the owner confirms.

## Release note line

Added: the game is playable in a phone browser with placeholder shapes: briefing, take parts off, inspect, fix, put back, pull the cord, and a scored result (plan 0003).
