---
id: 0002
title: Stack, dependencies and accepted limits
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0002. Stack, dependencies and accepted limits

## Context

The brief (section 3) names the stack and says to ask before adding any dependency. The owner asked on 2026-10-10 for the choice of language and architecture to be argued, not assumed. The comparison is in `docs/design/architecture.md`. In short: the players (low-end Android, mobile browser, expensive data, no install, no login) rule out anything that ships an engine runtime. A tree-shaken Three.js build fits the JavaScript budget with room, and every vendor's agent knows it.

Everything runs on the player's phone in the browser. The server is a static file host. That brings limits, listed below, which the owner has accepted for the first version while wanting two of them changeable later.

## Decision

**Stack.**

- Game: Vite, TypeScript in strict mode, Three.js. Plain DOM and CSS for the interface. No UI framework.
- Tests: Vitest, for `game/src/core` and the boundary rules in ADR 0010.
- Assets: Blender for modelling, the glTF Transform CLI for optimisation.
- Deploy: a static build that runs from any CDN. No server-side logic in the first version.

**Dependencies approved by this ADR.**

| Package | Kind | Needed from |
| --- | --- | --- |
| `vite` | dev | Phase 1 |
| `typescript` | dev | Phase 1 |
| `vitest` | dev | Phase 1 |
| `three` | runtime | Phase 2 |
| `@types/three` | dev | Phase 2 |
| `@types/node` (types only, for tests and tools) | dev | Phase 1 |
| `@gltf-transform/cli` | dev | Phase 3 |
| `meshoptimizer` (decoder only, if Meshopt compression is chosen) | runtime | Phase 3 |

Tweening, sequencing, hashing, the event emitter and storage wrappers are written in the project, not imported. Any other package needs a new ADR. No web fonts and no requests to third-party hosts at runtime.

**Accepted limits of a client-only game.** Agents do not try to fix these with a heavier engine or a backend.

1. Visual ceiling: simple lighting, no shadows, no global illumination. Realism comes from models and baked textures.
2. No editor: animation is data (ADR 0008) and code. Artists tune JSON or author in Blender.
3. Code and content are readable: the fault list is a public file. No obfuscation is attempted; it would not work.
4. Scores are computed on the device and cannot be trusted. The action log allows later consistency checks, not proof of play.
5. Device variance: old or broken WebGL stacks exist. The game shows a plain "this phone cannot run the game" message instead of failing silently.
6. Browser limits: storage can be wiped, audio needs a first tap, the share sheet may be absent.
7. No physics: parts move on scripted paths.

**Doors kept open.** The owner intends to change two of the limits later. The architecture (ADR 0010) must not close them, and nothing behind them is built now.

- *Hiding the game logic and content.* The path is a server that selects the fault and reveals part conditions on request, so the client never holds the whole fault list. The seams that make this possible are: `core` runs unchanged on a server, `DailyProvider` is an interface, and part condition text is looked up through one function, never read directly from the data by the interface. A future ADR designs the server.
- *Notifications and installability.* The path is a web app manifest and a service worker (installable, offline-capable, push notifications). The seams: the build is static and cacheable, and nothing in the game assumes it is online after the first load. A future ADR adds the manifest, the worker and push.

## Consequences

Small, auditable bundle; zero running cost; instant play from a link. Agents write a little utility code instead of importing packages. The two doors cost nothing now but constrain how `app` and `platform` are written in ADR 0010.

## History

- 2026-10-10: proposed by Claude, from the brief.
- 2026-10-10: rewritten after the owner asked for the stack to be argued and for two limits to remain changeable: hiding game logic, and notifications.
- 2026-10-10: accepted by the owner, who wrote "please accept both adr 2 and 10".
- 2026-10-10: the owner wrote "Add it": `@types/node` (dev, types only) is added to the approved list so the tests type-check.
- 2026-10-10: ADR 0014, accepted by the owner ("I accept ADR 14"), narrows limit 1: baked image-based lighting and baked shadows are allowed; real-time shadows and real-time global illumination are still out.
