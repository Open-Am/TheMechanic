# gen950 model status

Statuses: `placeholder`, `blocked`, `modelled`, `textured`, `approved` (brief section 9, ADR 0013). Only the owner sets `approved`. Updated 2026-10-10 by plan 0006.

`textured` means: detailed shape from the references within its triangle allocation, baked materials and wear, compared with at least one reference photo from about the same angle, and checked in the game's lighting at phone size. Nothing here is approved; that is the owner's call.

| Object | Status | Triangles | Matched against | What still differs from the references |
| --- | --- | --- | --- | --- |
| `fuel_tank` | textured | 3,314 | whole-front-right, whole-back, part-fuel_tank | The real lid's pressed panels are bolder than these thin grooves. Wear is light next to the Lagos photo, which shows heavy chipping and rust along the edges. |
| `recoil_starter` | textured | 3,554 | whole-front-right, part-recoil_starter | Bolt ears less pronounced; the new part is glossy, this one dusty and matte (deliberate: a used machine). |
| `muffler` | textured | 2,178 | whole-back, part-muffler | Louvres, pipe and spout match. The logo and bolt dimples on the shield are simplified; the Lagos photo shows far more rust and burn. |
| `alternator_cover` | textured | 1,398 | part-alternator_cover, whole-front-left | Close. The real casting has a square rim with feet in one piece with the cover. |
| `air_filter_cover` | textured | 512 | part-air_filter_cover | Outline, bolts and holes from one seller photo; whether this door is the filter cover is unconfirmed. |
| `air_filter` | textured | 184 | part-air_filter (a manual drawing) | No photo exists; size and colour are guesses. |
| `carburetor` | textured | 1,828 | part-carburetor (three rounds) | Linkage arm, oval two-hole flange, spring screws, bowl and inlet match. The casting is simpler than the real one. |
| `fuel_tap` | textured | 952 | part-fuel_tap (three rounds) | Oval body, screws, rotary lever, nut and stem match; it is chunkier than the real tap and the lever is shorter. Its position on the machine is unconfirmed. |
| `fuel_hose` | textured | 612 | part-fuel_hose | Close; the route on the machine is unconfirmed. |
| `spark_plug` | textured | 1,156 | part-spark_plug (three rounds) | Full plug: thread, ribs, hex, terminal. No printed marking (deliberate: no brand names). |
| `plug_cap` | textured | 676 | part-plug_cap | Right-angle boot and lead; the real boot is slimmer. |
| `capacitor` | textured | 620 | part-capacitor (two rounds) | A round cream can, following a Nigerian repair video; the seller listing shows a black CBB61 box. Unresolved; location unconfirmed. |
| `base_frame` | textured | 1,432 | whole-front-right | Feet, base tray and the cast post at the front right. The real base is the cast crankcase and alternator feet on rubber mounts. |
| `base_engine` | textured | 1,036 | whole-back | Shroud with plug notch, finned cylinder, crankcase. No ports or detailed studs. |
| `base_alternator` | textured | 1,628 | whole-front-left | Ribs and rim; the real casting has more ribbing. |
| `base_panel` | textured | 1,226 | whole-front-right | Follows the Tiger TG950. The label carries lines in place of text, with no brand. |

Total: 22,306 triangles of 60,000. The compressed model is 1.01 MB of 5 MB.

## Fasteners (plan 0011, ADR 0020)

Updated 2026-10-11. Each fastener is its own object, built by `model.py` from `machine.json`, parented to its part and baked with its part's atlas. Every count, head and position below is a draft and **unverified** until the mechanic checks it (`docs/open-questions.md`). Match images: `part-<id>-fasteners-<n>.png` (local only).

| Part | Fasteners (unverified) | Triangles | What still differs from the references |
| --- | --- | --- | --- |
| `alternator_cover` | 4 hex bolts with washers | 320 | The product photo of the outside casting shows no bolt heads on the round face. Its visible fixing points are two ears with holes at the top corners of the square rim and a lug at the side, and the rim and feet are one casting with the cover. The real bolts are probably through the rim, not the face as drawn. |
| `fuel_tank` | 4 Phillips pan-head screws, two on each side | 656 | The photo shows raised side flanges along the tank's two sides with a hole near each end. The model has no separate flanges: the screws sit in the lower rim and are hard to see. One screw (`screw_3`, z 0.03) is not opposite its pair (z 0.09), unlike the photo's holes near the ends. |
| `muffler` | 2 nuts on the exhaust studs, 2 bolts through the heat shield | 376 | The two shield bolts sit on the two dimples the photo shows: close. The photo's exhaust flange is an oval plate with two slotted holes; the model's flange is a smaller square plate and the nuts show only from the side. |
| `carburetor` | 2 nuts on the flange studs | 216 | The photo's oval flange has two holes either side of the bore; the model's flange is smaller and partly behind the body, so the nuts are hard to see from the photo's angle. Spacing follows the listing (about 37 mm, unverified). |
| `recoil_starter` | 4 hex bolts, one in each ear | 320 | The photo shows ears with holes at the lower edge and the left; the model's bolts sit on the inner face at its ears and only one shows from outside. Sources say three or four ears. |
| `air_filter_cover` | 2 hex bolts | 160 | The seller photo shows the door with three holes and a grip and no bolt heads. Whether the door is bolted, clipped or both is open. |

Total with the fasteners: 23,658 triangles of 60,000 (fasteners 2,048 of their 3,000 allocation). The compressed model is 1.04 MB of 5 MB.

## Match images

In `assets/gen950/match/`: the photo on the left, the render from about the same angle on the right. Whole-machine images are `whole-*`; single parts against product photos are `part-*`, numbered by round. They contain third-party photos, so like `assets/gen950/reference/` they stay on the build machine and are not committed (ADR 0013). `tools/blender/match.py` recreates them; `only=<id>` frames one part.

## Textures

One 2048 px atlas for the exterior, one 1024 px atlas for the small parts, each with base colour, ORM and normal maps, baked by `tools/blender/texture.py` and packed into the .blend. Wear: chipped paint with primer and rust on edges, laterite dust in crevices and on upward faces, scuffed and sun-faded plastic, rust and soot on the exhaust.

## Lighting

Look-development uses the game's environment, key light direction, exposure and Khronos PBR Neutral (`tools/blender/lookdev.py`). Faces turned away from the key light, such as the back, render dark in both Blender and the game.
