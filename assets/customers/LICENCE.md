# The customers: sources and licences

Required by ADR 0020 (restating ADR 0016) for every model made with MakeHuman, and by ADR 0015 for every animation. Applies to `game/public/customers/<look>.glb` and `assets/customers/blend/<look>.blend` for the three looks in `game/public/customers.json` (`woman_market`, `man_kaftan`, `man_young`), made by `tools/blender/customer.py` (plan 0015). Checked 2026-10-11 against the files installed for the user that runs Blender: MPFB 2.0.18 and the MakeHuman system assets pack, CC0 variant, as recorded in ADR 0016's history. No version has changed since, so ADR 0020 needs no history line.

| What a customer uses | Source | Licence |
| --- | --- | --- |
| Body shape: the MakeHuman base mesh (`data/3dobjs/base.obj`), its body and its two eye helper spheres (used as the eyeballs), reshaped and decimated | MPFB 2.0.18, https://extensions.blender.org/add-ons/mpfb/ | CC0. The file's own header: "This asset was explicitly released as CC0 in september 2020." Copyright Data Collection AB, Joel Palmius, Jonas Hauquier. MakeHuman's licence page, https://static.makehumancommunity.org/about/license.html: "All core assets are shared under Creative Commons, CC0." |
| Body proportions: MakeHuman's macro targets (gender, age, muscle, weight, height, proportions, cup size, firmness, African ethnicity) | MPFB 2.0.18 data (`data/targets/macrodetails`) | CC0 (core assets) |
| Skeleton: the "game_engine" rig, 53 joints, shipped in each file | MPFB 2.0.18 `data/rigs/standard/rig.game_engine.json` | CC0 (core assets). The bone placement file carries no licence line of its own; it is a MakeHuman core asset under the licence page above. Flagged for the owner, see the note below. |
| Skin weights binding the mesh to the skeleton | MPFB 2.0.18 `data/rigs/standard/weights.game_engine.json` | CC0: the file states `"license": "CC0"` |
| Clothes: blouse, wrapper, kaftan, trousers, jeans, T-shirt, head tie and its knot, cap, slippers, sandals and slides | Shaped on the body by `tools/blender/customer.py` | The project's own work |
| Every texture: skin, brows, hair, beard, lips, nails, eyes, the wax prints (our own design), plain cloth, denim, the cap's stitching, footwear | Procedural materials in `tools/blender/customer.py`, baked by `tools/blender/texture.py` | The project's own work |
| Every animation clip: `<look>.idle`, `.arrive`, `.waiting`, `.annoyed`, `.annoyed_idle`, `.failed_pull`, `.pleased`, `.leaving` | Keyframed by `tools/blender/customer.py` | The project's own work. No motion capture and no downloaded animation. |

Not used: MakeHuman's skin, eye, eyebrow, eyelash and hair images, its clothes, hair, eyebrow, eyelash, teeth and tongue meshes, its proxy meshes, its poses and expressions, and every community asset. The base mesh's other helper geometry (tights, skirt, hair, teeth, tongue, eyelash and joint helpers) is deleted.

MPFB's code is GPL-3.0-or-later. It is a build tool that runs inside Blender and is never shipped, so its licence does not reach the game.

Note on the skeleton. The hand (plan 0009) used MakeHuman's rig only to pose the hand and did not ship it. The customers ship the game_engine skeleton. Its weights file says CC0 in the file; its bone placement file says nothing, and is covered only by MakeHuman's statement that all core assets are CC0. That reading is the same one `assets/hand/LICENCE.md` relies on for the default rig. If the owner wants certainty, the skeleton can instead be built by our script from the body's joint positions, with only the CC0 weights file reused.

Reference photos of people (git-ignored, in `assets/customers/reference/`, catalogued in `docs/reference/visual-references.md`) are used only for clothing, colour and build, never for a face, and never as textures (ADR 0013, ADR 0015).

No credit is legally required for CC0 material. If the game gets a credits screen, "Customers made with MakeHuman (makehumancommunity.org)" is a courtesy worth adding.
