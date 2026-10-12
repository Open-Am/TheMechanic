---
id: 0029
title: Diagnosis checks before and while taking parts off
status: accepted
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0029. Diagnosis checks before and while taking parts off

## Context

On 2026-10-12 the owner asked for "a way to gamify this better" and chose all four directions in `docs/design/gamification-proposal.md`: a workshop day, real diagnosis clues, earning and upgrading, and badges and records. Asked how far to go overnight, the owner chose the option labelled "Build all four directions", whose text was: "You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details."

Today the only clues are the customer's complaint, the symptom line on the briefing, and each part's condition when it is inspected. A careful player has nothing to reason with before opening the machine, so finding the fault is mostly removal order and luck. The new faults (ADR 0030) make this worse: a weak ignition coil and a fouled plug give the same complaint, and only a test tells them apart.

This touches ADR 0004 (the action log, the score), ADR 0003 (the fault data), ADR 0007 (no hints), ADR 0015 (only a failed pull costs patience), ADR 0021 (the toolbox) and ADR 0027 (the pull looks the same for every fault). None is replaced whole.

## Decision

### Six checks, a fixed list

A check is something the player chooses to do to learn about the engine. There are exactly six. Their ids are a fixed vocabulary in `core`, like the symptom ids.

| Check | Kind | What the player does | Possible when | Cost (seconds) |
| --- | --- | --- | --- | --- |
| `listen_pull` | listen | Pulls the cord once and listens | every part installed | 3 |
| `look_smoke` | look | Pulls the cord once and watches the exhaust | every part installed | 3 |
| `look_plug` | look | Reads the spark plug's tip | `spark_plug` in the tray | 2 |
| `spark_test` | test | Clips a spark tester to the plug lead and pulls the cord | `spark_plug` in the tray, `recoil_starter` installed | 4 |
| `fuel_flow` | test | Opens the tap and watches fuel run from the hose's place into a bottle | `fuel_hose` in the tray, the fuel tank and tap installed | 3 |
| `volts_test` | test | Starts it and puts a test bulb on the output socket | every part installed | 4 |

- **Each check can be done once per round**, and only while the fault is not fixed. The player already knows when they have fixed it (they pressed Fix), so refusing checks after that says nothing new.
- **Where a check is possible is data, not code.** `machine.json` gains a `checks` object keyed by check id. Each entry says which parts must be off (`off`), which must be on (`on`), or that every part must be on (`allOn: true`), and which tester the hand uses (`tool`). Adding another machine needs no new code. The validator rejects an unknown check id, a part id that is not a part, and a machine that leaves out any of the six.
- **The cost** is a number of seconds per check, in `core/constants.ts`. It is added to the score and taken from the customer's patience, on top of the real time the check's animation takes (kept under 1.5 seconds). ADR 0033 lets bought tools lower some of these costs; nothing else changes them.

### What each check shows is fault data

- Each fault in `faults.json` gains `clues`: an object with one short line of player text for every one of the six checks, for example `"spark_test": "No spark jumps the tester's gap."`. The validator rejects a fault that is missing a check, has an unknown check id, or has an empty line. `faults.json` moves to `"schema": 2`. This extends ADR 0003; no existing field or id changes.
- The text describes what is seen, heard or measured, the same whichever tool did the check (ADR 0033), and never names the bad part.
- Like inspection (ADR 0010), the interface gets a check's result only through one `app` call, `resultOf(checkId)`, never by reading the fault data.
- Every fault needs a line for every check, so a missing line can never itself be a clue.
- The lines are drafts, `verified: false` with the rest of the fault, for the mechanic to check. Drafts for the six existing faults are in plan 0019; for the new faults, in ADR 0030.

### The action log and the reducer (extends ADR 0004)

- A new action type, `check`, with a `checkId` field: `{ t, type: "check", checkId }`. The five existing types are unchanged.
- The reducer applies a check if it is possible now, not yet done this round, and the fault is not fixed. Otherwise it refuses with `check_unavailable`, `already_checked` or `already_fixed`. Refused checks are not logged, as now.
- The round state gains the list of checks done. Replay and score stay folds over the log, and a test proves a log with checks replays to the same state and score.

### The score (extends ADR 0004)

`score = elapsedSeconds + 10 × wrongParts + 15 × failedPulls + checkSeconds − cleanBonus`, never below 0.

- `checkSeconds` is the sum of the costs of the checks done.
- `cleanBonus` is 10 when the round is fixed with no wrong parts and no failed pulls (a "clean diagnosis"), otherwise 0.
- The star thresholds are unchanged. Every number is in `core/constants.ts`. The breakdown on the result screen gains a "Checks" row and a "Clean job" row when they are not zero.

### Patience (changes one sentence of ADR 0015)

ADR 0015 says a failed pull "is the only action that costs patience". From this ADR, a check also costs patience: its cost in seconds, the same as it adds to the score. Removing a wrong part still costs nothing and draws no reaction. Patience stays a pure function of the log and the time.

### What the player sees

- A **Check** button beside Pull cord opens a short list of the six checks, each with its name and cost. A check that is not possible now is shown greyed with what it needs, in words the player can already see ("Needs the spark plug out", "Needs every part on"). That is a fact about the visible state of the machine, not about the fault, so ADR 0007 holds. A check already done shows its result instead.
- The result appears on a card like the inspect card, and stays in a **notes** list for the round that the player can reopen. The notes are built from the log.
- **The hand does the check** with a tester from the toolbox (ADR 0021's trip): an old spark plug used as a spark gap (`spark_test`), a test bulb on a lead (`volts_test`), a clear bottle (`fuel_flow`). These are visuals only: the hand takes the right one by itself, and nothing is chosen, bought or lost, until ADR 0033's shop. They live in their own small model, `game/public/hand/testers.glb`, budget 2,000 triangles, 100 KB, one 512 px texture set, made to ADR 0013's standard. If the file is missing, the check plays without the hand's trip.
- `listen_pull` and `look_smoke` play the pull of ADR 0027 and then what the fault's symptom does (no fire; fires and dies; runs, then the hand switches it off). The briefing already tells the player the symptom, so this adds nothing beyond the clue line. The ordinary Pull cord stays exactly as ADR 0027 says: the same for every fault.
- Sound: the checks use the existing moments (`cord`, `fail`, `start`, `run`); no new sound files.

### Unchanged

- ADR 0007: results come only from checks the player chooses. A blocked part still gives nothing. A check never reacts to which parts are off beyond its own stated needs.
- ADR 0005: the daily has the same checks and costs for everyone.
- Diagnostic mode (ADR 0007) also shows the checks possible now and their results.

## Consequences

The player can reason before taking things apart: listen, look, test, then open the right part. A good mechanic saves wrong parts (10 each) for a few seconds of checks. The new faults become fair puzzles. The cost: a new action type through core, app, ui, render and the browser checks; a data extension with a line per fault per check (72 lines for twelve faults) that the mechanic has to read; a small new model; a busier screen on a small phone. Bests saved under ADR 0022's format before this change were scored without checks or the clean bonus, so they are not quite comparable; ADR 0031 moves to a new key and starts fresh.

The spark plug's `inspectOk` today says "Tip is light brown". Some faults' `look_plug` lines describe a wet or sooty tip (from the engine, not the plug). Plan 0019 rewords `inspectOk` to describe the plug itself (a wording change, no ADR). Whether the plug cap must be off for a spark test, and where the tester clips, are for the mechanic; the data reads "the spark plug in the tray".

## History

- 2026-10-12: proposed by Claude, from the owner's choice quoted above.
- 2026-10-12: accepted by the owner in advance, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.") before going to bed; the owner reviews the result in the morning, and the tag before-gamification marks the game before this work.
