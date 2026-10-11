---
id: 0010
title: The hand follows the pointer; loosen, then drag to the tray
status: proposed
date: 2026-10-11
adrs: [0004, 0007, 0010, 0014, 0015, 0020]
branch: plan/0010-pointer-hand
---

# 0010. The hand follows the pointer; loosen, then drag to the tray

## Goal

The mechanic's hand is the player's hand. With a mouse it rests on whatever the cursor points at; on a phone it comes in under the finger. Pressing closes it on what is under it, and dragging turns the machine with the hand holding on. A double tap, a double click or the G key loosens the part under the pointer: the hand plays the part's unfastening animation and the part sits loose in place. The player then presses on the loose part and drags it: it comes out along its path, follows the hand down the screen, and dropping it on the tray removes it. Dropped anywhere else it goes back, still loose. Putting a part back carries it in the hand from the tray. Fasteners and the spanner and screwdriver come in the next plan; here a part is freed by its motion type alone.

## ADRs relied on

- **0020** (proposed with this plan) is the decision: the pointer hand, pressing grabs, loosening and its triggers, carrying to the tray, every other drag turning the machine, putting back, scoring unchanged, the hand's file.
- **0015**: the hand's budget; its "mechanic's hand" paragraph is replaced by ADR 0020, the rest (customers, patience) is unchanged.
- **0007**: the open hand looks the same over every part and the base; pressing grabs the same way everywhere; a drag on a part that is not loose turns the machine whether or not the part could come off; loosening a part that cannot come off does nothing.
- **0004**: one `remove` when a part is dropped on the tray, one `install` when it is put back; loosening, carrying and turning are not logged.
- **0010**: everything is in `render`, plus two small links from `ui` to `render` through `main.ts` (where the tray is on screen, and carrying a chip); `core` and `app` do not change.
- **0014**: the frame-rate budget holds with the hand on screen all the time on a computer.

## Exploration summary

The ADRs were summarised by Haiku agents earlier on 2026-10-11 (for ADR 0016 and ADRs 0017 to 0019); this plan reuses those summaries and the code read since. In the code: the camera orbits a still machine (`render/orbit.ts`); a drag is told apart in `render/gesture.ts` and handled in `render/view.ts`; parts move by `poseAt(motion, explode, progress)` in `render/motion.ts`, which takes a progress from 0 to 1, so it can drive both the loosening (the first part of the motion) and the carry (the rest); the hand rig (`render/handrig.ts`) and its maths (`render/handpose.ts`) from plans 0008 and 0009 place a gripping or pinching hand; `core` exports `canRemove(machine, state, partId)`, so the view can tell whether the part under the pointer can come off without proposing anything; the tray (`ui/tray.ts`) drags a chip as a DOM ghost and proposes `install` on drop. The base-plate hold of plan 0009 goes away.

## Simpler readings chosen

1. **Loosening by motion type.** The first 15 percent of each part's motion, played by the hand in 0.6 to 0.9 s: `unscrew` turns out of its thread, `unbolt` cracks loose with a small jolt, `unclip` rocks and pops, `pull` tugs off its spigot, `lift` and `slide` lift a few millimetres free. The part then sits loose at that point. Fasteners and tools join in the next plan.
2. **Triggers.** Double tap: two pointer-downs on the same part within 300 ms, both released within the 8 px tap slop. Double click with a mouse is the same thing. G: a key-down of `g` or `G` while the pointer is over a part, with or without the button held; if the button is held, the drag carries the part once it is loose. On a phone the canvas keeps `touch-action: none`, so a double tap does not zoom the page.
3. **Carrying.** Pressing a loose part grabs it. The first stretch of the drag (60 px on screen) takes it out along its path, from the loose point to the end of its motion; after that it follows the hand under the pointer at the depth it left at. The tray's position on screen comes from `ui` through `main.ts`; releasing with the pointer over it proposes `remove`. Anywhere else the part flies back to its loose point in 0.25 s.
4. **Turning keeps the held spot under the pointer.** Each move, the camera's azimuth and tilt are nudged so the held spot's screen position moves towards the pointer: one Newton step with a numerically estimated 2 x 2 Jacobian, clamped to the orbit limits and to 0.15 radians a frame. If the held spot faces away from the camera, or ends more than 60 px from the pointer, the hand lets go and grabs again under the pointer. With nothing under the pointer at the press, turning uses the present rotate rate.
5. **Hover hand.** With a mouse, the open hand's fingertips sit 8 mm off the surface under the cursor, palm towards it, forearm towards the screen's lower right, following with a 50 ms smoothing. Off the 3D view (over the tray, a button, a card, or off the page) it withdraws. Before "Start" and on the result screen there is no hand.
6. **Touch.** The hand comes in on touch with its fingertips at the finger, offset 10 mm towards the top of the screen so the finger does not hide them, and withdraws 0.25 s after the finger lifts.
7. **Pulling the cord with loose parts.** The hand presses every loose part home (its loosening played backwards, quickly) before the pull plays. No rule changes.
8. **Hand's file.** `hand.py` adds a `tip_point` extra (the middle fingertip of the open hand) so the hover hand puts its fingertips, not its grip point, on the surface. Optional in the asset check. No change to the hand's shape.
9. **Hint text.** The working screen's line "Pull a part off along its path" becomes "Double tap a part to loosen it, then drag it to the tray" (strings file).
10. **The dev hook** for the browser check gains the hand's state (visible, open or closed, what it holds), which parts are loose, and the orbit.

## Steps

1. **Pure maths and rules.** `gesture.ts`: double-tap detection, and deciding at the tap slop between "carry this loose part" and "turn". `motion.ts`: the loosening share of each motion, progress from the carry drag, the point where a part comes free. `handpose.ts`: hover placement, the touch offset, smoothing. `orbit.ts`: the turn that brings a held point under the pointer. Tests for each, including: a double tap on a blocked part looses nothing; a drag on a removable part that is not loose is a turn, the same as on a blocked part; the hover hand is the same over a removable and a blocked part; a held point moves towards the pointer; a drop away from the tray removes nothing.
2. **Hand rig.** `handrig.ts`: `hover`, `grab`, `loosen` (the animation), `carry`, `release`, `withdraw`; the plan 0009 base-plate hold is removed.
3. **View.** `view.ts`: hover (mouse only), press grabs, double tap and G loosen, the drag carries a loose part or turns, the drop on the tray proposes `remove`, a second finger withdraws the hand, loose parts are pressed home before the cord is pulled.
4. **Tray link and put back.** `ui/tray.ts` reports where the tray is and the chip drag's position; `main.ts` passes both to the view; the hand carries the part from the tray and puts it back.
5. **Hand file.** `hand.py` adds `tip_point`; `npm run assets`; `check.ts` accepts it. Tests.
6. **Browser check.** `npm run verify:phone` removes every part by double tap then a drag to the tray (the hand loosening and carrying it); checks a drag on a part that is not loose turns the machine and removes nothing, a double tap on a blocked part does nothing, a carried part dropped away from the tray goes back loose with nothing logged, G loosens the part under the mouse, the open hand is the same over a removable and a blocked part, parts go back by carrying; and still solves all six faults and the forced walk-out. Frame rate with the hover hand on screen.
7. **Design notes and release note.** `docs/design/interface.md` and `animation.md` describe the hand, loosening and carrying; `docs/releases/0.9.0.md`; the phone preview republished. ADR 0015 gets a history line that its hand paragraph is replaced by ADR 0020; ADRs 0016, 0017 and 0019 are marked superseded.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` checks the hand with `tip_point`.
- `npm run verify:phone` passes every check in step 6 with no console errors, at or above 30 fps at 4x CPU throttle in headless Edge.
- The owner tries it with a mouse and on the phone preview and decides whether the hand feels like their own and whether loosening then carrying is deliberate enough.

## Release note line

Changed: the mechanic's hand follows your pointer, and removal is deliberate. Double tap a part (double click, or press G on a keyboard) and the hand loosens it; then drag it to the tray. Drag anything else and you turn the machine (plan 0010, ADR 0020).
