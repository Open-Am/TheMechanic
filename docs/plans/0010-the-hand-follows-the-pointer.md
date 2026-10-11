---
id: 0010
title: The hand follows the pointer, and parts follow the hand
status: proposed
date: 2026-10-11
adrs: [0004, 0007, 0010, 0014, 0015, 0020]
branch: plan/0010-pointer-hand
---

# 0010. The hand follows the pointer, and parts follow the hand

## Goal

The mechanic's hand is the player's hand. With a mouse it rests on whatever the cursor points at; on a phone it comes in under the finger. Pressing closes it on what is under it. Dragging a part that can come off, along its path, pulls that part out with the hand, the part following the hand, springing back if let go early. Any other drag turns the machine with the hand holding on, the held spot staying under the pointer. A part that cannot come off yet does not move: the machine turns instead. Putting a part back carries it in the hand from the tray. This plan builds that for every part with a plain drag along its path; the twist, firm-drag and flick gestures of ADR 0020 come in the next plan.

## ADRs relied on

- **0020** (proposed with this plan) is the decision: the hand follows the pointer, pressing grabs, what a drag does, parts following the hand, give point and spring-back, carrying a part back, and the hand's file.
- **0015**: the hand's budget; its "mechanic's hand" paragraph is replaced by ADR 0020, the rest (customers, patience) is unchanged.
- **0007**: the open hand looks the same over every part and the base; pressing grabs the same way everywhere; a stuck part turning the machine is argued in ADR 0020 to show nothing new.
- **0004**: one `remove` per removal, logged at the give point; abandoned drags and stuck parts are not logged.
- **0010**: everything is in `render`, plus a small callback from `ui` to `render` through `main.ts` for carrying a part from the tray; `core` and `app` do not change.
- **0014**: the frame-rate budget holds with the hand on screen all the time on a computer.

## Exploration summary

The ADRs were summarised by Haiku agents earlier on 2026-10-11 (for ADR 0016 and ADRs 0017 to 0019); this plan reuses those summaries and the code read since. In the code: the camera orbits a still machine (`render/orbit.ts`), and a drag is told apart in `render/gesture.ts` (`classify`) and handled in `render/view.ts`; parts move by `poseAt(motion, explode, progress)` in `render/motion.ts`, which already takes a progress from 0 to 1, so a finger can drive it; the hand rig (`render/handrig.ts`) and its pure maths (`render/handpose.ts`) from plans 0008 and 0009 place a gripping or pinching hand; `core` exports `canRemove(machine, state, partId)`, so the view can tell whether the part under the finger can come off without proposing anything; the tray (`ui/tray.ts`) drags a chip as a DOM ghost and proposes `install` on drop. The base-plate hold of plan 0009 goes away.

## Simpler readings chosen

1. **One gesture in this plan.** Every part comes off with a drag along its path on screen (within 45 degrees, after the 8 px tap slop, as now; any direction for a part coming straight at the camera). Each kind still has its own feel: `slide` follows closely; `lift` settles then follows at 60 percent of the hand's travel; `pull` stretches to 15 percent of its path and snaps; `unbolt` barely moves for the first 30 percent of the drag, then follows; `unscrew` turns as it backs out with the drag; `unclip` rocks against the clip, then follows. The twist, firm-drag and flick gestures of ADR 0020 are the next plan.
2. **Give point.** 45 percent of the part's path for every kind (tunable per kind). Before it, letting go springs the part back in 0.2 s and nothing is logged. At it, `remove` is proposed; the part finishes its motion in 0.25 s and the hand carries it to the tray and lets go.
3. **Hover hand.** With a mouse, the open hand's fingertips sit 8 mm off the surface under the cursor, palm towards that surface, forearm towards the bottom right of the screen. Off the machine, the hand stays at the machine's depth. It follows with a short smoothing (a 50 ms half-life) so it moves like a hand, not a sprite. Over the tray, a button or a card (anything that is not the 3D view), and when the cursor leaves the page, it withdraws. Before "Start" and on the result screen there is no hand.
4. **Touch.** The hand comes in on touch, with its fingertips at the finger, offset 10 mm towards the top of the screen so the finger does not hide the fingertips, and withdraws 0.25 s after the finger lifts.
5. **Turning keeps the held spot under the pointer.** Each move, the camera's azimuth and tilt are nudged so the held spot's screen position moves towards the pointer: one Newton step with a numerically estimated 2 x 2 Jacobian, clamped to the orbit limits and to 0.15 radians a frame. If the held spot faces away from the camera, or ends more than 60 px from the pointer, the hand lets go and grabs again under the pointer. With nothing under the pointer at the press (empty space), turning falls back to the present rotate rate and the hand holds at the machine's depth.
6. **Hand's file.** `hand.py` adds a `tip_point` extra (the middle fingertip of the open hand) beside `pinch_point`, so the hover hand can put its fingertips, not its grip point, on the surface. Optional in the asset check. No change to the hand's shape.
7. **Carrying a part back.** While a tray chip is dragged, `ui` reports the pointer position through a callback that `main.ts` passes to `render`, and the hand holds that part under the pointer at the machine's depth instead of the DOM ghost. Dropping over the machine proposes `install` as now; a refused install drops the part back into the tray with no other response.
8. **The dev hook** for the browser check gains the hand's state (visible, open or closed, what it holds) and the orbit, so the check can see what the hand is doing.

## Steps

1. **Pure maths.** `handpose.ts`: hover placement (fingertip point on a surface, palm towards it, forearm towards the screen's lower right), the touch offset, smoothing, which grip a part gets (kept from plan 0009). `orbit.ts`: the turn that brings a held point under the pointer. `gesture.ts`: deciding at the tap slop between "take this part" and "turn", from whether the part can come off and the drag's direction. `motion.ts`: progress from the hand's travel along the part's on-screen path, each kind's feel, the give point, spring-back. Tests for each, including: the hover hand is the same over a removable and a blocked part; a stuck part's drag is a turn; a held point moves towards the pointer; the give point is reached once.
2. **Hand rig.** `handrig.ts`: `hover(point, normal)`, `grab(point, normal, shape)`, `carry(object)`, `release()`, `withdraw()`; the plan 0009 base-plate hold is removed.
3. **View.** `view.ts`: pointer move with no button drives the hover hand (mouse only); pointer down grabs; the drag decides between taking the part (the part follows the hand by progress, springs back or gives) and turning (the held spot follows the pointer); a second finger withdraws the hand. `remove` is proposed at the give point.
4. **Put back.** `ui/tray.ts` reports the chip drag's position and end through a callback; `main.ts` passes it to the view; the hand carries the part under the pointer.
5. **Hand file.** `hand.py` adds `tip_point`; `npm run assets`; `check.ts` accepts it. Tests.
6. **Browser check.** `npm run verify:phone` pulls every part by dragging it out with the hand (the hand gripping it mid-drag), lets one go early and sees it spring back with nothing logged, drags a blocked part and sees the machine turn with the part still on, hovers the mouse over a removable and a blocked part and sees the same open hand, turns the machine from the base and from empty space, puts parts back by carrying them, and still solves all six faults and the forced walk-out. Frame rate with the hover hand on screen.
7. **Design notes and release note.** `docs/design/interface.md` and `animation.md` describe the hand and the new drag rules; `docs/releases/0.9.0.md`; the phone preview republished. ADR 0015 gets a history line that its hand paragraph is replaced by ADR 0020.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build`, `npm run size` pass; `npm run assets` checks the hand with `tip_point`.
- `npm run verify:phone` passes every check in step 6 with no console errors, at or above 30 fps at 4x CPU throttle in headless Edge.
- The owner tries it with a mouse and on the phone preview and decides whether the hand feels like their own.

## Release note line

Changed: the mechanic's hand follows your pointer. Press to grab; drag a part out along its path and it comes with your hand, or springs back if you let go early; drag anything else and you turn the machine. A part that cannot come off yet stays put and the machine turns instead (plan 0010, ADR 0020).
