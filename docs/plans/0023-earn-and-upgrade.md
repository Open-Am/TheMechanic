---
id: 0023
title: Earning naira in the workshop day, and tools that save time
status: approved
date: 2026-10-12
adrs: [0001, 0004, 0005, 0013, 0014, 0015, 0020, 0021, 0026, 0029, 0031, 0032, 0033]
branch: plan/0023-earn-and-upgrade
---

# 0023. Earning naira in the workshop day, and tools that save time

## Goal

In the workshop day each fixed customer pays naira (a base by difficulty, a tip for speed, a tip for a clean job, nothing for a walk-out), shown between customers and at the end of the day. A shop between customers and at the end of the day sells six tools that only save time. Bought tools show in the toolbox and the hand uses them in workshop rounds. Free play and the daily always use the standard kit.

Approved by the owner in advance on 2026-10-12, who chose the option "Build all four directions" ("You pre-approve the whole gamification proposal (diagnosis, badges, workshop day, earn and upgrade) and the new faults. Most work done by morning, but the biggest scope changes (money, buying tools) get built before you've seen the details.").

The owner pre-approved the gamification proposal on 2026-10-12 by choosing "Build all four directions", knowing that money and buying tools would be built before they saw the details. This plan stays `proposed` until the owner or the coordinator marks it approved after ADR 0033 is accepted. Because it is the largest scope change, it is built last and kept on its own branch until then.

## ADRs relied on

- **0033** decides all of it: the guardrails, earning in the workshop day only, the amounts, the shop and its six tools with prices and savings, the kit as an input to the round, the toolbox showing bought tools, `shop-tools.glb` and its budget, the saved `wallet` and `tools`, and the exact sentences of ADRs 0001, 0015, 0020, 0021 and 0026 it replaces.
- **0029**: check costs, which the kit lowers; result text the same whatever the tool.
- **0031**: `wallet`, `tools`, `kit` in `StoredResult`, bests only from the standard kit, `first_tool` and `full_kit`, `records.bestDay.earned`.
- **0032**: the day, the between-customers and end-of-day screens where pay and the shop show.
- **0004**: the score stays a pure function of log, customer and kit.
- **0005**: the daily always uses the standard kit.
- **0020, 0021**: loosening and the toolbox trip, sped up by the socket set or impact driver; the hand still picks the right tool itself.
- **0026**: the notes stay a prop; the amount is shown only in the workshop day.
- **0013, 0014**: the tool models by script, within their own budget and the frame rate.
- **0001, 0015**: changed only in the sentences ADR 0033 names.

## Exploration summary

Done by Claude (Opus) reading the code on 2026-10-12. After plans 0019 to 0022: `core/reducer.ts` `apply()` takes a round setup with `customer` and an empty `kit`; check costs come from `CHECK_SECONDS`. `render/motion.ts` holds `TIMING`, `FASTEN` and `tripPlan()`; `render/handpose.ts` `toolFor()` chooses spanner or screwdriver; `render/view.ts` lays tools in toolbox slots. `ui/tray.ts` draws the tray and `ui/format.ts` has `DROP_REACH = 64` and `inDropZone()`. `tools/blender/tools.py` and `toolbox.py` make `tools.glb` and `toolbox.glb`. The saved value has `wallet` and `tools` with defaults.

Risks: a kit input touches every caller of `apply`, `score` and patience; speeding up the trip must keep the hand's collision checks of the browser checks passing; the toolbox may be too small to show six more tools; prices are guesses.

## Simpler readings chosen

1. The kit is a sorted list of tool ids; `core/kit.ts` turns it into check costs and a fastening speed factor.
2. The socket set and impact driver change only the time per fastener in `tripPlan()`; the ratchet model replaces the spanner in the hand for bolts and nuts; screws keep the screwdriver.
3. `big_tray` raises the drop reach from 64 to 120 px and the chip size by a quarter. `inDropZone()` takes the reach as a parameter, defaulting to today's `DROP_REACH`.
4. The shop is a list screen, not a 3D scene. Buying asks no confirmation; with no selling, a mistaken buy is not undone (prices are small against a day's pay).
5. Tools the player owns but that do not apply (free play, the daily) stay out of the toolbox there, as ADR 0033 says.

## Steps

1. **Core.** `core/kit.ts` and constants: tool ids, prices, savings, `impact_driver` needing `socket_set`, `pay(fault, score)`. Every caller of `apply`, `replay`, `score` and patience passes the kit. Tests in `game/tests/kit.test.ts` and the existing reducer, patience and score tests: each tool's saving, the standard kit unchanged, the same log with two kits scores differently only by check costs, pay for each difficulty, tips, nothing for a walk-out.
2. **App.** `app/workshop.ts`: pay after each customer, the wallet, buying, the kit at the start of each workshop round; free play and the daily always pass the empty kit. `first_tool` and `full_kit`. Tests in `app.test.ts`.
3. **Saving.** `platform/local/progress.ts`: `wallet`, `tools`, `kit` in results. Tests in `platform.test.ts`.
4. **Models.** `tools/blender/shop_tools.py`: spark tester, multimeter, ratchet, impact driver, fuel can; `budgets.json` `shopTools` (3,000 triangles, 150 KB, 1024 px); `check.ts --shop-tools`; `npm run assets` builds `game/public/hand/shop-tools.glb`; slots in the toolbox. `assets/tools/STATUS.md` and `LICENCE.md`. Tests in `pipeline.test.ts`.
5. **Render.** `render/view.ts`, `render/motion.ts`, `render/handpose.ts`: show owned tools in workshop rounds only, the faster trip, the ratchet in the hand, the bought testers in the checks. `render/model.ts` loads `shop-tools.glb`. Timing tests in `render.test.ts`.
6. **Interface.** `ui/strings.ts`: naira formatting, tool names and savings, the shop; `ui/shop.ts` (new); pay lines on the between-customers and end-of-day screens; the wallet on the start screen; `ui/tray.ts` with the bigger tray. Tests in `ui.test.ts` (naira text, buy button states).
7. **Browser checks.** `tools/verify/phone-play.ts`: pay after a fixed workshop customer and nothing after a walk-out; buying a tool, the wallet going down and the tool in the toolbox; a check with the spark tester costs 1 s; the daily and free play show the standard kit and standard costs; a reload keeps the wallet and tools. `drop-play.ts` with the bigger tray. Both under the shared lock, one after the other.
8. **Notes.** `AGENTS.md`'s "Do not build these" list, once ADR 0033 is accepted; `docs/design/interface.md`; release note `docs/releases/0.22.0.md`.

## Done when

- `npm test`, `npm run typecheck`, `npm run docs:check`, `npm run build` and `npm run size` pass.
- `npm run assets` checks `shop-tools.glb` within its budget.
- `npm run verify:phone` and then `npm run verify:drop` pass under the shared lock, with no console errors and at least 30 fps at 4x CPU throttle, as in step 7.
- The owner plays a day, buys a tool, and checks the daily is unchanged, on the phone.

## Depends on

Plans 0019, 0020, 0021 and 0022 merged first. Nothing depends on this plan.

## Release note line

Added: workshop customers pay naira, with tips for speed and a clean job, and a shop sells tools that save time; the daily and free play always use the standard kit. No real money, no ads, no purchases (plan 0023, ADR 0033).
