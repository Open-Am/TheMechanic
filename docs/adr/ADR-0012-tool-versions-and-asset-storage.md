---
id: 0012
title: Tool versions, finding Blender, and storing asset files
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0012. Tool versions, finding Blender, and storing asset files

## Context

ADR 0002 names the tools (Node through Vite, Blender, the glTF Transform CLI) but no versions. The brief says to check Blender operator names and export options against the installed version, which only works if the version is fixed. On 2026-10-10 Blender 4.5.10 LTS was installed on the build machine at `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`. It is the x64 build running under emulation, because the build machine is Windows on ARM64 and the 4.5 LTS package offers only x64. It is not on PATH. The machine runs Node 24.19.0, while `@types/node` is at 26.

Phase 3 will also add `.blend` files and textures to the repository. `.gitattributes` marks them binary but does not use Git LFS, so every save would add a full copy to the history. This ADR extends ADR 0002 and does not change any of its decisions.

## Decision

**Node.**

- Node 24, the current LTS line. Any 24.x patch. `package.json` files declare `"engines": { "node": ">=24 <25" }`, and the repository root has a `.node-version` file holding `24`.
- `@types/node` follows the Node major: `^24`.
- `tools/` scripts that are not Blender scripts are TypeScript or plain JavaScript run directly by Node, as `tools/play/play.ts` already is. No build step and no `ts-node` or `tsx`.
- `game/package-lock.json` is committed. Installs for builds and checks use `npm ci`.

**Blender.**

- Blender 4.5 LTS. Any 4.5.x patch. 5.x is not used until a new ADR moves to it.
- Every script in `tools/blender/` checks `bpy.app.version[:2] == (4, 5)` first and exits with an error naming the found version if not.
- Scripts find Blender through the `BLENDER` environment variable holding the full path to the executable. If it is unset, they try `blender` on PATH. If neither works, they stop and say so, as the brief requires.
- Blender's bundled Python is the only Python the project uses. No system Python is required.
- The x64 build under emulation is acceptable on an ARM64 machine. Asset scripts run rarely, so speed does not matter.

**glTF Transform.**

- `@gltf-transform/cli` (approved in ADR 0002) is pinned to an exact version in `game/package.json`, with no `^`, when Phase 3 adds it. The version chosen is recorded in this ADR's history at that time.
- Flags are checked with `--help` against that version before scripts rely on them, as the brief says.

**Storing asset files.**

- Git LFS tracks `*.blend` and texture sources (`*.png`, `*.jpg`, `*.exr`, `*.tif`) under `assets/`.
- The shipped `game/public/machines/<id>/model.glb` stays in plain git. It is small (ADR 0006 caps it at 5 MB), and a static host that builds from a clone may not fetch LFS files.
- The raw export `assets/*/export/*.glb` stays ignored, as now. Blender's backup files `*.blend1` and `*.blend2` are added to `.gitignore`.
- Reference photos stay ignored (`assets/*/reference/`), as now.

## Consequences

Any agent or person can reproduce the tool setup and knows which Blender API to read. Blender scripts fail fast on the wrong version instead of misbehaving. The LFS rule keeps the history small, but anyone cloning the repository to work on assets needs Git LFS installed, and GitHub's LFS storage and bandwidth quota on the owner's plan applies (see `docs/open-questions.md`). Moving to Blender 5.x or Node 26 later is a new ADR.

Work this creates, for a plan: add `engines` and `.node-version`, change `@types/node` to `^24`, add the `.gitattributes` LFS lines and the `.gitignore` lines, and update the AGENTS.md commands section to mention `BLENDER`. The Blender and glTF Transform parts land with Phase 3.

## History

- 2026-10-10: proposed by Claude, after the owner asked for Blender to be installed and for this ADR to be written.
- 2026-10-10: accepted by the owner, who wrote "I accept adr 12".
- 2026-10-10: plan 0005 installed `@gltf-transform/cli` 4.5.0, pinned exactly: the newest release at least two weeks old that day (4.5.1 was newer). The Meshopt decoder comes from the `three` package, so `meshoptimizer` was not added.
