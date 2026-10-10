# Open Am: build brief for Claude Code

"Open Am" is a working title. Rename freely; nothing depends on it.

**How to use this file.** Put it in the root of an empty folder, start Claude Code there, and say: *"Read open-am-build-brief.md and start Phase 1. Stop at the end of each phase."*

Everything below is addressed to you, Claude Code.

---

## 1. What we are building

A browser game where the player is a roadside generator mechanic in Lagos. A customer brings a small petrol generator with one fault. The player opens the machine part by part, inspects parts to find the bad one, fixes it, puts everything back, and pulls the cord. The score is time, plus penalties for pulling parts that did not need to come off.

The pleasure is taking a real machine apart and seeing what each part does. Understanding the machine is how you win; nothing is labelled as a lesson.

**Players and their constraints.** Nigerian players on low-end Android phones, in a mobile browser, on expensive data. Portrait orientation, touch first. No install, no login.

**The test for the first version.** Someone plays it twice without being asked.

## 2. Scope

### In the first version

- One machine: a 950-type two-stroke generator (`gen950`), 12 removable parts.
- Six faults, one bad part each.
- Free play (random fault) and a daily fault (same for everyone that day).
- Local best scores and a shareable text result.
- Placeholder geometry first, then real models loaded from a GLB file with no code change.

### Not in the first version. Do not build these.

- Accounts, backend, leaderboards.
- Community-submitted faults or machines, and moderation.
- Money, shop upgrades, tools, customer haggling.
- More machines, a learn mode, multiplayer.

### What "designed as a project" means here

Only these five seams. Build them; build nothing else for the future.

1. **Machines are data.** A machine is a folder holding `machine.json`, `faults.json` and `model.glb`. Adding a machine must not need new code.
2. **Core logic is pure.** `game/src/core` imports no Three.js and no DOM. A server can reuse it later to check scores.
3. **A round is an action log.** Record every player action with a timestamp. The score is a pure function of the log. This is what makes leaderboards and replays possible later.
4. **Storage and the daily fault sit behind interfaces** (`ScoreStore`, `DailyProvider`) with local implementations now.
5. **Player-facing text lives in data or in one strings file**, never inline in logic, so the wording can be rewritten without touching code.

## 3. Stack

- **Game:** Vite, TypeScript (strict), Three.js. Plain DOM and CSS for the interface; no UI framework.
- **Tests:** Vitest, for `core` only.
- **Assets:** Blender for modelling, the glTF Transform CLI for optimisation.
- **Deploy:** a static build that runs from any CDN.

Ask before adding any other runtime dependency.

## 4. Repository layout

```
open-am-build-brief.md
CLAUDE.md                  conventions; you create and maintain it
game/
  src/
    core/                  pure logic: types, rules, state, scoring, daily seed
    render/                Three.js: scene, loading, picking, animation
    ui/                    DOM: screens, tray, inspect card, share, strings.ts
    platform/              ScoreStore, DailyProvider (local implementations)
  public/machines/gen950/  machine.json, faults.json, model.glb (once it exists)
  tests/
assets/gen950/
  reference/               photos for modelling; never shipped
  blend/                   .blend sources
  export/                  raw GLB out of Blender
  STATUS.md                art status per part
tools/
  blender/                 Python scripts run inside Blender
  pipeline/                Node scripts: optimise and check the GLB
docs/
  decisions.md             one line per decision, with the reason
  open-questions.md        anything unverified or unclear
```

## 5. Data contracts

These two files are the contract between the game, the artists and, later, community contributors. Do not change a field name or an ID without asking.

Units are metres. Axes: X is the machine's length, Y is up, Z is its width, and the front (control panel side) faces +Z. The origin is the centre of the base at ground level. The real machine is about 0.367 long, 0.375 high and 0.312 wide.

### 5.1 `machine.json`

`requires` lists the parts that must be off before this part can come off. `inspectOk` is what the player reads when a healthy part is inspected. `placeholder` describes stand-in geometry: `size` is its bounding box and `position` its centre, and `axis` is the axis a cylinder runs along. `explode` is the direction and distance the part travels when removed. `base` is fixed geometry that never comes off.

Placeholder positions are rough stand-ins, checked only so that nothing intersects. The one intended exception is `alternator_cover`, which encloses `capacitor`; render the cover as a shell or slightly transparent so the capacitor is not visible through a gap before the cover comes off.

```json
{
  "id": "gen950",
  "name": "950 generator",
  "schema": 1,
  "verified": false,
  "size": [0.367, 0.375, 0.312],
  "base": [
    { "id": "base_frame", "placeholder": { "shape": "box", "size": [0.36, 0.02, 0.30], "position": [0, 0.01, 0], "color": "#2b2b2b" } },
    { "id": "base_engine", "placeholder": { "shape": "box", "size": [0.16, 0.18, 0.16], "position": [-0.08, 0.12, 0], "color": "#8a8f94" } },
    { "id": "base_alternator", "placeholder": { "shape": "box", "size": [0.09, 0.16, 0.16], "position": [0.045, 0.11, 0], "color": "#6f7479" } },
    { "id": "base_panel", "placeholder": { "shape": "box", "size": [0.12, 0.08, 0.01], "position": [0.10, 0.15, 0.145], "color": "#1f1f1f" } }
  ],
  "parts": [
    {
      "id": "fuel_hose",
      "name": "Fuel hose",
      "does": "Carries fuel from the tap to the carburetor.",
      "requires": [],
      "inspectOk": "No cracks. Not blocked.",
      "placeholder": { "shape": "cylinder", "axis": "y", "size": [0.012, 0.07, 0.012], "position": [-0.02, 0.17, 0.13], "color": "#111111" },
      "explode": [0, 0, 0.10]
    },
    {
      "id": "fuel_tap",
      "name": "Fuel tap",
      "does": "Turns the fuel on and off. Its strainer catches dirt.",
      "requires": ["fuel_hose"],
      "inspectOk": "Strainer is clean. Fuel runs freely.",
      "placeholder": { "shape": "box", "size": [0.03, 0.04, 0.03], "position": [-0.02, 0.225, 0.13], "color": "#b08d57" },
      "explode": [0, 0, 0.10]
    },
    {
      "id": "fuel_tank",
      "name": "Fuel tank",
      "does": "Holds the petrol and oil mix.",
      "requires": ["fuel_tap"],
      "inspectOk": "Clean inside. Fuel smells fresh.",
      "placeholder": { "shape": "box", "size": [0.34, 0.10, 0.28], "position": [0, 0.30, 0], "color": "#c0392b" },
      "explode": [0, 0.15, 0]
    },
    {
      "id": "air_filter_cover",
      "name": "Air filter cover",
      "does": "Holds the air filter in place.",
      "requires": [],
      "inspectOk": "Not cracked. Clips are fine.",
      "placeholder": { "shape": "box", "size": [0.09, 0.09, 0.012], "position": [-0.08, 0.14, 0.146], "color": "#222222" },
      "explode": [0, 0, 0.12]
    },
    {
      "id": "air_filter",
      "name": "Air filter",
      "does": "Keeps dust out of the engine.",
      "requires": ["air_filter_cover"],
      "inspectOk": "A little dusty. Air passes easily.",
      "placeholder": { "shape": "box", "size": [0.08, 0.08, 0.02], "position": [-0.08, 0.14, 0.13], "color": "#d9c27a" },
      "explode": [0, 0, 0.12]
    },
    {
      "id": "carburetor",
      "name": "Carburetor",
      "does": "Mixes fuel with air in the right amount.",
      "requires": ["air_filter", "fuel_hose"],
      "inspectOk": "Bowl is clean. Jet is clear.",
      "placeholder": { "shape": "box", "size": [0.05, 0.05, 0.04], "position": [-0.08, 0.14, 0.10], "color": "#a9adb1" },
      "explode": [0, 0, 0.12]
    },
    {
      "id": "plug_cap",
      "name": "Spark plug cap",
      "does": "Carries the high voltage to the spark plug.",
      "requires": [],
      "inspectOk": "Fits tightly. No cracks.",
      "placeholder": { "shape": "box", "size": [0.025, 0.025, 0.03], "position": [-0.08, 0.16, -0.135], "color": "#111111" },
      "explode": [0, 0, -0.10]
    },
    {
      "id": "spark_plug",
      "name": "Spark plug",
      "does": "Makes the spark that lights the fuel.",
      "requires": ["plug_cap"],
      "inspectOk": "Tip is light brown. Healthy.",
      "placeholder": { "shape": "cylinder", "axis": "z", "size": [0.02, 0.02, 0.04], "position": [-0.08, 0.16, -0.10], "color": "#e8e8e8" },
      "explode": [0, 0, -0.10]
    },
    {
      "id": "recoil_starter",
      "name": "Recoil starter",
      "does": "The pull cord that spins the engine to start it.",
      "requires": [],
      "inspectOk": "Rope is sound. Spring pulls it back.",
      "placeholder": { "shape": "cylinder", "axis": "x", "size": [0.02, 0.14, 0.14], "position": [-0.17, 0.12, 0], "color": "#2b2b2b" },
      "explode": [-0.12, 0, 0]
    },
    {
      "id": "muffler",
      "name": "Muffler",
      "does": "Quiets the exhaust and lets the smoke out.",
      "requires": [],
      "inspectOk": "A thin layer of soot. Gas passes freely.",
      "placeholder": { "shape": "box", "size": [0.10, 0.07, 0.05], "position": [-0.02, 0.09, -0.115], "color": "#5a5a5a" },
      "explode": [0, 0, -0.12]
    },
    {
      "id": "alternator_cover",
      "name": "Alternator end cover",
      "does": "Protects the electrical end of the generator.",
      "requires": [],
      "inspectOk": "Not cracked. Vents are clear.",
      "placeholder": { "shape": "box", "size": [0.05, 0.16, 0.16], "position": [0.115, 0.11, 0], "color": "#2b2b2b" },
      "explode": [0.12, 0, 0]
    },
    {
      "id": "capacitor",
      "name": "Capacitor",
      "does": "Starts the generator's voltage and keeps it steady.",
      "requires": ["alternator_cover"],
      "inspectOk": "Case is flat and clean. Holding charge.",
      "placeholder": { "shape": "box", "size": [0.03, 0.05, 0.03], "position": [0.105, 0.11, 0.03], "color": "#f2f2f2" },
      "explode": [0.10, 0, 0]
    }
  ]
}
```

### 5.2 `faults.json`

Each fault has exactly one `culprit`. `symptom` is one of four values and several faults share a symptom on purpose, so the symptom narrows the search without giving the answer. `inspectBad` replaces the culprit's `inspectOk` until it is fixed. `author` and `verified` exist now so community faults can use the same format later.

```json
{
  "machine": "gen950",
  "schema": 1,
  "faults": [
    {
      "id": "fouled_plug",
      "complaint": "E no gree start at all.",
      "symptom": "no_start",
      "culprit": "spark_plug",
      "inspectBad": "Tip is black and oily. No spark can jump.",
      "fix": "Clean the plug",
      "author": "core",
      "verified": false
    },
    {
      "id": "clogged_jet",
      "complaint": "E go start, then e go off.",
      "symptom": "starts_then_dies",
      "culprit": "carburetor",
      "inspectBad": "Sticky gum in the bowl. The jet is blocked.",
      "fix": "Clean the bowl and jet",
      "author": "core",
      "verified": false
    },
    {
      "id": "blocked_fuel_tap",
      "complaint": "E work small, then e quench like say fuel finish.",
      "symptom": "starts_then_dies",
      "culprit": "fuel_tap",
      "inspectBad": "Strainer is packed with dirt. Fuel only drips.",
      "fix": "Clean the strainer",
      "author": "core",
      "verified": false
    },
    {
      "id": "dead_capacitor",
      "complaint": "Gen dey work but light no dey come.",
      "symptom": "runs_no_output",
      "culprit": "capacitor",
      "inspectBad": "Case is swollen. It holds no charge.",
      "fix": "Fit a new capacitor",
      "author": "core",
      "verified": false
    },
    {
      "id": "choked_muffler",
      "complaint": "E no get power again; small load dey quench am.",
      "symptom": "runs_weak",
      "culprit": "muffler",
      "inspectBad": "Outlet is caked with hard carbon.",
      "fix": "Clear the carbon",
      "author": "core",
      "verified": false
    },
    {
      "id": "dirty_air_filter",
      "complaint": "E dey smoke well well, e dey drink fuel.",
      "symptom": "runs_weak",
      "culprit": "air_filter",
      "inspectBad": "Clogged with dust and oil. Air can barely pass.",
      "fix": "Wash the filter",
      "author": "core",
      "verified": false
    }
  ]
}
```

Symptom text, kept in `ui/strings.ts`:

| Symptom | What the player reads when the cord is pulled |
| --- | --- |
| `no_start` | You pull the cord. Nothing. Not even a cough. |
| `starts_then_dies` | It fires, runs a few seconds, then dies. |
| `runs_no_output` | The engine runs sweetly. The bulb stays dark. |
| `runs_weak` | It runs, but it smokes and struggles under load. |

### 5.3 Validation

Write a validator in `core` and run it at load and in tests. It must reject: duplicate IDs, a `requires` entry that names no part, a cycle in `requires`, a fault whose `culprit` names no part, and an unknown `symptom`.

### 5.4 The content is a draft

The parts, the removal order and the faults come from online sources and general knowledge of small two-stroke engines. A mechanic has not checked them, which is why `verified` is false. Do not "correct" the content from your own knowledge. If something looks wrong, add it to `docs/open-questions.md` and carry on.

## 6. Rules of a round

1. **Briefing.** Show the customer's `complaint` and the symptom text. The model loads behind this screen.
2. **Working.** The timer starts when the player dismisses the briefing.
   - **Remove.** Tapping an installed part removes it if every part in its `requires` is already off. It moves along `explode`, then into the tray. Otherwise it shakes and a hint names one part that must come off first.
   - **Inspect.** Tapping a part in the tray opens a card: `name`, `does`, and its condition. The condition is `inspectOk`, or the fault's `inspectBad` if this part is the unfixed culprit.
   - **Fix.** The card for the unfixed culprit has a button labelled with the fault's `fix`. Fixing takes about two seconds.
   - **Put back.** A part in the tray can go back only when every part that lists it in `requires` is already back on.
3. **Test.** "Pull cord" is enabled only when every part is installed. If the culprit is fixed, the engine starts and the round ends. If not, the symptom text shows again, a failed pull is recorded, and the round continues.
4. **Result.** Score, stars, and a share button.

### Scoring

Lower is better. Keep every constant in one file.

- `necessary` = the culprit plus everything in its `requires`, transitively.
- `wrongParts` = distinct parts removed that are not in `necessary`.
- `score = elapsedSeconds + 10 × wrongParts + 15 × failedPulls`
- Stars: 3 at 45 or under, 2 at 90 or under, otherwise 1. These thresholds are guesses; expect to tune them.

### Action log

Record each action as `{ t, type, partId? }`, where `t` is milliseconds since the timer started and `type` is `remove`, `inspect`, `fix`, `install` or `pull`. The round's state and score must be reproducible from the log alone. Test this.

## 7. Daily fault

- The day number counts days since a `DAILY_EPOCH` constant, using Lagos time (UTC+1, no daylight saving).
- The day's fault comes from a seeded hash of the day number, and never repeats the previous day's.
- One scored attempt per day. After that the daily can be replayed, unscored.
- Share text, sent through the Web Share API where it exists and the clipboard otherwise:

```
Open Am · Day 12
Fixed in 38s · 1 wrong part · ★★★
<url>
```

With six faults the daily repeats within a week. That is acceptable for testing the loop; do not add machinery to hide it.

Browser storage can fail or come back empty. Wrap every read and write in try/catch and fall back to memory.

## 8. Rendering and interface

- **Scene.** One hemisphere light and one directional light. No real-time shadows.
- **Camera.** Orbit with limits: drag to rotate, pinch to zoom. The machine never leaves the frame.
- **Picking.** Raycast on pointer-up, only if the pointer did not drag. Walk up from the hit mesh to the first node whose name is a part ID.
- **Small parts.** The spark plug and fuel tap are tiny on a phone. Give every part an invisible hit volume large enough for a 44-pixel finger target at default zoom.
- **Feedback.** A removable part responds within 100 ms. A blocked tap shakes the part and tints it briefly.
- **Layout.** Portrait first. Timer at the top, the machine in the middle, the parts tray along the bottom, "Pull cord" above the tray.
- **Sound.** Provide `audio.play('remove' | 'fail' | 'start')` hooks that do nothing if the files are missing. Ship no audio; the owner will record a real generator.

### Model contract

The game loads `model.glb` if it exists and falls back to placeholders if it does not.

- One node per part, named exactly the part ID. Fixed geometry sits under nodes whose names start with `base_`. Anything else is ignored.
- Real-world scale in metres, Y up, origin as described in section 5.
- Each part node's own origin is at the centre of its geometry.
- If the GLB lacks a node for a part, build that one part's placeholder and log a warning.

### Budgets

These are targets to hold, not measurements.

| Item | Budget |
| --- | --- |
| JavaScript, gzipped | 350 KB |
| `model.glb` per machine | 5 MB, aiming for 3 MB |
| Triangles per machine | 60,000 |
| Textures | 1024 px, one 2048 px atlas at most |
| Frame rate | 30 fps with 4× CPU throttling in Chrome DevTools |
| Device pixel ratio | Capped at 2 |

## 9. Blender asset pipeline

The goal is realistic parts. Be honest about what you can and cannot do here.

**What you can do:** set up the scene, block out every part at real scale, build hard-surface shapes from primitives (cylinders, tubes, bolts, cooling fins), name and organise objects, export, validate and optimise.

**What you cannot do:** produce photoreal surfaces from scripted geometry. Realism comes from reference photos, hand modelling and texture work by a person. Never describe a blocked-out part as finished. Track each part in `assets/gen950/STATUS.md` as one of: `placeholder`, `blocked`, `modelled`, `textured`, `approved`. Only the owner sets `approved`.

### How to drive Blender

- If a Blender MCP server is connected in this session, use it for scene work and viewport screenshots, and look at the screenshots before reporting progress.
- Otherwise run Blender headless: `blender --background --python tools/blender/<script>.py -- <args>`.
- If Blender is not installed, stop and say so.
- Check operator names and export options against the installed Blender version before relying on them.

For the owner: the official Blender MCP server is documented at blender.org/lab/mcp-server.

### Scene conventions

- Metric units, scale 1.0, transforms applied.
- One object per part, named exactly the part ID; `base_` objects for fixed geometry.
- Collections: `parts`, `base`, `reference`. Nothing in `reference` is exported.
- Principled BSDF materials, baked to base colour, normal, and a packed occlusion-roughness-metallic texture.
- Model at medium detail. Carry bevels and small detail in normal maps.

### Scripts

| Script | Job |
| --- | --- |
| `tools/blender/scaffold.py` | Build the scene from `machine.json`: collections, plus a real-scale blocking volume for each part and base object |
| `tools/blender/validate.py` | Check object names against `machine.json`, applied transforms, triangle counts, missing materials |
| `tools/blender/export.py` | Export `parts` and `base` to `assets/gen950/export/model.glb` |
| `tools/pipeline/optimise` | Run glTF Transform: deduplicate, prune, compress geometry, resize and compress textures |
| `tools/pipeline/check` | Confirm node names match `machine.json` and the file is within budget, then copy it to `game/public/machines/gen950/` |

Check the glTF Transform flags with `--help` before use. If you choose Meshopt compression, wire the Meshopt decoder into the Three.js loader.

### Modelling order

Outside first, because that is what the player sees in the first seconds: `fuel_tank`, `alternator_cover`, `recoil_starter`, `muffler`, `air_filter_cover`. Then the parts the faults live in: `carburetor`, `spark_plug`, `fuel_tap`, `capacitor`, `air_filter`. Then the rest.

Reference photos go in `assets/gen950/reference/`. Sellers' photos are for reference only and must never be used as textures.

## 10. Phases

Stop at the end of each phase, summarise what was built and what is uncertain, and wait.

### Phase 1: core logic, no graphics

Types, validator, state machine, remove and install rules, scoring, action log, daily seed, all tested.

**Done when:** `npm test` passes, and a script can play every fault to completion in text mode from an action log.

### Phase 2: playable with placeholders

Scene, placeholders from `machine.json`, picking, tray, inspect card, fix, put back, pull cord, result screen.

**Done when:** a full round is playable in portrait in a phone browser over the local network, all six faults can be solved, there are no console errors, and the JavaScript budget holds.

### Phase 3: asset pipeline

The Blender scripts, the optimise and check steps, and one `npm run assets` command.

**Done when:** that command takes the `.blend` to a validated `model.glb`, and the game loads it in place of the placeholders with no code change. Blocked-out geometry is enough to pass.

### Phase 4: daily fault and polish

Daily fault, one scored attempt, local best scores, share text, loading states, a performance pass against the budgets.

**Done when:** the daily works across a simulated day change, the share text is correct, and the frame-rate budget holds.

### After that, not now

Leaderboards arrive as a remote `ScoreStore` that re-scores the action log on a server. Community faults arrive as submissions in the `faults.json` format. New machines arrive as new folders. None of this is built until the owner says so.

## 11. Working rules

- Keep `core` free of Three.js and DOM imports. Add a test or lint rule that enforces it.
- Ask before adding a dependency or changing a data contract.
- Make small commits with clear messages, one phase per branch.
- Record each decision in `docs/decisions.md` in one line, with the reason.
- Create `CLAUDE.md` in Phase 1 with the commands, the conventions above and the list of things not to build.
- Commands to provide: `npm run dev`, `npm test`, `npm run build`, and from Phase 3 `npm run assets`.
- When something in this brief is ambiguous, pick the simpler reading, note it in `docs/decisions.md`, and continue.
