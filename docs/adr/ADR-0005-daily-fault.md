---
id: 0005
title: Daily fault
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0005. Daily fault

## Context

The brief (section 7) wants one fault per day, the same for everyone, with one scored attempt, and share text. It says the day's fault never repeats the previous day's but does not say how. This ADR fixes the method so every implementation agrees.

## Decision

- The day number counts days since a `DAILY_EPOCH` constant, in Lagos time (UTC+1, no daylight saving).
- The fault for day N is chosen from the faults that are not day N−1's fault, indexed by a seeded hash of N modulo the size of that set. Day 0 picks from all faults. This recurses to the epoch and is deterministic; the cost is negligible.
- The daily sits behind a `DailyProvider` interface and scores behind a `ScoreStore` interface, both with local implementations now.
- One scored attempt per day. After that the daily can be replayed, unscored.
- Share text, through the Web Share API where it exists and the clipboard otherwise:

```
Open Am · Day 12
Fixed in 38s · 1 wrong part · ★★★
<url>
```

- Browser storage can fail or come back empty. Every read and write is wrapped in try/catch with a memory fallback.
- With six faults the daily repeats within a week. That is accepted; no machinery hides it.

## Consequences

Any client that implements the same hash and epoch produces the same daily. A server can later replace `DailyProvider` without touching the game.

## History

- 2026-10-10: proposed by Claude, from the brief.
- 2026-10-10: accepted by the owner, who wrote "I accept all the ADRs as is", with ADR 0002 held back for an architecture discussion.
