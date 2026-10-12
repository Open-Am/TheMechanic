# The customers' status

Statuses as for the machine (ADR 0013): `placeholder`, `blocked`, `modelled`, `textured`, `approved`. Only the owner sets `approved` (ADR 0015). Under plan 0015 reading 9, a look's file reaches `game/public/customers/` on `main` only once it is `approved` here; this branch carries all three so the owner can judge them. Updated 2026-10-11 by plan 0015 steps 1 to 5, and 2026-10-12 after the owner's review.

On 2026-10-12 the owner reviewed the three people and wrote "Go with your recommendations in 1 and 2". The recommendation for the people was to approve Mama Ngozi (`woman_market`) and Tunde (`man_young`), and to give Alhaji Musa (`man_kaftan`) another pass. So `woman_market` and `man_young` are `approved`, as they were built on 2026-10-11; `man_kaftan` is not approved, second pass requested.

| Look | Who | Status | Triangles | Joints | File | Matched against | What still differs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `woman_market` | Mama Ngozi: a woman of about 50, fuller build, in a wax-print blouse and wrapper with a head tie | approved (owner, 2026-10-12: "Go with your recommendations in 1 and 2") | 14,178 of 15,000 | 53 of 64 | 700 KB of 1.5 MB | `woman_market-2.jpg` (Lagos clothes seller, matching print set and head tie) and `woman_market-4.jpg` (market women) | Reads as a market woman in a matching print set. Still differs: the wrapper is one smooth tube with no tied fold or knot at the waist and no hanging drape; the blouse follows the body too closely at the bust; the print is our own ring-and-dot design, busier and smaller than most real Ankara, with no large motifs; the head tie is a smooth wrapped cap with a small knot at the back, not the folded, tucked cloth of a real one; her slippers barely show; the hands are the decimated MakeHuman hands, with no wrinkles. |
| `man_kaftan` | Alhaji Musa: a man of about 55, average build, in a plain long kaftan over trousers, with a cap | textured; not approved, second pass requested (owner, 2026-10-12) | 14,178 of 15,000 | 53 of 64 | 624 KB of 1.5 MB | `man_kaftan-1.jpg` (older man in a white kaftan and fila, seated) and `man_kaftan-2.jpg` (a plain brown jalabia, standing) | The weakest of the three. The kaftan is stiff: no long vertical folds, the chest and belly show through the cloth, the sleeves balloon at the elbow, and a faint line marks where the skirt meets the body. The cap is a low cream drum with a few stitches; real fila and kufi are taller and patterned or embroidered. The neat grey beard in the material does not show in the bake (its mask sits off the jaw); his hair is short and greying. His sandals barely show. |
| `man_young` | Tunde: a man of about 25, slim, in a plain T-shirt, jeans and slides | approved (owner, 2026-10-12: "Go with your recommendations in 1 and 2") | 14,178 of 15,000 | 53 of 64 | 563 KB of 1.5 MB | `man_young-1.jpg` (young men on an okada: T-shirt, jeans) and `street-3.jpg` (Lagos street, casual wear) | The most convincing. Still differs: the T-shirt is a little tight with no creases, and its hems are ragged where decimation cut the material border; the jeans are straight tubes with no seams, pockets or bunching at the ankle; the low-cut hair is a dark matte cap with a hard hairline; the slides are a strap painted on the foot. |

All three: the faces are MakeHuman's average face for the settings, with no exaggerated feature, our own brows and eyes, and no wrinkles or pores (ADR 0015's "never caricatures" kept by staying near the middle of every slider). Skin is one smooth tone per person with soft mottling. The clips (`idle`, `arrive`, `waiting`, `annoyed`, `annoyed_idle`, `failed_pull`, `pleased`, `leaving`) are first passes keyed by angle: readable in the strips, stiff next to real motion; the walk-off has no foot roll and the wrapper and kaftan skirts follow the legs a little too closely.

## The default game view does not show the head

At the default camera (azimuth 0.55, polar 1.12, 40 degrees vertical, 2.12 m from the machine's centre on a 390 by 844 screen) the top edge of the picture, 0.6 m behind the machine where reading 7 places the customer, is only 0.82 m above the ground. The heads are at 1.57 m (woman), 1.70 m and 1.74 m. So the default view shows only their legs and a hand, not "head and upper body above the machine" as plan 0015's goal says; the `*-game-baked.png` renders show it. Steps 7 to 9 will need to change the spot, the camera or the goal; that is a decision for the owner, not something step 3 can fix. `*-game-tilted-baked.png` turns the same camera up to the head, to show how large the person reads at that distance.

## How they are made

`tools/blender/customer.py` (`-- build`, `-- preview <dir>`, `-- render <dir>`, `-- export`), from MPFB 2.0.18 bodies with the CC0 game_engine skeleton; see the script's header and `assets/customers/LICENCE.md`. Build, bake and save of all three takes about 155 s on the build machine; the renders about 130 s.

## Rounds

1. First body (`man_young`): skin-tight clothes, a shiny swim-cap hair, glossy skin, 1.89 m tall.
2. Clothes draped from the chest and as tubes on limbs: the radii were maxima from the bone line and caught the buttock and shoulder, giving balloon trousers and shoulder pads.
3. Tubes fitted through slice centres with percentile radii; matte low-cut hair; heights set to 1.57 to 1.74 m. `man_young` reads right. The wrapper and kaftan skirts ballooned: their fit took in the hands hanging at hip height.
4. Skirts fitted to hips and legs only; smaller print motifs; deeper blue kaftan, softer sleeves, lower cap. The woman reads right.
5. Kaftan skirt overlapping the body from the waist, trousers hanging below it, a domed cap. Baked, exported, checked, and matched against the reference photos (`match/`, git-ignored, as they contain third-party photos).

The match images `match/<look>-match.png` put two reference photos beside the front and three-quarter renders.
