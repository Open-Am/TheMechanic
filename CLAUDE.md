# CLAUDE.md

All agent instructions for this repository live in [AGENTS.md](AGENTS.md). Read it first and follow it. Nothing here overrides it.

Claude-specific notes only:

- For the exploration step in the work loop, use a Haiku subagent to read the ADR index, the relevant ADRs and the open questions, and return a summary.
- Stop at the end of each phase of the brief and wait for the owner.
