---
id: 0027
title: The mechanic pulls the cord on screen, and the engine runs
status: proposed
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0027. The mechanic pulls the cord on screen, and the engine runs

## Context

On 2026-10-12 the owner wrote: "we need an animation that replace the: 'it starts' with an actually animation showing the mechanic starting the generator and it starting and running."

Today pressing Pull cord plays the cord and engine sounds (ADR 0018) and, when the fault is fixed, the round ends with the result screen titled "It starts!". Nothing moves on the machine. ADR 0020 says the hand does up loose parts' fasteners first as part of the pull. ADR 0026 has the customer pay and leave with the running generator after a fixed round. The machine model has one node per part and per fastener (ADR 0003, ADR 0020); there is no separate starter handle or rope to animate, so this touches the model contract.

## Decision

**The pull, every time.** Pressing Pull cord (after any loose parts are done up, as ADR 0020 says) plays the pull on the machine: the generator turns on the bench, if needed, so the recoil starter's handle faces the mechanic; the hand grips the handle and pulls it out sharply about 40 cm, the rope paying out of the starter, then lets it run back in. The `cord` sound and moment (ADR 0018) land on the pull. About 1 second.

**When the fault is fixed: it starts and runs.** The engine catches: the generator shakes on its rubber feet, a puff of exhaust comes from the muffler and then a faint haze, and it keeps running, shaking gently, with the `start` sound. After about 1.5 seconds of running, the customer's paying and leaving (ADR 0026) plays, and they carry it off still running. The result screen's title "It starts!" stays as the heading of the result, shown after all of this.

**When it is not fixed: it coughs and dies.** The engine turns over, coughs with a small dark puff, shudders and stops, with the `fail` sound; the handle is back in its housing and the round goes on. About 1.5 seconds. Patience costs and the log are as now (ADR 0004, ADR 0015).

**The model.** The recoil starter part gains two child nodes, `recoil_starter.handle` (the T-grip) and `recoil_starter.rope` (a short rope from the housing to the handle, stretched along its length by the game), named under the part like fasteners and checked by the asset check. They come off and go back with the recoil starter. If the starter is in the tray when the cord is pulled, the round cannot be fixed (as now) and the hand pulls nothing: the cough plays without a pull.

**Effects.** The shake is a transform on the machine group; the exhaust puff and haze are a few soft camera-facing sprites from the muffler's outlet, our own texture, no real-time lights or shadows, within ADR 0014's frame budget.

**Same for every fault (ADR 0007).** The pull is identical every time; what happens after depends only on fixed or not, which the player is already told.

**Skip.** A tap during the pull or the run skips to the next step, as ADR 0026's endings do.

## Consequences

The round's payoff is something the player sees, not only a title. The cost: a re-model and re-bake of the recoil starter's handle and rope, an asset-check change, the hand's pull and grip, the turn to the starter, the shake and the sprites, and every browser check that pulls the cord must wait for the animation. A pull takes about a second longer than today, which counts against the clock only for failed pulls (a fixed round's time stops at the winning pull, as now).

## History

- 2026-10-12: proposed by Claude, from the owner's message quoted above.
