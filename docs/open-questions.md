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
- Sounds: until the owner records the real machine, every sound is a CC0 stand-in, not a TG950. Since 2026-10-12 the ten files ship, the shortlist's first choices (`assets/audio/STATUS.md`, `game/public/audio/LICENCE.md`): the cord and failed start are a lawnmower or snowmobile recoil (kyles), the engine a chainsaw (esperri). The cord, the failed start and the engine are to be replaced first.
- The engine start (`start.ogg`): since 2026-10-12 it is esperri 118971, 2.52 s, picked from the waveform as the engine already firing through three revs and then slowing. The first choice, damsur 443239, gave only 0.98 s (two short tries split by digital silence). Nobody has listened to either; the owner's listen decides whether it reads as a start.
- The failed start (`fail.ogg`) was picked from the waveform, not by ear: 17.59–18.49 s of kyles 450951, the stretch after the last pull whose sound is lower and more broken up than the pulls (spectral centroid about 0.6–1.1 kHz against about 2 kHz). It may be the engine coughing or something else; the owner's listen decides.
- Safari before about iOS 17 cannot decode Ogg Opus, so those players hear nothing (ADR 0018 allows it). Which iOS versions the players have is unknown.
- The fuel tap turns one turn in `machine.json`, and loosening does 75 percent of the turns, so it makes no click while loosening, only one going back in. Is one turn right for the real tap? (Plan 0013.)
- With no sound files, a static host that answers 404 will likely make the browser print its own "Failed to load resource" line for each of the ten requests. The game itself stays silent and logs nothing. Not seen on 2026-10-12: the dev server and `vite preview` answer a missing file with the page, and a production build in `vite preview` showed no console error. Not tested on a real host. Since 2026-10-12 the ten files ship, so this no longer arises.

## Owner decisions pending

- Choosing between sounds: the owner wants players to be able to choose between alternative sounds later. On 2026-10-12 the owner wrote: "Yes go with the recommendations but also keep the rest. Later we will provide options for customization for the users later". This changes scope (what is built), so it needs an ADR first (ADR 0001). The alternatives the owner downloaded are kept locally in `assets/audio/source/`, which is git-ignored, so they exist on this machine only. Their pages are listed in `docs/reference/sound-shortlist.md`.
- Git LFS quota: ADR 0012 puts `.blend` files and textures in Git LFS. The storage and bandwidth allowance on the GitHub plan for `Open-Am/TheMechanic` is not checked.

## Raised during plan 0001

