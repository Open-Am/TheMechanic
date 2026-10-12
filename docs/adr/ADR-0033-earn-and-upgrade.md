---
id: 0033
title: Earning naira in the workshop day, and tools that save time
status: accepted
date: 2026-10-12
supersedes: []
superseded_by: null
---

# 0033. Earning naira in the workshop day, and tools that save time

## Context

On 2026-10-12 the owner asked for "a way to gamify this better" and chose all four directions in `docs/design/gamification-proposal.md`. Asked how far to go overnight, the owner chose the option labelled "Build all four directions", whose text was: "You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details."

That text says the owner has not seen the details of this part. This ADR is the biggest scope change of the four, so it states exactly which accepted sentences it replaces, for the owner to read before accepting.

Today a fixed customer hands over folded naira notes (ADR 0026), but no amount is shown and nothing is counted. The toolbox holds the spanner and screwdriver, and from ADR 0029 the basic testers; the hand always takes the right one. Several accepted ADRs rule out money and tools as things to buy:

- ADR 0001: "The first version does not contain, and no agent builds without a new ADR: accounts, a backend, leaderboards, community-submitted faults or machines, moderation, money, shop upgrades, tools, customer haggling, more machines, a learn mode, multiplayer."
- ADR 0015: "ADR 0001's exclusions still hold: no money, no haggling, no tips, no customer choice of price."
- ADR 0020: "Visuals only: no tool to pick, buy or upgrade, and 'do not build tools' still holds." (inner quotes changed to single here)
- ADR 0021: "There is no tool to choose, buy, upgrade or lose. The hand always takes the right tool by itself. ADR 0001's exclusion stands."
- ADR 0026: "Payment is only an animation. No amount is shown, nothing is counted, saved or spent, and the score and the action log do not change (ADR 0004). There is no wallet, no earnings and no shop. Anything more than this moment needs its own ADR under ADR 0001."

## Decision

### What changes in those sentences

None of those ADRs is superseded whole. On acceptance each gets a history line naming this ADR and the part it replaces:

- **ADR 0001**: "money", "shop upgrades" and "tools" leave the list of things not built, for in-game naira and time-saving tools as this ADR describes. Everything else on the list stays excluded, including customer haggling and leaderboards.
- **ADR 0015**: "no money" and "no tips" no longer hold in the workshop day. "No haggling" and "no customer choice of price" still hold.
- **ADR 0020**: "no tool to pick, buy or upgrade" becomes: tools can be bought and upgraded in the shop; the player still never picks a tool during a round.
- **ADR 0021**: "There is no tool to choose, buy, upgrade or lose" becomes: tools can be bought and upgraded; there is still no tool to choose during a round, and none can be lost, broken or sold. "The hand always takes the right tool by itself" stands. "ADR 0001's exclusion stands" no longer holds.
- **ADR 0026**: in the workshop day, the amount paid is shown and counted. In free play and the daily, payment stays only an animation, as now. In every mode the score and the action log do not change because of payment.

`AGENTS.md`'s "Do not build these" list needs the same change.

### Guardrails

- **No real money.** Naira here is a number in the game, never bought, never cashed out. No ads, no purchases, no prices in real currency, no links to a store.
- **Tools save time; they never change the rules or what the player learns.** A tool never reveals anything a check or an inspection would not, never skips a step of the puzzle, and never changes which parts must come off.
- **The daily stays equal.** The daily always uses the standard kit, whatever the player owns. So does free play. Bought tools work only in the workshop day.

### Earning (workshop day only)

Each fixed workshop customer pays, by a pure function in `core` of the fault and the round's score:

| Part | Amount (draft) |
| --- | --- |
| Base, by the fault's difficulty (ADR 0030) | 1: ₦3,000 · 2: ₦5,000 · 3: ₦8,000 |
| Tip for speed | ₦1,000 when fixed in 90 seconds or less (`elapsedSeconds`) |
| Tip for a clean job | ₦1,000 when there are no wrong parts and no failed pulls |
| A walk-out | Nothing |

Amounts are constants in `core/constants.ts`, placeholders for the owner to set. Whether they match real Lagos roadside prices is not known. The amount is shown on the between-customers screen and the end-of-day screen ("Paid ₦5,000 · tip ₦1,000"), and the notes in ADR 0026's animation stay a prop. Free play and the daily earn nothing.

### The shop

Between customers and on the end-of-day screen, a **Shop** lists the tools with price, what each saves, and a Buy button (greyed when the player cannot afford it or owns it). There is nothing else to buy, nothing to sell, and nothing wears out.

| Tool | Price (draft) | What it saves |
| --- | --- | --- |
| `spark_tester` | ₦12,000 | `spark_test` costs 1 s instead of 4 s |
| `multimeter` | ₦20,000 | `volts_test` costs 1 s instead of 4 s |
| `fuel_can` | ₦6,000 | `fuel_flow` costs 1 s instead of 3 s |
| `socket_set` | ₦25,000 | The hand undoes and does up bolts and nuts 30 percent faster |
| `impact_driver` | ₦60,000, needs `socket_set` | 60 percent faster, in place of the socket set's 30 |
| `big_tray` | ₦10,000 | The tray's drop zone is taller and its chips larger, so parts land first time |

A check's result text is the same whichever tool did it (ADR 0029). Prices and savings are constants; tool names and descriptions are in `strings.ts`. The tool ids are a fixed list in `core`, like the check ids.

### The kit is part of a round

- Each round has a **kit**: the tools in effect. The standard kit is empty. A workshop round's kit is the tools owned when it starts; free play and the daily always use the standard kit.
- The reducer, patience and the score take the kit, as they take the customer, because it sets the cost of checks. A round's score is still a pure function of its log, customer and kit, and ADR 0031's `StoredResult` keeps `kit` so it can be scored again.
- The faster fastening is a matter for `render` (it shortens the loosening animation of ADRs 0020 and 0021); its effect reaches the score only as the real time it saves, through the log's times.

### In the toolbox

Bought tools show in the toolbox on the bench (ADR 0021, ADR 0025), and the hand uses them: the spark tester and multimeter in place of the basic testers of ADR 0029, a ratchet from the socket set or the impact driver in place of the spanner for bolts and nuts, and the fuel can beside the toolbox. In free play and the daily the toolbox shows only the standard kit. The models are made to ADR 0013's standard in one file, `game/public/hand/shop-tools.glb`, budget 3,000 triangles, 150 KB, one 1024 px texture set; if it is missing, the hand keeps using the standard tools and only the timings change. No new sound files: the impact driver plays the existing `turn` moment faster.

### Saved data (in ADR 0031's format)

`wallet.naira` (what the player has), `wallet.earned` (all ever earned), `tools` (ids owned). A day's earnings are in `records.bestDay.earned` and on the end-of-day screen. Buying is saved at once.

## Consequences

The workshop day gains a goal beyond reputation: earn, buy a tool, play faster. The daily and free play are untouched, so a shared daily result means the same for everyone. The cost: money, a shop and tools are new screens, new data, new models and new rules about which kit is in effect; the reducer, patience and score gain a kit input; the loosening animation gains a speed. Prices and savings will need tuning. Each badge for tools (ADR 0031) only means something once this is built. The owner has not yet seen these details; if they reject them, ADRs 0029 to 0032 stand without this one.

## History

- 2026-10-12: proposed by Claude, from the owner's choice quoted above.
- 2026-10-12: accepted by the owner in advance, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.") before going to bed; the owner reviews the result in the morning, and the tag before-gamification marks the game before this work.
