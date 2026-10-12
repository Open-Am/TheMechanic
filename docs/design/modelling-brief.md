# Modelling brief

Instructions for whoever models `gen950` in Phase 3: Claude in Blender, an approved AI tool, or a person. Design note under ADR 0013. Read that ADR, ADR 0014 (budgets and lighting) and ADR 0012 (Blender 4.5 LTS) first, and section 9 of the brief for scene conventions and scripts.

## The job

Model a used Yamaha ET950-pattern generator, the kind sold in Lagos as Tiger TG950 and similar, so that at phone size it reads as the real machine. Work like a senior hard-surface artist on a product-visualisation job: reference first, real scale, correct materials, honest wear, and checking against photos until it matches. Do not invent details the references do not show; where they disagree, note it in `docs/open-questions.md`.

## Inputs

- `docs/reference/visual-references.md`: links, what each shows, local file names.
- `assets/gen950/reference/`: local copies, by part. Reference only, never textures (ADR 0013).
- `game/public/machines/gen950/machine.json`: part IDs, rough positions, `explode` directions. The model must match the IDs exactly.
- Real size: 367 × 312 × 375 mm (L × W × H), front (control panel side) facing +Z, Y up, origin at the centre of the base on the ground.

## Workflow for every part

1. **Study.** Collect three or more reference views of the part. Write down its silhouette, its main forms, how it is made (stamped steel, die-cast aluminium, moulded plastic, rubber), how it fastens, and its colour.
2. **Scale.** Get sizes from known dimensions: the 367 mm length, the 4 L tank, a standard M6 bolt head (10 mm across flats), the spark plug hex (21 mm for a B-series plug). Measure photos against these, not by eye.
3. **Block out** primary forms at real size in its real place. Check the silhouette against a reference photo with the camera matched (step 8) before adding detail.
4. **Secondary forms.** Fillets, rolled seams, ribs, bosses, fins, fastener heads, lettering panels. Bevel every hard edge; nothing real has a perfectly sharp corner. A 0.5 to 1.5 mm bevel catches light and sells the scale.
5. **High and low poly.** Build detail on a high-poly copy (subdivision, small bevels, embossing). Make a low-poly game mesh within the triangle allocation below. Bake normal and ambient occlusion from high to low. Detail smaller than about 2 mm goes in the normal map, not the mesh.
6. **UVs.** Even texel density across the exterior (target about 5 px per mm on the 2048 atlas for large exterior parts). Straighten UV shells on lettering and seams. Keep seams where real seams are.
7. **Materials and wear.** Principled BSDF, baked to base colour, normal, and packed occlusion-roughness-metallic, as the brief says. See the material table and wear notes below.
8. **Match.** Set a Blender camera to the angle and focal length of a reference photo, light it as the game does (ADR 0014: the same environment map, the same key light direction, PBR Neutral tone mapping), render, and put the render beside the photo in one image. Save it as `assets/gen950/match/<part>-<n>.png`. List what differs: silhouette, proportions, colour, gloss, wear. Fix and repeat. A part is `modelled` only after a match image exists and its list has no silhouette or proportion problems left.
9. **Check in the game.** Export, run the pipeline, and look at the part in the game at default zoom on a phone-sized viewport. The game's lighting is simpler than Cycles; a part that only looks right in Cycles is not done.

Stop after five match rounds on one part, and report what still differs and why, rather than looping.

## Triangle allocation

Total budget 60,000 (ADR 0014). The parts below add up to 51,700 (with 3,000 for fasteners in `budgets.json`, 54,700), keeping the rest spare for detail where the match loop shows it is needed. ADR 0030 added the last three rows.

| Object | Triangles |
| --- | --- |
| `fuel_tank` (with cap, filler neck) | 5,000 |
| `recoil_starter` (housing, ribs, handle, rope) | 4,500 |
| `muffler` (body, heat shield, outlet) | 4,000 |
| `alternator_cover` | 3,500 |
| `carburetor` (body, float bowl, choke lever) | 4,500 |
| `air_filter_cover` | 1,800 |
| `air_filter` | 1,200 |
| `fuel_tap` | 1,500 |
| `fuel_hose` | 800 |
| `plug_cap` | 1,000 |
| `spark_plug` | 1,400 |
| `capacitor` | 800 |
| `fuel_cap` (on the tank's top, its filler neck in `fuel_tank`) | 400 |
| `fuel_filter` (short clear cylinder on the tap's outlet, under the hose's end) | 400 |
| `ignition_coil` (small black block with two bolts, beside the flywheel behind the recoil starter) | 900 |
| `base_frame` (tube frame, feet) | 6,000 |
| `base_engine` (cylinder, cooling fins, crankcase) | 9,000 |
| `base_alternator` | 3,000 |
| `base_panel` (socket, breaker, switch, DC posts) | 2,000 |

### The three parts of ADR 0030 (plan 0020)

Not modelled yet: plan 0020's model step waits for plan 0018's branch, which also edits `gen950.blend`. Until then the game draws them from their placeholders in `machine.json`, and `npm run assets` warns, naming them and the coil's bolts, instead of failing.

- **Fuel cap.** A separate node on the tank's top, unscrewing about two turns; the tank's mesh gets a filler neck under it. Its vent design is unknown (open questions).
- **Fuel filter.** A short clear cylinder on a stub from the tap's outlet, under the hose's end, so the hose comes off first and the tap after it. Whether the clones have one at all is unknown.
- **Ignition coil.** A small black block with two bolts (`ignition_coil.bolt_1`, `bolt_2`) on the engine side behind the recoil starter's housing, in reach once the starter is off. No plug lead is modelled. Coil or CDI unit is unknown.

## Textures

- One 2048 px atlas for the large exterior: tank, frame, covers, recoil starter, muffler, engine block.
- 1024 px sets for the small parts, grouped: carburetor, fuel tap, hose and air filter together; spark plug, cap and capacitor together.
- Every set has base colour, normal, and occlusion-roughness-metallic. Compression is the pipeline's job.

## Materials

Starting values; match them to the references in the game's lighting.

| Surface | Base colour | Metallic | Roughness | Notes |
| --- | --- | --- | --- | --- |
| Painted steel tank | from references (often red on clones) | 0 | 0.35 to 0.5 | Slight orange peel in the normal map; paint thinner on edges. |
| Powder-coated frame tube | near black | 0 | 0.5 to 0.6 | Scuffs to bare metal on the feet and lower rails. |
| Die-cast aluminium (carburetor, fins, covers) | #a7a8aa | 1 | 0.45 to 0.6 | Casting texture in the normal map; darker in recesses. |
| Black ABS plastic (recoil housing, panel, filter cover) | #1b1b1b | 0 | 0.55 to 0.7 | Mould texture; faded grey on top faces from sun. |
| Rubber (hose, plug cap) | #121212 | 0 | 0.8 to 0.9 | Slight sheen where handled. |
| Zinc-plated fasteners | #b9b39a | 1 | 0.3 to 0.4 | Small, but they sell realism. |
| Exhaust steel | #5a534c | 1 | 0.6 to 0.8 | Heat discolouration, surface rust, carbon at the outlet. |
| Spark plug ceramic | #ece8df | 0 | 0.2 | Steel hex and thread, metallic. |
| Filter foam | from references | 0 | 0.9 | Dust in the outer layer. |

## Wear: a working machine in Lagos

The machine is used, not new and not wrecked. Roughly:

- Dust settled in every upward-facing crevice and on top of the engine fins.
- Oil seep and dirt around the carburetor, the base of the cylinder and the muffler joint.
- A fuel stain below the fuel tap.
- Carbon and soot at the muffler outlet; surface rust on the heat shield.
- Chipped paint on the tank's edges and filler neck; paint faded on its top.
- Scratches and bare metal on the frame feet; scuffs on the recoil housing.

The condition of each fault's culprit is told in text on the card (ADR 0004, ADR 0010). The model shows a normal used machine; it does not show the fault.

## Markings

Do not copy Yamaha, Tiger or any other maker's logo, name or trademark. Use plain panels where badges would be, generic "950" and warning-style markings, and labels written by us. The machine should feel like the real type without imitating a brand.

## If an approved AI generation tool is used

Only after the owner approves the tool (ADR 0013). Generate one part at a time, never the whole machine, so parts stay separable. Feed it our own photos or our own renders, never third-party photos. A starting prompt, adjusted per part:

> Photorealistic game-ready 3D model of a single [part] from a small 950 W two-stroke portable generator (Yamaha ET950 type), real size about [W × H × D] mm. Made of [material], [colour], with [key features from the study notes]. Lightly used: [wear notes]. No logos, no text, no brand names. Clean hard-surface topology, bevelled edges, PBR textures (base colour, normal, roughness, metallic), centred on its own origin.

Whatever the tool produces goes through the same steps from 5 on: topology and triangle count, UVs, materials, the match loop, and the in-game check.

## Done, per status

| Status | Means |
| --- | --- |
| `placeholder` | The box from `machine.json`. |
| `blocked` | Real size and silhouette from references, in place, named right. |
| `modelled` | Secondary forms, low poly within budget, baked normals, at least one match image with no silhouette or proportion issues left. |
| `textured` | Materials and wear done, checked in the game's lighting on a phone-sized view. |
| `approved` | The owner says so. Nobody else sets it. |
