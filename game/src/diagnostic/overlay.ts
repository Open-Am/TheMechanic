// Diagnostic overlay (ADR 0007, docs/design/diagnostic-mode.md). Development builds only, loaded by main.ts with ?diag.
// Reads app events and state; never changes game state.

import type { Game } from "../app/round.ts";
import { removableNow, type Refusal } from "../core/index.ts";

/** Searched for in the production build to prove this file is absent (plan 0003). */
export const DIAGNOSTIC_MARKER = "open-am-diagnostic-overlay";

export function mountDiagnostic(root: HTMLElement, game: Game): void {
  const panel = document.createElement("pre");
  panel.dataset.marker = DIAGNOSTIC_MARKER;
  panel.style.cssText =
    "position:fixed;top:4px;left:4px;z-index:100;margin:0;max-width:60vw;max-height:45vh;overflow:auto;" +
    "padding:6px 8px;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#cfe;background:rgb(0 0 0/.72);" +
    "border-radius:6px;pointer-events:auto;white-space:pre-wrap";
  root.appendChild(panel);

  let collapsed = false;
  let lastRefusal: Refusal | null = null;
  let fps = 0;
  let frames = 0;
  let since = performance.now();
  panel.addEventListener("click", () => {
    collapsed = !collapsed;
    draw();
  });

  game.events.on("refused", (r) => {
    lastRefusal = r;
    draw();
  });
  game.events.on("started", () => {
    lastRefusal = null;
    draw();
  });
  for (const name of ["removed", "installed", "inspected", "fixed", "pulled", "ended"] as const) game.events.on(name, draw);

  function draw(): void {
    if (collapsed) {
      panel.textContent = `diag ${fps} fps`;
      return;
    }
    const s = game.state;
    const refusal = lastRefusal
      ? `${lastRefusal.action.type} ${lastRefusal.action.partId ?? ""} -> ${lastRefusal.reason}${lastRefusal.parts ? ` [${lastRefusal.parts.join(", ")}]` : ""}`
      : "none";
    const log = game.log.map((a) => `${(a.t / 1000).toFixed(1)}s ${a.type} ${a.partId ?? ""}`).join("\n  ");
    panel.textContent = [
      `fps ${fps}  lighting ${document.documentElement.dataset.lighting ?? "-"}`,
      `fault ${game.faultId ?? "-"}  culprit ${game.culprit ?? "-"}  fixed ${s.fixed}`,
      `last refusal: ${refusal}`,
      `removable: ${removableNow(game.machine, s).join(", ") || "-"}`,
      `tray: ${s.tray.join(", ") || "-"}`,
      `log:\n  ${log || "-"}`,
    ].join("\n");
  }

  function tick(now: number): void {
    frames++;
    if (now - since >= 1000) {
      fps = Math.round((frames * 1000) / (now - since));
      frames = 0;
      since = now;
      draw();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  draw();
}
