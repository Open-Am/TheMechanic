---
id: 0002
title: Stack and allowed dependencies
status: proposed
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0002. Stack and allowed dependencies

## Context

The brief (section 3) names the stack and says to ask before adding any other runtime dependency. Listing the dependencies the whole first version needs here means the owner approves them once and agents do not ask repeatedly.

## Decision

- Game: Vite, TypeScript in strict mode, Three.js. Plain DOM and CSS for the interface. No UI framework.
- Tests: Vitest, for `game/src/core` only.
- Assets: Blender for modelling, the glTF Transform CLI for optimisation.
- Deploy: a static build that runs from any CDN.

Dependencies approved by this ADR:

| Package | Kind | Needed from |
| --- | --- | --- |
| `vite` | dev | Phase 1 |
| `typescript` | dev | Phase 1 |
| `vitest` | dev | Phase 1 |
| `three` | runtime | Phase 2 |
| `@types/three` | dev | Phase 2 |
| `@gltf-transform/cli` | dev | Phase 3 |
| `meshoptimizer` (decoder only, if Meshopt compression is chosen) | runtime | Phase 3 |

Tweening, sequencing, hashing and storage wrappers are written in the project, not imported. Any other package needs a new ADR.

No web fonts and no requests to third-party hosts at runtime. Players pay for data.

## Consequences

Bundle stays small and auditable. Agents write a little utility code instead of adding packages.

## History

- 2026-10-10: proposed by Claude, from the brief and discussion with the owner.
