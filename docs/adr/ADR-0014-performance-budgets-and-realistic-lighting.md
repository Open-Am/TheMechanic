---
id: 0014
title: Performance budgets and realistic lighting
status: accepted
date: 2026-10-10
supersedes: [0006]
superseded_by: null
---

# 0014. Performance budgets and realistic lighting

## Context

ADR 0006 set the budgets and limited lighting to one hemisphere light and one directional light, with no real-time shadows. ADR 0013 then set the visual target: the model should read as the real ET950-pattern generator next to a photo of it. On 2026-10-10 the owner asked for the lighting to be brought up to match, "because we want that realism to make sense".

Two lights can shade a shape, but they cannot make metal look like metal or paint look like paint. Real materials are recognised mostly by what they reflect: the bright sky in a painted tank, the soft grey sheen on cast aluminium, the dull rubber that reflects almost nothing. Without reflections every material reads as coloured plastic, however good the model is. Image-based lighting (an environment map) is the standard fix, and on a phone it costs one download and a few texture lookups per pixel, not extra draw calls. Real-time shadow maps are a different matter: they need a second render pass every frame, which low-end phones cannot afford. Grounding the machine with a baked shadow gets most of the benefit for none of the cost.

This ADR supersedes ADR 0006. The budgets are restated unchanged; only lighting, colour handling and grounding change. It also narrows limit 1 of ADR 0002 ("simple lighting, no shadows, no global illumination"): baked image-based lighting and baked shadows are allowed, and real-time shadows and real-time global illumination are still out.

## Decision

**Budgets.** Unchanged from ADR 0006, plus two new rows.

| Item | Budget |
| --- | --- |
| JavaScript, gzipped | 350 KB |
| `model.glb` per machine | 5 MB, aiming for 3 MB |
| Triangles per machine | 60,000 |
| Textures | 1024 px, one 2048 px atlas at most |
| Environment map | 400 KB, one per game, shared by every machine |
| Ground shadow texture | 64 KB per machine |
| Frame rate | 30 fps with 4× CPU throttling in Chrome DevTools |
| Device pixel ratio | Capped at 2 |

The asset check step fails the build if the GLB, the environment map or the ground shadow is over budget.

**Lighting rig.**

1. **Image-based lighting.** The scene's environment is a prefiltered environment map (Three.js `PMREMGenerator`), so every standard material picks up reflections and soft ambient light from it. It is built once at startup.
   - *Until a real map exists:* Three.js `RoomEnvironment`, a neutral studio generated in code at startup. It ships inside the approved `three` package and costs no download.
   - *From Phase 3 look-development:* a real HDR environment of a bright outdoor roadside or open-sided workshop, matching where the game is set. Equirectangular, 1024 × 512, stored as an Ultra HDR JPEG (loaded with `UltraHDRLoader` from the `three` package) or RGBE `.hdr`, whichever is smaller at acceptable quality, within 400 KB. It is served from `game/public/env/` and fetched with the machine folder at load. The source is CC0 (for example Poly Haven) or photographed by the owner, and its licence is recorded next to the file.
2. **One key light.** One directional light stays, aimed to match the sun or brightest area in the environment map, so that shading and reflections agree. It gives the shape a clear light side and dark side, which the environment alone makes too flat.
3. **No hemisphere light** while the environment map is active. It returns only in the fallback below.

**Shadows and grounding.**

- No real-time shadow maps.
- Ambient occlusion is baked into each part's occlusion-roughness-metallic texture (brief section 9), so crevices and contact areas darken correctly.
- A ground plane under the machine carries a soft contact shadow baked in Blender from the assembled machine, 512 px at most, within 64 KB. It is not updated when parts come off. That is an accepted simplification: the base and frame, which make most of the shadow, never move.
- The ground plane is subtle: a dark surface that fades out at its edges, so the machine stands on something without the scene becoming a set.

**Colour handling.**

- Output colour space sRGB. Base colour textures in sRGB, all other maps linear.
- Tone mapping: Khronos PBR Neutral (`NeutralToneMapping` in Three.js). It was designed so that product colours on screen match the real product, which is exactly the ADR 0013 test. Exposure is tuned once during look-development and kept in the render layer's lighting file.
- Materials stay `MeshStandardMaterial`. `MeshPhysicalMaterial` (clearcoat, sheen) is not used; its extra cost is not worth it on low-end phones.

**Background.** A plain dark colour, not the environment image. The environment lights and reflects; it is not shown. This keeps attention on the machine and avoids shipping a sharp, high-resolution backdrop.

**Fallback.** If the environment map cannot be built (no WebGL 2, a failed load, or a GPU that cannot render the needed half-float targets), the game uses the ADR 0006 rig instead: one hemisphere and one directional light. The game still runs and looks plainer. Diagnostic mode shows which rig is active.

**Same light in Blender.** The match renders in `docs/design/modelling-brief.md` use the same environment file, the same key light direction and the same tone mapping, so what passes in Blender also passes in the game.

## Consequences

Metal, paint, plastic and rubber can look like themselves, which the ADR 0013 target needs. Tuning is easier: matching a photo becomes a question of material values, not of fighting a lighting rig that cannot produce the effect.

The first load grows by up to 400 KB for the environment map and 64 KB for the ground shadow, about 9 percent of the GLB budget, paid once and cached. Startup does one extra step, building the prefiltered map, which takes tens of milliseconds on a fast phone and more on a slow one; it happens behind the briefing screen. Per-frame cost rises slightly with the environment lookups in each material. The 30 fps budget must still hold, and the Phase 3 performance check confirms it on a throttled CPU.

Work this creates, for a plan: the lighting setup in `render` with the `RoomEnvironment` stage first, the fallback and its selection test, tone mapping and exposure, the ground plane, the budget checks in the asset pipeline, and the environment and key light in the Blender look-development scene. The real HDR environment is chosen during Phase 3.

On acceptance: ADR 0006 becomes `superseded` with `superseded_by: 0014`, and ADR 0002 gains a history line noting that ADR 0014 narrows its limit 1.

## History

- 2026-10-10: proposed by Claude, from the owner's instruction to "create a detailed ADR bringing that in, because we want that realism to make sense".
- 2026-10-10: accepted by the owner, who wrote "I accept ADR 14". ADR 0006 is superseded and ADR 0002 limit 1 is narrowed.
