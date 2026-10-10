# gen950 model status

Statuses: `placeholder`, `blocked`, `modelled`, `textured`, `approved` (brief section 9, ADR 0013). Only the owner sets `approved`. Updated 2026-10-10 by plan 0005.

`blocked` means real size and silhouette from the references, in place, named right, with flat colours. Nothing here is finished.

| Object | Status | Triangles | What still differs from the references |
| --- | --- | --- | --- |
| `fuel_tank` | blocked | in 5,832 total | Lid slightly too even; the real one has a pressed recess and a deeper flared lip. Handle should be thicker and a little taller. No wear yet: the Lagos photos show chipped paint and rust on the edges. |
| `recoil_starter` | blocked | | Real cover is a rounded, bulbous pressed shape whose front protrudes past the panel; this is a flat slab with a disc. Vents are slots on a disc rather than pressed into the cover. |
| `muffler` | blocked | | Shield slots are painted on, not cut. Real shield is rusted orange-brown with burn marks on used units. |
| `alternator_cover` | blocked | | Cross slots are dark insets, not cut. Real casting has a square rim and an earth wire. |
| `air_filter_cover` | blocked | | Close in outline. Holes and bolts placed by eye from one photo. |
| `air_filter` | blocked | | From a manual drawing only; no photo. Size and colour are guesses. |
| `carburetor` | blocked | | Simplified body; no choke linkage or adjusting screws yet. |
| `fuel_tap` | blocked | | Position unconfirmed (see `docs/open-questions.md`). Lever shape simplified. |
| `fuel_hose` | blocked | | Route chosen so the hose is visible and can be pulled; the real route is unconfirmed. |
| `spark_plug` | blocked | | Hex and insulator only; no thread, terminal or electrode. |
| `plug_cap` | blocked | | Straight boot; the real boot is a right angle with an HT lead. |
| `capacitor` | blocked | | Round cream can; a black CBB61 box is also seen. Location unconfirmed. |
| `base_frame` | blocked | | Tray and four feet. The real base is the cast crankcase and alternator feet with rubber mounts. |
| `base_engine` | blocked | | Crankcase, finned cylinder and shroud as simple shapes. No studs, ports or cut-out for the plug. |
| `base_alternator` | blocked | | Plain cylinder; no cast ribs. |
| `base_panel` | blocked | | Follows the Tiger TG950 (round socket, warning label, switch, choke). Other clones use a blue Schuko socket and a meter, with the alternator further forward. |

## Match images

In `assets/gen950/match/`: the photo on the left, the render from about the same angle on the right. These images contain third-party reference photos, so like `assets/gen950/reference/` they stay on the build machine and are not committed (ADR 0013). `tools/blender/match.py` recreates them.

- `whole-front-right-1.png`: the first round. Panel too narrow, tank too thick and round, handle too wide and low.
- `whole-front-right-2.png`: after corrections. The silhouette matches; the differences left are listed above.
- `whole-back-1.png`: shroud and plug left, muffler right, as in the photo. The render is dark; lighting is tuned in plan 0006.
- `whole-front-left-1.png`: against a clone variant with a narrower panel; kept for the record, not followed.

## Lighting

Look-development uses the game's environment (`game/public/env/workshop.hdr`), key light direction and Khronos PBR Neutral. Metal parts read too dark against the street environment; materials and exposure are tuned in plan 0006.
