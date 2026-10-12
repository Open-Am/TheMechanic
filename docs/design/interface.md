# Interface

Design note, first written for Phase 2 (plan 0003). Not a decision: the gestures are decided in ADR 0020 (plan 0010), from the owner's requests of 2026-10-11.

## Layout

Portrait first. From top to bottom:

- Timer, top centre. `m:ss`. Hidden on the briefing and result screens.
- Mute button, top right beside the timer: a speaker, slashed when muted, 44 px square, labelled "Sound on" or "Sound off" with `aria-pressed`. Muted means no sound and no vibration. The choice is kept in the browser under `openam.muted`, with a memory fallback when storage is blocked. Sound starts on (plan 0013, ADR 0018).
- The machine, centred in the space above the pull cord and tray. The canvas sits behind everything else and runs to the bottom of the screen, so a carried part and the hand stay drawn over the controls; only the framing moves. As the tray wraps onto more rows the machine glides up to stay clear of them (since 0.9.3), and if the free space gets too short for it the camera stands back. It always keeps at least 40 percent of the screen's height.
- "Pull cord" button, full width, above the tray. Enabled only when the tray is empty.
- The tray, chips along the bottom, wrapping onto more rows as parts come off. It does not scroll: chips take every drag for putting parts back, so a scrolling tray could not be scrolled by touch.

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
- **Take to the tray.** Press a loose part and drag: it comes out along its path over the first 60 px, then follows the hand. Dropped anywhere in the strip from 64 px above the pull cord down to the bottom of the screen, it is removed; while a part is carried the tray lights up with "Drop it here", laid over the tray so the controls do not change height mid-carry. Dropped anywhere else it flies back, still loose.
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
