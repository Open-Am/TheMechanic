---
id: 0022
title: What the game saves in the browser
status: accepted
date: 2026-10-11
supersedes: []
superseded_by: null
---

# 0022. What the game saves in the browser

## Context

ADR 0005 puts best scores and the daily attempt behind a `ScoreStore` interface with a local implementation, and says every storage read and write is wrapped with a memory fallback. ADR 0001 asks for local best scores. Neither says what is written to browser storage, under which name, or what happens when that changes. Each saved record holds an action log (ADR 0004), and later versions, or a later remote store, will have to read what the first version writes. Plan 0014 (Phase 4) needs this settled before it writes anything to the browser.

## Decision

- Everything the game saves lives under one `localStorage` key: `openam.scores.v1`.
- Its value is JSON: `{ "v": 1, "best": { <faultId>: StoredResult }, "daily": { <day>: StoredResult } }`, where `StoredResult` is the type already in `game/src/platform/interfaces` (`faultId`, `day`, `log`, `score`, `playedAt`).
- `best` keeps one record per fault: the fixed round with the lowest total. A round the customer walked out of is never a best.
- `daily` keeps one record per day: the scored attempt, fixed or walked. Practice rounds are never saved.
- Nothing else is saved: no settings, no player name, no identifier. A mute setting, if ADR 0018's work needs one, gets its own decision.
- A value that cannot be read, is not valid JSON, or has a different `v` is treated as empty, and the next write replaces it.
- A future change to this format uses a new key (`openam.scores.v2`) and starts empty. There is no migration.
- If storage is blocked or throws, the game keeps this session's results in memory, as ADR 0005 already says.

## Consequences

The saved data stays small (about one short record a day) and a format change can never crash an old save. The cost: a format change loses players' history, which is acceptable with no accounts and no leaderboard. A remote `ScoreStore` later would need its own ADR.

## History

- 2026-10-11: proposed by Claude, from the gap found while drafting plan 0014.
- 2026-10-11: accepted by the owner, who wrote "Plan 12, 15 and adr 22 is approved."
