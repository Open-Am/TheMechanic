---
id: 0031
title: Badges and personal records, and the second saved format
status: accepted
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0031. Badges and personal records, and the second saved format

## Context

On 2026-10-12 the owner asked for "a way to gamify this better" and chose all four directions in `docs/design/gamification-proposal.md`. Asked how far to go overnight, the owner chose the option labelled "Build all four directions", whose text was: "You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details."

Badges and records need saved data that ADR 0022's format (`openam.scores.v1`) has no room for. ADR 0022 says a format change uses a new key and starts empty, with no migration. The workshop day (ADR 0032) and earnings and tools (ADR 0033) need saved data too. To change the format once, not three times, this ADR designs the second format for all three. ADR 0005 fixes the share text; this adds one optional line. ADR 0001 still excludes leaderboards: everything here stays on the phone.

## Decision

### The saved format, version 2 (replaces ADR 0022's format)

Everything the game saves about play lives under one `localStorage` key, `openam.scores.v2`. Its value is JSON:

```json
{
  "v": 2,
  "best":   { "<faultId>": "StoredResult" },
  "daily":  { "<day>": "StoredResult" },
  "badges": { "<badgeId>": { "at": "2026-10-13T09:12:00.000Z" } },
  "records": {
    "fastestFix": { "faultId": "fouled_plug", "seconds": 24, "at": "..." },
    "customersServed": 0,
    "fixedFaults": [],
    "longestStreak": 0,
    "bestDay": { "number": 3, "fixed": 5, "earned": 31000, "at": "..." }
  },
  "workshop": {
    "reputation": 30,
    "streak": 0,
    "daysPlayed": 0,
    "today": null
  },
  "wallet": { "naira": 0, "earned": 0 },
  "tools": []
}
```

- **`StoredResult`** is ADR 0022's (`faultId`, `day`, `log`, `score`, `playedAt`, and ADR 0024's `unfinished`) plus three fields: `mode` (`"free"`, `"daily"` or `"workshop"`), `customerId` (the customer's id, or null), and `kit` (the bought tools in effect for the round, ADR 0033; `[]` is the standard kit). With these a round can be scored again from the saved record alone.
- **`best`** keeps, per fault, the fixed round with the lowest total, from rounds played with the standard kit (`kit` empty). So bests stay comparable once tools exist. A walked or unfinished round is never a best, as now.
- **`daily`** is as ADR 0022 and ADR 0024 say: one record per day, the scored attempt.
- **`badges`**: the badges earned, each with when.
- **`records`**: the personal records below. `fastestFix` and `bestDay` are null until there is one.
- **`workshop`**, **`wallet`** and **`tools`** are defined here, with their defaults, and filled in by ADRs 0032 and 0033. `workshop.today` is null when no day is in progress; its shape is in ADR 0032.
- **Defaults inside version 2.** A section that is missing or the wrong type reads as its default (above), and the rest of the value is kept. So a release can add a section to version 2 without a new key, as long as the section has a default. A value that is not JSON, or whose `v` is not 2, is treated as empty, as ADR 0022 says.
- **No migration.** Version 2 starts empty. The `openam.scores.v1` value is left where it is and never read again. Players lose their old bests and their record of past dailies. On the day this ships, a player who already used today's scored daily under version 1 gets one more scored attempt that day. Both are accepted: the score changed with ADR 0029, so old totals do not compare.
- **Still nothing personal.** No name, no identifier, no settings. The mute setting stays under its own key (`openam.muted`, ADR 0018).
- **Storage failing** works as ADR 0005 and ADR 0022 say: everything is kept in memory for the session.

### Badges

A badge is earned once and kept. All are local. Each has an id, a name and a one-line description in `strings.ts`, and a rule that is a pure function in `core` of the saved data and the round that just ended. Practice rounds earn nothing.

| Badge | Earned when |
| --- | --- |
| `first_fix` | Any round ends fixed. |
| `fast_fix` | A round ends fixed in 30 seconds or under (`elapsedSeconds`). |
| `no_wrong_parts` | A round ends fixed with no wrong parts and no failed pulls (ADR 0029's clean job). |
| `every_fault` | Every fault in `faults.json` has been fixed at least once, in any mode but practice (`records.fixedFaults`). |
| `daily_streak_7` | Seven days in a row each have a fixed, scored daily. |
| `customers_100` | `records.customersServed` reaches 100. |
| `clean_day` | A workshop day ends with no walk-outs (ADR 0032). |
| `first_tool` | The first tool is bought (ADR 0033). |
| `full_kit` | Every tool in the shop is owned (ADR 0033). |

The last three can only be earned once ADRs 0032 and 0033 are built; until then they show as not yet earned. Numbers (30 seconds, 7 days, 100 customers) live in `core/constants.ts`.

### Personal records

- **Best per fault**, as now (from `best`).
- **Fastest fix**: the lowest `elapsedSeconds` of any fixed round, any fault, standard kit.
- **Customers served**: fixed rounds in free play, the daily and the workshop day, not practice.
- **Faults fixed**: the ids of every fault fixed at least once (`records.fixedFaults`), for `every_fault`.
- **Longest streak**: the longest run of workshop customers fixed without a walk-out (ADR 0032).
- **Best day**: the workshop day with the most customers fixed, earnings breaking a tie (ADR 0032, ADR 0033).

### Where they show

- The start screen gains a **Badges** button showing every badge, earned or not, with its description, and the records. An unearned badge says how to earn it. It never names a fault's bad part.
- The result screen names any badge just earned and any record just beaten.

### Share text (extends ADR 0005)

The scored daily's share text keeps its three lines. When that round earned a badge, one line is added before the link, naming the first one in the table's order:

```
Open Am · Day 12
Fixed in 38s · 1 wrong part · ★★★
New badge: Quick hands
<url>
```

Nothing else changes in the share text. Free play, practice and workshop rounds still have no share text.

### Layers (ADR 0010)

The badge rules and records are pure functions in `core`. `app` calls them at the end of a round and saves through `platform`. The `ScoreStore` interface grows, or a `ProgressStore` interface joins it, in `platform/interfaces`; the local version writes the one key above.

## Consequences

The player has reasons to come back that cost no backend: a daily streak to keep, badges to collect, records to beat. ADRs 0032 and 0033 add to the same saved value without a third key. The cost: everyone's old bests are gone once; the saved value grows (still small: a short record per daily and per best, a few numbers more); a new screen and more strings, which want real Pidgin from the owner. Badges whose rules are wrong are hard to take back once earned, so their tests matter.

ADR 0022's format is replaced by this one; its rules about storage failing and no migration still hold, and on acceptance it gets a history line saying so. ADR 0005 gets a history line for the share line.

## History

- 2026-10-12: proposed by Claude, from the owner's choice quoted above.
- 2026-10-12: accepted by the owner in advance, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.") before going to bed; the owner reviews the result in the morning, and the tag before-gamification marks the game before this work.
