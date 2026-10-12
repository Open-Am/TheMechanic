---
id: 0021
title: The toolbox, and the hand fetching and returning its tools
status: accepted
date: 2026-10-11
supersedes: []
superseded_by: null
---

# 0021. The toolbox, and the hand fetching and returning its tools

## Context

On 2026-10-11, while plan 0011 (fasteners and the spanner and screwdriver) was being built, the owner wrote: "we need that hand to hold the screwdriver or whatever tool is required to unfasten each of those bolts. [...] So that will be like a [...] video animation that is played at the point someone double-clicks something. So when you double-click something, right, the hand goes, pick up the tool, and it could be like a toolbox somewhere. And then it uses it to loosen the bolts. Or you know, use a spanner if spanner that is needed. And then drops it and the hand goes back so that the user can now pull."

ADR 0020 already has the hand hold a spanner (bolts, nuts) or a screwdriver (screws) while it undoes and does up fasteners, as visuals only, from one small model. It does not say where the tool comes from or goes back to, and there is no toolbox in the scene. ADR 0001's list of what not to build includes "tools", meaning tools as something to pick, buy or upgrade. This ADR adds the toolbox and the hand's trips to it. It changes nothing in ADR 0020 beyond saying where the tools are kept.

## Decision

**A toolbox in the scene.** A mechanic's toolbox sits on the ground beside the generator, inside the default view and clear of the machine: a worn metal toolbox, lid open, with the spanner and the screwdriver in it. It is scenery: it cannot be picked, it never blocks the pointer, the hand never stays on it, and it carries no information about the fault. It is modelled in Blender by script to ADR 0013's standard, from our own materials. Budget: 3,000 triangles, 200 KB, one 1024 px texture set, in its own file next to the tools. If the file is missing, the hand takes the tool from just off screen instead.

**The loosening sequence becomes a short scripted animation, played in the scene.** When the player loosens a part that has fasteners (ADR 0020: a double tap, a double click, or G):

1. The hand leaves the pointer and goes to the toolbox.
2. It picks up the tool the first fastener needs: a spanner for bolts and nuts, a screwdriver for screws.
3. It undoes each fastener in turn with it, as ADR 0020 says. If a part's fasteners need different tools, the hand changes tool at the toolbox between them.
4. It frees the part by its motion type.
5. It puts the tool back in the toolbox.
6. It returns to the pointer, and the part sits loose, ready to be carried to the tray.

It is a 3D animation played live, not a video file, so it is seen from wherever the player has turned the view. A part without fasteners loosens as now, with no trip to the toolbox. Putting a part back runs the same trip: fetch the tool, do the fasteners up, return it. Before the cord is pulled, loose parts' fasteners are done up quickly without a trip.

**While the sequence plays.** It takes about 1.5 to 3 seconds depending on the fasteners; the clock runs. The player can still turn and zoom the view; the hand finishes the sequence before it follows the pointer again, and a new loosen waits until it is done. Nothing in the sequence differs between parts except their own fasteners and motion, so it shows nothing about the fault (ADR 0007).

**Still not a tool feature.** There is no tool to choose, buy, upgrade or lose. The hand always takes the right tool by itself. ADR 0001's exclusion stands.

**Rules and scoring do not change (ADR 0004).** The core sees `remove` and `install` as now. The trip to the toolbox costs only its time.

## Consequences

Loosening becomes a small piece of theatre that shows the mechanic's craft, which is what the owner asked for, and the toolbox gives the scene a sense of place. The cost: removals that need tools take a second or two longer, which counts against the clock and the customer's patience (just raised five times, so it fits); a second small model to make and check; the hand's choreography grows (travel to the toolbox from any view, tool changes, the sequence surviving a turn of the view); and the toolbox must be placed so it is visible in the default view on a portrait phone without crowding the machine. The spark plug, which a real mechanic takes out with a plug spanner, still comes out by hand; a plug spanner could be a later addition.

Work this creates, for a plan: the toolbox model and its place in the scene, and the fetch, use and return sequence, built on plan 0011's fasteners and tools.

## History

- 2026-10-11: proposed by Claude, from the owner's message quoted above.
- 2026-10-11: accepted by the owner, who wrote "I approve ADR 21."
- 2026-10-12: ADR 0025 (the workbench) moves the toolbox from the ground to the left end of the bench. The rest of this ADR stands.
- 2026-10-12: ADR 0033 replaces "There is no tool to choose, buy, upgrade or lose": in the workshop day tools can be bought and are shown in the toolbox. The rest stands.
