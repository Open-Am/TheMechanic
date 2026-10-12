# Sound status (plan 0013, ADR 0018)

Updated 2026-10-11.

No sound ships yet. The owner has not chosen or downloaded the originals, so every moment is silent and `game/public/audio/` does not exist. The game plays the same without them (ADR 0023).

Candidates, two to four per moment, all CC0 1.0 on Freesound, are in `docs/reference/sound-shortlist.md`. Nobody has listened to them yet.

Every sound, once chosen, is a stand-in until the owner records the real machine (ADR 0018). The cord, the failed start and the engine start are to be replaced first.

| Moment | File | Chosen | Status |
| --- | --- | --- | --- |
| turn | turn.ogg | not yet | silent |
| give-unbolt | give-unbolt.ogg | not yet | silent |
| give-unclip | give-unclip.ogg | not yet | silent |
| give-pull | give-pull.ogg | not yet | silent |
| give-scrape | give-scrape.ogg | not yet | silent |
| land | land.ogg | not yet | silent |
| seat | seat.ogg | not yet | silent |
| cord | cord.ogg | not yet | silent |
| fail | fail.ogg | not yet | silent |
| start | start.ogg | not yet | silent |

## How to add them

1. Pick one sound per moment from the shortlist. Download the original from its Freesound page (this needs a sign-in) into `assets/audio/source/`. That folder is not committed.
2. In `assets/audio/sounds.json`, fill the moment's row: `source` (the file name), `url`, `author`, `licence` (`CC0 1.0`), `fetched` (the date), `start` and `end` (seconds into the original), `fadeIn`, `fadeOut` and `gainDb`.
3. Run `npm run audio`. Blender encodes each row to mono Ogg Opus at 48 kHz and 40 kbps. The check then keeps only the Opus stream, copies the files into `game/public/audio/` with a `LICENCE.md` written from `sounds.json`, and checks every file, the 250 KB budget and the licences. It fails until all ten files are there.
4. Commit `game/public/audio/` (the ten `.ogg` files and `LICENCE.md`) and `sounds.json`, and update the table above.

The pipeline was proved on 2026-10-11 with a synthetic click: Blender 4.5 in background mode wrote a mono Opus stream at 48 kHz, and Edge decoded the result as one channel of 0.12 s.
