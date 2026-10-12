// The Check sheet and the notes (ADR 0029, docs/design/interface.md). The Check button beside Pull cord opens a list of
// the six checks with their cost. A check that cannot be done now is greyed with what it needs, in words about what the
// player can see; one already done shows its result. Doing a check shows its result on the card; the notes list every
// result of the round, in order, and can be reopened. Results come only from game.resultOf and game.notes.

import type { Game } from "../app/round.ts";
import type { CheckId } from "../core/index.ts";
import type { Card } from "./card.ts";
import { el } from "./dom.ts";
import { needsText } from "./format.ts";
import { CHECK_NAMES, STRINGS, TEMPLATES } from "./strings.ts";

export interface Checks {
  /** Opens the list of checks. */
  open(): void;
  /** Opens the round's notes. */
  openNotes(): void;
  close(): void;
  /** Redraws the open sheet after the machine or the round changed. */
  refresh(): void;
  readonly isOpen: boolean;
}

export function createChecks(host: HTMLElement, game: Game, card: Card): Checks {
  let sheet: HTMLElement | null = null;
  let view: "list" | "notes" = "list";

  function close(): void {
    sheet?.remove();
    sheet = null;
  }

  function frame(title: string, ...children: Array<Node | null>): void {
    sheet?.remove();
    const closeBtn = el("button", { class: "close", type: "button", "aria-label": STRINGS.close, text: "×" });
    closeBtn.addEventListener("click", close);
    const backdrop = el("div", { class: "backdrop" });
    backdrop.addEventListener("click", close);
    const body = el("div", { class: `sheet checks-sheet ${view}`, role: "dialog", "aria-label": title }, closeBtn, el("h2", { text: title }), ...children);
    sheet = el("div", { class: "card checks" }, backdrop, body);
    host.appendChild(sheet);
  }

  function notesButton(): HTMLElement {
    const n = game.notes().length;
    const b = el("button", { class: "notes-open", type: "button", text: TEMPLATES.notesCount(n) });
    b.addEventListener("click", () => {
      card.close();
      openNotes();
    });
    return b;
  }

  function showResult(id: CheckId): void {
    close();
    card.openResult(CHECK_NAMES[id], game.resultOf(id) ?? "", notesButton());
  }

  function row(c: ReturnType<Game["checks"]>[number]): HTMLElement {
    const note =
      c.status === "done" ? (c.result ?? "") : c.status === "needs" && c.needs ? needsText(game.machine, c.needs) : c.status === "fixed" ? STRINGS.checkFixed : "";
    const button = el(
      "button",
      { class: `check-row ${c.status}`, type: "button", "data-check": c.id, "data-status": c.status },
      el("span", { class: "check-name", text: CHECK_NAMES[c.id] }),
      el("span", { class: "check-cost", text: TEMPLATES.seconds(c.seconds) }),
      note ? el("span", { class: "check-note", text: note }) : null,
    );
    if (c.status === "possible") {
      button.addEventListener("click", () => {
        if (game.propose({ type: "check", checkId: c.id })) showResult(c.id);
        else refresh();
      });
    } else if (c.status === "done") {
      button.addEventListener("click", () => showResult(c.id)); // shows the result again; never checks twice
    } else {
      button.disabled = true;
    }
    return el("li", {}, button);
  }

  function drawList(): void {
    view = "list";
    frame(STRINGS.checksTitle, el("p", { class: "does", text: STRINGS.checksHint }), el("ul", { class: "check-list" }, ...game.checks().map(row)), notesButton());
  }

  function drawNotes(): void {
    view = "notes";
    const notes = game.notes();
    const back = el("button", { class: "notes-back", type: "button", text: STRINGS.back });
    back.addEventListener("click", drawList);
    const list = notes.length
      ? el("ul", { class: "notes-list" }, ...notes.map((n) => el("li", {}, el("span", { class: "check-name", text: CHECK_NAMES[n.checkId] }), el("span", { class: "check-note", text: n.text }))))
      : el("p", { class: "does", text: STRINGS.notesEmpty });
    frame(STRINGS.notesTitle, list, back);
  }

  function openNotes(): void {
    card.close();
    drawNotes();
  }

  function refresh(): void {
    if (!sheet) return;
    if (view === "list") drawList();
    else drawNotes();
  }

  return {
    open() {
      card.close();
      drawList();
    },
    openNotes,
    close,
    refresh,
    get isOpen() {
      return sheet !== null;
    },
  };
}
