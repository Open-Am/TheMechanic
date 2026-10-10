---
id: 0001
title: Scope of the first version
status: proposed
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0001. Scope of the first version

## Context

The brief (`open-am-build-brief.md`, section 2) fixes what the first version contains and, more importantly, what it does not. Agents from several vendors will work on this, and scope creep is the most likely way they drift. This ADR makes the scope a checkable decision.

## Decision

The first version contains exactly:

- One machine, `gen950`, a 950-type two-stroke generator with 12 removable parts.
- Six faults, one bad part each.
- Free play (random fault) and a daily fault (same for everyone that day).
- Local best scores and a shareable text result.
- Placeholder geometry first, then real models loaded from a GLB file with no code change.
- Two modes: player mode and an internal diagnostic mode (ADR 0007).

The first version does not contain, and no agent builds without a new ADR: accounts, a backend, leaderboards, community-submitted faults or machines, moderation, money, shop upgrades, tools, customer haggling, more machines, a learn mode, multiplayer.

Only five seams are built for the future: machines as data folders, a pure core, the action log, storage and daily behind interfaces, and player text in data or one strings file. Nothing else is built "for later".

The test for the first version: someone plays it twice without being asked.

## Consequences

Any feature request outside this list starts as a proposed ADR that supersedes this one. Agents can refuse out-of-scope work by pointing here.

## History

- 2026-10-10: proposed by Claude, from the brief.
