---
id: 0010
title: Module layout and boundaries
status: proposed
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0010. Module layout and boundaries

## Context

The brief lays out `core`, `render`, `ui` and `platform`. Discussion on 2026-10-10 (`docs/design/architecture.md`) added one layer, `app`, so that render and ui never decide a rule and never talk to each other, and so that player mode and diagnostic mode (ADR 0007) share one code path for the rules. This ADR fixes the layers, what each may import, and how the boundaries are enforced. It also protects the two doors in ADR 0002.

## Decision

**Layers**, under `game/src/`. Each imports only from the layers listed.

| Layer | Holds | May import |
| --- | --- | --- |
| `core` | Types, validator, reducer, replay, scoring, daily seed, constants | nothing outside `core` |
| `app` | The running round: timer, action log, calls to the reducer, event emitter, fault selection | `core`, and the interfaces in `platform/interfaces` |
| `render` | Three.js scene, placeholders and GLB loading, picking, camera, animation system | `app`, `core` types |
| `ui` | DOM screens and widgets, `strings.ts` | `app`, `core` types |
| `platform` | `interfaces/` (ScoreStore, DailyProvider, Share, Audio, Clock) and `local/` implementations | `core` types |
| `diagnostic` | Overlay for development builds | `app`, `core` types |

`main.ts` is the only file that imports every layer. It constructs the platform implementations, injects them into `app`, and imports `diagnostic` only inside a build-flag guard so production builds drop it.

**Events.** `app` exposes `propose(action)` and an event emitter written in the project. Events: `started`, `removed`, `installed`, `inspected`, `fixed`, `pulled`, `refused`, `ended`. `render` and `ui` subscribe; they never call each other and never hold game state of their own beyond what is needed to draw. `refused` carries the reason from `core`; player mode ignores it, diagnostic mode shows it.

**One path to a part's condition.** The interface gets a part's condition text through `app.conditionOf(partId)`, never by reading the fault data directly. This is what lets a later server hold the fault list instead of the client (ADR 0002, first door).

**Nothing assumes being online after load.** After the machine folder is fetched, no layer makes a network request. This keeps the second door in ADR 0002 open.

**Enforcement.** Tests in `game/tests/boundaries.test.ts` scan imports and fail on any violation of the table above. Three.js and DOM globals in `core` fail the same test. The test is part of `npm test` and runs before every commit.

**Folders.**

```
game/
  src/
    core/        app/        render/      ui/      platform/   diagnostic/   main.ts
  public/machines/gen950/   machine.json  faults.json  model.glb
  tests/
```

## Consequences

Rules exist in exactly one place. The interface can be rebuilt or restyled without touching rules. The server-side future has a clean seam. The cost is a small amount of plumbing in `app` that a simpler game would skip.

## History

- 2026-10-10: proposed by Claude, from discussion with the owner.
