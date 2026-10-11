---
id: 0016
title: MakeHuman for characters, and the hand turns the machine
status: superseded
date: 2026-10-11
supersedes: []
superseded_by: 0020
---

# 0016. MakeHuman for characters, and the hand turns the machine

## Context

On 2026-10-11 the owner wrote: "Before we do the customer, lets do the hand with make human. Also the hand should also come in when the user is try to rotate the generator."

ADR 0015 lets a free, open human-modelling tool be used for the characters once the owner approves it in writing, and names the MakeHuman add-on for Blender as an example. The owner's message is that approval. ADR 0012 pins every tool's version, and ADR 0013 says what may ship and how outside material is recorded. Neither says how the MakeHuman add-on and its asset pack are pinned, where they live, or what their licences allow.

ADR 0015 also says when the hand acts: "On a pull it reaches the part ... On a put-back it carries the part in and releases it. It is visible only while it acts." Turning the machine is not on that list. This ADR adds it. ADR 0007 (no hints in player mode) and ADR 0008 (part motion) still hold. Nothing in ADR 0015 is replaced.

## Decision

**MakeHuman is an approved modelling tool.**

- The MakeHuman Plugin for Blender (MPFB) may be used to make the hand and the customer. The version used, its download address and the version of its asset pack are recorded in this ADR's history when first installed, as ADR 0012 does for glTF Transform. Moving to another version is a history line, not a new ADR, as long as the licences below do not change.
- MPFB runs inside Blender 4.5 (ADR 0012). It is a build tool. Its code is never shipped.
- Only material whose licence allows shipping it in the game without asking anyone is used in a shipped model: CC0, or a licence that only asks for credit. The licence of every MakeHuman item a shipped model uses (base mesh, skin, eyes, clothes, rig) is written next to the model, in `assets/<model>/LICENCE.md`, with credit lines where the licence asks for them. Anything with a licence that forbids commercial use, or is unclear, is not used.
- MakeHuman gives the shape: the mesh, its proportions, the skeleton used to pose it. Textures still follow ADR 0013: MakeHuman's skin and clothing images are not shipped; skin and cloth are baked from our own procedural materials, as the current hand's are. Using a MakeHuman image in a shipped model needs the owner's approval of that image.
- A model made with MakeHuman is still checked against reference photos and held to the realism rule of ADR 0013. People are shown as real Lagos people, never as caricatures. The owner approves each character.

**The hand's file (no ADR defined it until now).** `game/public/hand/hand.glb`, loaded at startup with the machine; if it is missing, parts move on their own. One root node named `mechanic_hand`, its origin at the grip point, fingers along -Z, palm facing -Y, forearm along +Z, in metres. A morph target named `grip` (the hand closed around a bar about 30 mm thick) is required; more morph targets may be added, such as `pinch` (fingertips closed, for small parts). The budget stays as ADR 0015 sets it: 4,000 triangles, 400 KB, one 1024 px texture set, animations included. `npm run assets` checks all of this.

**The hand turns the machine.**

- When the player drags to rotate the view, the mechanic's hand comes in, takes hold of the edge of the base (`base_frame`: the die-cast base and body shell; the machine has no tube frame), and stays on it while the drag lasts, so the machine looks turned by hand. When the drag ends the hand lets go and pulls back out of view.
- The hand holds the base only. It never touches, points at or rests on a removable part, so it says nothing about which parts will come off (ADR 0007). A rotation that starts with the finger on a part, blocked or not, shows exactly the same hand on the frame as one that starts on empty space.
- If the frame turns so far that the hand's hold would be hidden or the arm would twist, the hand lets go and takes a new hold, hand over hand.
- Zooming with two fingers does not bring the hand in.
- A removal or put-back during or after a rotation takes the hand over: the new action wins, as it does now.
- The hand is still visible only while it acts. A tap shows no hand. A blocked pull still shows no hand.
- The view's rotation itself is unchanged: the hand follows the rotation; it does not limit or slow it.

## Consequences

The hand can be sculpted and rigged rather than built from tubes, which is the realism the owner asked for, and the same tool can later make the customer. The cost is a second outside asset source to track: each shipped model needs a licence file, and a later MPFB or asset pack update must be checked for licence changes.

Rotating, the most common gesture, now shows the hand most of the time the player touches the screen. That makes the hand's look matter more, and adds a little drawing work while rotating; the frame-rate budget of ADR 0014 must still hold.

Work this creates, for a plan: install and record MPFB; remake the hand with it inside the hand budget; add the rotation hold to the hand rig; tests for the pure parts; the browser check catches the hand on the frame during a rotation.

## History

- 2026-10-11: proposed by Claude, from the owner's message quoted above.
- 2026-10-11: accepted by the owner, who answered "Yes, accept ADR 16" when asked.
- 2026-10-11: installed for the user that runs the asset scripts. MPFB 2.0.18 from https://extensions.blender.org/add-ons/mpfb/ (download add-on-mpfb-v2.0.18.zip, sha256 c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad, matching the platform's published hash), licence GPL-3.0-or-later, installed with `blender --command extension install-file -r user_default -e <zip>`. MakeHuman system assets pack, CC0 variant, from https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip (no version stated, metadata dated 2020-01-01; sha256 b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107 computed here, none published), unpacked into MPFB's user data folder. Its metadata marks all 94 items CC0; the base mesh file says it was released as CC0 in September 2020. A headless test made a human of 19,158 vertices with a 137-bone rig.
- 2026-10-11: superseded by ADR 0020 (the hand follows the pointer; loosen, then drag to the tray), which restates what of this ADR still stands.
