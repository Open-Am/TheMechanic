// Briefing screen: the customer's complaint and the symptom. The timer starts on "Start" (brief section 6).
// For today's fault it names the day, or says the round is practice (ADR 0005). While the machine still loads, Start
// is disabled under a progress bar (plan 0014 reading 10); the ui calls setBriefingLoading as files arrive.

import type { Briefing } from "../app/round.ts";
import { el } from "./dom.ts";
import { STRINGS, SYMPTOM_TEXT, TEMPLATES } from "./strings.ts";

/** `loading` is the share loaded so far (0 to 1), or null once the machine is ready. */
export function briefingScreen(b: Briefing, onStart: () => void, loading: number | null = null): HTMLElement {
  const start = el("button", { class: "primary begin", text: STRINGS.start, type: "button" });
  start.addEventListener("click", onStart, { once: true });
  const fill = el("div", { class: "fill" });
  const bar = el("div", { class: "progress loading", role: "progressbar", "aria-label": STRINGS.loadingLabel, "aria-valuemin": "0", "aria-valuemax": "100" }, fill);
  const daily = b.daily ? el("p", { class: "daily-label", text: b.daily.scored ? TEMPLATES.dailyDay(b.daily.day) : STRINGS.practiceLabel }) : null;
  const screen = el(
    "section",
    { class: "screen briefing", role: "dialog", "aria-label": STRINGS.briefingLabel },
    daily,
    el("p", { class: "label", text: b.customer ? TEMPLATES.customerSays(b.customer.name) : STRINGS.briefingLabel }),
    b.customer ? el("p", { class: "arrive", text: `“${b.customer.line}”` }) : null,
    el("blockquote", { class: "complaint", text: `“${b.complaint}”` }),
    el("p", { class: "label", text: STRINGS.symptomLabel }),
    el("p", { class: "symptom", text: SYMPTOM_TEXT[b.symptom] }),
    bar,
    start,
  );
  setBriefingLoading(screen, loading);
  return screen;
}

/** Shows how much has loaded; null removes the bar and enables Start. */
export function setBriefingLoading(screen: HTMLElement, loading: number | null): void {
  const start = screen.querySelector<HTMLButtonElement>("button.begin");
  const bar = screen.querySelector<HTMLElement>(".progress.loading");
  if (start) start.disabled = loading !== null;
  if (!bar) return;
  if (loading === null) {
    bar.remove();
    return;
  }
  const pct = Math.round(Math.max(0, Math.min(1, loading)) * 100);
  bar.setAttribute("aria-valuenow", String(pct));
  (bar.firstElementChild as HTMLElement | null)?.style.setProperty("width", `${pct}%`);
}
