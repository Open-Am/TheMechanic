---
id: 0004
title: Round rules, scoring and the action log
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0004. Round rules, scoring and the action log

## Context

The brief (section 6) defines a round, the score and the action log. The score must be a pure function of the log so that a server can re-score it later. This ADR fixes the rules and says how the core is shaped to keep them pure. Feedback on a blocked tap is decided in ADR 0007, not here.

## Decision

**Round.** Briefing (complaint plus symptom text), then working, then test, then result. The timer starts when the briefing is dismissed.

**Remove.** An installed part comes off only if every part in its `requires` is already off. **Put back.** A part in the tray goes back only when every part that lists it in `requires` is already back on. **Inspect** opens a card with the part's name, what it does, and its condition: `inspectOk`, or the fault's `inspectBad` if the part is the unfixed culprit. **Fix** is offered only on the unfixed culprit's card. **Pull cord** is enabled only when every part is installed; it ends the round if the culprit is fixed, otherwise records a failed pull and the round continues.

**Scoring.** Lower is better. `necessary` is the culprit plus everything in its `requires`, transitively. `wrongParts` is the number of distinct parts removed that are not in `necessary`. `score = elapsedSeconds + 10 × wrongParts + 15 × failedPulls`. Stars: 3 at 45 or under, 2 at 90 or under, otherwise 1. Every constant lives in one file. Thresholds are expected to be tuned, by a superseding ADR.

**Action log.** Each action is `{ t, type, partId? }`, `t` in milliseconds since the timer started, `type` one of `remove`, `inspect`, `fix`, `install`, `pull`. Blocked attempts are not logged. The round's state and score are reproducible from the log alone, and a test proves it.

**Shape of the core.** `game/src/core` exposes a pure reducer: given machine, fault, state and an action it returns the next state or a typed refusal with a reason. Replay and score are folds over the log. The fix delay of about two seconds is an interface matter; the core records `fix` at whatever `t` arrives. The core imports no Three.js and no DOM, and a test enforces that.

## Consequences

Leaderboards and replays become possible later without changing the game. The interface can never invent a rule; it can only submit actions and display refusals.

## History

- 2026-10-10: proposed by Claude, from the brief.
- 2026-10-10: accepted by the owner, who wrote "I accept all the ADRs as is", with ADR 0002 held back for an architecture discussion.
- 2026-10-12: ADR 0029 adds the `check` action and the clean-job bonus to the score; ADR 0033 makes the kit an input to the reducer and score in the workshop day. The rest stands.
