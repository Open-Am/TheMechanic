# Scene models status

Statuses as for the machine (ADR 0013): `placeholder`, `blocked`, `modelled`, `textured`, `approved`. Only the owner sets `approved`. Updated 2026-10-12 by plan 0016.

| Object | Status | Triangles | Matched against | What still differs |
| --- | --- | --- | --- | --- |
| `bench` | textured | 902 of 3,000 | `match/bench-match.png` (git-ignored): the baked bench from eye level and from above beside the wooden bench in "Generator Repair Workshop" (Wikimedia Commons, CC BY-SA 4.0, a roadside generator repairer in Nigeria) | Plan 0016. Five planks with gaps on two battens, aprons, four square legs a little out of true, low stretchers, nail heads; weathered grey-brown wood with oil stains and old oil soaked in. Still differs: the photo's bench is almost black with years of oil and dust and has a deeper apron and heavier legs; ours is kept lighter so the generator's black base still reads against it. No tools, rags or parts lie on it (the toolbox stands on its left end in the game). 141.0 KB of 300 KB (one 1024 px set; the occlusion and roughness are softened before packing). |

## How it is made

`tools/blender/bench.py -- build` models the bench in glTF axes (origin on the floor under the middle of the top, the long side along X, the near edge towards +Z, the top at 0.78 m), leaves out every face that points down (the camera is always above the top, ADR 0025), and bakes it with `texture.py`'s `wood` profile into one 1024 px set: grain along each piece, sun-greyed patches, grime in the corners, and on the top oil stains and soaked-in oil. `-- preview <out.png>` renders it unbaked for tuning; `--blend assets/scene/blend/bench.blend -- render <out.png>` renders the baked one. `npm run assets` exports, optimises, checks (one `bench` node within budget) and copies it to `game/public/scene/bench.glb`.

## Rounds

1. The mock-up's bench (2026-10-12) rebuilt to the budget: 902 triangles, lighter weathered wood with oil stains.
2. Against the Lagos photo: darker planks, wider stains and a soaked-in darkening over the whole top.
