---
id: 0015
title: The customer, their patience, and the mechanic's hand
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0015. The customer, their patience, and the mechanic's hand

## Context

On 2026-10-10 the owner played the Phase 3a build and wrote: "It looks good but we need to bring it a human hand that is removing the parts and also the customer that brings the generator for repair. we talked about impatience of some of them etc to make this feel like a game." Asked to choose, the owner picked a patience meter where the customer can walk away, a 3D customer in the scene, and a 3D hand that does the pulling.

Today the customer is only a line of text on the briefing screen, parts move on their own, and a round can only end with the engine starting. ADR 0001 lists exactly what the first version contains; this adds to that list. ADR 0004 defines the round; this adds a second way for a round to end. ADR 0005 (daily), ADR 0007 (no hints in player mode), ADR 0010 (layers) and ADR 0014 (budgets) are all touched. None of them is replaced.

## Decision

**Scope.** The first version gains a customer who brings the machine and waits, and the mechanic's hand. ADR 0001's exclusions still hold: no money, no haggling, no tips, no customer choice of price.

**Patience: the rule (core).**

- Each round has one customer. Each customer has a patience value in seconds.
- Patience starts full when the timer starts and drains by one per second of round time.
- A failed pull of the cord costs a fixed amount of patience (a starting value of 20 seconds, in the constants file). It is the only action that costs patience.
- Removing a wrong part costs no patience and draws no reaction. Otherwise the customer would tell the player which parts did not need to come off, which is the kind of hint ADR 0007 rules out. Wrong parts stay a silent score penalty, revealed on the result screen as now.
- When patience reaches zero the customer takes the generator and leaves. The round ends unsolved.
- Patience is a pure function of the action log and the time, like the score (ADR 0004). A round replayed from its log walks out at the same moment. The reducer refuses every action after the walk-out with a new refusal reason, `customer_left`.
- A finished round has an outcome: `fixed` or `walked`. A walked round has no stars. Its score breakdown still shows time, wrong parts and failed pulls, with `complete` false, as an unfinished round does today.
- In the daily (ADR 0005), a walked round uses up the one scored attempt, and everyone gets the same customer that day, chosen from the same day seed as the fault.

**Patience: what the player sees.** A patience meter near the timer. The customer's reactions follow the meter only (time passing, a failed pull, nearly out, leaving, and pleased when the engine starts), never a removal. The thresholds and the reactions live in data.

**Customers are data.** A new file, `game/public/customers.json`, separate from the machine because customers are not tied to one machine. Each entry has: `id`, `name`, `look` (which character model and outfit), `patience` (seconds), and `lines` for each moment (`arrive`, `waiting`, `annoyed`, `leaving`, `pleased`), written in Nigerian Pidgin by the owner or the mechanic. The validator checks every field and that every moment has at least one line. Agents draft placeholder lines, marked as drafts, the way fault complaints are drafts. The first version ships three customers with different patience: calm, ordinary and impatient.

**The 3D customer.** The customer stands in the scene behind and beside the machine, framed so the default camera shows their upper body without hiding any part. They have an idle loop and short animations for each moment (checking a watch, arms crossed, tapping a foot, walking off, nodding). The customer can never be picked; taps and pulls pass through them.

**The mechanic's hand.** A first-person 3D hand. On a pull it reaches the part, closes its grip, follows the part's motion (ADR 0008), and lets go over the tray. On a put-back it carries the part in and releases it. It is visible only while it acts. A blocked pull still shows nothing (ADR 0007): the hand does not move for a part that will not come off.

**How the characters are made.** Characters are modelled and rigged in Blender 4.5 (ADR 0012) to the standard of ADR 0013: they should read as real Lagos people, never as caricatures, and the owner approves each one. A free, open human-modelling tool may be proposed for this (for example the MakeHuman add-on for Blender, whose generated characters are CC0), and an AI generation tool may be used under ADR 0013's rule, but each tool needs the owner's written approval first. Animations are made in Blender or come from a source whose licence allows shipping them in the game; the licence is recorded beside each file.

**Budgets (adds to ADR 0014).**

| Item | Budget |
| --- | --- |
| Each customer model, with its animations | 1.5 MB, 15,000 triangles, one 1024 px texture set |
| The hand, with its animations | 400 KB, 4,000 triangles, one 1024 px texture set |
| Customers loaded per round | One: the round's customer only |

The machine keeps its own 5 MB and 60,000-triangle budget. The frame-rate budget is unchanged and must hold with the customer and the hand on screen.

**Layers (ADR 0010).** Patience, the outcome and the customer choice are `core` and `app`. `app` emits two new events, `patience` (the level at its thresholds) and `left`. `render` draws the customer and the hand; `ui` draws the meter and the speech line. Neither imports the other.

## Consequences

The round gains pressure and a face, which is what the owner asked for. The cost is real. The rule changes core, the log replay, scoring, the daily and the result screen, all with tests. The art is the larger part: a believable person and hand are much harder to make than the generator, and may need a person, an approved tool, or both. The scene needs framing for a standing person on a portrait screen. Each round now downloads up to about 1.9 MB more, which matters to players on expensive data.

Patience values and the failed-pull cost will need tuning against real play so that a careful player usually finishes and a careless one sometimes loses the customer.

Work this creates, for plans: the patience rule, customers.json and the result screen in one plan; the hand in a second; the customer character in a third, after the owner approves how characters are made.

## History

- 2026-10-10: proposed by Claude, from the owner's feedback quoted above and their choices of a patience meter with walk-out, a 3D customer, and a 3D hand on pulls.
- 2026-10-10: accepted by the owner, who wrote "Approved".
- 2026-10-11: its paragraph "The mechanic's hand", including "It is visible only while it acts", is replaced by ADR 0020 (the hand follows the pointer). The rest of this ADR stays in force.
