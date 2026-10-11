// Briefing screen: the customer's complaint and the symptom. The timer starts on "Start" (brief section 6).
// For today's fault it names the day, or says the round is practice (ADR 0005).

import type { Briefing } from "../app/round.ts";
import { el } from "./dom.ts";
import { STRINGS, SYMPTOM_TEXT, TEMPLATES } from "./strings.ts";

export function briefingScreen(b: Briefing, onStart: () => void): HTMLElement {
  const start = el("button", { class: "primary", text: STRINGS.start, type: "button" });
  start.addEventListener("click", onStart, { once: true });
  const daily = b.daily ? el("p", { class: "daily-label", text: b.daily.scored ? TEMPLATES.dailyDay(b.daily.day) : STRINGS.practiceLabel }) : null;
  return el(
    "section",
    { class: "screen briefing", role: "dialog", "aria-label": STRINGS.briefingLabel },
    daily,
    el("p", { class: "label", text: b.customer ? TEMPLATES.customerSays(b.customer.name) : STRINGS.briefingLabel }),
    b.customer ? el("p", { class: "arrive", text: `“${b.customer.line}”` }) : null,
    el("blockquote", { class: "complaint", text: `“${b.complaint}”` }),
    el("p", { class: "label", text: STRINGS.symptomLabel }),
    el("p", { class: "symptom", text: SYMPTOM_TEXT[b.symptom] }),
    start,
  );
}
