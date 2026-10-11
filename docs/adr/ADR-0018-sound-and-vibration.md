---
id: 0018
title: Sound and vibration
status: accepted
date: 2026-10-11
supersedes: []
superseded_by: null
---

# 0018. Sound and vibration

## Context

On 2026-10-11, asked how removal could feel better, the owner chose, among others, "Sound and vibration: ratchet clicks, a metal clunk, a plastic clip snapping, a short buzz on Android phones as a part gives."

The brief, section 8, says: "Provide `audio.play('remove' | 'fail' | 'start')` hooks that do nothing if the files are missing. Ship no audio; the owner will record a real generator." Those hooks exist (`game/src/platform/local/audio.ts`) and nothing ships. An accepted ADR wins over the brief, so this ADR is how the brief's "ship no audio" is changed. ADR 0010 puts `Audio` in `platform`. ADR 0002 limit 6 notes that audio needs a first tap. ADR 0007 rules out hints on blocked actions. ADR 0014 has no row for sound. No ADR says where sound may come from.

## Decision

**What makes a sound.**

| Moment | Sound | Vibration (where the phone supports it) |
| --- | --- | --- |
| An `unscrew` part or fastener turns | A thread or ratchet click per turn | none |
| A part breaks loose or gives | By kind: bolt crack (`unbolt`), plastic snap (`unclip`), rubber pop (`pull`), scrape (`slide`, `lift`) | about 15 ms |
| A part lands in the tray | A light metal or plastic clunk | none |
| A part is put back and seats | A click or thunk | about 15 ms |
| Pull cord | Rope through the starter | none |
| Engine fails | A cough and splutter | about 40 ms |
| Engine starts | A short burst of the engine running | a longer pattern, under 300 ms |

**Nothing for a blocked part.** A part that cannot come off does not move (ADR 0017), so it makes no sound and no vibration. The press acknowledgement on touch stays silent, the same for every part. Sound and vibration never add information that the picture does not already show.

**Where sounds come from.** Sound files are recordings, not sounds made up in code, so they sound real. Each file is either the owner's or the mechanic's own recording, or a recording released as CC0. Every file is listed in `game/public/audio/LICENCE.md` with its source and licence. When the owner records a real generator, those recordings replace the stand-ins for the cord, the failed start and the engine. No sound with a licence that asks for more than credit is used.

**Format and budget (adds to ADR 0014).** Mono Ogg Opus, short, trimmed. All sound files together: 250 KB at most. They load after the round starts, so the first screen never waits for them. A browser that cannot play them plays nothing, and the game works the same. No new dependency: the Web Audio API and `navigator.vibrate`, both built into the browser.

**Control.** A mute button on the working screen turns both sound and vibration off. The choice is remembered on the phone, with the same storage fallbacks as the best scores. Sound starts on. The first tap ("Start") unlocks audio, as browsers require.

**Layers (ADR 0010).** The `Audio` interface in `platform` grows from the brief's three names to the list of moments above, plus a vibrate call. `app` plays the moments that come from accepted actions. Moments that come from the finger (a turn, a part giving) are passed from `render` to `main.ts` through a callback, never by `render` importing `platform`.

## Consequences

Removal gets the clicks and clunks that make a hand feel it did something, and the engine start gets a payoff. Players on expensive data download up to 250 KB more, after the round has started. Finding good CC0 recordings takes searching and listening; until the owner records the real machine, the cord and engine are stand-ins. A mute button joins the interface. Sound bugs on some Android browsers are likely and are only found on real phones.

## History

- 2026-10-11: proposed by Claude, from the owner's choice quoted above.
- 2026-10-11: accepted by the owner, who wrote "I approve the 3 new adr and plan".
