# Animation

Design note for Phase 2 (plan 0003). The motion vocabulary itself is ADR 0008.

## Removal sequence

1. Press acknowledgement starts on touch (under 120 ms).
2. The pull is recognised; the part's motion plays.
3. The part drifts toward the bottom of the screen and fades out as its chip appears in the tray.
4. The camera eases a little toward where the part was, then holds.

Install is the same in reverse: the part fades in near the bottom of the screen, flies to its exploded position, then plays its motion backwards into place.

## The mechanic's hand (plan 0008)

On an accepted removal the hand reaches in before the part moves, closes its grip, rides along with the part's motion, then opens and pulls back as the part drifts to the tray. On a put-back it brings the part in already gripping, pushes it home, then lets go and pulls back. It comes in from the side the part comes off (its explode direction), leaning towards the camera, so it reaches around the machine rather than through it. A blocked pull shows no hand (ADR 0007). The numbers live in `game/src/render/handpose.ts`.

| Hand | Target |
| --- | --- |
| Reach and grip, before the part moves | 0.18 s; the grip closes over the last 40 percent |
| Release | 0.12 s |
| Withdraw | 0.25 s, back the way it came |
| Start of the reach | 0.32 m from the part |

Input is not blocked during an animation. The reducer has already accepted the action; the animation only shows it.

## Motion defaults

Kept in one file, `game/src/render/motion.ts`. A part's `motion.duration`, `axis` and `turns` override these.

| Type | Duration | Axis | Turns | Shape |
| --- | --- | --- | --- | --- |
| `slide` | 0.45 s | — | — | Ease out along `explode`. |
| `lift` | 0.6 s | — | — | A 0.1 s drop of 2 mm, then ease out along `explode`. |
| `pull` | 0.5 s | — | — | Stretch 10% of the distance in 0.15 s, snap the rest. |
| `unscrew` | 0.8 s | `y` | 2 | Rotate `turns` about `axis` while backing out linearly. |
| `unbolt` | 0.6 s | `y` | — | 0.1 s settle, then ease out with a 10 degree turn about `axis`. |
| `unclip` | 0.5 s | `x` | — | Rock 8 degrees and back in 0.15 s, then ease out. |

Unknown types play as `slide`.

## Other timings

| Item | Target |
| --- | --- |
| Drift to tray | 0.35 s |
| Camera ease toward part | 0.4 s, at most 15% closer |
| Press acknowledgement | 1.0 to 1.06 scale and back, 0.1 s |
| Fix progress | 2 s |
| Failed-pull banner | 3 s |

## Easing

Cubic ease-out for travel, ease-in-out for the camera, linear for rotation in `unscrew`. All tweens are driven by one clock in the render loop; nothing uses CSS transitions on the canvas.
