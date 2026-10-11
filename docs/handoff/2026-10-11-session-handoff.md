# Session handoff, 2026-10-11

For the next agent session (or after a context compaction). Read `AGENTS.md` and `CLAUDE.md` first; this file says where things stand, what the owner decided, and what has bitten us. The repository is the source of truth; this is a map, not a replacement.

## Where things stand

- `main` at `f4637f7` ("Merge plan/0008-mechanics-hand"), pushed to `origin` (github.com/Open-Am/TheMechanic). Working tree clean.
- Phases 1, 2 and 3 of the brief are done. Phase 3 was split into plans 0005 (pipeline, block-out) and 0006 (modelling); ADR 0015 work (customers, hand) has started.
- 226 tests pass. JavaScript 177.1 KB gzipped of 350 KB. Model 1.01 MB of 5 MB, 22,306 triangles of 60,000. Hand 157.7 KB of 400 KB, 3,992 triangles of 4,000.
- The owner was last asked to choose the next step (see "Waiting on the owner").

## Decisions (all ADRs accepted unless noted)

| ADR | What it decides |
| --- | --- |
| 0001 | Scope: one machine (`gen950`), six faults, free play and daily, local best scores, share text. |
| 0002 | Stack: Vite, strict TypeScript, Three.js, Vitest, Blender, glTF Transform. Approved deps only. Limit 1 narrowed by 0014. |
| 0003 | `machine.json` / `faults.json` data contracts. |
| 0004 | Round rules, scoring, action log; score is a pure function of the log. |
| 0005 | Daily fault (Phase 4). |
| 0006 | Budgets: superseded by 0014 (same numbers). |
| 0007 | Player mode gives no hint on blocked actions; diagnostic mode is dev-only (`?diag`). |
| 0008 | Part motion vocabulary. |
| 0009 | Decision and documentation process. |
| 0010 | Layers: core, app, render, ui, platform, diagnostic; boundary test enforces. |
| 0011 | Inspect parts in place (rule in core; the chosen gestures give it no UI). |
| 0012 | Node 24, Blender 4.5 LTS (found via `BLENDER` then PATH), glTF Transform pinned (4.5.0), Git LFS for `.blend` and texture sources under `assets/`. |
| 0013 | Visual target: as close to the real ET950/Tiger TG950 as budgets allow; AI-assisted modelling allowed; third-party photos are reference only (never textures, never committed); photo-match image before a part counts as `modelled`; only the owner sets `approved`. |
| 0014 | Budgets plus image-based lighting: HDR environment (≤400 KB), one key light, PBR Neutral tone mapping, baked ground shadow (≤64 KB), fallback to two-light rig. |
| 0015 | Customers with patience (walk out when it runs out; wrong parts cost no patience), a 3D customer, a 3D hand. Budgets: customer 1.5 MB / 15k tris; hand 400 KB / 4k tris. Outside modelling tools need the owner's written approval. |

## Plans and releases

| Plan | Status | Release |
| --- | --- | --- |
| 0001 Phase 1 core logic | done | 0.1.0 |
| 0002 Inspect in place | done | 0.1.0 |
| 0003 Phase 2 playable | done | 0.2.0 |
| 0004 Lighting, tool settings | done | 0.3.0 |
| 0005 Asset pipeline, block-out | done | 0.4.0 |
| 0007 Customers and patience | done | 0.5.0 (finished before 0006) |
| 0006 Modelling and textures | done | 0.6.0 |
| 0008 The mechanic's hand | done | 0.7.0 |

## The owner's choices to remember

- Product title is **Open Am** (confirmed 2026-10-10).
- Gestures: pull a part along its removal path to take it off; tap a tray chip for its card (name, does, condition, Fix); drag a chip onto the machine to put it back. No inspect action on the machine. Tray chips show a picture of the part.
- Realism matters a lot to the owner ("high fidelity, not just blocks"). Push realism, but report honestly what still differs.
- Customers: patience meter, walk-out ends the round unsolved; three customers (Mama Ngozi 150 s, Alhaji Musa 110 s, Tunde 80 s), Pidgin lines are drafts (`verified: false`).
- The owner approves with short messages ("I approve plan 0008", "Approved", "I accept ADR 14"). Record the quote in the plan or the ADR history. Merge locally and push are fine now; the owner asked for local merges earlier and GitHub push now works.

## Waiting on the owner

1. Next step: (a) the 3D customer, which first needs approval of how to make a believable person (MakeHuman add-on, CC0, or an AI tool under ADR 0013); (b) Phase 4 (daily, best scores, share, loading, performance); (c) more realism passes after the owner looks on the phone.
2. Rewrite customer lines in real Pidgin (or with the mechanic).
3. Photos of a real machine and of a Lagos mechanic's hands; links the research could not download are listed in the chat history and in `docs/reference/visual-references.md`.
4. A mechanic's check of `docs/open-questions.md` (removal order, fuel tap position, capacitor, common faults).

## Environment (Windows 11 ARM64 build machine)

- The agent runs as Windows user `agent-home\write`; the repo folder belongs to `shieldbuild`. `safe.directory` is set globally for `write`, so plain `git` works. GitHub sign-in for `write` works (Git Credential Manager); `git push origin main` works, including LFS.
- Node 24.19, npm 11. Blender 4.5.10 LTS (x64 under emulation) at `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`. `BLENDER` is set for `write`, but a long-running agent session may not see it: prefix commands with `export BLENDER="C:/Program Files/Blender Foundation/Blender 4.5/blender.exe"`.
- No system Python; Blender's bundled Python only. Cycles works on CPU headless; EEVEE renders headless.
- Edge (Chromium) at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` drives `npm run verify:phone` over DevTools (no Playwright).
- Bash tool resets its working directory each call: use absolute paths. Long Blender jobs (texture bakes take minutes) are best run in the background.
- Phone preview for the owner: artifact https://claude.ai/artifact/7zntsAiDYnDsYmeEkRcQ3A (private to the owner). The artifact host will not serve `.glb` or `.hdr`, so the preview packs `model.glb`, `workshop.hdr` and `hand.glb` as base64 into `assets/binary-files.js` with a small fetch shim in the page. The packing script and page live in the session scratchpad (`scratchpad/pack-preview.mjs`, `scratchpad/phone/open-am.html`); rebuild with `npm run build`, copy `game/dist/*`, pack, update the page's script and CSS names, republish the same file path.

## Commands

| Command | Does |
| --- | --- |
| `npm test` / `npm run typecheck` / `npm run docs:check` (`-- --fix` regenerates the ADR index) | Run before every commit. |
| `npm run play` | Text player: every fault plus a walked round. |
| `npm run build` then `npm run size` | Production build and the 350 KB check. |
| `npm run verify:phone [-- --out <dir>] [-- --lighting fallback]` | Plays all six faults in headless Edge at 390×844 with real gestures; blocked-pull check; hand mid-pull screenshot; forced walk-out (`?patience=5`); console errors; frame rate. |
| `npm run assets` | Validate, export, bake ground, optimise, check and copy the machine; then export, optimise, check and copy the hand. |
| `node tools/run-blender.mjs tools/blender/<script>.py --blend <file> -- <args>` | Run any Blender script headless. |

Blender scripts (`tools/blender/`): `scaffold.py` (new gen950.blend, refuses to overwrite without `-- --force`), `block.py` (block-out), `model.py` (detailed parts; `-- <id>` for one), `texture.py` (bake atlases; run after model.py, refuses already-baked objects), `lookdev.py` (apply game lighting), `render.py`, `match.py` (`only=<id>`, `key=<shapekey>:<value>`), `bake_ground.py`, `validate.py`, `export.py`, `make_env.py`, `hand.py -- build|export`. Helpers in `common.py` and `shapes.py`. Budgets in `tools/pipeline/budgets.json` (read by Python and Node).

Typical model change: edit `model.py` → `model.py` → `texture.py` (background, several minutes) → `npm run assets` → sync placeholders in `machine.json` from the BOUNDS line `model.py` prints (positions and sizes only) → match renders → `npm run verify:phone`.

## Lessons learned (avoid repeating)

- Cycles' DIFFUSE colour bake is weighted by (1 − metallic): metals baked black. Bake base colour through emission (done in `texture.py`).
- KHR_mesh_quantization puts a decoding scale on each node: never set a model node's scale; wrap and scale the wrapper (done in `placeholders.ts`).
- The machine's light laterite dust washes out dark skin; skin gets grease, not dust.
- A hand reaching from a screen corner went through the machine; it now comes from the part's explode side.
- Match images and reference photos contain third-party photos: git-ignored (`assets/*/match/`, `assets/*/reference/`). Baked loose textures are ignored too (packed in the .blend).
- Shell `sed`/`node -e` edits lose Windows backslashes and break on apostrophes; use the edit tool or a script file in the scratchpad.
- The diagnostic panel grows and can cover drop points in the browser check; drops go right of centre.
- `optimize` in glTF Transform defaults would flatten/join/simplify: `optimise.mjs` turns those off to keep one node per part.
- Third-party downloads go in their own folder; Wikimedia sometimes returns HTML error pages instead of images.
- For parallel work, a git worktree (`git worktree add ../TheMechanic-NNNN -b plan/NNNN main`, then `npm ci` in `game/`) avoids disturbing a long bake.

## Known gaps

- Generator wear is lighter than the Lagos photos; air filter and capacitor references are weak; fuel tap position and hose route unconfirmed; back faces render dark (single key light).
- Hand is smoother than a real hand; one grip shape for all parts.
- Frame rate measured only in headless Edge with software rendering.
- `npm audit`: high-severity `braces` inside the glTF Transform CLI (build tool only).
