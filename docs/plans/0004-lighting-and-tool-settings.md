---
id: 0004
title: Realistic lighting, first stage, and tool settings
status: approved
date: 2026-10-10
adrs: [0010, 0012, 0014]
branch: plan/0004-lighting-and-tool-settings
---

# 0004. Realistic lighting, first stage, and tool settings

## Goal

The game is lit as ADR 0014 describes, as far as is possible before Phase 3: image-based lighting from a studio environment generated in code, one key light, PBR Neutral tone mapping, a soft ground shadow, and the old two-light rig as a fallback. Tray pictures use the same light. The placeholder colours follow the references (blue tank, black body, silver alternator end). The repository carries the ADR 0012 tool settings: Node 24, `@types/node` 24, Git LFS rules for Blender files and texture sources, and the `BLENDER` variable documented.

Approved by the owner on 2026-10-10, who wrote "go ahead with the lighting plan. And continue with what's available now."

## ADRs relied on

- **0014** defines the rig, the fallback, the tone mapping, the plain background and the ground shadow. The real HDR environment, the ground shadow baked in Blender, and the asset-pipeline budget checks belong to Phase 3, because the model and the pipeline do not exist yet. This plan uses a ground shadow generated in code as a stand-in.
- **0012** defines the Node, `@types/node` and Git LFS settings and the `BLENDER` variable.
- **0010** keeps lighting in `render`. Diagnostic mode must show which rig is active but may not import `render`, so `render` writes the rig's name to a `data-lighting` attribute on the page and the overlay reads it.

## Exploration summary

Done in this session from the code written in plans 0003 and the ADRs above. `RoomEnvironment` and `NeutralToneMapping` exist in the installed `three` 0.186. `render/view.ts` and `render/thumbnails.ts` each build their own hemisphere and directional lights; both move to one lighting module. Git LFS 3.7.1 is installed, but its filter is not configured for this repository. The reference research (`docs/reference/visual-references.md`) shows the machine is blue and black.

## Steps

1. **Tool settings (ADR 0012).** `engines` in both `package.json` files, `.node-version`, `@types/node` to `^24`, LFS lines in `.gitattributes` for `assets/**/*.blend` and texture sources under `assets/`, `*.blend1` and `*.blend2` in `.gitignore`, `git lfs install --local`, and `BLENDER` in AGENTS.md.
2. **Lighting module.** `game/src/render/lighting.ts`: the rig choice as a pure function (WebGL 2 and half-float render targets present, or fall back), the environment from `RoomEnvironment` through `PMREMGenerator`, the key light, tone mapping and exposure in one place, and the fallback rig. Tests in `game/tests/render.test.ts` for the choice and the constants.
3. **Use it.** `view.ts` and `thumbnails.ts` take their light from the lighting module. The page gets `data-lighting="ibl"` or `"fallback"`, and the diagnostic overlay shows it.
4. **Ground shadow stand-in.** A dark plane under the machine with a soft shadow drawn in code from the machine's footprint, fading at its edges. Replaced by the Blender bake in Phase 3.
5. **Placeholder colours.** `machine.json` placeholder colours follow the references. Only `color` values change; no field or ID.
6. **Verify and release note.** `docs/releases/0.3.0.md`.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check` pass; `npm run build` and `npm run size` stay within budget.
- `npm run verify:phone` solves all six faults with no console errors, and reports a frame rate at 4x CPU throttle.
- Screenshots before and after show the new lighting; the diagnostic overlay shows `ibl`.
- Forcing the fallback (a development-only `?lighting=fallback` query) still renders and plays.

## Release note line

Changed: the game is lit by a studio environment with one key light and product-accurate tone mapping, with a soft ground shadow and a fallback for weak phones (plan 0004, ADR 0014).
