---
id: 0020
title: The hand follows the pointer; loosen a part, then drag it to the tray
status: proposed
date: 2026-10-11
supersedes: [0016, 0017, 0019]
superseded_by: null
---

# 0020. The hand follows the pointer; loosen a part, then drag it to the tray

## Context

On 2026-10-11, after trying release 0.8.0, the owner wrote: "I've looked at the hand and it's much better. But there's a problem. I think the hand should follow the mouse cursor. [...] It should follow the mouse. And only pull the things that the mouse is [...] trying to point at. [...] the user puts his hand forward and automatically puts the [...] mouse forward and automatically the hand appears following it. If he pushes it to a part where it's going to be moving the generator, it would automatically move the generator. [...] and then if he pulls, it will be able to pull something out."

Reading the first draft of this ADR, the owner added: "Let the removal be deliberate. double tap on phone and maybe on phone as well to start the removal process, the user still need to press and drag to the tray. also pressing the letter "G" while trying to drag also does that removal process. note the double tap and the G tap runs the animation for unfastening the screens etc that gets the piece ready for removal."

Today the hand is an animation: it reaches in from the side a part comes off (ADR 0015) or holds the base plate while the view turns (ADR 0016), and a 40 px drag along a part's path takes it off. ADR 0017 (accepted, not built) gives each kind of part its own gesture; ADR 0019 (accepted, not built) has each bolt or screw twisted out by the player before a cover comes off. The owner now wants the hand to be the player's own hand, and removal to be two deliberate steps: loosen the part, then carry it to the tray.

This ADR supersedes ADR 0016, ADR 0017 and ADR 0019 whole, restating what stays (MakeHuman and the hand's file; the motion vocabulary; fasteners as data and model nodes, the tools in the hand, scoring unchanged) so they can be retired. It replaces the paragraph "The mechanic's hand" of ADR 0015, including "It is visible only while it acts"; the rest of ADR 0015 (customers, patience, budgets, layers) stays in force, and its history gets a line saying so. ADR 0018 (sound) stands; its "turn" and "gives" moments now come from the loosening animation. ADR 0007 (no hints in player mode) and ADR 0004 (the action log) still hold.

## Decision

### The hand is the pointer

- **Mouse.** While a round is running and the mouse is over the 3D view, the hand is there, relaxed and open, its fingertips on the spot the cursor points at: on the machine when the cursor is over it, at the machine's depth when it is not. The forearm runs off the bottom of the screen towards the right, re-aimed as the cursor moves. Over the tray, a button or a card, or off the page, the hand withdraws.
- **Touch.** A phone has no cursor. The hand comes in under the finger when it touches the 3D view, follows the finger, and withdraws when it lifts.
- **Pressing grabs.** A press closes the hand on what is under it: a grip, or a fingertip pinch on a part whose longest side is at most 75 mm. The same for every part, removable or not, and for the base.
- **Hovering says nothing (ADR 0007).** The open hand looks and moves the same over a removable part, a blocked part, the base and empty space. The cursor never changes shape.
- **Two fingers** (zoom) send the hand away until one finger is left.

### Removal is two deliberate steps

**1. Loosen.** The player loosens the part under the pointer with:

- a **double tap** on a phone (two taps on the same part within 300 ms, each moving less than the 8 px tap slop);
- a **double click** with a mouse (the owner's "maybe on [a computer] as well", read this way);
- the **G key** on a keyboard, while the pointer is on the part, with or without the button held ("pressing the letter G while trying to drag").

If the part can come off now, the hand plays its **unfastening animation**, which gets the part ready: it undoes the part's fasteners one by one with a spanner or screwdriver, then frees the part by its motion type: a turn or two out of its thread (`unscrew`), a crack loose (`unbolt`), a rock off its clip (`unclip`), a tug off its spigot (`pull`), a small lift free (`lift`, `slide`). The part is then **loose**: it sits in place, a few millimetres proud, its fasteners beside their holes. The player does nothing during the animation; it takes about 0.6 to 1.5 seconds depending on the fasteners, and the clock runs.

If the part cannot come off yet, nothing happens beyond the press: no animation, no sound, no text (ADR 0007). A double tap, double click or G on a part that is already loose, on the base or on empty space does nothing.

**2. Take it to the tray.** The player presses on a loose part and drags. The hand carries it: first out along its own path (it can only leave the way it came off), then freely under the pointer. **Dropping it on the tray removes it**: `remove` is proposed to the core then, and the part's chip appears. Dropping it anywhere else sends it back into its place, still loose, ready to be carried again. A loose part that is never removed stays loose; when the player pulls the cord, the hand does up every loose part's fasteners first, as part of the pull.

**Every other drag turns the machine,** with the hand holding the spot it grabbed: a press on the base, on empty space, on a part that is not loose, whether it could come off or not. While turning, the machine turns so that the held spot stays as close under the pointer as the turn allows; if that spot turns out of sight, the hand lets go and takes hold again under the pointer.

**Why this keeps ADR 0007.** The only thing that differs between a part that can come off and one that cannot is whether the loosening animation plays, and that is the outcome the player asked for, as it is today when a pull does or does not take a part off. A drag on a part that is not loose turns the machine whether or not the part could come off, so dragging says nothing at all. Blocked attempts are not logged and cost nothing, as now (ADR 0004).

### Putting back

Dragging a chip from the tray carries the part in the hand, under the pointer. Releasing it over the machine puts it back: it goes into place by its motion in reverse, and the hand does its fasteners up. If it cannot go back yet, it returns to the tray with no other response.

### Rules and scoring do not change (ADR 0004)

Loosening is a matter for the render layer. The core sees one `remove` when a part is dropped on the tray and one `install` when it is put back, as now. Loosening, carrying and turning cost only the time they take. The log, replay, the daily and the score are unchanged; no new action type.

### The motion vocabulary (restated from ADRs 0008 and 0017, unchanged)

Each part in `machine.json` may carry an optional `motion` object, default `{ "type": "slide" }`, with optional `axis` (`"x"`, `"y"`, `"z"`), `turns` (number) and `duration` (seconds). Types: `slide`, `lift`, `pull`, `unscrew`, `unbolt`, `unclip`. The validator accepts unknown types with a warning and plays them as `slide`. Defaults live in one file in the render layer. The type decides how the part is freed when loosened and how it leaves along its path when carried.

### Fasteners (restated from ADR 0019; how they come out changes)

- **Fasteners are part of how a part comes off, not parts.** The twelve removable parts of ADR 0001 stay twelve. A fastener is never a wrong part, never goes in the tray, never appears in the fault data, and has no condition.
- **Data (adds to ADR 0003).** A part may carry an optional `fasteners` list. Each entry has `id` (unique across the machine, written `<part id>.<name>`, for example `alternator_cover.bolt_1`), `kind` (`bolt`, `screw` or `nut`), `position` (machine axes, metres, as `placeholder.position`) and `axis` (the direction it backs out along, a unit vector). The validator checks every field, that ids are unique and that each fastener's part exists. Counts and kinds for gen950 are drafts; doubts go in `docs/open-questions.md`.
- **Model (adds to the GLB contract).** Each fastener is its own node in `model.glb`, named by its id, checked by the asset check, within the machine's budget.
- **How they come out.** By the hand, during the loosening animation, never by a gesture of their own. When a part is removed, its fasteners go with it; when it is put back, the hand does them up.
- **Tools in the hand.** While undoing or doing up fasteners, the hand holds a spanner (bolts, nuts) or a screwdriver (screws). Visuals only: no tool to pick, buy or upgrade, and "do not build tools" still holds. One small model, `game/public/hand/tools.glb`, at most 100 KB and 2,000 triangles, made to ADR 0013's standard.
- Until fasteners are in the data and the model, loosening frees the part by its motion type alone.

### MakeHuman and the hand's file (restated from ADR 0016, unchanged)

- The MakeHuman Plugin for Blender (MPFB) is an approved modelling tool for the hand and the customer. Its version, download address and asset pack are recorded in ADR 0016's history (MPFB 2.0.18, system assets CC0 variant) and from now on in this ADR's history; a version change is a history line as long as the licences do not change. It runs inside Blender 4.5 and is never shipped.
- Only material whose licence allows shipping it without asking anyone is used (CC0, or a licence that only asks for credit); every MakeHuman item a shipped model uses is listed in `assets/<model>/LICENCE.md`; anything forbidding commercial use, or unclear, is not used.
- MakeHuman gives the shape (mesh, proportions, the skeleton used to pose it). Textures follow ADR 0013: our own baked materials; a MakeHuman image needs the owner's approval of that image. Every character is checked against reference photos, shown as a real Lagos person, and approved by the owner.
- **The hand's file.** `game/public/hand/hand.glb`, loaded at startup; if it is missing, the game plays without a hand. One root node named `mechanic_hand`, origin at the grip point, fingers along -Z, palm facing -Y, forearm along +Z, metres. A `grip` morph target is required; others may be added. A `pinch` morph needs the node's `pinch_point` extra; a `tip_point` extra may mark the fingertips for hovering. Budget as ADR 0015: 4,000 triangles, 400 KB, one 1024 px texture set. `npm run assets` checks all of this.

### Tuning

The double-tap window, how far a loose part sits proud, how far it must be carried along its path before it comes free, how the hand floats over a surface and how the forearm leans live in constants in the render layer, listed in `docs/design/animation.md`.

## Consequences

The hand is the player's own hand, and removal is a choice the player makes, not something a stray drag does: loosen, then carry to the tray. Turning the machine can never take a part off by accident, and a drag never says whether a part could come off. The per-kind gestures of ADR 0017 and the twist per bolt of ADR 0019 are gone, so the game is easier to learn, but the "feel" of each part now comes from the loosening animation, which must be good. The tray becomes the drop target, so the part must stay visible under the hand while it travels down the screen. Double taps need care on phones (no page zoom, a clear time window); G only exists on a keyboard, so the game never depends on it. Rounds get longer by the loosening and carrying time, so patience values may need tuning.

Work this creates, for plans: the pointer hand, turning, loosening by motion type, carrying to the tray and putting back; then fasteners and the tools in the hand; then sound (ADR 0018).

## History

- 2026-10-11: proposed by Claude, from the owner's message quoted above.
- 2026-10-11: revised before acceptance, from the owner's second message quoted above: removal is two deliberate steps (loosen with a double tap, double click or G; then drag to the tray), loosening plays the unfastening animation, and ADR 0019 is superseded too.
