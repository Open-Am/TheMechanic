---
id: 0005
title: Phase 3a, the asset pipeline and a blocked-out model
status: approved
date: 2026-10-10
adrs: [0002, 0003, 0010, 0012, 0013, 0014]
branch: plan/0005-asset-pipeline
---

# 0005. Phase 3a, the asset pipeline and a blocked-out model

## Goal

`npm run assets` takes `assets/gen950/blend/gen950.blend` to a validated, compressed `game/public/machines/gen950/model.glb`, and the game loads it in place of the placeholders. Every part and base piece is at least `blocked` in `assets/gen950/STATUS.md`: real size and silhouette from the references, in place, named right. The Blender look-development scene uses the same lighting as the game, with a real HDR environment and a baked ground shadow. This meets the brief's Phase 3 done line ("blocked-out geometry is enough to pass"). The realism work that ADR 0013 asks for is plan 0006, which builds on this.

Approved by the owner on 2026-10-10, who wrote "I approve." in answer to approving plans 0005 and 0006.

## ADRs relied on

- **0002** approves `@gltf-transform/cli` (dev). The Meshopt decoder ships inside the approved `three` package, so the optional `meshoptimizer` package is not needed.
- **0003** and the brief's model contract: one node per part named exactly the part ID, `base_` nodes for fixed geometry, metres, Y up, front +Z, each part's origin at its geometry centre, a missing node falls back to that part's placeholder with a warning.
- **0010**: GLB loading lives in `render`; the model is fetched with the machine folder and nothing is fetched after.
- **0012**: Blender 4.5 LTS found through `BLENDER`; scripts check the version first; glTF Transform pinned to an exact version; `.blend` files in Git LFS.
- **0013**: blocked parts are reported as blocked, never as finished; references guide shapes only.
- **0014**: budgets (5 MB GLB, 60,000 triangles, 1024 px textures and one 2048 atlas, 400 KB environment, 64 KB ground shadow), the asset check fails the build when over budget, and Blender lights the match renders as the game does.

## Exploration summary

Done in this session. `three` 0.186 includes `GLTFLoader`, `HDRLoader`, `UltraHDRLoader` and the Meshopt decoder. `@gltf-transform/cli` is at 4.5.1. Blender 4.5.10 LTS is installed (x64 under emulation) and has the Khronos PBR Neutral view transform, so Blender and the game can share tone mapping. `render/placeholders.ts` builds one group per part with a hit volume; the loader must produce the same shape so picking, animation and tray pictures keep working. `render/thumbnails.ts` assumes one mesh per part; real parts have several. References are in `docs/reference/visual-references.md` and `assets/gen950/reference/`.

## Simpler readings chosen

1. **Compression.** Meshopt for geometry (decoder already in `three`), WebP for textures (`EXT_texture_webp`, read by `GLTFLoader`). KTX2 would need a separate encoder binary that is not installed.
2. **Environment file.** RGBE `.hdr` downsampled to fit 400 KB (about 512 × 256), loaded with `HDRLoader`. Ultra HDR JPEG would be smaller but needs an encoder that is not installed. A small environment is enough for blurred reflections on a 37 cm machine.
3. **Environment source.** A CC0 HDRI from Poly Haven of a bright outdoor scene, chosen to resemble an open roadside workshop. Its name, URL and licence go in `game/public/env/LICENCE.md`. If the owner later photographs one, it replaces this.
4. **Missing model.** The machine folder lists no model yet, so the loader tries `model.glb` and treats a 404 as "use placeholders". Once this plan ships the file always exists, so players never see the 404.
5. **glTF Transform version.** The newest release at least two weeks old on the day it is installed, pinned with no `^`, recorded in ADR 0012's history.
6. **Match images** are composed in Blender's own Python (two images side by side), so no image library is added.

## Steps

1. **Blender helpers.** `tools/blender/common.py`: version check (4.5), reading `machine.json`, the triangle allocation from `docs/design/modelling-brief.md`, collection names. `tools/run-blender.mjs`: finds Blender through `BLENDER` or PATH and runs a script headless.
2. **Scaffold.** `tools/blender/scaffold.py`: builds `gen950.blend` with collections `parts`, `base`, `reference`, one empty per part and base piece at its placeholder position, metric units.
3. **Look-development scene.** In the same file: the HDR environment, the key light in the game's direction, the Khronos PBR Neutral view transform, a ground catcher for the shadow bake, and cameras for the default game view and each match view.
4. **Blocked model.** Real-size blocking for every part and base piece from the references (blue tank shell about 330 × 279 × 127 mm, recoil cover about 290 × 200 mm, muffler about 162 × 156 mm, cast alternator end, finned cylinder, and so on), with flat materials in the reference colours. Each reaches `blocked`; a match image per outside part shows the silhouette against a photo. `assets/gen950/STATUS.md` lists every part.
5. **Validate.** `tools/blender/validate.py`: names match `machine.json`, nothing else in `parts` and `base`, transforms applied, origins at geometry centres, triangle counts within each part's allocation and the total, every mesh has a material.
6. **Export and bake.** `tools/blender/export.py`: `parts` and `base` to `assets/gen950/export/model.glb`. Bake the ground shadow to `ground.png` (512 px at most).
7. **Optimise and check.** `tools/pipeline/optimise.mjs` runs glTF Transform (dedupe, prune, weld, Meshopt, WebP textures resized to the budget; flags checked with `--help` first). `tools/pipeline/check.mjs` confirms node names against `machine.json`, the GLB, environment and ground shadow against their budgets, and copies them into the game. `npm run assets` runs steps 5 to 7 in order and fails on the first error.
8. **Load it.** `game/src/render/model.ts`: load `model.glb` with the Meshopt decoder, build each part's group from its node (hit volume from its bounds), fall back per part to the placeholder with a warning. The real environment replaces `RoomEnvironment`, which stays as the fallback when the file is missing. The baked ground shadow replaces the drawn one. Tray pictures handle parts made of several meshes. Tests for the pure parts: node matching, fallback choice, bounds to hit volume.
9. **Verify and release note** `docs/releases/0.4.0.md`.

## Done when

- `npm run assets` turns the `.blend` into `game/public/machines/gen950/model.glb`, and fails when a name is wrong or a budget is broken (shown by a test run with a deliberately broken copy).
- The game loads the GLB with no other code change; deleting the GLB brings the placeholders back.
- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run size` pass; `npm run verify:phone` solves all six faults with the GLB, no console errors, and reports the frame rate at 4x throttle.
- `assets/gen950/STATUS.md` shows every part at `blocked` or better, with match images for the outside parts. Nothing is called finished.
- Screenshots: the game's default view next to the Blender look-development render of the same view.

## Release note line

Added: `npm run assets` turns the Blender file into a validated, compressed model that the game loads in place of the placeholders; every part blocked out at real size from the references, lit by a real environment with a baked ground shadow (plan 0005, ADRs 0013, 0014).
