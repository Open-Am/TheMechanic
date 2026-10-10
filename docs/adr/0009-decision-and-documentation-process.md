---
id: 0009
title: Decision and documentation process
status: proposed
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0009. Decision and documentation process

## Context

Several agents from several vendors (Claude, Codex, Kimi and others) will build this project. Without a shared record of decisions they will each re-decide and drift. The owner asked on 2026-10-10 for a process where every decision is an ADR, every piece of work has a plan rooted in ADRs, the owner explicitly approves any change to a decision, and each release has a note. This ADR is that process. `AGENTS.md` is its operational form.

## Decision

- **One instruction file.** `AGENTS.md` holds every agent instruction. `CLAUDE.md` and any other vendor file only point to it.
- **ADRs decide.** Work that touches scope, a data contract, a game rule, scoring, the stack, a dependency, build or deploy, this process, or an existing ADR requires an ADR first. Bug fixes, wording, behaviour-preserving refactors, tests and in-budget performance work do not, but must not contradict an accepted ADR.
- **Status is the gate.** `status` is `proposed`, `accepted`, `superseded` or `rejected`. Agents create ADRs only as `proposed`. Only the owner changes status, in the file or by a written instruction that the agent quotes in the ADR's history.
- **Overrides are explicit.** A change to an accepted decision is a new ADR naming the old one in `supersedes`. On acceptance the old one becomes `superseded` with `superseded_by` set. Accepted decision text is never edited.
- **Plans follow ADRs.** Every plan names the ADRs it relies on, and can be approved only when those ADRs are accepted. No code beyond the plan is written before the owner approves the plan.
- **Exploration is cheap.** Before planning, an agent reads the ADR index, the relevant ADRs, the open questions and the code area, using the cheapest capable model its tool offers, and summarises. The owner assigns models and agents to steps.
- **Releases are noted.** Every release has a note in `docs/releases/` naming the plans and ADRs that went in.
- **A script enforces the shape.** `npm run docs:check` validates front matter, unique numbers, resolvable `supersedes` and `superseded_by` links, that approved plans name only accepted ADRs, that release notes name existing plans, and that the ADR index matches the files. `-- --fix` regenerates the index.

## Consequences

More writing before code. In return, any agent can pick up the project cold and know what is decided. The process itself is changed only by superseding this ADR.

## History

- 2026-10-10: proposed by Claude, from the owner's instruction.
