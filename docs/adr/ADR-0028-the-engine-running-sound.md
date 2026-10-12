---
id: 0028
title: The engine's sound runs as long as the engine does
status: proposed
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0028. The engine's sound runs as long as the engine does

## Context

ADR 0018's table gives "Engine starts: a short burst of the engine running". ADR 0027 (with the owner's later timing) has the engine run on the bench for about 5 to 6 seconds: about 3 seconds on its own, then while the customer smiles and pays, until the mechanic switches it off and it winds down. A short burst no longer fits. On 2026-10-12, after playing the preview, the owner wrote: "the generator sound when it starts does not sound like a successful start." The current stand-in is a chainsaw revved three times that dies away.

## Decision

- The "Engine starts" moment becomes two parts: a **catch** (the engine firing up, surging and settling, about 1 to 4 seconds, as real small engines do) followed by the **running** sound (a steady idle of a small two-stroke generator) that keeps playing for as long as the engine runs on screen. The running part is a seamless loop of 1 to 3 seconds, cut at zero crossings, played on repeat.
- When the mechanic presses the switch (ADR 0027), the running sound fades out over the wind-down (about 0.8 seconds). A tap that skips the ending stops it at once.
- Vibration is unchanged: one pattern under 300 ms at the catch.
- The files are one recording or two (`start.ogg` for the catch and `run.ogg` for the loop), from our own recordings or CC0 only (ADR 0018, as the owner settled), listed in `game/public/audio/LICENCE.md`. All sound files together stay within 250 KB.
- The rest of ADR 0018 stands.

## Consequences

A fixed round ends with the sound of a generator that works, which is the payoff the owner wants. The cost: finding a CC0 recording of a small generator starting and idling (or the owner recording the real machine, which ADR 0018 already prefers), a loop that does not click, and audio code that can start, loop and fade a sound instead of only firing one-shots.

## History

- 2026-10-12: proposed by Claude, from the owner's message quoted above.
- 2026-10-12: revised before acceptance: the catch may run 1 to 4 seconds, because no CC0 recording found settles in under 1.5 seconds and the surge is what makes it sound like a real start; it fits inside ADR 0027 run-alone phase of about 3 seconds.
