// Start screen (plan 0014 reading 1): today's fault or free play, with today's scored result once there is one.
// When today's fault cannot be offered, free play takes the main button. Nothing here says anything about the fault itself (ADR 0007).

import { el } from "./dom.ts";
import { type DailyView, dailyButtonText, todayResultText } from "./format.ts";
import { STRINGS } from "./strings.ts";

/** `daily` is null when today's fault cannot be offered; then only free play shows. */
export function startScreen(daily: DailyView | null, onDaily: () => void, onFree: () => void): HTMLElement {
  const free = el("button", { class: daily ? "free" : "primary free", type: "button", text: STRINGS.freePlay });
  free.addEventListener("click", onFree, { once: true });
  let dailyBtn: HTMLButtonElement | null = null;
  if (daily) {
    dailyBtn = el("button", { class: "primary daily", type: "button", text: dailyButtonText(daily) });
    dailyBtn.addEventListener("click", onDaily, { once: true });
  }
  const today = daily ? todayResultText(daily) : null;
  return el(
    "section",
    { class: "screen start", role: "dialog", "aria-label": STRINGS.title },
    el("h1", { text: STRINGS.title }),
    el("p", { class: "label", text: STRINGS.startLabel }),
    today ? el("p", { class: "today", text: today }) : null,
    dailyBtn,
    free,
  );
}
