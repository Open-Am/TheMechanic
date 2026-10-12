---
id: 0032
title: A workshop day of five customers, with reputation
status: accepted
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0032. A workshop day of five customers, with reputation

## Context

On 2026-10-12 the owner asked for "a way to gamify this better" and chose all four directions in `docs/design/gamification-proposal.md`. Asked how far to go overnight, the owner chose the option labelled "Build all four directions", whose text was: "You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details."

Today the game has two modes, free play and the daily (ADR 0001, ADR 0005), and both are single rounds. Nothing carries from one round to the next except best scores. A workshop day turns rounds into a session and gives a sense of a career without accounts or a backend. It adds a mode to ADR 0001's scope, chooses faults and customers in a new way (ADR 0015 picks customers at random), and saves new data in the format of ADR 0031. Faults get a difficulty in ADR 0030; earnings come in ADR 0033.

## Decision

### Scope (adds to ADR 0001)

The game gains a third mode, the **workshop day**, beside free play and the daily. Free play stays a single round with a random fault. The daily stays a single scored round, the same for everyone (ADR 0005); nothing in this ADR touches it.

### A day

- A day is **five customers** in a row. Each is an ordinary round: the same rules, action log, score, checks and patience as any round (ADRs 0004, 0015, 0029). Each round has its own log.
- Between customers, a short screen shows the streak, the day so far, and (with ADR 0033) the earnings and the shop. The player taps on to the next customer.
- Days are numbered from 1 in the order played (`workshop.daysPlayed + 1`), not by the calendar. A player may play as many days as they like.
- **The day's jobs are chosen when it starts**: five faults and five customers, using the game's random source, saved at once. No fault comes twice in a day; no customer comes twice in a row.
- **Leaving and coming back.** The day in progress is saved after every customer. The start screen offers to continue it. A round that was running when the page closed or reloaded counts as a walk-out when the player returns (saved as unfinished at its start, as ADR 0024 does for the daily), so a bad round cannot be escaped by reloading.

### Reputation

- A number from 0 to 100, starting at 30, carried from day to day. Shown as five stars on the bench and on the between-customers screen (one star per 20 points, rounded down).
- After each customer, by pure functions in `core`, from the round's score:
  - fixed: +3; +2 more for a clean job (no wrong parts, no failed pulls); +1 more for three stars;
  - each failed pull: −1;
  - walked: −8.
- Clamped to 0 to 100. Every number is in `core/constants.ts`, expected to be tuned.

### Reputation chooses the work

| Reputation | Faults drawn from | Customers drawn from |
| --- | --- | --- |
| 0 to 34 | difficulty 1 | patience 550 s or more |
| 35 to 69 | difficulty 1 and 2 | everyone |
| 70 to 100 | difficulty 2 and 3 | patience 550 s or less |

The band is set by the reputation when the day starts and holds for the whole day. Each pool always has at least five faults (5, 10 and 7 with ADR 0030's levels) and at least two customers (with today's three). The limits are constants. Customers need no new data field: their `patience` already says who is impatient.

### Streak and a clean day

- **Streak**: workshop customers fixed in a row without a walk-out. It carries from one day to the next and goes back to 0 on a walk-out. Shown during the day.
- **Clean day**: all five customers fixed. It earns ADR 0031's `clean_day` badge.

### End of the day

After the fifth customer, an end-of-day screen shows: customers fixed out of five, the reputation before and after, the best fix of the day (lowest total), the streak, a clean day if it was one, any badge or record earned, and (with ADR 0033) the day's earnings. Then it returns to the start screen.

### Saved data (in ADR 0031's format)

- `workshop.reputation`, `workshop.streak`, `workshop.daysPlayed` as above.
- `workshop.today` while a day is in progress: `{ "number", "startedAt", "reputationAtStart", "jobs": [{ "faultId", "customerId" }] × 5, "results": [StoredResult], "current": StoredResult | null }`. `current` is the round under way, saved with `"unfinished": true` when its timer starts. When the day ends, `today` goes back to null and `records.bestDay` and `records.longestStreak` are updated.
- Fixed workshop rounds count towards `records.customersServed`, `records.fastestFix` and badges. They count towards `best` only when played with the standard kit (ADR 0031).

### Unchanged

- ADR 0007: nothing about a day hints at a fault. The end-of-day screen names the faults fixed only after they are fixed, as the result screen does.
- ADR 0026 and ADR 0027: each customer arrives, and pays or storms off, as now.
- No leaderboard, no account (ADR 0001).

## Consequences

The game gains a session: a reason to play five rounds, and reputation that rises with care and falls with walk-outs. Harder faults come only once the player has shown they can fix easy ones. The cost: a new mode through app (a day's state machine around the round), new screens (between customers, end of day, continue), saved state that must survive reloads, more browser checks, and new strings. Three customers make a day feel repetitive; more customers are content for the owner to add, with no code. Reputation numbers will need tuning against real play. A walk-out on reload may feel harsh after a phone crash, as with the daily.

ADR 0001 gets a history line for the new mode on acceptance; its other text stands except what ADRs 0030 and 0033 change. ADR 0015 gets a history line: in workshop days, reputation narrows which customers can come.

## History

- 2026-10-12: proposed by Claude, from the owner's choice quoted above.
- 2026-10-12: accepted by the owner in advance, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.") before going to bed; the owner reviews the result in the morning, and the tag before-gamification marks the game before this work.
