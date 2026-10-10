---
id: 0007
title: Player mode and diagnostic mode
status: proposed
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0007. Player mode and diagnostic mode

## Context

The brief (sections 6 and 8) says a blocked tap shakes the part, tints it, and shows a hint naming a part that must come off first. On 2026-10-10 the owner decided otherwise: working out the removal order is the game, so the player gets no help. Testers and the mechanic check still need to see why parts refuse. This ADR replaces the brief's feedback rule.

## Decision

**Two modes.**

- **Player mode** is the default and the only mode in production. A tap on a blocked part does nothing visible: no shake, no tint, no hint, no text. Nothing is logged. The player has to work out the order.
- **Diagnostic mode** is internal. It shows why the last tap refused, which parts are currently removable, the active fault and culprit, the live action log, and the frame rate.

**Enabling diagnostic mode.** Diagnostic code is behind a build-time flag and is absent from production builds. In development builds it is turned on with a URL query parameter. There is no hidden gesture in the game. (The owner may add one by superseding this ADR.)

**Tap acknowledgement.** In player mode every tap on any part, removable or not, gets the same brief press response so the player can tell the game heard the tap. It carries no information about whether the tap was allowed. A successful removal then continues into its animation. (The owner may strike this clause before accepting.)

**Core unchanged.** The core reducer still returns a typed refusal with a reason for a blocked action, as in ADR 0004. Player mode discards the reason; diagnostic mode displays it.

## Consequences

The game is harder and more satisfying. Testing needs development builds. The brief's shake-and-hint text is superseded; agents must not reintroduce it.

## History

- 2026-10-10: proposed by Claude, from the owner's instruction.
