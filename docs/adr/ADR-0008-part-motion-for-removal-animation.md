---
id: 0008
title: Part motion field for removal and install animation
status: superseded
date: 2026-10-10
supersedes: []
superseded_by: 0017
---

# 0008. Part motion field for removal and install animation

## Context

The owner wants each removal to look real, with an animation scheme that is a first-class part of the design. The data contract (ADR 0003) gives each part only an `explode` vector, which can express a straight slide and nothing else. Animation should be driven by data so that placeholders and final models use the same motions and an artist can tune them without code. This ADR extends ADR 0003.

## Decision

- Each part in `machine.json` may carry an optional `motion` object. When absent, the part uses `{ "type": "slide" }`, which moves along `explode` as before. Existing data stays valid.
- The vocabulary, version 1:

| `type` | Movement | Typical parts |
| --- | --- | --- |
| `slide` | Translate along `explode`. | default |
| `lift` | Translate along `explode`, with a slight settle at the start as if freed. | fuel tank |
| `pull` | Translate along `explode` with a brief stretch and snap, like a hose coming off a spigot. | fuel hose |
| `unscrew` | Rotate about `axis` for `turns` turns while backing out along `explode`. | spark plug, plug cap |
| `unbolt` | Short settle, then lift away along `explode`, with a small rotation about `axis`. | recoil starter, muffler, covers |
| `unclip` | A short rock about `axis`, then translate along `explode`. | air filter cover |

- Optional fields: `axis` (`"x"`, `"y"` or `"z"`), `turns` (number), `duration` (seconds). Defaults live in one file in the render layer.
- Install plays the same motion in reverse.
- The render layer owns a small tween and sequence utility, written in the project (ADR 0002). Each removal is: motion, then drift to the tray, with the camera easing slightly toward the part. Timing targets are in `docs/design/animation.md`.
- The validator accepts unknown `motion.type` values with a warning and falls back to `slide`, so data from a newer vocabulary does not break an older build.

## Consequences

Artists tune feel in data. The GLB contract is unchanged. Every new motion type is a superseding ADR so the vocabulary stays small and known.

## History

- 2026-10-10: proposed by Claude, from discussion with the owner.
- 2026-10-10: accepted by the owner, who wrote "I accept all the ADRs as is", with ADR 0002 held back for an architecture discussion.
- 2026-10-11: superseded by ADR 0017 (hands-on removal), which keeps this ADR's motion vocabulary and data and changes how a removal plays.
