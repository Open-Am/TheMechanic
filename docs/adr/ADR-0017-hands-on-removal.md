---
id: 0017
title: Hands-on removal, a gesture for each kind of part
status: proposed
date: 2026-10-11
supersedes: [0008]
superseded_by: null
---

# 0017. Hands-on removal, a gesture for each kind of part

## Context

On 2026-10-11 the owner wrote: "we need to improve the removal mechanics as well. it can definately be better." Asked what felt most wrong, they chose "Too automatic: the part just flies off; I don't feel like I'm doing it." Of four options, they chose all of them, including "Part follows finger" and "Gesture per motion".

Today a drag of 40 CSS px roughly along a part's path sets off a fixed animation (ADR 0008): the part plays its motion and drifts to the tray, whatever the finger does next. ADR 0008 says: "Each removal is: motion, then drift to the tray". This ADR changes how a removal plays, so it supersedes ADR 0008. It keeps ADR 0008's motion vocabulary and data exactly as they are, and restates them here so ADR 0008 can be retired whole.

Touched, not replaced: ADR 0002 limit 7 ("No physics: parts move on scripted paths"), ADR 0004 (the action log), ADR 0007 (no hints in player mode), ADR 0015 and the proposed ADR 0016 (the hand). Sound and vibration are ADR 0018; visible bolts and screws are ADR 0019.

## Decision

**The motion vocabulary is unchanged (from ADR 0008).** Each part in `machine.json` may carry an optional `motion` object, default `{ "type": "slide" }`. Optional fields `axis` (`"x"`, `"y"`, `"z"`), `turns` (number), `duration` (seconds). The validator accepts unknown types with a warning and plays them as `slide`. Defaults live in one file in the render layer. No data changes.

**The part follows the finger.** A drag that starts on a removable part moves the part along its own scripted path as the finger moves: the motion's progress follows the finger instead of a clock. Paths stay scripted; there is no physics engine (ADR 0002).

**Each kind of part has its own gesture and feel.**

| `type` | Gesture | Feel | Typical parts |
| --- | --- | --- | --- |
| `slide` | Drag along the path. | Light: follows the finger closely. | air filter |
| `lift` | Drag along the path. | Heavy: a small settle as it frees, then follows the finger more slowly than the finger moves. | fuel tank |
| `pull` | Drag along the path. | Holds and stretches, then snaps free at its give point. | fuel hose, plug cap |
| `unscrew` | Circle the finger around the part. | Each circle turns it once. After `turns` turns it is loose and backs out. | spark plug, fuel tap |
| `unbolt` | A long, firm drag along the path. | Barely moves until it breaks loose, then follows. Once ADR 0019's fasteners are out, it follows like `slide`. | recoil starter, muffler, carburettor, covers |
| `unclip` | A quick flick along the path. | A slow drag rocks it against the clip and it springs back; a flick pops it free. | air filter cover, capacitor |

Either direction of circling loosens an `unscrew` part; the game does not teach thread direction.

**Give point and spring-back.** Every motion has a give point. Let go before it and the part springs back into place, and nothing is logged. Pass it and the game proposes the `remove` action to the core as now (ADR 0004); if accepted, the rest of the motion plays out and the part drifts to the tray. One `remove` per removal, logged when the part gives. Abandoned drags are never logged.

**Telling gestures apart uses only what the player can see.** Whether a drag is a pull, a twist, a flick or a rotation of the view is decided from the part under the finger, its motion type, its path on screen and the finger's movement. It never depends on whether the part can come off. A drag that does not match the part's gesture rotates the view, as now.

**Blocked parts (ADR 0007).** A part that cannot come off does not move under the finger at all: no resistance, no rock, no hand, no sound, no vibration. It looks exactly like dragging a fixed part of the machine. This is not a new hint. A full pull on a blocked part already shows nothing and costs nothing (blocked attempts are not logged, ADR 0004), so the player can already find out, for free, which parts are blocked. Seeing a removable part move under the finger before it gives tells them nothing more about the fault.

**The hand.** The mechanic's hand takes hold as soon as a removable part starts to follow the finger, rides along with it, lets go and withdraws if the part springs back, and carries it off past the give point (ADR 0015).

**Putting back stays as it is.** Dragging a chip onto the machine plays the part's motion in reverse by itself, with the hand. Hands-on reassembly can be a later ADR.

**Tuning lives in one file.** Give points, the weight of each kind of part, flick speed, the circle needed for one turn and spring-back timing are constants in the render layer, listed in `docs/design/animation.md`. They will need tuning on real phones.

## Consequences

The player does the work: they feel the tank's weight, the hose's stretch and the plug's threads, and can change their mind halfway. The core, the log, the scoring and the data are untouched. The cost is in the render layer: gesture recognition grows from one rule to six, with more room for a twist to be read as a rotation; the browser check must drive each gesture with real pointer paths; and every number needs tuning on a phone. Removals take a little longer, which counts against the clock and the customer's patience; patience values may need retuning.

## History

- 2026-10-11: proposed by Claude, from the owner's message and choices quoted above.
