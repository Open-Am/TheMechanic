# Sound status (plan 0013, ADRs 0018 and 0028)

Updated 2026-10-12.

All eleven sounds ship in `game/public/audio/`, 50.7 KB (50,699 bytes) of the 250 KB budget: ADR 0018's ten moments, and since ADR 0028 the engine running (`run`), which loops. Each one is a **stand-in** until the owner records the real machine (ADR 0018). The cord, the failed start and the engine start are to be replaced first.

They are the first choices in `docs/reference/sound-shortlist.md`, except `start` and `run`, which the owner chose for ADR 0028. The owner downloaded the shortlist and on 2026-10-12 wrote "Yes go with the recommendations but also keep the rest. Later we will provide options for customization for the users later". The other downloads stay in `assets/audio/source/`, on this machine only (the folder is not committed). Letting players choose between sounds needs an ADR first (`docs/open-questions.md`).

On 2026-10-12 each chosen sound's Freesound page was checked again: all eleven link their licence to `creativecommons.org/publicdomain/zero/1.0/` (CC0 1.0). A CC-BY page, checked the same way as a control, linked `licenses/by/4.0/`.

Trims were chosen from the waveforms (peak envelopes, onsets, spectral centroid), not by ear. Nobody has listened to the encoded files yet. Levels were matched on the encoded files: every file peaks between -1.5 and -8.5 dBFS. The loudest 50 ms of each is between -17.4 and -24.9 dB RMS. The sharpest clicks sit lower because their peaks limit them.

| Moment | File | Source (Freesound) | Trim (s) | Gain (dB) | Length | Bytes | Peak dBFS | Loudest 50 ms RMS dB | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| turn | turn.ogg | 340529 mickyman5000, ratchet single click | 0.22–0.33 | -1.5 | 0.11 s | 795 | -3.1 | -24.2 | stand-in |
| give-unbolt | give-unbolt.ogg | 524264 Flares.fr, torque wrench (one isolated clack at 2.008 s) | 2.00–2.12 | +18 | 0.12 s | 1,095 | -2.3 | -24.9 | stand-in |
| give-unclip | give-unclip.ogg | 151778 slappy13, clip in | 0.08–0.25 | -1.5 | 0.17 s | 1,081 | -1.5 | -21.1 | stand-in |
| give-pull | give-pull.ogg | 702880 CrudeWax, bottle rubber cap pop | 0.23–0.35 | -4 | 0.12 s | 828 | -2.1 | -17.4 | stand-in |
| give-scrape | give-scrape.ogg | 743259 qubodup, short rusty metal scrape | 0.00–0.16 | -1.5 | 0.16 s | 1,083 | -3.9 | -17.9 | stand-in |
| land | land.ogg | 362506 Jetrod, clonk1 | 0.00–0.40 | -16 | 0.40 s | 2,255 | -8.3 | -17.6 | stand-in |
| seat | seat.ogg | 815493 xkeril, mechanical switch latch 02 | 0.07–0.30 | -3.5 | 0.23 s | 1,450 | -3.7 | -17.9 | stand-in |
| cord | cord.ogg | 450929 kyles, cord pull start | 0.02–0.62 | +0.5 | 0.60 s | 3,558 | -5.7 | -18.1 | stand-in, replace first |
| fail | fail.ogg | 450951 kyles, won't start, false starts | 17.59–18.49 | -2.5 | 0.90 s | 4,823 | -8.5 | -17.9 | stand-in, replace first |
| start | start.ogg | 871136 ElSchorscho, chainsaw starting, idling, stopping (Husqvarna 445) | 2.84–6.80 | +4.5 | 3.96 s | 21,675 | -5.0 | -16.3 | stand-in, replace first |
| run | run.ogg | 871135 ElSchorscho, chainsaw idle and revving (Husqvarna 445); loops 1.260229–3.508750 | 1.15–3.62 | +14.5 | 2.47 s (loop 2.249 s) | 12,056 | -7.5 | -25.2 | stand-in, replace first |

Fades are in `sounds.json`. Only `fail` has a fade-in (10 ms). `start` fades out over its last 0.3 s while `run` fades in over the same 0.3 s: the crossfade from the catch to the running engine. Blender's volume keys step in 10 ms frames, and a fade-in swallowed any click within about 20 ms of the cut, so the others start on the quiet just before their onset, with no fade-in.

**The engine start and run (ADR 0028, 2026-10-12).** The owner wrote, after playing the preview, "the generator sound when it starts does not sound like a successful start", accepted ADR 0028, and chose the ElSchorscho Husqvarna 445 recordings ("Go with the 2 instead"). Before that, `start` was esperri 118971 (three revs dying away), and before that damsur 443239 (two short tries split by digital silence).

- `start` is 2.84–6.80 s of 871136: from just before the first firing (2.86 s; the two pulls before it are left out), through the surge (loudest about 5.3 s), to the settle at idle loudness. A 3 s cut was tried and dropped: it ended at the top of the surge, 9.6 dB above the idle, so the loop would have come in as a sudden drop.
- `run` is 1.15–3.62 s of 871135, even idle, and the game repeats 0.110229 to 2.358750 s into the file (`RUN_LOOP` in `game/src/app/moments.ts`, `loopStart` and `loopEnd` in `sounds.json`).
  - The points were found by scoring upward zero crossings by how well the 20 ms either side of them match.
  - They were then placed again on the decoded file, which lines up with the original to within 1 sample.
  - Across the seam the step is 0.00101, against the loop's median step of 0.00354, and 0.00024 when resampled for a 44.1 kHz phone. The 20 ms either side correlate at 0.785, and the level 5 ms either side is -35.9 / -36.6 dB.
- Levels: the catch's tail before its fade and the loop both measure -28.9 dB RMS, so the loop takes over at the catch's loudness. The two recordings differ by 10 dB, hence +4.5 and +14.5 dB.
- **Re-encoding `run.ogg` moves its samples slightly** (Opus is not byte-stable). After `npm run audio`, check the seam again on the decoded file and move the loop points to the nearest upward zero crossings if they have drifted, in both `sounds.json` and `RUN_LOOP`. A test holds the two together. `npm run audio` re-encodes every file, so restore the ones you did not mean to change from git.

## What to listen for

Nobody has listened to these yet. When the owner does, check:

- `land`: the original clonk1 is clipped (flat at full scale for about 20 ms). Turning it down does not undo that, so it may sound harsh.
- `give-unbolt`: the clack is quiet in the original (peak -26 dBFS), so it is raised 18 dB. Hiss may be audible in its 50 ms tail.
- `turn`: the original is stereo with its two channels partly out of phase (correlation -0.32). Blender's mono mix loses some of the click.
- `fail`: picked from the waveform as the stretch after the last pull that sounds lower and more broken up than the pulls. It may not be a cough.
- `start` and `run`: picked from the waveforms. Check that the catch sounds like a start, that the crossfade into the idle is smooth, and that the 2.25 s idle loop does not sound repetitive or click. Both are a chainsaw, not a TG950.
- `seat`: the author recorded it on an iPhone. The noise floor is about -65 dB in the original, which is fine.

## How to change them

1. Put the original into `assets/audio/source/` (not committed; download it again from the URL in `sounds.json`).
2. In `assets/audio/sounds.json`, change the moment's row: `source` (the file name), `url`, `author`, `licence` (`CC0 1.0` or `own recording`), `fetched` (the date), `start` and `end` (seconds into the original, in steps of 0.01), `fadeIn`, `fadeOut` and `gainDb`.
3. Run `npm run audio`. Blender encodes each row to mono Ogg Opus at 48 kHz and 40 kbps. The check then keeps only the Opus stream, copies the files into `game/public/audio/` with a `LICENCE.md` written from `sounds.json`, and checks every file, the 250 KB budget and the licences.
4. Commit `game/public/audio/` and `sounds.json`, and update the table above.

Two things to know when setting gain. A stereo original comes out of Blender's mono mix about 6 dB louder than one channel, as if the channels were added. And the mix clips at full scale before encoding. So measure the encoded file, not the original.
