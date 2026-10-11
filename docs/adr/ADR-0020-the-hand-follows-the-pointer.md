---
id: 0020
title: The hand follows the pointer, and parts follow the hand
status: proposed
date: 2026-10-11
supersedes: [0016, 0017]
superseded_by: null
---

# 0020. The hand follows the pointer, and parts follow the hand

## Context

On 2026-10-11, after trying release 0.8.0, the owner wrote: "I've looked at the hand and it's much better. But there's a problem. I think the hand should follow the mouse cursor. [...] The way it is now, the hand is not following the mouse. It comes from a different direction. It should follow the mouse. And only pull the things that the mouse is [...] trying to point at. [...] the user puts his hand forward and automatically puts the [...] mouse forward and automatically the hand appears following it. If he pushes it to a part where it's going to be moving the generator, it would automatically move the generator. [...] and then if he pulls, it will be able to pull something out."

Today the hand is an animation: it reaches in from the side a part comes off (ADR 0015), or holds the base plate from underneath while the view turns (ADR 0016), and it is visible only while it acts. ADR 0017 (accepted, not yet built) makes a part follow the finger, with a gesture for each kind of part, and says a blocked part shows no hand. The owner now wants the hand to be the player's own hand: always where the pointer is, grabbing whatever is under it, pulling it off if it can come off and turning the machine if not.

This changes decisions in three accepted ADRs. It supersedes ADR 0016 and ADR 0017 whole, restating what stays (MakeHuman, the hand's file, the motion vocabulary and the gestures) so they can be retired. It replaces the paragraph "The mechanic's hand" of ADR 0015, including "It is visible only while it acts"; the rest of ADR 0015 (customers, patience, budgets, layers) stays in force, and its history gets a line saying so. ADR 0007 (no hints in player mode) and ADR 0004 (the action log) still hold.

## Decision

### The hand is the pointer

- **Mouse.** While a round is running and the mouse is over the 3D view, the mechanic's hand is there, relaxed and open, its fingertips on the spot the cursor points at: on the surface of the machine when the cursor is over it, or at the machine's depth when it is not. The forearm runs off the bottom of the screen towards the right, re-aimed as the cursor moves. When the cursor leaves the 3D view, or is over the tray, a button or a card, the hand withdraws.
- **Touch.** A phone has no cursor. The hand comes in under the finger when it touches the 3D view, follows the finger while it moves, and withdraws when the finger lifts.
- **Pressing grabs.** Pressing the mouse button or touching closes the hand on what is under it: a grip, or a fingertip pinch on a part whose longest side is at most 75 mm. The same for every part, removable or not, and for the base.
- **Hovering says nothing (ADR 0007).** The open hand looks and moves the same over a removable part, a blocked part, the base and empty space. The cursor never changes shape. Only the surface it rests on, which the player can see anyway, decides where it sits.
- **Two fingers** (zoom) send the hand away until one finger is left.

### What a drag does

- A press on a part that can come off, followed by a drag that matches that part's gesture (below), takes that part: it follows the hand along its own path, as ADR 0017 set out. Only the part under the pointer is ever pulled.
- Any other drag turns the machine, with the hand holding on where it grabbed: a press on the base, on empty space, a drag that does not match the part's gesture, and a press on a part that cannot come off yet. A stuck part does not move, the machine turns instead, as it would if a mechanic tugged on a part that is still held on. While turning, the machine turns so that the spot the hand holds stays as close under the pointer as the turn allows; if that spot turns out of sight, the hand lets go and takes hold again under the pointer.
- **Why a stuck part turning the machine is not a new hint (ADR 0007).** A full pull on a blocked part already shows that it does not come off, and costs nothing (blocked attempts are not logged, ADR 0004). Turning the machine instead of doing nothing shows the same thing. It adds no text, tint, shake or sound, and says nothing about the fault.
- The hand never moves a part that the pointer is not on, and never moves on its own except to come in, follow and withdraw.

### Parts follow the hand (restated from ADR 0017, adjusted)

- **The motion vocabulary is unchanged (from ADR 0008 through ADR 0017).** Each part in `machine.json` may carry an optional `motion` object, default `{ "type": "slide" }`. Optional fields `axis` (`"x"`, `"y"`, `"z"`), `turns` (number), `duration` (seconds). The validator accepts unknown types with a warning and plays them as `slide`. Defaults live in one file in the render layer. No data changes.
- **Gestures and feel:**

| `type` | Gesture | Feel | Typical parts |
| --- | --- | --- | --- |
| `slide` | Drag along the path. | Light: follows the hand closely. | air filter |
| `lift` | Drag along the path. | Heavy: a small settle as it frees, then follows more slowly than the hand. | fuel tank |
| `pull` | Drag along the path. | Holds and stretches, then snaps free at its give point. | fuel hose, plug cap |
| `unscrew` | Circle the pointer around the part. | Each circle turns it once; after `turns` turns it is loose and backs out. Either direction loosens it. | spark plug, fuel tap |
| `unbolt` | A long, firm drag along the path. | Barely moves until it breaks loose, then follows. Once ADR 0019's fasteners are out, it follows like `slide`. | recoil starter, muffler, carburettor, covers |
| `unclip` | A quick flick along the path. | A slow drag rocks it against the clip and springs back; a flick pops it free. | air filter cover, capacitor |

- **Give point and spring-back.** Let go before a part's give point and it springs back into place, with nothing logged. Past it, the game proposes `remove` to the core as now (ADR 0004); if accepted, the part finishes its motion and goes to the tray, carried by the hand until it lets go. One `remove` per removal, logged when the part gives.
- **Putting back.** Dragging a chip from the tray carries the part in the hand, under the pointer; releasing it over the machine puts it back with its motion in reverse, as now. If it cannot go back yet, it returns to the tray with no other response.
- **Tuning** (give points, weights, flick speed, the circle for one turn, spring-back, how far the hand floats over a surface, how the forearm leans) lives in constants in the render layer, listed in `docs/design/animation.md`.

### MakeHuman and the hand's file (restated from ADR 0016, unchanged)

- The MakeHuman Plugin for Blender (MPFB) is an approved modelling tool for the hand and the customer. Its version, download address and asset pack version are recorded in ADR 0016's history (MPFB 2.0.18, system assets CC0 variant) and, from now on, in this ADR's history. A version change is a history line as long as the licences below do not change. MPFB runs inside Blender 4.5 and is never shipped.
- Only material whose licence allows shipping it without asking anyone is used: CC0, or a licence that only asks for credit. Every MakeHuman item a shipped model uses is listed with its licence in `assets/<model>/LICENCE.md`. Anything forbidding commercial use, or unclear, is not used.
- MakeHuman gives the shape (mesh, proportions, the skeleton used to pose it). Textures follow ADR 0013: skin and cloth are baked from our own materials; a MakeHuman image needs the owner's approval of that image. Every character is checked against reference photos, shown as a real Lagos person, and approved by the owner.
- **The hand's file.** `game/public/hand/hand.glb`, loaded at startup with the machine; if it is missing, the game plays without a hand, parts following the pointer on their own. One root node named `mechanic_hand`, origin at the grip point, fingers along -Z, palm facing -Y, forearm along +Z, metres. A `grip` morph target is required; others may be added. A `pinch` morph needs the node's `pinch_point` extra. More poses may be added as morph targets, for example a relaxed pointing hand for hovering. Budget as ADR 0015: 4,000 triangles, 400 KB, one 1024 px texture set. `npm run assets` checks all of this.

## Consequences

The hand becomes the player's own hand, which is what makes the game feel hands-on, and one rule covers pulling and turning: grab what is under the pointer; if it can come off that way, it comes off, otherwise the machine turns. The hold-the-plate logic of 0.8.0 goes away. The cost: the hand is on screen most of the time on a computer, so its look matters even more and its drawing cost must stay inside the frame-rate budget; on a phone the hand sits under and around the finger, so it must be placed so the fingertips, not the palm, are at the finger and the part stays visible; the machine's turning must be reworked so the grabbed spot follows the pointer; and the gestures of ADR 0017 must now also decide between pulling and turning on every drag. A stuck part now turns the machine, where in 0.8.0 the drag did nothing; that changes how blocked parts feel and the browser check must cover it. Removal takes longer by hand, so patience values may need tuning.

Work this creates, for plans: first the hand following the pointer, grabbing, turning the machine and slide, lift and pull parts following the hand; then the twist, firm drag and flick gestures; then fasteners (ADR 0019) and sound (ADR 0018), whose texts still refer to ADR 0017's gestures, which this ADR restates.

## History

- 2026-10-11: proposed by Claude, from the owner's message quoted above.
