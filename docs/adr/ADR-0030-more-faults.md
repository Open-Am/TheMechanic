---
id: 0030
title: Six more faults, and three new parts to carry them
status: accepted
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0030. Six more faults, and three new parts to carry them

## Context

On 2026-10-12 the owner asked for "a way to gamify this better" and chose all four directions in `docs/design/gamification-proposal.md`. Asked how far to go overnight, the owner chose the option labelled "Build all four directions", whose text was: "You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details."

The new faults are the top six of `docs/reference/more-faults-research.md`. That research came from web search snippets about other small generators. Nothing in it is from an ET950 manual or a Lagos mechanic, and every frequency is an estimate.

ADR 0001 fixes "Six faults, one bad part each" and "12 removable parts". ADR 0003 fixes the data contracts. ADR 0005 accepts that with six faults the daily repeats within a week. ADR 0029 adds the clue lines each fault needs. ADR 0032 needs a difficulty for each fault.

## Decision

### Scope (changes two lines of ADR 0001)

- "Six faults, one bad part each" becomes twelve faults, one bad part each.
- "12 removable parts" becomes 15. ADR 0020's "the twelve removable parts of ADR 0001 stay twelve" reads as fifteen; fasteners are still not parts.
- One machine, as before. Everything else in ADR 0001 stands except what ADRs 0032 and 0033 change.

### Three new parts (adds to ADR 0003; no id or field changes)

| Part | Sits | `requires` | Motion | Fasteners (draft) |
| --- | --- | --- | --- | --- |
| `fuel_cap` | On top of the tank | none | `unscrew`, about 2 turns | none |
| `fuel_filter` | In-line, on the tap's outlet, under the hose | `fuel_hose` | `pull` | none |
| `ignition_coil` | Beside the flywheel, behind the recoil starter | `recoil_starter` | `unbolt` | 2 bolts |

- Two existing parts gain a `requires` entry, so a new part is never left floating when the part under it goes: `fuel_tank` gains `fuel_cap`, and `fuel_tap` gains `fuel_filter`. No existing entry is removed.
- `ignition_coil` gains `hiddenBy: ["recoil_starter"]`.
- Each new part gets `name`, `does`, `inspectOk`, `placeholder`, `explode`, `motion` and, for the coil, `fasteners`, all drafts.
- **Model contract.** Each new part is its own node in `model.glb`, named by its id, with its fasteners as child nodes (ADR 0020), checked by `npm run assets`. Triangle allocation inside the machine's 60,000: `fuel_cap` 400, `fuel_filter` 400, `ignition_coil` 900. The machine's 5 MB budget is unchanged.
- **The tests (ADR 0029).** `fuel_flow` also needs `fuel_cap` and `fuel_filter` installed. The other checks' needs are unchanged.

### Difficulty (adds a field to ADR 0003)

Each fault gains `difficulty`: 1, 2 or 3. ADR 0032 uses it to choose a day's faults and ADR 0033 to set the price. The validator rejects any other value. Draft levels, for the owner and the mechanic to tune:

- **1**: `fouled_plug`, `dirty_air_filter`, `choked_muffler`, `fuel_cap_vent_blocked`, `recoil_rope_or_spring`.
- **2**: `clogged_jet`, `blocked_fuel_tap`, `dead_capacitor`, `fuel_filter_or_pickup_blocked`, `weak_capacitor_low_output`.
- **3**: `float_stuck_or_needle_leak`, `ignition_coil_or_magneto`.

The level reflects how deep the bad part sits and how much another fault looks like it.

### Six new faults

All `author: "core"`, `verified: false`. Complaints are drafts in Pidgin for the owner to correct.

| Fault | Culprit | Symptom | Complaint (draft) | `inspectBad` (draft) | `fix` |
| --- | --- | --- | --- | --- | --- |
| `fuel_cap_vent_blocked` | `fuel_cap` | `starts_then_dies` | "E go run small, then e go off. If I open the tank cover, e go start again." | The breather hole in the cap is packed with dirt. No air can get in. | Clear the vent hole |
| `fuel_filter_or_pickup_blocked` | `fuel_filter` | `starts_then_dies` | "E dey work like ten minutes, then e quench. I go wait before e start again." | The filter is dark with dirt. Fuel can barely pass. | Fit a new filter |
| `float_stuck_or_needle_leak` | `carburetor` | `runs_weak` | "E dey smell fuel, black smoke dey comot, fuel dey drip after I off am." | The float is stuck and the needle does not seat. The bowl overflows. | Free the float, clean the needle seat |
| `recoil_rope_or_spring` | `recoil_starter` | `no_start` | "The rope no dey go back inside. E hard to pull." | The recoil spring is broken. The rope cannot wind back. | Fit a new recoil spring |
| `weak_capacitor_low_output` | `capacitor` | `runs_no_output` | "Gen dey work but the light no bright. E just dey glow small." | It holds far less charge than the value printed on its case. | Fit a new capacitor |
| `ignition_coil_or_magneto` | `ignition_coil` | `no_start` | "E no gree start. I don change plug sef, nothing." | The coil's lead is cracked and burnt at the core. No spark reaches the plug. | Fit a new ignition coil |

`recoil_rope_or_spring` keeps the research's id but is the spring only: one fault, one culprit.

### Their clues (ADR 0029)

| Fault | `listen_pull` | `look_smoke` | `look_plug` | `spark_test` | `fuel_flow` | `volts_test` |
| --- | --- | --- | --- | --- | --- | --- |
| `fuel_cap_vent_blocked` | Fires and runs, slows, dies | A little pale smoke | Dry, light brown | Strong blue spark | Runs, then slows to a trickle; loosen the cap and it runs again | Full voltage, then fading as it dies |
| `fuel_filter_or_pickup_blocked` | Fires and runs, then dies | A little pale smoke | Dry, pale | Strong blue spark | A thin, weak stream from the start | Full voltage, then fading as it dies |
| `float_stuck_or_needle_leak` | Hard to start, then runs rough and rich | Thick black smoke, raw petrol smell | Black and wet with petrol | Strong blue spark | Flows freely | Low and unsteady |
| `recoil_rope_or_spring` | The rope comes out and stays out; no fire | None | Clean, light brown | The rope stays out after one pull; too slow for a spark | Flows freely | No reading: it will not start |
| `weak_capacitor_low_output` | Starts at once and runs smoothly | Clear | Light brown | Strong blue spark | Flows freely | The bulb glows faintly: about 25 V, not 230 |
| `ignition_coil_or_magneto` | Turns over, no fire at all | None; a smell of raw petrol | Clean but wet with petrol | No spark jumps the tester's gap | Flows freely | No reading: it will not start |

Plan 0020 turns these into full sentences of player text.

### The symptom line for `runs_no_output`

`dead_capacitor` and `weak_capacitor_low_output` share the symptom `runs_no_output`. The symptom ids stay four (ADR 0003). The player text in `strings.ts` ("The engine runs sweetly. The bulb stays dark.") is reworded so it is true for both, for example "The engine runs sweetly. The bulb gives no proper light." That is a wording change and needs no ADR.

### Unverified until the mechanic checks

Every item above is a draft: the three parts, where they sit and what holds them, the `requires` changes, the complaints, the bad-part text, the clues and the difficulty levels. Doubts go to `docs/open-questions.md`, including: whether the clones have an in-line fuel filter or only a tank screen; the fuel cap's vent design; where the coil sits and whether it is a coil or a CDI unit; whether the spring alone, or the rope too, fails often enough to be the fault.

## Consequences

Twelve faults make the daily repeat less often and give the workshop day (ADR 0032) faults to grade by difficulty. Faults now share complaints and symptoms more often (four `starts_then_dies` faults on the fuel side, three `no_start` faults), and two culprits carry two faults each (the carburettor and the capacitor), so the checks of ADR 0029 matter. The cost: three new parts to model, bake and check; six faults with 36 clue lines for the mechanic to read; more removal-order cases for the browser checks and the text-mode player.

Changing the fault list changes every day's daily fault (ADR 0005's hash runs over the list). On the day this ships, a player who has already played today's daily may find a different fault listed for the same day. Their attempt for that day stays used (ADR 0024). This is accepted.

`blocked_fuel_tap` now needs `fuel_filter` off on the way to the tap, so its best path is one part longer than before.

ADR 0001's "six faults" and "12 removable parts", ADR 0005's "With six faults the daily repeats within a week" and ADR 0020's "stay twelve" get history lines on acceptance. Their other text stands.

## History

- 2026-10-12: proposed by Claude, from the owner's choice quoted above.
- 2026-10-12: accepted by the owner in advance, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.") before going to bed; the owner reviews the result in the morning, and the tag before-gamification marks the game before this work.
