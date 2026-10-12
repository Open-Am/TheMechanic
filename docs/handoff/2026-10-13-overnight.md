# Overnight handoff, 2026-10-13

For the owner in the morning, and for the next agent session. The repository is the source of truth; this is a map. Written at about 00:15 on 2026-10-13 while the Windows build machine ran on battery (30%, not charging), so the work below may have stopped when the battery ran out.

## On main (pushed)

Everything up to `99388b0` and this note: the workbench (0016), customers (0015) with arrive / pay / storm-off (0017), the smile and clearer payment, sounds (0013) with the engine catching and running (ADR 0028), the toolbox (0012), bolts and tools (0011), Phase 4 (0014). The phone preview (https://claude.ai/artifact/7zntsAiDYnDsYmeEkRcQ3A, shared "anyone with the link") is built from `de99f72`.

Accepted on the owner's advance approval ("Build all four directions", 2026-10-12): ADRs 0029 to 0033 and plans 0019 to 0023 (diagnosis checks, six more faults, badges and records, the workshop day, earn and upgrade). The tag `before-gamification` marks main before any of that is built; `git reset --hard before-gamification` on a branch, or reverting the later merges, undoes it.

## In progress (branches backed up on GitHub, not merged)

| Branch | Worktree | State |
| --- | --- | --- |
| `fix/easier-drop` | `TheMechanic-drop2` | Drop is near the generator, by proximity, flicks count, onto other parts, the tray re-flows. 336/336 drops first time. The "frame rate fell" failures were the check reading one noisy second per round; it now takes the median of three (80b5afa). Carry moves made cheaper (2078015); no resting cost against main. Closing checks NOT run (machine on battery, throttled): run verify:drop twice and verify:phone once under the lock on mains power, then merge. |
| `plan/0018-pulling-the-cord` | `TheMechanic-0018` | The pull, the engine running, the customer paying into the mechanic's hand, the switch, the wind-down; both checks passed earlier. Being fixed so the arm reaches the notes from the lower left instead of across the generator. Merge after its checks. |
| `plan/0019-diagnosis-and-faults` | `TheMechanic-0019` | Plans 0019 and 0020 without the Blender models: the `check` action, clues, the six new faults and three new parts as data and placeholders. The new parts' models wait for plan 0018 to merge (both edit `gen950.blend`). |

Merge order: easier drop, then 0018, then 0019; then model the new parts; then plans 0021, 0022, 0023 in that order.

## Rules learned this session

- Run `verify:phone` and `verify:drop` before every merge, one at a time, each under the shared lock: `mkdir C:/Users/write/AppData/Local/Temp/open-am-check.lock` before, `rm -rf` after, with an `owner` file inside.
- Never launch the checks' headless Edge with `--mute-audio` (it slows the page to 12 to 30 fps). The checks play sound; `OPEN_AM_SILENT=1` silences them in the page.
- Never put the owner's email address in any web request (agents once sent it in a User-Agent to Wikimedia Commons; disclosed to the owner).
- Shell `sed` drops backslashes on this machine; use the edit tool or a script file.

## Known gaps

- The hand is sometimes 10 to 35 percent inside the machine (carburettor hover, muffler, starter, tank); not found yet.
- Carrying a part costs 40 to 75 ms per frame in headless Edge, against 8 ms at rest.
- The speech bubble covers the customer's forehead; feet show through the bench under the controls; hands rest on the generator's handle instead of gripping it.
- The ending after a fix lasts about 9 s (tap skips each step).

## Waiting on the owner

- Look at the smiles, the drop and the pull on the phone once merged.
- Real Pidgin lines; a mechanic's check of `open-questions.md` (now including the six new faults); recordings of the real generator; the Git LFS quota.
