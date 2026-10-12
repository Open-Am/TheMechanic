---
id: 0027
title: The mechanic pulls the cord on screen, and the engine runs
status: accepted
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

**When the fault is fixed: it starts and runs, the customer pays, the mechanic stops it.** The engine catches: the generator shakes on its rubber feet, a puff of exhaust comes from the muffler and then a faint haze, and it keeps running, shaking gently, with the `start` sound. While it runs, the customer smiles and holds out the folded naira notes across the bench (ADR 0026), and the mechanic's hand takes them. Then the hand presses the red engine switch on the front panel: the engine winds down, the shaking stops and the haze fades. Only then does the customer lift the generator and leave happily, carrying it stopped. About 4 to 5 seconds from the catch to the customer leaving. The result screen's title "It starts!" stays as the heading of the result, shown after all of this.

This replaces one detail of ADR 0026: there the customer lifts "the running generator"; here the mechanic stops it first. The rest of ADR 0026 stands.

**When it is not fixed: it coughs and dies.** The engine turns over, coughs with a small dark puff, shudders and stops, with the `fail` sound; the handle is back in its housing and the round goes on. About 1.5 seconds. Patience costs and the log are as now (ADR 0004, ADR 0015).

**The model.** The panel's red engine switch becomes its own child node, `base_panel.switch`, so the hand can press it and the rocker can flip. The recoil starter part gains two child nodes, `recoil_starter.handle` (the T-grip) and `recoil_starter.rope` (a short rope from the housing to the handle, stretched along its length by the game), named under the part like fasteners and checked by the asset check. They come off and go back with the recoil starter. If the starter is in the tray when the cord is pulled, the round cannot be fixed (as now) and the hand pulls nothing: the cough plays without a pull.

**Effects.** The shake is a transform on the machine group; the exhaust puff and haze are a few soft camera-facing sprites from the muffler's outlet, our own texture, no real-time lights or shadows, within ADR 0014's frame budget.

**Same for every fault (ADR 0007).** The pull is identical every time; what happens after depends only on fixed or not, which the player is already told.

**Skip.** A tap during the pull or the run skips to the next step, as ADR 0026's endings do.

## Consequences

The round's payoff is something the player sees, not only a title. The cost: a re-model and re-bake of the recoil starter's handle and rope, an asset-check change, the hand's pull and grip, the turn to the starter, the shake and the sprites, and every browser check that pulls the cord must wait for the animation. A pull takes about a second longer than today, which counts against the clock only for failed pulls (a fixed round's time stops at the winning pull, as now).

## History

- 2026-10-12: proposed by Claude, from the owner's message quoted above.
- 2026-10-12: revised before acceptance, from the owner's next message: "Once it starts, the customer will smile and hand the money over to the mechanic who will receive the money an then stop the generator before the customer leave with it". The customer pays while it runs, the mechanic switches it off, then the customer carries it away stopped.
- 2026-10-12: accepted by the owner, who wrote "I am also approving adr 27 and plan 18".
- 2026-10-12: timing clarified by the owner, who wrote "The start should run a little longer and the customer smiles and then pays while it's still running and then the mechanic stops the generator". The decision text stands; as the owner's clarification, a fixed round now plays: the catch, the engine running on its own for about 3 seconds, the customer's smile (about 0.6 s), the notes held out and taken while it still runs (about 0.9 s), the hand to the red switch and the press (about 0.6 s), the wind-down (about 0.8 s), then the customer lifts it and leaves (about 1.1 s). From the catch to the customer leaving is about 7 seconds, not the 4 to 5 seconds written above.
