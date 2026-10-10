# Architecture

Status: draft for discussion, 2026-10-10. When agreed, the parts that are decisions go into ADR 0002 (stack) and a new ADR for the module layout.

## Why TypeScript in the browser

The constraints decide the language: low-end Android, mobile browser, expensive data, no install, no login. That rules out everything that ships an engine runtime.

| Option | Bundle on first load | Verdict |
| --- | --- | --- |
| Unity WebGL export | 10 to 30 MB of wasm and data | Too heavy; poor on low-end mobile GPUs. |
| Godot 4 web export | 20 MB or more, needs SharedArrayBuffer headers | Same problem, plus hosting constraints. |
| Rust or C++ to WebAssembly with a custom renderer | Small possible, but months of engine work | Wrong trade for a one-machine game. |
| Babylon.js | About 1 MB gzipped minimum | Three to five times the JavaScript budget. |
| PlayCanvas | Around 300 KB, editor is proprietary and hosted | Workable, but locks the pipeline to their editor. |
| **TypeScript + Three.js, tree-shaken** | 120 to 180 KB gzipped for what this game uses | Fits the 350 KB budget with room. Largest ecosystem, every agent knows it. |

So the choice in ADR 0002 stands on the merits. The rest of this note is how the code is shaped so that the choice does not leak everywhere.

## Layers

Six layers, each importing only from the layers below it. Arrows in the diagram point in the direction of imports.

```
platform  ─┐
ui        ─┼─▶ app ─▶ core ─▶ (nothing)
render    ─┘            ▲
data (machine folder) ──┘ loaded as JSON and validated
```

1. **data** `game/public/machines/<id>/`. `machine.json`, `faults.json`, `model.glb`. Pure content, fetched at runtime, validated by core before use. Adding a machine is adding a folder (ADR 0003).
2. **core** `game/src/core/`. Pure TypeScript. Types, the validator, the reducer, replay, scoring, the daily seed, and the constants file. Imports nothing from Three.js or the DOM; a test asserts it. A server can run it unchanged to re-score a log (ADR 0004).
3. **app** `game/src/app/`. The one place that holds a running round. It owns the timer, appends to the action log, calls the reducer, and emits events: `removed`, `installed`, `refused`, `fixed`, `pulled`, `ended`. It does not know how anything looks. It also chooses the fault for free play or asks `DailyProvider` for the daily.
4. **render** `game/src/render/`. Three.js. Builds the scene from the machine data: placeholders, or the GLB when present. Owns picking, the camera rig, the animation system (motion vocabulary from ADR 0008, the tween and sequence utility), and the material swap for highlight and shell rendering. Listens to app events; sends taps to app as proposed actions.
5. **ui** `game/src/ui/`. Plain DOM and CSS. Screens: briefing, working, result. Widgets: timer, tray, inspect card as a bottom sheet, pull-cord button, share. All text from `strings.ts` or the data. Listens to app events; sends taps on tray chips and buttons to app.
6. **platform** `game/src/platform/`. Adapters behind interfaces: `ScoreStore` (local storage with memory fallback), `DailyProvider` (local clock and hash), `share` (Web Share API or clipboard), `audio` (no-op when files are missing).

**diagnostic** `game/src/diagnostic/` sits beside ui and render, imports from app, and is included only when the build flag is set (ADR 0007). Production builds contain none of it.

## Flow of one tap on the machine

1. render raycasts on pointer-up, walks up to the part node, and calls `app.propose({ type: "remove", partId })`.
2. app timestamps it, calls `core.apply(state, action)`.
3. core returns the next state, or a refusal with a reason.
4. On success, app appends the action to the log and emits `removed`. render plays the part's motion then drifts it to the tray. ui adds a tray chip.
5. On refusal, app emits `refused` with the reason. In player mode render plays only the uniform press acknowledgement. In diagnostic mode the overlay shows the reason.

Nothing in render or ui decides whether an action is allowed. Only core does.

## Flow of the asset pipeline (offline)

Blender `.blend` → `tools/blender/export.py` → raw GLB → `tools/pipeline/optimise` (glTF Transform) → `tools/pipeline/check` (names match `machine.json`, within budget) → copied to `game/public/machines/gen950/model.glb`. The game reads the GLB if present and falls back to placeholders if not. No code change between the two.

## Build output

Vite produces one HTML file, one hashed JavaScript bundle with Three.js tree-shaken in, one CSS file, and the machine folder as static files. Everything is cacheable by a CDN. The game makes no request to any other host.

## Module boundaries agents must keep

- `core` imports nothing outside `core`.
- `app` imports only `core` and the platform interfaces (not implementations).
- `render` and `ui` import `app` and `core` types. They never import each other.
- `platform` implementations are injected into `app` at startup in `main.ts`.
- `diagnostic` is imported only inside a build-flag guard in `main.ts`.

A lint rule or a test enforces each of these.

## Open design questions

- Should `app` be a small event emitter written in the project, or should render and ui poll a state snapshot each frame? Proposal: an emitter, because animations need to start at the moment of the event.
- Does the inspect card belong to ui alone, or does render show the part enlarged behind it? Proposal: ui alone for the first version; a rendered close-up is a later ADR.
