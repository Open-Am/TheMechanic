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
| `cord` | the cord is pulled (the accepted pull) | app | none |
| `fail`, `start` | 0.6 s after the cord (`CORD_SECONDS`) | app | 40 ms; 60, 40, 60, 40, 80 ms |

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
