# Open questions

Anything unverified or unclear. Add a line. Do not resolve by guessing. When one is settled, move the answer to an ADR or the data and delete the line here.

## Machine content (needs a mechanic)

See the checklist at the end of `reference/generator-reference-pack.md`. Nothing in `machine.json` or `faults.json` is verified.

## Owner decisions pending

- Git LFS quota: ADR 0012 puts `.blend` files and textures in Git LFS. The storage and bandwidth allowance on the GitHub plan for `Open-Am/TheMechanic` is not checked.
- Blender is not on PATH on the build machine (`C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`). ADR 0012 reads it from `BLENDER`; the owner sets that variable or adds the folder to PATH.
- The Phase 2 done-criterion needs a real phone on the local network. The owner does the real check; agents test in emulation.
- "Open Am" is a working title. It appears in share text and the page title.

## Raised during plan 0001

