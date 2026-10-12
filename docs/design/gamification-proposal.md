# Gamification proposal

Status: proposal for the owner, 2026-10-12. Nothing here is decided. Each part that changes scope, rules, data contracts or saved data needs its own ADR, listed at the end of each section.

The owner asked for "a way to gamify this better" and chose four directions to develop: a workshop day, real diagnosis clues, earning and upgrading, and badges and records. They fit together as one loop, so this proposal treats them as layers on the round that exists today.

## The loop, in one paragraph

A **workshop day** is a shift of customers, one after another, each bringing a fault. Before taking anything apart the player can use **diagnosis clues** (listen, look, test) to narrow the fault down, so a good mechanic fixes things fast with few wrong parts. Each fixed customer **pays**, more for a quick, clean job, and the money buys **tools** that make diagnosis or work faster. Over days the player earns **badges** and beats **personal records**. Reputation decides which customers come and how hard their faults are.

## 1. A workshop day

- A day is 5 customers in a row (free play stays as a single round; the daily stays a single scored round, ADR 0005).
- **Reputation**, 0 to 100, shown as a row of stars on the bench. A quick fix with no wrong parts raises it; a walk-out lowers it; a failed pull costs a little. It carries over between days.
- Reputation picks the day's faults: low reputation brings the common, simpler faults; higher reputation brings harder ones (the new faults from `reference/more-faults-research.md`) and more impatient customers.
- **Streak**: customers fixed in a row without a walk-out, shown during the day; a day with no walk-outs is a "clean day".
- End of day screen: customers served, earnings (section 3), reputation change, best fix, streak.
- Why: gives a reason to play more than one round, and a sense of a career without needing accounts or a backend.
- ADR needed: yes. A new mode and reputation change ADR 0001 (scope) and ADR 0004 (what a round is part of); reputation is new saved data (ADR 0022's format).

## 2. Real diagnosis clues

- Before or while taking parts off, the player can do quick checks, each costing a few seconds of the clock and of the customer's patience:
  - **Listen**: pull the cord once to hear how it fails (no fire, coughs, starts then dies, runs rough). Today a failed pull already tells this a little; make each fault's sound and behaviour distinct.
  - **Look**: smoke colour on a pull, fuel in the bowl, a wet or black plug when it comes out, a dim or dark test bulb.
  - **Test**: a spark test (plug out, earthed, pull: strong, weak or no spark), fuel flow at the hose, a multimeter on the socket (volts), compression by feel on the cord.
- The customer's complaint, written per fault, gives the first clue; the checks narrow it down; taking parts off confirms it.
- Score: fewer wrong parts already counts (ADR 0004); a "clean diagnosis" (the first part opened was on the path to the culprit) earns a bonus.
- This is also how the new faults become fair: weak coil vs fouled plug differ by the spark test; float stuck vs clogged jet differ by smoke and fuel smell.
- ADR needed: yes. New actions in the action log and their costs change ADR 0004; the clue results are new data in `faults.json` (ADR 0003). ADR 0007 still holds: clues come only from checks the player chooses, never from tapping a blocked part.

## 3. Earn and upgrade

- Each fixed customer pays naira: a base price per fault (harder faults pay more), plus a tip for a quick fix, less for wrong parts or a failed pull. A walk-out pays nothing. (The paying animation exists already; this gives it a number.)
- Money buys **tools** in a small shop between customers or between days. Each tool changes time, not rules:
  - spark tester (the spark test takes 1 s instead of 4 s),
  - multimeter (the volts test),
  - socket set or impact driver (fasteners come out faster),
  - a bigger parts tray (fewer rows, easier to drop),
  - a fuel can (drain and refill water-in-fuel faster).
- Tools show in the toolbox on the bench.
- Guardrails: no real money, no ads, no purchases, nothing that skips the puzzle. The daily stays equal for everyone: tools do not apply to the daily's score (or the daily uses a standard kit).
- ADR needed: yes. ADR 0001 excludes money, shop upgrades and tools as items to pick or buy; ADR 0021 says "there is no tool to choose, buy, upgrade or lose". Both would be superseded in part. Earnings and owned tools are new saved data (ADR 0022).

## 4. Badges and records

- Local badges, shown on the start screen: first fix; a fix under 30 s; no wrong parts; a clean day; every fault fixed once; 7-day daily streak; 100 customers served; each new tool bought.
- Personal records per fault (already partly there: best score per fault, ADR 0022), plus best day, longest streak.
- The share text can mention a new badge or record (ADR 0005's text would change).
- ADR needed: a small one for the saved data (ADR 0022's format grows) and for the share text if it changes. No backend, no leaderboard (ADR 0001 still excludes leaderboards).

## Suggested order

1. **Diagnosis clues with the first new faults** (section 2, plus 3 to 4 of the top-six faults). This makes each round a better puzzle and is the core of the game.
2. **Badges and records** (section 4). Small, cheap, and keeps the daily sticky.
3. **The workshop day with reputation** (section 1). Turns rounds into a session.
4. **Earn and upgrade** (section 3). The biggest scope change; best once there are enough faults and tools that matter.

## What it costs

- Each section needs an ADR and a plan; sections 1 and 3 change ADR 0001's scope list.
- New faults need a mechanic's check (see `open-questions.md`) and, for some, new model parts (fuel cap, fuel filter, ignition coil).
- Saved data grows; ADR 0022's format moves to a new key (`openam.scores.v2` or similar), and old saves start fresh.
- More screens (end of day, shop, badges) mean more strings, which ideally get real Pidgin from the owner.
