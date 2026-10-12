// Result screen: score, its breakdown, stars, the best for this fault, Share for a fixed scored daily, next customer.

import type { RoundRecord } from "../app/round.ts";
import type { ScoreBreakdown } from "../core/index.ts";
import { el } from "./dom.ts";
import { formatTime, starText } from "./format.ts";
import { STRINGS, TEMPLATES } from "./strings.ts";

export type ShareRoute = "sheet" | "clipboard" | "none";

export interface ResultExtras {
  /** What was saved for this round, or null if nothing is known. */
  record: RoundRecord | null;
  /** Offered only for a scored daily that ended with the engine running (plan 0014 reading 8). */
  share: { text: string; send(text: string): Promise<ShareRoute>; sheet: boolean } | null;
}

/** `customer` names who brought the machine and what they said at the end, when there is a customer. */
export function resultScreen(
  score: ScoreBreakdown,
  onNext: () => void,
  customer: { name: string; line: string | null } | null = null,
  extras: ResultExtras = { record: null, share: null },
): HTMLElement {
  const walked = score.outcome === "walked";
  const title = walked && customer ? TEMPLATES.walkedTitle(customer.name) : STRINGS.resultTitle;
  const next = el("button", { class: "primary", text: STRINGS.nextCustomer, type: "button" });
  next.addEventListener("click", onNext, { once: true });
  const row = (label: string, value: string, cls = "row") => el("div", { class: cls }, el("span", { text: label }), el("span", { text: value }));
  const { record } = extras;
  const practice = record?.mode === "practice";
  const best = !practice && record && record.best !== null ? row(STRINGS.best, String(record.best), "row best") : null;
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
      walked ? null : row(STRINGS.total, String(score.total), "row total"),
      best,
    ),
    record?.newBest && !practice ? el("p", { class: "new-best", text: STRINGS.newBest }) : null,
    practice ? el("p", { class: "not-scored", text: STRINGS.notScored }) : null,
    walked ? null : el("p", { class: "hint", text: STRINGS.scoreHint }),
    extras.share ? shareBlock(extras.share) : null,
    next,
  );
}

/** The Share button, "Copied" after a clipboard copy, and the text to copy by hand when nothing else worked. */
function shareBlock(share: NonNullable<ResultExtras["share"]>): HTMLElement {
  const button = el("button", { class: "share", type: "button", text: STRINGS.share });
  const status = el("p", { class: "share-status", role: "status", hidden: "" });
  const block = el("div", { class: "share-block" }, button, status);
  let box: HTMLTextAreaElement | null = null;
  button.addEventListener("click", async () => {
    button.disabled = true;
    let route: ShareRoute = "none";
    try {
      route = await share.send(share.text);
    } catch {
      route = "none";
    }
    button.disabled = false;
    if (route === "clipboard") {
      status.textContent = STRINGS.copied;
      status.hidden = false;
    } else if (route === "none" && !share.sheet) {
      // No sheet and no clipboard: show the text, selected, to copy by hand (plan 0014 reading 9).
      if (!box) {
        box = el("textarea", { class: "share-text", readonly: "", rows: "3", "aria-label": STRINGS.copyByHand });
        box.value = share.text;
        status.textContent = STRINGS.copyByHand;
        status.hidden = false;
        block.appendChild(box);
      }
      box.focus();
      box.select();
    }
    // A "none" with a sheet is the player closing it: nothing else happens.
  });
  return block;
}
