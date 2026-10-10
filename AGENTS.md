# AGENTS.md

Instructions for any AI agent working in this repository, whatever vendor or tool it comes from. This is the only instruction file. `CLAUDE.md` points here. Do not put agent instructions anywhere else.

## The project in one paragraph

"Open Am" (working title) is a browser game. The player is a roadside generator mechanic in Lagos who takes a small two-stroke generator apart, part by part, finds the one bad part, fixes it, reassembles the machine and pulls the cord. It runs on low-end Android phones over expensive data: portrait, touch first, no install, no login. The full product brief is `open-am-build-brief.md`. Real-machine facts are in `docs/reference/`.

## Where things are

| Path | Holds |
| --- | --- |
| `open-am-build-brief.md` | The product brief: scope, data contracts, rules, phases. Read it once. Where it conflicts with an accepted ADR, the ADR wins. |
| `docs/adr/` | Architecture Decision Records. `README.md` there is the index. |
| `docs/plans/` | One plan per piece of work, each naming its ADRs. |
| `docs/releases/` | One release note per release. |
| `docs/design/` | Game and interface design notes. |
| `docs/open-questions.md` | Anything unverified or unclear. Add to it; never resolve by guessing. |
| `docs/reference/` | Source material about the real machine. Never shipped. |
| `game/` | The Vite + TypeScript + Three.js game. `game/src/core` is pure logic. |
| `assets/` | Blender sources, exports, reference photos. Never shipped except the final GLB. |
| `tools/` | Scripts: Blender, asset pipeline, docs checks. |

## The rule that governs everything: decisions live in ADRs

No work that touches a decision is done without an ADR, and no ADR takes effect until the project owner accepts it. This is how several agents from several vendors avoid drifting apart.

**When an ADR is required.** The work touches any of: scope (what is or is not built), a data contract (`machine.json`, `faults.json`, the action log, the GLB model contract), a game rule or the scoring, the stack or a dependency, the build or deploy process, the documentation process itself, or anything an existing ADR already decides.

**When an ADR is not required.** A bug fix, a wording change, a refactor that changes no behaviour, a test, a performance tweak within the budgets. These still get a line in the release note and must not contradict any accepted ADR.

**Status is the approval gate.** Every ADR has a `status` field: `proposed`, `accepted`, `superseded` or `rejected`. An agent may create ADRs only as `proposed`. Only the project owner changes status. Never set `accepted` yourself, even if the owner agreed in conversation. Ask the owner to change the file, or to say "accept ADR NNNN" in writing; then change the status and add a history line quoting that.

**Changing an existing decision.** Write a new ADR with the old one's number in `supersedes`. Say plainly what changes and why. It stays `proposed` until the owner accepts it. At that point the old ADR becomes `superseded` with `superseded_by` set. Never edit an accepted ADR's decision text. Add a history line instead.

## The loop for any piece of work

1. **Explore, cheaply.** Read `docs/adr/README.md`, then only the ADRs relevant to the work, then `docs/open-questions.md`, then the code area involved. Use the cheapest capable model your tool offers for this step (in Claude Code, a Haiku subagent; elsewhere, the vendor's small model). Produce a short summary: which ADRs apply, which would be contradicted, what is unclear.
2. **Decide, if needed.** If the work needs a decision, write a `proposed` ADR from `docs/adr/TEMPLATE.md` and stop for the owner.
3. **Plan.** Write `docs/plans/NNNN-slug.md` (ADR files are `docs/adr/ADR-NNNN-slug.md`) from `docs/plans/TEMPLATE.md`. It names the ADRs it relies on, the files it will touch, the steps, and what done looks like. Stop for the owner's approval before building anything beyond the plan.
4. **Build, with tests as you go.** On a branch named after the plan. Small commits with clear messages. Run `npm run docs:check` and the project tests before every commit. Tests are written alongside the code, not after: see "Testing" below.
5. **Verify.** Do what the plan's done section says. Report results honestly: failing tests are reported as failing, skipped steps as skipped.
6. **Release note.** Add or extend the entry in `docs/releases/` for the version being worked on, naming the plan and the ADRs. Regenerate the ADR index with `npm run docs:check -- --fix`.

Which model does which step is the owner's call. Lay out the steps and let the owner assign them when more than one agent or model is available.

## Testing

Unit tests are part of every piece of work, written while the code is written. A step is not done until its tests pass.

- **Every rule gets a test.** Each behaviour in an accepted ADR that code implements has at least one test naming that behaviour. When a test and an ADR disagree, the ADR wins and the test is wrong, or the ADR needs superseding.
- **Every bug gets a test first.** Reproduce the bug in a failing test, then fix it, then commit both together.
- **Core is tested exhaustively.** `game/src/core` is pure, so every function there is tested: normal cases, refusals, edge cases, and that the same input always gives the same output.
- **Other layers are tested where they can be.** Pure helpers in `app`, `render`, `ui` and `platform` (tweens, emitters, formatting, storage fallbacks) get unit tests. DOM and WebGL behaviour is verified by the plan's done checks instead.
- **The boundary test always runs.** `game/tests/boundaries.test.ts` enforces ADR 0010 and is never skipped or weakened.
- **Tests use the shipped data.** Load `game/public/machines/<id>/` in tests rather than inventing fixtures, so a data change that breaks a rule is caught.
- **A commit never lowers coverage of core.** Removing or weakening a test needs a reason in the commit message.
- Tests live in `game/tests/`, named `<area>.test.ts`, run with `npm test` from the repository root.

## Standing rules from the brief

- `game/src/core` imports no Three.js and no DOM. Ever. A test enforces it.
- Machines are data. Adding a machine must not need new code.
- A round is an action log. The score is a pure function of the log.
- Player-facing text lives in data or in one strings file, never inline in logic.
- Ask before adding any dependency not already accepted in an ADR.
- Do not change a field name or an ID in the data contracts without an ADR.
- The machine content is an unverified draft. Do not "correct" it from your own knowledge. Add doubts to `docs/open-questions.md`.
- Player mode gives no hint and no feedback when a blocked part is tapped. Diagnostic mode is internal and compiled out of production builds. See ADR 0007.
- Keep within the performance budgets in ADR 0014.

## Do not build these

Accounts, backend, leaderboards, community-submitted content, moderation, money, shop upgrades, tools, haggling, more machines, a learn mode, multiplayer. If the owner wants one, it starts as an ADR.

## Commands

| Command | Does |
| --- | --- |
| `npm run docs:check` | Validates ADRs, plans, release notes and the ADR index. `-- --fix` rewrites the index. |
| `npm run docs:site <out.html>` | Bundles every document into one HTML page for review on any device. Republish it after doc changes. |
| `npm run dev` | Game dev server, reachable on the local network. (From Phase 1.) |
| `npm test` | Core tests. (From Phase 1.) |
| `npm run build` | Static production build. (From Phase 2.) |
| `npm run play` | Text-mode player: solves every fault from an action log and prints the steps and score. |
| `npm run typecheck` | TypeScript check of the game, its tests and the play script. |
| `npm run assets` | Blender to validated GLB. (From Phase 3.) |

## Writing conventions

- Documents are plain Markdown, short sentences, no decoration. Say what is uncertain.
- ADRs are `ADR-NNNN-slug.md`; plans and releases are `NNNN-slug.md` and `MAJOR.MINOR.PATCH.md`. Numbers are never reused.
- Dates are absolute (`2026-10-10`), never "today" or "next week".
- Commit messages: imperative first line under 72 characters, body explains why.
- When the brief or an ADR is ambiguous, pick the simpler reading, say so in the plan, and continue.
