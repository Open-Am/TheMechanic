// The tray card: name, what it does, condition, and Fix for the unfixed culprit (docs/design/interface.md).
// Condition text comes only from game.conditionOf (ADR 0010).

import type { Game } from "../app/round.ts";
import type { PartId } from "../core/index.ts";
import { el } from "./dom.ts";
import { STRINGS } from "./strings.ts";

/** How long a fix takes on the running clock, ms (plan 0003). */
export const FIX_MS = 2000;

export interface Card {
  open(partId: PartId): void;
  close(): void;
  readonly partId: PartId | null;
}

export function createCard(host: HTMLElement, game: Game): Card {
  let current: PartId | null = null;
  let sheet: HTMLElement | null = null;
  let fixTimer: ReturnType<typeof setTimeout> | null = null;

  function close(): void {
    if (fixTimer) clearTimeout(fixTimer);
    fixTimer = null;
    sheet?.remove();
    sheet = null;
    current = null;
  }

  function render(partId: PartId): void {
    const part = game.machine.parts.find((p) => p.id === partId);
    if (!part) return;
    sheet?.remove();
    const closeBtn = el("button", { class: "close", type: "button", "aria-label": STRINGS.close, text: "×" });
    closeBtn.addEventListener("click", close);
    const backdrop = el("div", { class: "backdrop" });
    backdrop.addEventListener("click", () => {
      if (!fixTimer) close();
    });
    const body = el(
      "div",
      { class: "sheet", role: "dialog", "aria-label": part.name },
      closeBtn,
      el("h2", { text: part.name }),
      el("p", { class: "does", text: part.does }),
      el("p", { class: "label", text: STRINGS.conditionLabel }),
      el("p", { class: "condition", text: game.conditionOf(partId) ?? "" }),
    );
    const fix = game.fixLabel(partId);
    if (fix) {
      const btn = el("button", { class: "primary", type: "button", text: fix });
      const bar = el("div", { class: "progress" }, el("div", { class: "fill" }));
      btn.addEventListener("click", () => {
        btn.disabled = true;
        closeBtn.disabled = true;
        btn.textContent = STRINGS.fixing;
        body.appendChild(bar);
        bar.style.setProperty("--fix-ms", `${FIX_MS}ms`);
        requestAnimationFrame(() => bar.classList.add("run"));
        fixTimer = setTimeout(() => {
          fixTimer = null;
          game.propose({ type: "fix", partId });
          if (current === partId) render(partId);
        }, FIX_MS);
      });
      body.appendChild(btn);
    }
    sheet = el("div", { class: "card" }, backdrop, body);
    host.appendChild(sheet);
  }

  return {
    open(partId) {
      if (fixTimer) return; // finish the fix first
      if (!game.propose({ type: "inspect", partId })) return;
      current = partId;
      render(partId);
    },
    close,
    get partId() {
      return current;
    },
  };
}
