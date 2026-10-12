---
id: 0025
title: The generator on a workbench, the customer across it
status: accepted
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0025. The generator on a workbench, the customer across it

## Context

ADR 0015 puts a 3D customer in the scene, behind and beside the machine, with their upper body in the default view. Built as planned (plan 0015), that cannot work: the camera sits about 1.1 m above the ground looking down at a generator on the floor, so nothing higher than the camera can be on screen, and a standing customer shows only from the waist down. On 2026-10-12 the owner compared renders of several ways out, liked a small live picture of the customer in a corner, and asked for one more: "the generator is on top of a table and the customer characters are behind the table. So it looks more like how it will be." Renders of that (a roadside workbench, the camera at a standing mechanic's eye level, the customer across the bench) showed the customer from head to waist with the generator as large on screen as today. The owner chose it: "I go with your recommendation."

This changes three things accepted ADRs decided: where the machine's shadow is baked (ADR 0014), where the toolbox stands (ADR 0021), and what a drag that is not a carry does (ADR 0020: "every other drag turns the machine", today built as the camera moving round the machine). Each of those ADRs gets a history line saying which part this one replaces; the rest of each stands.

## Decision

**The workbench.** The generator stands on a worn wooden roadside workbench: top about 0.78 m high, about 1.15 m wide and 0.65 m deep, planks with gaps and oil stains, four legs. It is scenery: never picked, never blocks the pointer, carries no information about the fault. Modelled in Blender by script to ADR 0013's standard, from our own materials. Budget: 3,000 triangles, 300 KB, one 1024 px texture set, in its own file. If the file is missing, the game draws a plain box-shaped bench in its place.

**The camera.** The default camera is at a standing mechanic's eye level on the near side of the bench, about 1.6 m high, looking down at the generator about 12 degrees. It is framed so the generator fills about 60 percent of the screen's width at 390 by 844 and sits above the controls, with the customer's head and shoulders above it. On shorter screens the camera stands back until a 1.76 m customer's head clears the timer, and the generator may shrink to no less than 40 percent of the width.

**Turning.** The customer must stay across the bench, so the camera no longer goes round the machine. A sideways drag that is not a carry turns the generator on the bench about its upright axis, as a mechanic would turn it by hand; the held spot stays as close under the pointer as the turn allows, as ADR 0020 already says. An up-and-down drag raises or lowers the camera within limits to see the top or lower down. The machine can be turned all the way round; everything else in the scene stays still.

**The shadow.** ADR 0014's baked contact shadow is baked onto the bench top instead of the ground, under the same budget (512 px, 64 KB) and the same simplification (not updated when parts come off).

**The toolbox.** ADR 0021's toolbox stands on the left end of the bench instead of on the ground, cut by the screen's left edge so its open tray and tools show, as the owner chose for its ground place on 2026-10-12. The arm still reaches it from below on the left.

**The customer.** Stands about 0.35 m behind the bench's far edge, facing the mechanic, fixed in the scene. Plan 0015 places them there.

**Unchanged.** Rules, scoring and the action log (ADR 0004); ADR 0007 (no hints); picking, hit volumes, the hand, loosening and carrying (ADR 0020) apart from what a non-carry drag turns; the budgets of ADR 0014 for the machine, hand, tools and toolbox.

## Consequences

The scene reads as a real roadside workshop, and the customer's face and reactions are visible while the player works, which is what ADR 0015 wanted. The cost: a new model to make and check; the camera, framing and turning code changes, with all browser checks re-tuned; the view is flatter than today, so the player sees more of the generator's front and less of its top and turns it more; on small screens the generator is smaller than today; the shadow is re-baked; the toolbox moves again. Plan 0015's game steps wait for this.

## History

- 2026-10-12: proposed by Claude, from the owner's choice quoted above.
- 2026-10-12: accepted by the owner, who wrote "I accept adr 25 and plan 16".
