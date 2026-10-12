---
id: 0026
title: The customer brings the generator, and pays or storms off with it
status: accepted
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0026. The customer brings the generator, and pays or storms off with it

## Context

On 2026-10-12, with the workbench scene accepted (ADR 0025), the owner wrote: "We need an animation for when a customer brings the generator and drop it on the table and when the customer takes the generator to leave (angryly when it was not fixed on time or Pay the mechanic and happily leave when it was fixed)."

ADR 0015 already says that when patience runs out "the customer takes the generator and leaves", and gives the customer short animations for each moment, including walking off and nodding. It does not say how the generator arrives, and it has no payment. ADR 0001 lists money among the things the first version does not build. Paying here is a moment in an animation, not money in the game, but because it touches that list, this ADR says so plainly.

## Decision

**Arrival.** After the player presses Start, the round's customer walks up to the bench carrying the generator and sets it down on the bench in front of the mechanic, then steps back to their place across the bench. About 3 seconds. The timer and patience start when the generator is down, so the arrival costs no time and no patience, and the daily stays fair (ADR 0005). A tap anywhere skips the rest of the arrival and puts the generator down at once.

**Fixed: pay and leave happily.** When the engine starts and the round ends fixed, the customer smiles, hands the mechanic a few folded naira notes across the bench, the mechanic's hand takes them, and the customer lifts the running generator and walks off pleased. About 3 seconds, then the result screen. A tap skips to the result.

**Not fixed in time: storm off.** When patience runs out (ADR 0015), the customer shakes their head, snatches the generator off the bench and walks off angrily, without paying. About 2.5 seconds, then the result screen. A tap skips to the result. Parts the player had taken off go back onto the machine as the customer reaches for it, quickly and without the hand, so the customer carries away a whole generator; the tray empties.

**Payment is only an animation.** No amount is shown, nothing is counted, saved or spent, and the score and the action log do not change (ADR 0004). There is no wallet, no earnings and no shop. Anything more than this moment needs its own ADR under ADR 0001.

**Same for every fault (ADR 0007).** The arrival is identical for every fault; the endings depend only on the outcome (fixed or walked), never on which part was bad.

**What it is made of.** Clips on each customer's existing skeleton (`arrive`, `pay_leave`, `storm_off`), keyframed in Blender by `customer.py`, within ADR 0015's budget per customer. The generator group is carried by attaching it to the customer's hands; the naira notes are a small prop of our own (under 300 triangles, in the customer file or the tools file). The mechanic's hand reaches for the notes using the existing hand rig. Sounds, if any, are a separate decision (ADR 0018); this ADR adds none.

## Consequences

The round has a beginning and an end that read as a real roadside job, and the customer's mood is clearest when it matters most. The cost: three more clips per customer, a carried generator (the machine group re-parented during the animation and put back on the bench after), a skip path for each, the timer starting after the arrival, and the result screen waiting for the ending. The browser checks must time rounds from the generator landing and test each skip. The player waits about 3 seconds more per round unless they tap.

## History

- 2026-10-12: proposed by Claude, from the owner's message quoted above.
- 2026-10-12: the owner confirmed the two readings put to them (parts snap back on so the customer carries off a whole generator; the timer starts when the generator lands), writing "both decisions are correct". Still proposed until accepted in writing.
- 2026-10-12: accepted by the owner, who wrote "i accept adr 26 and plan 17".
- 2026-10-12: ADR 0027 changes one detail: the customer pays while the engine runs and the mechanic switches it off before the customer lifts it, so it leaves stopped, not running. The rest of this ADR stands.
- 2026-10-12: ADR 0033 replaces "no wallet, no earnings and no shop" for the workshop day. The rest stands.
