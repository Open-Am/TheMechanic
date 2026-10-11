---
id: 0019
title: Visible bolts and screws
status: accepted
date: 2026-10-11
supersedes: []
superseded_by: null
---

# 0019. Visible bolts and screws

## Context

On 2026-10-11, asked how removal could feel better, the owner chose, among others, "Visible bolts first: covers held by bolts or screws you take out one by one before the cover comes off."

Today a bolted part comes off in one gesture. `machine.json` (ADR 0003) has no field for fasteners; ADR 0003 says a new field needs an ADR. ADR 0001 fixes twelve removable parts. ADR 0004 defines the action log and the wrong-part penalty. The real machine's fasteners are not recorded anywhere: how many, what heads, which parts (`docs/open-questions.md` notes the fuel tank may be "held by screws, lifting off whole"). ADR 0017 (proposed) gives `unscrew` a twist gesture.

## Decision

**Fasteners are part of how a part comes off, not parts.** The twelve removable parts of ADR 0001 stay twelve. A fastener is never a wrong part, never goes in the tray, never appears in the fault data, and has no condition.

**Data (adds to ADR 0003).** A part may carry an optional `fasteners` list. Each entry has:

- `id`: unique across the machine, written `<part id>.<name>`, for example `alternator_cover.bolt_1`.
- `kind`: `bolt`, `screw` or `nut`.
- `position`: where it sits, in the machine's axes and metres, as `placeholder.position` is.
- `axis`: the direction it backs out along, as a unit vector.

The validator checks every field, that ids are unique, and that each fastener's part exists. Counts and kinds for gen950 are drafts, like the rest of the machine data, and every doubt goes in `docs/open-questions.md` for the mechanic.

**Model (adds to the GLB contract).** Each fastener is its own node in `model.glb`, named by its id. The asset check enforces it. Fasteners count towards the machine's triangle and size budget.

**How it plays.**

- A part's fasteners can be turned only when the part itself could come off. On a blocked part they do not turn, exactly as the part does not move (ADR 0007, ADR 0017).
- Each fastener comes out with the twist gesture of ADR 0017: one full circle of the finger, whatever its real thread count, so a cover with four bolts is four short twists, not twenty.
- A fastener that is out sits beside its hole. When every fastener of a part is out, the part comes off with its own gesture, freely, without the `unbolt` break-loose.
- A part with fasteners still in does not move under the finger, the same as a blocked part.
- When a part comes off, its fasteners go with it. When it is put back, the hand does its fasteners up as part of the put-back animation, with no extra gesture.
- If the player leaves fasteners out and pulls the cord, the hand does them up first, as part of the pull.

**Rules and scoring do not change (ADR 0004).** Fasteners are a matter for the render layer. The core sees one `remove` when the part comes off, as now. Undoing fasteners costs only the time it takes. The log, replay, the daily and the score are unchanged, so no new action type is needed.

**Tools in the hand.** While undoing or doing up a fastener, the hand holds a spanner (bolts, nuts) or a screwdriver (screws). They are visuals, not a player's choice: there is no tool to pick, buy or upgrade, and AGENTS.md's "do not build tools" (no tool inventory or upgrades) still holds. The two tools are one small model, `game/public/hand/tools.glb`, at most 100 KB and 2,000 triangles, made in Blender to ADR 0013's standard.

## Consequences

Covers come off the way they do on the roadside: bolt by bolt, then the cover. The core and scoring stay simple. The cost: new data and validation, every bolted part remodelled with separate fastener nodes, a tools model, more gesture work, and longer rounds, which counts against the clock and the customer's patience, so patience values will need retuning. The fastener counts are guesses until the mechanic checks them; if real covers have more bolts than is fun, the data can show fewer than the real machine, and that choice gets written down.

## History

- 2026-10-11: proposed by Claude, from the owner's choice quoted above.
- 2026-10-11: accepted by the owner, who wrote "I approve the 3 new adr and plan".
