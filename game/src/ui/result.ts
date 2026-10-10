// Result screen: score, its breakdown, stars, next customer. Share arrives with the daily in Phase 4.

import type { ScoreBreakdown } from "../core/index.ts";
import { el } from "./dom.ts";
import { formatTime, starText } from "./format.ts";
import { STRINGS, TEMPLATES } from "./strings.ts";

/** `customer` names who brought the machine and what they said at the end, when there is a customer. */
export function resultScreen(score: ScoreBreakdown, onNext: () => void, customer: { name: string; line: string | null } | null = null): HTMLElement {
  const walked = score.outcome === "walked";
  const title = walked && customer ? TEMPLATES.walkedTitle(customer.name) : STRINGS.resultTitle;
  const next = el("button", { class: "primary", text: STRINGS.nextCustomer, type: "button" });
  next.addEventListener("click", onNext, { once: true });
  const row = (label: string, value: string) => el("div", { class: "row" }, el("span", { text: label }), el("span", { text: value }));
  return el(
    "section",
    { class: walked ? "screen result walked" : "screen result", role: "dialog", "aria-label": title },
    el("h1", { text: title }),
    customer?.line ? el("p", { class: "arrive", text: `“${customer.line}”` }) : null,
    walked ? el("p", { class: "hint", text: STRINGS.walkedHint }) : el("p", { class: "stars", text: starText(score.stars), "aria-label": `${score.stars} of 3` }),
    el(
      "div",
      { class: "breakdown" },
      row(STRINGS.time, formatTime(score.elapsedSeconds * 1000)),
      row(STRINGS.wrongParts, String(score.wrongParts)),
      row(STRINGS.failedPulls, String(score.failedPulls)),
      // A walked round has no total: a quick walk-out would otherwise read as a good, low score.
      walked ? null : el("div", { class: "row total" }, el("span", { text: STRINGS.total }), el("span", { text: String(score.total) })),
    ),
    walked ? null : el("p", { class: "hint", text: STRINGS.scoreHint }),
    next,
  );
}
