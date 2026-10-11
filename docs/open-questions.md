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
- Capacitor in view: the removal check of release 0.9.3 (`tools/verify/drop-play.ts`) turned the machine all the way round at the default tilt, with the alternator end cover and every other part off, and no pixel of the capacitor showed from any side (other tilts not tried). It still comes off by tapping where it is, through its finger-sized hit volume, but a player cannot see it. Whether the model hides it inside the alternator end, and whether it should show, is for the model's next pass.
- There is no tube frame. `base_frame` will be modelled as the die-cast base, rubber mounts and body shell. Its ID stays as it is (data contract).
- Fuel tap position: not seen clearly in any photo. Plan 0005 puts it under the tank's left front corner with the lever facing left, and runs the hose down the left side into the filter compartment, so both can be seen and pulled. A photo of a real machine settles it.
- Front panel variants: the Tiger TG950 has a full-width panel (round socket, warning label, switch, choke); other clones have a narrower panel with a blue Schuko socket and a meter, and the alternator further forward. The model follows the Tiger.
- Spark plug angle: the plug leans up and back out of the head (Lagos back-view photo). The data's `motion.axis` can only be x, y or z, so the unscrew turns about y, which is close but not exact.

## Fasteners and sound (ADRs 0018 and 0019, proposed 2026-10-11)

- Fasteners on each part of the real machine: how many, what heads (hex bolt, Phillips screw, nut on a stud), and what size spanner. Unknown for every part. Likely candidates: alternator cover, recoil starter (often three bolts), muffler (nuts on studs plus a bolt), carburettor (two nuts on studs), fuel tank (screws, per the Benco video), air filter door. Drafts go in machine.json marked unverified; the mechanic checks them.
- Whether any fastener is captive (stays in the cover) rather than coming out loose.
- Plan 0011 drafted these fasteners in machine.json, all unverified: fuel tank 4 screws on the side flanges; recoil starter 4 bolts, one per ear; muffler 2 nuts on the exhaust studs and 2 bolts through the heat shield; carburettor 2 nuts on the flange studs; alternator cover 4 bolts; air filter cover 2 bolts (it also rocks off a clip). Counts, heads, sizes and positions all need the mechanic. The capacitor's mounting (a strap screw?) is unknown, so it has none.
- Air filter cover: the model shows two bolts on the lower door, but its motion is `unclip`. Bolted, clipped, or both?
- Alternator cover: the product photo shows no bolt heads on the round face, only ears with holes on the square rim. Are the cover's bolts through the rim (as the photo suggests) rather than the face (as drafted)? (Plan 0011 match images, 2026-10-11.)
- Fuel tank: the listing photo shows a side flange along each side with a hole near each end. Are the four screws there, and is one really off-centre as drafted (`fuel_tank.screw_3`)?
- Sounds: until the owner records the real machine, the cord pull, the failed start and the engine are stand-ins from CC0 recordings, not a TG950.

## Owner decisions pending

- Git LFS quota: ADR 0012 puts `.blend` files and textures in Git LFS. The storage and bandwidth allowance on the GitHub plan for `Open-Am/TheMechanic` is not checked.

## Raised during plan 0001

