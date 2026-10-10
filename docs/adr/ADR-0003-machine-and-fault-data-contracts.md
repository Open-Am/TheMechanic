---
id: 0003
title: Machine and fault data contracts
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0003. Machine and fault data contracts

## Context

A machine is a folder of data: `machine.json`, `faults.json` and `model.glb`. These files are the contract between the game, the artists and, later, community contributors. The brief (section 5) defines them fully. This ADR makes them a decision that cannot be changed casually.

## Decision

- The schemas, field names, IDs and axis conventions in `open-am-build-brief.md` section 5 are the contract. The copy in `game/public/machines/gen950/` is the source of truth once it exists.
- Units are metres. X is the machine's length, Y is up, Z is its width, the front (control panel side) faces +Z, and the origin is the centre of the base at ground level.
- `requires` lists parts that must be off before a part can come off. `base` geometry never comes off.
- Each fault has exactly one `culprit`. The four symptom IDs are `no_start`, `starts_then_dies`, `runs_no_output`, `runs_weak`. Symptom text lives in the strings file, not in the data.
- A validator in `core` runs at load and in tests. It rejects duplicate IDs, a `requires` entry naming no part, a cycle in `requires`, a culprit naming no part, and an unknown symptom.
- The content is an unverified draft (`verified: false`). Agents do not correct it from their own knowledge. Doubts go to `docs/open-questions.md`.
- Adding or renaming a field, or changing an ID, requires an ADR that supersedes or extends this one. ADR 0008 is the first such extension.

## Consequences

Artists and future contributors can rely on the format. Agents must route any schema change through the owner.

## History

- 2026-10-10: proposed by Claude, from the brief.
- 2026-10-10: accepted by the owner, who wrote "I accept all the ADRs as is", with ADR 0002 held back for an architecture discussion.
