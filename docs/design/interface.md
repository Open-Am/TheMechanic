# Interface

Design note, first written for Phase 2 (plan 0003). Not a decision: the gestures are decided in ADR 0020 (plan 0010), from the owner's requests of 2026-10-11.

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

Since plan 0010 (ADR 0020) the mechanic's hand is the player's pointer, and removal is two deliberate steps.

- **The hand.** With a mouse, the open hand rests on whatever the cursor points at, fingertips just off the surface, the arm running off the bottom of the screen to a body just out of view. On a phone it comes in under the finger and leaves when the finger lifts. Over the tray, a button or a card, it withdraws. It looks the same over every part and the base (ADR 0007).
- **Press.** Every press closes the hand on what is under it, a grip or, on a part no longer than 75 mm, a fingertip pinch, and gives the same brief press pulse on a part, allowed or not.
- **Loosen.** A double tap (two taps on the same part within 300 ms and 30 px), a double click, or the G key with the pointer on the part. If the part can come off now, the hand plays its unfastening animation and the part sits loose, a few millimetres proud. If not, nothing happens.
- **Take to the tray.** Press a loose part and drag: it comes out along its path over the first 60 px, then follows the hand. Dropped on the tray (with 24 px of slack around it) it is removed. Dropped anywhere else it flies back, still loose.
- **Turn.** Every other drag turns the machine: on the base, on empty space, on a part that is not loose, whether it could come off or not. The hand holds the spot it grabbed and the camera turns to keep that spot under the pointer; if it turns out of sight, the hand grabs again under the pointer. Over empty space the machine turns at the old rate.
- **Zoom.** Two fingers pinch to zoom, or the mouse wheel. The hand goes away until one finger is left. Distance and tilt are limited so the machine never leaves the frame.
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
