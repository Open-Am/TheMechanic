# docs

| Folder | Holds |
| --- | --- |
| `adr/` | Architecture Decision Records. Start with `adr/README.md`, the index. |
| `plans/` | One plan per piece of work. Each names the ADRs it relies on. |
| `releases/` | One note per release, naming the plans and ADRs that went in. |
| `design/` | Game design and interface design notes. |
| `reference/` | Source material about the real machine. Not shipped. |
| `open-questions.md` | Anything unverified or unclear. |

The process that ties these together is in `AGENTS.md` and ADR 0009. Run `npm run docs:check` to validate everything here.
