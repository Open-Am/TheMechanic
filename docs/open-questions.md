# Open questions

Anything unverified or unclear. Add a line. Do not resolve by guessing. When one is settled, move the answer to an ADR or the data and delete the line here.

## Machine content (needs a mechanic)

See the checklist at the end of `reference/generator-reference-pack.md`. Nothing in `machine.json` or `faults.json` is verified.

Raised by the visual reference research on 2026-10-10 (`reference/visual-references.md`). All from clone manuals, seller photos and videos, none from Yamaha; for the mechanic to confirm:

- Fuel tap: every source shows it screwed into the underside of the tank, so it would come away with the tank. The data has the tap as a separate removal before the tank (`fuel_tank` requires `fuel_tap`).
- Tank: it is one shallow shell that is also the lid, held by screws, lifting off whole (Benco video, approx 3:20).
- Spark plug: one video and one photo suggest the plug comes out with the tank still on. That matches the data (`plug_cap` needs nothing off).
- Air filter: the GG950 manual shows a foam block behind the lower front door of the panel, not a separate cover. Whether `air_filter_cover` is that door is unconfirmed.
- Muffler heat shield: bolted with the muffler to the cylinder, not seen coming off on its own. That matches the data.
- Capacitor: three shapes and ratings found (a box beside the panel in the PS50 diagram, a round cream cylinder under the tank lid in a Benco video, a CBB61 24 µF box in a listing). The reference pack's location behind the alternator end cover, and its 12 µF figure, came from a four-stroke generator. The data has `capacitor` requiring `alternator_cover`.
- Spark plug model: clone sources show F5TC, F6TC or F7TC, gap 0.7 to 0.8 mm. No genuine Yamaha figure found.
- Fuel mix: 50:1 in the pack and the GG950 manual; the GG1000 says 40:1.
- Bore: 45 mm in most piston kits, 44 mm in one.

## Modelling (Phase 3)

- Capacitor look: a round cream cylinder (Nigerian video) or a black CBB61 box (listing). The placeholder is cream for now; the mechanic or a photo decides.
- There is no tube frame. `base_frame` will be modelled as the die-cast base, rubber mounts and body shell. Its ID stays as it is (data contract).

## Owner decisions pending

- Git LFS quota: ADR 0012 puts `.blend` files and textures in Git LFS. The storage and bandwidth allowance on the GitHub plan for `Open-Am/TheMechanic` is not checked.
- Blender is not on PATH on the build machine (`C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`). ADR 0012 reads it from `BLENDER`; the owner sets that variable or adds the folder to PATH.
- "Open Am" is a working title. It appears in share text and the page title.

## Raised during plan 0001

