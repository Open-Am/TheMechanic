---
id: 0011
title: Inspecting parts in place
status: accepted
date: 2026-10-10
supersedes: []
superseded_by: null
---

# 0011. Inspecting parts in place

## Context

The brief and ADR 0004 allow inspection only from the tray: a part must come off before the player can look at it. On 2026-10-10 the owner decided that a part can also be inspected where it sits, but only if it is visible. A real mechanic looks before pulling.

Visible is not the same as removable. The fuel tank cannot come off until the fuel tap is off, yet it is in plain view the whole time. The spark plug, by contrast, is hidden under its cap, and the capacitor under the alternator cover. So the data has to say what hides a part. This ADR extends ADR 0003 (data) and ADR 0004 (rules) without replacing them.

## Decision

**Data.** Each part in `machine.json` may carry an optional `hiddenBy`, a list of part IDs. While any part in that list is installed, this part cannot be seen. When `hiddenBy` is absent it defaults to the part's `requires`, which is the safe reading: whatever must come off first is assumed to be in the way. A part that is always visible says `"hiddenBy": []`. The validator checks that every entry names a part and, with a warning, that each entry is also in `requires` (something that hides a part but need not come off to remove it would be odd, and is worth a second look).

**Rule.** `inspect` is allowed on a part that is in the tray, or that is installed and not hidden. The action log entry is the same `{ t, type: "inspect", partId }` either way. Inspection is free: it costs no score and is never a wrong part.

**Refusal.** Inspecting an installed, hidden part is refused with reason `hidden_by` and the installed parts that hide it. Player mode shows nothing (ADR 0007). Diagnostic mode shows the reason.

**Condition text** is the same whether the part is inspected in place or in the tray, and still comes only through `conditionOf` (ADR 0010).

**Interface.** The inspect card can open from a tap on a visible installed part as well as from the tray. How a tap is split between "inspect" and "remove" is a design matter for Phase 2 and lives in `docs/design/interface.md`.

**Initial data.** For `gen950`, parts with no `requires` are visible from the start. `fuel_tank` gets `"hiddenBy": []`. Every other part keeps the default. These are drafts for the mechanic to check, like the rest of the content.

## Consequences

The player can look before taking things apart, which rewards understanding the machine over trial and error. Some faults become findable without a removal, but fixing still needs the part off, so the removal order still matters. The ADR 0004 text "inspect happens from the tray" is extended, not contradicted: tray inspection still works as written. Core, the validator, the tests and `play.ts` change; a small follow-up plan covers it.

## History

- 2026-10-10: proposed by Claude, from the owner's instruction "it depends if the part is visible, and only the visible part".
- 2026-10-10: accepted by the owner, who wrote "adr 11 is approved".
