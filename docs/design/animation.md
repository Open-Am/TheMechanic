# Animation

Design note, first written for Phase 2 (plan 0003). The motion vocabulary is in ADR 0020 (from ADRs 0008 and 0017).

## Removal sequence (plan 0010, ADR 0020)

1. Press acknowledgement on touch (under 120 ms), the same for every part; the hand closes on what is under it.
2. A double tap, double click or G on a part that can come off: the hand loosens it (below) and the part sits loose.
3. The player drags the loose part: it comes out along its path, then follows the hand.
4. Dropped on the tray, it sinks into the tray, shrinking and fading, as its chip appears. Dropped elsewhere, it flies back to its loose point.

Install: dragging a chip carries the part in the hand under the pointer; dropped over the machine, it flies to its exploded position, then plays its motion backwards into place, and the hand lets go.

## Sound and vibration (plan 0013, ADR 0018)

Each moment fires with the picture, never before it and never for a part that cannot come off.

| Moment | Fires when | From | Vibration |
| --- | --- | --- | --- |
| `turn` | a fastener or an `unscrew` part completes a whole turn, coming out or going in: a fastener's two turns click at half way and at the end of its 0.25 s (0.2 s going in), while the tool is on it | render | none |
| `give-unbolt`, `give-unclip`, `give-pull`, `give-scrape` | the part's freeing step starts, after its fasteners (`slide` and `lift` scrape; unknown types scrape; `unscrew` has none) | render | 15 ms |
| `land` | the part is dropped on the tray (the accepted remove) | app | none |
| `seat` | a part put back reaches home, before its fasteners go in | render | 15 ms |
| `cord` | the hand starts pulling the starter's handle out (plan 0018) | render | none |
| `fail`, `start` | the handle is fully out and let go: `fail` as the cough starts; `start` as the engine catches, with `run-start` so ADR 0028's running loop follows it; `run-stop` at the switch press (the 0.8 s wind-down); `run-cut` if the start-up is cut short (a skip to the end, a new round) | render | 40 ms; 60, 40, 60, 40, 80 ms |

An unscrewed part clicks for the whole turns it makes while loosening (75 percent of its turns): the spark plug clicks twice, the fuel tap (one turn) not at all. Going back in it clicks every turn. Pressing loose parts home before the cord and the walk-out are silent. Carrying a part makes no sound, and neither do the hand's trips to and from the toolbox (ADR 0021): the give comes once the last fastener is out, before the tool goes back, and the seat comes before the hand fetches the tool to do the fasteners up.

## The mechanic's hand (plans 0008 to 0010)

The hand is the player's pointer. It follows the pointer with a short smoothing, its arm aimed at a point level with the camera and well below it, so the arm runs off the bottom of the screen to a body just out of view. Resting, its fingertips float just off the surface under the pointer, palm towards it; gripping, its grip point sits off the surface by about the radius of what it closes on; pinching (parts no longer than 75 mm: the spark plug, plug cap, fuel tap, capacitor), its pinch point does. While it loosens or carries a part, it rides with the part. The numbers live in `game/src/render/handpose.ts` and `motion.ts`.

| Hand | Target |
| --- | --- |
| Follow smoothing | 50 ms half-life |
| Close or open | 0.12 s |
| Come in, withdraw | 0.25 m along the arm; withdraw in 0.25 s |
| Fingertips off the surface (resting) | 8 mm |
| Grip point off the surface | 12 mm |
| Pinch point off the surface | 4 mm |
| Arm aimed at | 0.3 m right of and 0.6 m below the camera |

**Loosening.** The hand frees the part by its motion type, ending 4 mm proud: `unscrew` turns three quarters of its turns (0.9 s); `unbolt` bites down, then jolts free with a 4 degree twist (0.8 s); `unclip` rocks 8 degrees and pops out (0.6 s); `pull` tugs twice (0.6 s); `lift` settles, then lifts (0.6 s); `slide` eases out (0.5 s).

**Fasteners (plan 0011).** A part held on by bolts, screws or nuts is undone first. The hand brings the tool from just off screen at the lower left in 0.3 s (a spanner for bolts and nuts, a screwdriver for screws), then takes each fastener in turn: the tool hops to it in the first quarter of its 0.25 s, then turns it out 2 turns as it backs out 8 mm, so it stands proud of its hole. The screwdriver turns with the screw; the spanner lies across the bolt with its handle to the lower right of the screen and swings in 60 degree strokes, ratcheting back. Then the part comes free in 0.3 s and the tool goes back off screen in 0.3 s. Four bolts take about 1.9 s in all. The fasteners ride with the part to the tray and back; once a part is put back and home, its fasteners go back in, 0.15 s each. When the cord is pulled, loose parts are pressed home and their fasteners go back in with them over the same 0.2 s; a part caught half undone is pressed home the same way and the tool is put away at once. Without the tools file, the fingers turn them. Since plan 0012 the tool comes from the toolbox; see below.

**The toolbox trip (plan 0012, ADR 0021).** A red cantilever toolbox stands on the left end of the workbench (since plan 0016; on the ground to the left of the machine before, and in front of it until release 0.11.1), with the spanner and the screwdriver lying across its back tray. In the default view the left screen edge cuts it, so only its open back tray, the tools and the near end show, beside the machine and never over it or under the controls, at any tray size. It is scenery: it is never picked and never blocks the pointer. Loosening a part with fasteners plays one sequence (`tripPlan` in `game/src/render/motion.ts`): the open hand goes from the pointer to the toolbox, takes the tool (0.12 s), carries it to the first fastener, undoes each fastener that tool fits (0.25 s each, as above), changes tool at the toolbox if a fastener needs the other one (fasteners are grouped by tool, so at most once), lets the part come free (0.3 s), lays the tool back in its slot (0.12 s) and returns to where the player touched the part. Each leg takes 0.35 s up to 1.0 m and longer with distance, never more than 0.6 s. From the default view on the bench the recoil starter's legs are 0.47 m (pointer to toolbox) and 1.36 m (toolbox over the machine to the first bolt), and the whole sequence is planned at 3.19 s. On the trip the forearm comes from the toolbox's side of the screen: its root, normally off screen at the lower right, slides to the mirror place off screen at the lower left on the legs to a toolbox on the left, arriving by 70 percent of the leg, stays there while the tool is taken or laid back, and slides back over the last 70 percent of the legs to the fasteners and home (`armSideOnTrip` in `game/src/render/handpose.ts`, eased with a 0.08 s half-life). So at the toolbox the arm rises from the bottom edge below it rather than lying across the machine; while the hand crosses over the machine the arm still passes in front of it. Every leg runs along `overPath`: out from the surface by 5 cm, and if the straight line would cross the machine's bounds, up to 5 cm above its top, across, and down. On a leg, away from the machine, the hand is not pushed out of the machine's surface; near it, it is, as always. Putting a part back runs the same trip once the part is home: fetch, do each fastener up (0.2 s each), put the tool back, return; then the hand withdraws. While a sequence plays, the view still turns and zooms and the clock runs; a new double tap, a carry of a loose part (the drag turns the view instead) and a put-back from the tray are ignored until it ends. The part counts as loose once it is free, while the hand is still taking the tool back. When the cord is pulled mid-sequence, the tool goes straight back to its slot and the fasteners go in quickly with no trip, as before. Without `toolbox.glb` the tools come from just off screen as in plan 0011; without `tools.glb` the fingers turn the fasteners, with no trip.

| Carrying | Target |
| --- | --- |
| Out along its path | over the first 60 px of drag |
| Back to its loose point when dropped away from the tray | 0.25 s |
| Into the tray | 0.2 s, shrinking to half and fading |
| Loose parts pressed home before the cord is pulled | 0.2 s |

**Turning.** Since plan 0016 (ADR 0025) the machine stands on a workbench and turns there; the camera does not go round it. Each pointer move nudges the machine's turn about its upright axis and the camera's rise on its circle about the machine's middle, so the held spot moves towards the pointer: one Newton step, at most 0.15 radians on each (`turnStageToward` in `game/src/render/stage.ts`). The held spot is kept in the machine's own axes, so it turns with it. The rise runs from the default view to looking 35 degrees down. If the held spot lags the pointer by more than 60 px or faces away from the camera, the hand grabs again under the pointer. The key light stays put as the machine turns, so the light falls on it differently as it turns, as it would on a real bench.

**The workbench (plan 0016).** The bench top is 0.78 m high, 1.15 by 0.65 m; the machine's middle stands 0.31 m behind the near edge and 0.34 m in front of the far edge, so it turns without hanging over either. Its contact shadow, baked from the machine (`tools/blender/bake_ground.py`: a wide soft shadow and a darker one where the feet touch), lies on the bench top under it and turns with it. The floor beyond the bench is a faint surface fading to the background, with the bench's own soft shadow. The toolbox stands on the bench's left end, its back tray towards the camera and clear of the circle the machine sweeps, with the spanner and screwdriver lying across that tray's rims (from eye level the tray's wall would hide them on its floor). The customer's spot is 0.35 m behind the far edge. Positions live in `game/src/render/stage.ts`.

Input is not blocked during an animation, except a new loosen, carry or put-back during the toolbox sequence (above). The reducer has already accepted the action; the animation only shows it.

## The customer (plan 0015, ADRs 0007, 0015 and 0025)

One person per round stands 0.35 m behind the bench's far edge, facing the mechanic, and plays one clip at a time with a 0.2 s blend (`render/customer.ts`, `render/customerpose.ts`). Only the clock and the cord move them; part events never do (ADR 0007).

| Event | Clip | Then |
| --- | --- | --- |
| `started` | `idle` (4 s loop: breathing, a slow weight shift) | loops |
| `patience`, waiting (50 percent) | `waiting` (1.5 s: looks at the wrist) | `idle` |
| `patience`, annoyed (20 percent) | `annoyed` (1 s: crosses the arms) | `annoyed_idle` (2 s loop, foot tapping) |
| `pulled`, not started | `failed_pull` (1.2 s: hands to hips, head shakes) | the resting loop for the mood |
| `ended` | `pay_leave` (4.3 s, plan 0017; smiling) | hidden, with the generator |
| `left` | `storm_off` (2.5 s, plan 0017) | hidden, with the generator |

A figure that arrives late starts in the resting loop for the current mood. `pleased` and `leaving` stay in the files but are no longer played.

## Bringing the generator, paying, storming off (plan 0017, ADRs 0026 and 0027)

Start pressed: the customer walks in carrying the generator by its handle and sets it on the bench (`arrive`, 3.1 s). The clock and patience start when it lands, at 2.5 s (`app` `begin()`); they step back into `idle`. Fixed: `pay_leave` (4.3 s): they smile (the `smile` morph, full by 0.3 s) and nod; the notes are in their right hand from 0.55 s, held out at the height of the generator's top, and let go at 2.2 s; a hold point at 2.35 s, where plan 0018's running engine and its switch-off will go (`setPayHold`, ADR 0027); they take the generator at 2.7 s and walk off. `pleased` also smiles. Walked: the parts that were off or loose snap home at once, silently, the tray empties, and `storm_off` (2.5 s): a head shake, the generator snatched at 0.85 s, a fast walk off. While carried, the generator hangs from `<look>_grip_r` by its handle, turned along the line to `<look>_grip_l`; it eases onto the bench over the last 0.3 s before it lands, and before an ending reaches for it, it is turned back to the landed turn over 0.3 s. A tap anywhere during the arrival or a walk-out skips to its end (the arrival lands at once); a fixed round's ending is part of the start-up below and skips a step a tap. The result screen waits for the ending, at most 14 s. Without a figure, the round begins at Start and ends as before. Times are in `render/customerpose.ts` (`STORY`).

## Pulling the cord, the engine running, the switch-off, the cough (plan 0018, ADR 0027)

Times are in `render/startup.ts` (`STARTUP`), seconds from the press. Loose parts are pressed home first (0.35 s, `CARRY.homeSeconds`). If the recoil starter is more than 40 degrees off facing the camera, the generator turns on the bench the shortest way to 25 degrees off (0.25 s plus 0.3 s a radian, at most 0.8 s), and stays turned. The hand reaches the T-handle (0.22 s), grips it (0.1 s) and pulls it out 40 cm along the starter's axis, rising 5 cm, sharply (0.3 s, `cord`), lets go (0.06 s) and the rope runs back in (0.3 s). The rope (`recoil_starter.rope`) is scaled along its +X from the housing's outlet to the handle every frame.

Fixed: the engine catches as the handle is let go (`start`): a kick of 2.2 times the running shake settling over 0.35 s, a puff from `muffler.outlet` and a haze building over 0.6 s. The running shake is a seeded random walk of the machine's offset (1.5 mm across, 0.6 mm up) and roll (0.25 degrees) stepped at 25 Hz. It runs on its own for 3.0 s, then the customer smiles: `pay_leave` starts; the customer smiles, the notes are held out 0.55 s in, the hand reaches across the bench for them and takes them at 2.2 s (a copy of the customer's `<look>_notes` moves into the mechanic's hand), then brings them back off the bottom of the screen into the pocket (0.6 s), all while the engine runs; the clip holds at 2.35 s. The hand goes to the red switch (0.45 s) and presses it (0.15 s): the rocker (`base_panel.switch`) turns 16 degrees about its X. The engine winds down over 0.8 s: the shake, the haze and the sound fade to nothing. Then the clip is let go and the customer lifts the stopped generator at 2.7 s and walks off (1.95 s after the hold). About 9.15 s from the catch to the customer gone. The pay times come from `STORY.pay_leave`, so a longer clip moves them. The engine's sound is ADR 0028's: the catch (`start`), then `run` on repeat from `run-start`, wound down by `run-stop` at the press over the same 0.8 s; once the ending is over, main.ts cuts any loop still playing, so nothing loops under the result. Without a figure, the result follows the wind-down.

Not fixed: the engine turns over and coughs twice (0.45 s and 0.9 s after the let-go), each with a jolt and a dark puff, and stops 1.5 s after the let-go (`fail`). The round goes on; the clock runs through it (ADR 0027).

The exhaust is at most 10 camera-facing sprites from one 128 px soft texture drawn in code (`render/exhaust.ts`): light grey puff and haze, dark grey cough smoke, each living about 1.4 s, drifting out of the spout (machine -X) and rising. A tap during the start-up skips to its next step: the catch (or the end of the cough), the smile, the press, stopped, gone. Pointer input does nothing else until it is over.

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
