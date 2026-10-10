# Interface

Design note for Phase 2 (plan 0003). Not a decision; the gestures were chosen by the owner on 2026-10-10 and are recorded in plan 0003.

## Layout

Portrait first. From top to bottom:

- Timer, top centre. `m:ss`. Hidden on the briefing and result screens.
- The machine, filling the middle. The canvas sits behind everything else.
- "Pull cord" button, full width, above the tray. Enabled only when the tray is empty.
- The tray, chips along the bottom, wrapping onto more rows as parts come off. It does not scroll: chips take every drag for putting parts back, so a scrolling tray could not be scrolled by touch.

Landscape works but is not tuned. Safe-area insets are respected (`viewport-fit=cover`).

## Screens

- **Briefing.** The customer's complaint in quotes, then the symptom text, then "Start". The machine loads behind it. The timer starts when "Start" is pressed.
- **Working.** The layout above.
- **Result.** "It starts!", the time, wrong parts and failed pulls, the total score and the stars, then "Next customer".
- **Cannot run.** A plain message when WebGL is missing or the data is invalid. No retry loop.

## Gestures

- **Pull to remove.** A drag that starts on an installed part and goes roughly along its removal direction takes the part off: it plays its motion (ADR 0008) and drifts to the tray. "Roughly along" means within 45 degrees of the part's `explode` direction as seen on screen, after 40 CSS px of movement. When a part comes straight at the camera, so its direction is too short on screen to follow, any direction counts.
- **Blocked parts.** A pull on a blocked part does nothing. The part does not move and nothing tints, shakes or explains (ADR 0007).
- **Press acknowledgement.** Every touch that lands on a part, allowed or not, gives the same brief press: a small scale pulse on the part, under 120 ms.
- **Rotate and zoom.** A one-finger drag that is not a pull rotates the camera around the machine. Two fingers pinch to zoom. Distance and tilt are limited so the machine never leaves the frame.
- **Looking.** There is no inspect action on the machine. The player looks at the part itself.
- **Tray card.** Tapping a tray chip opens the card.
- **Put back.** Dragging a chip from the tray and releasing it over the machine puts the part back, playing its motion in reverse. If it cannot go back yet, the chip returns to its place in the tray with no other response.

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
