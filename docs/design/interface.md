# Interface

Design note, first written for Phase 2 (plan 0003). Not a decision: the gestures are decided in ADR 0020 (plan 0010), from the owner's requests of 2026-10-11.

## Layout

Portrait first. From top to bottom:

- Timer, top centre. `m:ss`. Hidden on the briefing and result screens.
- Mute button, top right beside the timer: a speaker, slashed when muted, 44 px square, labelled "Sound on" or "Sound off" with `aria-pressed`. Muted means no sound and no vibration. The choice is kept in the browser under `openam.muted`, with a memory fallback when storage is blocked. Sound starts on (plan 0013, ADR 0018).
- The machine, standing on a worn wooden workbench (plan 0016, ADR 0025), seen from a standing mechanic's eye on the near side: the camera is 1.6 m above the floor and looks down about 12 degrees. At 390 by 844 the generator fills 60 percent of the width, its middle a little right of centre (so the toolbox on the bench's left end shows its tools), and its lowest point 60 px above the controls; above it there is room across the bench for the customer (plan 0015 places them). On shorter screens the camera stands back until a 1.76 m customer's head would clear the timer, but never so far that the generator is under 40 percent of the width: at 360 by 640 it stands about 2.4 m back and the generator is about 42 percent wide. The framing is computed (`frameBench` in `game/src/render/stage.ts`), not hand-set. The canvas sits behind everything else and runs to the bottom of the screen, so a carried part and the hand stay drawn over the controls. As the tray wraps onto more rows the camera tilts and stands back so the machine glides up to stay clear of them (since 0.9.3), and the machine always keeps at least 40 percent of the screen's height.
- "Pull cord" button, full width, above the tray. Enabled only when the tray is empty and no part is being carried.
- The tray, chips along the bottom, wrapping onto more rows as parts come off. When a chip comes or goes the others glide to their new places in 180 ms and the new chip grows in (since 0.15.1; none with reduced motion). It does not scroll: chips take every drag for putting parts back, so a scrolling tray could not be scrolled by touch.

Landscape works but is not tuned. Safe-area insets are respected (`viewport-fit=cover`).

## Screens

- **Loading.** Before any script runs, the page shows a thin pulsing bar with no words. It is replaced by the start screen as soon as `machine.json`, `faults.json` and `customers.json` arrive (plan 0014).
- **Start.** "Open Am", then "Today's fault · Day N" and "Free play". Once today's scored attempt is used the daily button reads "Today's fault · practice", and the screen shows today's result ("Day N: score 52 ★★☆", "Day N: the customer walked", or "Day N: Not finished" for a daily left mid-round, ADR 0024). "Next customer" on the result screen comes back here (plan 0014).
- **Briefing.** For today's fault, "Today's fault · Day N", or "Practice, not scored". Then the customer's complaint in quotes, the symptom text, and "Start". The model, environment and hand load behind it: until they are in, a progress bar (files arrived out of files requested) sits above "Start", which is disabled. The timer starts when "Start" is pressed; for a scored daily that also uses up the day's attempt (ADR 0024).
- **Working.** The layout above.
- **Result.** "It starts!", the time, wrong parts and failed pulls, the total score and the stars, then "Best" (the lowest fixed total for this fault, kept in the browser) and "New best" when this round set it. Practice shows "Not scored" and no best. A scored daily that ended with the engine running shows "Share": the phone's share sheet, otherwise the clipboard ("Copied"), otherwise the text in a box to copy by hand. Then "Next customer".
- **Cannot run.** A plain message when WebGL is missing or the data is invalid. No retry loop.

## Gestures

Since plan 0010 (ADR 0020) the mechanic's hand is the player's pointer, and removal is two deliberate steps.

- **The hand.** With a mouse, the open hand rests on whatever the cursor points at, fingertips just off the surface, the arm running off the bottom of the screen to a body just out of view. On a phone it comes in under the finger and leaves when the finger lifts. Over the tray, a button or a card, it withdraws. It looks the same over every part and the base (ADR 0007).
- **Press.** Every press closes the hand on what is under it, a grip or, on a part no longer than 75 mm, a fingertip pinch, and gives the same brief press pulse on a part, allowed or not.
- **Loosen.** A double tap (the second tap comes down within 300 ms of the first lifting and within 30 px of it, and is itself a tap of at most 500 ms; times are the events' own time stamps), a double click, or the G key with the pointer on the part. The second tap counts while the first tap's part is still under the finger by its hit volume, even if a neighbour shows there. If the part can come off now, the hand plays its unfastening animation and the part sits loose, a few millimetres proud. If not, nothing happens.
- **Take to the tray.** Press a loose part and drag: it comes out along its path over the first 60 px, then follows the hand. While it is carried the drop zone is the whole lower part of the screen, full width, from 8 px below the generator's lowest point as drawn (recomputed on every move, so it follows the view and the tray) down to the bottom edge: over the bench's front edge, the pull cord, the hint and the chips (since 0.15.1; before, it began 64 px above the pull cord). It is never shorter than the controls. "Drop it here" is laid over that whole region with a dashed top edge, and the controls fade behind it so the carried part shows over them; the pull cord is disabled meanwhile. The zone is generous (`dropTarget` in `game/src/ui/format.ts`):
  - Released in the zone, or within a magnet reach above it (9 percent of the screen's height, 56 to 80 px: 76 px at 390 by 844, 58 px at 360 by 640), the part glides into the tray. Not within that reach over the generator itself: a release inside the generator's screen bounds above the zone sends the part back, loose.
  - The carried part's middle on screen counts as well as the finger: if either is in reach, it drops.
  - A quick flick down counts where it was heading: if the finger moved down at least 0.8 px per ms over the last 80 ms before lifting, the release is judged 120 ms ahead (`flickAhead` in `game/src/render/gesture.ts`). A thumb lifts while still moving, and the screen reports the last spot it touched, short of where the player meant.
  - Released over chips already in the tray it always drops: the carrying finger belongs to the 3D view, so a chip never takes it as a tap or a put-back.
  - The zone brightens as soon as the part is near enough to drop. Released anywhere else it flies back, still loose.
- **Turn.** Every other drag turns the machine: on the base, on empty space, on a part that is not loose, whether it could come off or not. Since plan 0016 (ADR 0025) the generator turns on the bench about its upright axis, as a mechanic turns it by hand, and the camera never moves sideways: the customer stays across the bench. A drag up or down raises or lowers the camera on a circle about the machine's middle, from the default view up to looking 35 degrees down, to see the top. The hand holds the spot it grabbed and the machine turns (and the camera rises) to keep that spot under the pointer; if it turns out of sight, the hand grabs again under the pointer. Over empty space the machine turns at the old rate, 0.008 radians per pixel. It turns all the way round; the bench, the toolbox and the rest of the scene stay still.
- **Zoom.** Two fingers pinch to zoom, or the mouse wheel: the camera moves along its line to the machine, from 0.7 to 1.4 times the framed distance. The hand goes away until one finger is left.
- **Looking.** There is no inspect action on the machine. The player looks at the part itself.
- **Tray card.** Tapping a tray chip opens the card.
- **Put back.** Dragging a chip from the tray carries the part in the hand. Releasing it over the machine puts it back, playing its motion in reverse. If it cannot go back yet, it returns to the tray with no other response.
- **Pull cord.** Loose parts are pressed home by the hand before the pull.

A tap is under 8 CSS px of movement. Every part has an invisible hit volume at least 44 CSS px across at the default zoom.

## The card

A bottom sheet over the lower part of the screen, dismissed by tapping outside it or the close button.

- Part name, as a heading.
- What it does (`does`).
- Its condition, from `app.conditionOf`.
- "Fix" button, labelled with the fault's `fix` text, shown only on the unfixed culprit. Pressing it disables the card's buttons for 2 seconds, shows a thin progress bar, then logs the fix. The clock keeps running.

## Failed pull

The symptom text appears in a banner above the tray for 3 seconds. The round continues.

## Look

- System font stack only: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. No web fonts (ADR 0002).
- Colour tokens on `:root`: background `#1b1c1e`, surface `#2a2c30`, text `#f1efe9`, muted text `#a8a59c`, accent `#e0a526` (pull cord, fix), success `#5fb36b`. Dark theme only for now, since the scene is lit against a dark workshop.
- Touch targets at least 44 CSS px. Body text 16 px.
- All player-facing text lives in `game/src/ui/strings.ts` or the data files.
