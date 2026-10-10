---
id: 0006
title: Phase 3b, modelling the parts towards the real machine
status: proposed
date: 2026-10-10
adrs: [0003, 0012, 0013, 0014]
branch: plan/0006-modelling
---

# 0006. Phase 3b, modelling the parts towards the real machine

## Goal

Starting from plan 0005's blocked model, take each part as far towards the real ET950-pattern machine as the references allow, following `docs/design/modelling-brief.md`: secondary forms, a low-poly game mesh within its allocation, baked normals and occlusion, materials and Lagos wear, and a photo-match loop on every part. Each part ends at `modelled` or `textured`, with match images that show where it stands. Only the owner sets `approved`.

This plan can be approved now and started after plan 0005, or held until the owner's own photos arrive. The owner said on 2026-10-10: "When I get the images, we can try to improve on it." Parts can be redone when better references come.

## ADRs relied on

- **0013**: the target, the honest status, the reference rule, the match image required before `modelled`.
- **0014**: budgets, the lighting used for match renders.
- **0003**: names, origins and units stay as the model contract says.
- **0012**: Blender 4.5 LTS.

## Exploration summary

The references (`docs/reference/visual-references.md`) are strong for the outside: tank, recoil cover, muffler, alternator end, carburetor, fuel tap, spark plug, plug cap. They are weak for the air filter and its cover, the capacitor, and close-ups of wear. No Blender MCP server is connected, so modelling is by script and render, and each render is looked at before it is reported.

## Steps

The brief's order: outside first, then the parts the faults live in, then the rest.

1. `fuel_tank`, `alternator_cover`, `recoil_starter`, `muffler`, `air_filter_cover`.
2. `carburetor`, `spark_plug`, `fuel_tap`, `capacitor`, `air_filter`.
3. `fuel_hose`, `plug_cap`, then the base pieces (`base_frame` as the cast base, mounts and body shell; `base_engine` with its fins and shroud; `base_alternator`; `base_panel` with socket, breaker, switch and choke).
4. For every part: the nine-step workflow in the modelling brief, at most five match rounds, then report what still differs.
5. A whole-machine match against the clearest whole-machine photos, from their angles.
6. A performance check on the finished model at 4x throttle, and the GLB size against the budget.
7. Release note `docs/releases/0.5.0.md` listing each part's status.

## Done when

- Every part is `modelled` or better in `assets/gen950/STATUS.md`, each with at least one match image in `assets/gen950/match/`, and the list of what still differs for each.
- `npm run assets` passes with the finished model within every budget, and `npm run verify:phone` passes with it.
- A side-by-side of the game's default view and the clearest reference photo, for the owner to judge.

## Release note line

Changed: every part modelled from the references towards the real machine, with baked detail, materials and wear; per-part status and photo comparisons in `assets/gen950/` (plan 0006, ADR 0013).
