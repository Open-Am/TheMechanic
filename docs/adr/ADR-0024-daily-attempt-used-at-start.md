---
id: 0024
title: The daily attempt is used up when its timer starts
status: proposed
date: 2026-10-11
supersedes: []
superseded_by: null
---

# 0024. The daily attempt is used up when its timer starts

## Context

ADR 0005 gives one scored attempt at the daily fault each day, with unscored replays after it, but does not say when the attempt is used up. If it counts only when the round ends, a player can close the tab during a bad round and play again scored. On 2026-10-11 the owner chose that the attempt counts when the timer starts. ADR 0022 says the `daily` record for a day is "the scored attempt, fixed or walked"; a round that never ends is neither, so the saved data needs one more case.

## Decision

- The day's scored attempt is used up the moment its round's timer starts.
- At that moment the game saves the day's record under ADR 0022's `daily` key, with the log so far and `"unfinished": true`. When the round ends, fixed or walked, the record is replaced with the full result, without the flag.
- A day whose record is still unfinished counts as attempted. It is never a best score, it has no stars and no share text, and the start screen shows that day's daily as "Not finished".
- Everything else in ADR 0022 stands.
- If storage is blocked (ADR 0005's memory fallback), the attempt is remembered only for this session, as before.

## Consequences

A shared daily result always means one honest try. The cost: a player whose phone reloads or crashes during the daily loses that day's scored attempt, with no way to get it back. Plan 0014 changes when it records the attempt and adds the "Not finished" state to the start screen.

## History

- 2026-10-11: proposed by Claude, from the owner's answer "1. B" to the question of when the daily attempt counts.
