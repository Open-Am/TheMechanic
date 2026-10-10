---
id: 0007
title: Customers and their patience
status: proposed
date: 2026-10-10
adrs: [0003, 0004, 0005, 0007, 0010, 0015]
branch: plan/0007-customer-patience
---

# 0007. Customers and their patience

## Goal

Every round has a customer from `game/public/customers.json`. Their patience drains with round time and drops on a failed pull; when it runs out they take the generator and leave, and the round ends unsolved. The player sees a patience meter and the customer's lines; the result screen says whether the machine was fixed or the customer walked. All of it is pure, tested, and replayable from the log. No 3D characters yet: the customer is a name, a meter and speech lines until the character plan.

## ADRs relied on

- **0015** defines the rule, the data file, the events, and that wrong parts cost no patience.
- **0004** keeps the score a pure function of the log; a walked round is scored like an unfinished one, with no stars.
- **0005**: the daily customer comes from the same day seed as the fault. The daily itself is Phase 4; this plan adds only the pure choice and its test.
- **0007**: reactions follow the meter only, never a removal.
- **0003**: the validator style and "never throws, reports everything" carry over to customers.
- **0010**: patience in `core` and `app`; meter and lines in `ui`; `render` untouched.

## Simpler readings chosen

1. **No new log entry.** The walk-out time follows from the log and the customer: patience minus round time minus the cost of each failed pull. `core` computes it; the reducer refuses anything at or after it with `customer_left`. The action types in ADR 0004 stay as they are.
2. **`apply` takes the customer as an optional last argument.** Without it there is no patience, so existing tests, `npm run play` and logs from before this plan behave as now.
3. **Who notices the time.** `app` has no clock loop of its own; the interface's existing frame tick calls `game.tick()`, which ends the round when the walk-out time passes and emits `left`.
4. **Stars.** A walked round shows no stars: `stars` becomes `0 | 1 | 2 | 3`, and the breakdown gains `outcome: "fixed" | "walked" | null`.
5. **Draft lines.** Placeholder Pidgin lines, each marked as a draft in the data, for the owner or the mechanic to rewrite.
6. **Starting numbers**, all in the constants file or the data: patience 150 s (calm), 110 s (ordinary), 80 s (impatient); a failed pull costs 20 s; reactions at 50 percent and 20 percent. Every fault can be finished well inside 80 s by a player who knows the order (the slowest perfect play is about 25 s of actions), so these leave room for searching. To be tuned in play.

## Steps

1. **Data.** `game/public/customers.json` with three draft customers; `Customer` and `CustomerFile` types; `validateCustomers` (unique IDs, positive patience, every moment has at least one line, known `look`). Tests on the shipped file and on broken copies.
2. **Core.** Constants; `patienceAt(state, customer, t)`, `walkOutTime(state, customer)`; the reducer refuses with `customer_left` at or after the walk-out; scoring gives a walked round `outcome: "walked"`, its elapsed time, and no stars; `dailyCustomerId(day)` from the day seed. Tests for each, including that a wrong part changes nothing about patience and that a replayed log walks out at the same moment.
3. **App.** The round's customer (random in free play, never the same twice running), `game.tick()`, events `patience` at each threshold and `left`, `game.patience()` for the meter, the customer's line for each moment. Tests.
4. **UI.** The meter beside the timer, the customer's name and arrival line on the briefing, a speech line for each reaction, the result screen's walked version ("Tunde took the generator to another mechanic"), strings in `ui/strings.ts`. Tests for the pure helpers.
5. **Player and diagnostic.** `npm run play` also shows one walked round; the overlay shows patience and the walk-out time.
6. **Verify and release note.**

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run play`, `npm run size` pass.
- `npm run verify:phone` solves all six faults with customers present, no console errors, and a forced walk-out (a development-only `?patience=5`) ends on the walked result screen.
- Screenshots of the meter mid-round, a reaction line, and both result screens.

## Release note line

Added: every round has a customer whose patience drains with time and failed pulls; if it runs out they take the generator and leave (plan 0007, ADR 0015).
