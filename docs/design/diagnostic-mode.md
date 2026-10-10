# Diagnostic mode

Design note for Phase 2 (plan 0003). The rules are ADR 0007.

## Enabling

Development builds only. Open the dev server with `?diag` in the URL. `main.ts` loads the overlay with a dynamic import inside `if (import.meta.env.DEV && ...)`, so production builds contain none of it. There is no gesture.

## What it shows

A small translucent panel in the top-left corner, monospace, tappable to collapse.

- Fault ID and culprit.
- The last refusal: action, reason, and the parts named.
- Parts removable now (`removableNow`).
- Tray contents.
- The action log, newest last, with times in seconds.
- Frame rate, averaged over one second.

It listens to `app` events only; it never changes game state.
