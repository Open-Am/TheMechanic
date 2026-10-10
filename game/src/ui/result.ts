// Result screen: score, its breakdown, stars, next customer. Share arrives with the daily in Phase 4.

import type { ScoreBreakdown } from "../core/index.ts";
import { el } from "./dom.ts";
import { formatTime, starText } from "./format.ts";
import { STRINGS } from "./strings.ts";

export function resultScreen(score: ScoreBreakdown, onNext: () => void): HTMLElement {
  const next = el("button", { class: "primary", text: STRINGS.nextCustomer, type: "button" });
  next.addEventListener("click", onNext, { once: true });
  const row = (label: string, value: string) => el("div", { class: "row" }, el("span", { text: label }), el("span", { text: value }));
  return el(
    "section",
    { class: "screen result", role: "dialog", "aria-label": STRINGS.resultTitle },
    el("h1", { text: STRINGS.resultTitle }),
    el("p", { class: "stars", text: starText(score.stars), "aria-label": `${score.stars} of 3` }),
    el(
      "div",
      { class: "breakdown" },
      row(STRINGS.time, formatTime(score.elapsedSeconds * 1000)),
      row(STRINGS.wrongParts, String(score.wrongParts)),
      row(STRINGS.failedPulls, String(score.failedPulls)),
      el("div", { class: "row total" }, el("span", { text: STRINGS.total }), el("span", { text: String(score.total) })),
    ),
    el("p", { class: "hint", text: STRINGS.scoreHint }),
    next,
  );
}
