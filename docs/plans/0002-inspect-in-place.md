---
id: 0002
title: Inspect parts in place
status: approved
date: 2026-10-10
adrs: [0003, 0004, 0010, 0011]
branch: plan/0002-inspect-in-place
---

# 0002. Inspect parts in place

## Goal

The core allows `inspect` on a visible installed part as ADR 0011 says, with the `hiddenBy` field in the data and validator, tests for every new rule, and the text-mode player showing an in-place inspection. Nothing visual.

## ADRs relied on

- **0011** defines the field, the default, the rule and the refusal.
- **0003** gains the optional field; no existing field changes.
- **0004** keeps tray inspection as is.
- **0010** keeps condition text behind one function.

## Exploration summary

Done in this session. Touch points: `types.ts` (field and refusal reason), `rules.ts` (who hides a part, visibility), `validate.ts` (unknown entries, warning when an entry is not in `requires`), `reducer.ts` (inspect branch), `machine.json` (`fuel_tank`), tests, `play.ts`.

## Steps

1. Types and data: `hiddenBy?: PartId[]`, refusal reason `hidden_by`, `"hiddenBy": []` on `fuel_tank`.
2. Rules: `hiders(machine, state, partId)` returns installed parts from `hiddenBy` (defaulting to `requires`); `isVisible`.
3. Validator: error on an unknown entry, warning on an entry not in `requires`.
4. Reducer: `inspect` passes when in the tray, or installed and visible; refuses `hidden_by` with the hiders.
5. Tests: tank inspectable at start; spark plug refused with `["plug_cap"]`, then allowed once the cap is off; capacitor hidden by the cover; a `hiddenBy` entry outside `requires` warns; an unknown entry errors; every fault still plays to completion.
6. Player: each fault's play starts by inspecting one visible part in place, so the output shows the rule working.
7. Release note 0.1.0 gains a line.

## Done when

- `npm test` passes with the new tests.
- `npm run play` shows an in-place inspection per fault and exits 0.
- `npm run docs:check` passes.

## Release note line

Added: a part can be inspected where it sits when nothing covers it, driven by a `hiddenBy` field with a safe default (plan 0002, ADR 0011).
