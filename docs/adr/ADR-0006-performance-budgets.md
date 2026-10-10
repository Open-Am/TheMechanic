---
id: 0006
title: Performance budgets
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0006. Performance budgets

## Context

Players are on low-end Android phones over expensive data. The brief (section 8) sets budgets. They are targets to hold, and any work that would break one needs an ADR.

## Decision

| Item | Budget |
| --- | --- |
| JavaScript, gzipped | 350 KB |
| `model.glb` per machine | 5 MB, aiming for 3 MB |
| Triangles per machine | 60,000 |
| Textures | 1024 px, one 2048 px atlas at most |
| Frame rate | 30 fps with 4× CPU throttling in Chrome DevTools |
| Device pixel ratio | Capped at 2 |

Rendering: one hemisphere light and one directional light, no real-time shadows. No web fonts, no third-party requests at runtime. The asset check step fails the build if the GLB is over budget.

## Consequences

Agents measure before merging anything that adds bytes or triangles. Visual ambition is spent on modelling and animation, not on lighting cost.

## History

- 2026-10-10: proposed by Claude, from the brief.
- 2026-10-10: accepted by the owner, who wrote "I accept all the ADRs as is", with ADR 0002 held back for an architecture discussion.
