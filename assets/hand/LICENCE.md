# The mechanic's hand: sources and licences

Required by ADR 0016 for every model made with MakeHuman. Applies to `game/public/hand/hand.glb` and `assets/hand/blend/hand.blend`, made by `tools/blender/hand.py` (plan 0009).

| What the hand uses | Source | Licence |
| --- | --- | --- |
| Body shape: the MakeHuman base mesh (`data/3dobjs/base.obj`), cut to the right hand and forearm, with its topology | MPFB 2.0.18 (MakeHuman Plugin for Blender), https://extensions.blender.org/add-ons/mpfb/ | CC0. The file's own header: "This asset was explicitly released as CC0 in september 2020." Copyright Data Collection AB. MakeHuman's licence page, https://static.makehumancommunity.org/about/license.html: "All core assets are shared under Creative Commons, CC0." |
| Body proportions: MakeHuman's macro targets (gender, age, muscle, weight, ethnicity) and the hand and forearm targets `r-hand-fingers-diameter-incr`, `r-lowerarm-muscle-incr` | MPFB 2.0.18 data and the MakeHuman system assets pack, CC0 variant, https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip | CC0 (core assets; the pack's metadata marks every item CC0) |
| Poses: the hand posed open, gripping and pinching with MakeHuman's "default" skeleton; the skeleton itself is not shipped | MPFB 2.0.18 rig `rig.default.json` and its weights | CC0 (core assets) |
| Skin, nails and sleeve texture | Baked by `tools/blender/texture.py` from the project's own procedural materials | The project's own work |
| Sleeve shape | Made by `tools/blender/hand.py` | The project's own work |

Not used: MakeHuman's skin, eye and clothing images, and any community asset (ADR 0016 keeps textures our own).

MPFB's code is GPL-3.0-or-later. It is a build tool that runs inside Blender and is never shipped, so its licence does not reach the game.

No credit is legally required for CC0 material. If the game gets a credits screen, "Hand made with MakeHuman (makehumancommunity.org)" is a courtesy worth adding.
