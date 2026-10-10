---
id: 0013
title: Visual target and how the models are made
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0013. Visual target and how the models are made

## Context

On 2026-10-10 the owner saw the Phase 2 placeholder boxes and asked for the real model to be as close as possible to the actual generator: "high fidelity, not just blocks and square shapes". The owner kept the budgets in ADR 0006 as they are, and asked that manufacturer pictures and online videos guide the modelling, and that AI modelling be pushed as far as it can go in Phase 3.

The brief (section 9) says realism comes from reference photos, hand modelling and texture work by a person, and that scripted geometry cannot be photoreal. That stays true of plain scripts. It does not account for an AI working in Blender to a detailed brief, or for AI generation tools. The target machine is the Yamaha ET950 design and its clones, such as the Tiger TG950 (`docs/reference/generator-reference-pack.md`).

## Decision

**Target.** The model aims to look like a real, used ET950-pattern generator, as close as the budgets allow. The test: at phone-screen size, from the default camera, a render next to a photo of the real machine from the same angle should read as the same machine, made of the same materials. The owner makes that judgement and is the only one who sets a part to `approved` in `assets/gen950/STATUS.md`.

**Budgets unchanged.** ADR 0006 holds: 5 MB GLB (aim 3), 60,000 triangles, 1024 px textures with one 2048 px atlas at most, one hemisphere and one directional light, no real-time shadows. Realism comes from shape, baked normal and occlusion maps, and good materials, not from heavier assets.

**Who models.** AI-assisted modelling is allowed. Claude models in Blender 4.5 (ADR 0012), by script or through a Blender MCP server if one is connected, following `docs/design/modelling-brief.md`. An external AI generation service (image-to-3D, text-to-texture) may be used only after the owner approves that specific tool in writing, having seen its cost, account terms and the licence of its output. A person can do any part instead at any time.

**References.** Manufacturer pages, manuals, parts diagrams, seller listings and online videos are reference only. They are catalogued with links in `docs/reference/visual-references.md`. Local copies go in `assets/gen950/reference/`, which git ignores. Third-party photos are never used as textures, and never fed to a tool whose output ships, unless the owner decides otherwise for a named source after checking its licence. Photos the owner or the mechanic take of a real machine can be used freely, including for textures and photogrammetry.

**Honest status.** Every part is tracked in `assets/gen950/STATUS.md` as `placeholder`, `blocked`, `modelled`, `textured` or `approved`, as the brief says. A part is not `modelled` until a render of it has been compared with at least one reference photo from the same angle, and the comparison image is saved next to it. The release note says plainly which parts reached which status.

## Consequences

The bar is now realism, not "good enough to play". Phase 3 takes longer: the modelling brief asks for a reference-match loop on every part, not one pass. Results from AI modelling are uncertain, so some parts may need a person, the owner's own photos, or an approved AI tool to get close.

Keeping ADR 0006's lighting rule limits how real metal and paint can look. A small environment map would add realistic reflections for about 100 to 300 KB, and is the biggest single gain still available. Adding one needs a new ADR that supersedes ADR 0006's lighting line, so it is only listed here, not decided.

The licensing rule means seller photos guide the shapes and colours, but the textures are made by us: procedural materials baked in Blender, generated from our own prompts by an approved tool, or taken from our own photos.

## History

- 2026-10-10: proposed by Claude, from the owner's instruction to make the model "as close as possible to the actual generator", keeping the ADR 0006 budgets.
- 2026-10-10: accepted by the owner, who wrote "I accept ADR 13".
