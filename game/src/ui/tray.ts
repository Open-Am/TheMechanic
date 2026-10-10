// The parts tray: one chip per removed part. Tap a chip to open its card; drag it onto the machine to put it back.
// A refused put-back just returns the chip (ADR 0007).

import type { Game } from "../app/round.ts";
import type { PartId } from "../core/index.ts";
import type { Card } from "./card.ts";
import { el } from "./dom.ts";
import { STRINGS } from "./strings.ts";

/** Movement under this is a tap, CSS px (docs/design/interface.md). */
const TAP_SLOP = 8;

export interface Tray {
  refresh(): void;
}

/** `overMachine(x, y)` says whether a release point is over the machine rather than the controls. */
/** `partImage` returns a picture of a part for its chip, or null to show the name alone. */
export function createTray(
  host: HTMLElement,
  game: Game,
  card: Card,
  overMachine: (x: number, y: number) => boolean,
  partImage: (partId: PartId) => string | null,
): Tray {
  const list = el("ul", { class: "tray", "aria-label": "Tray" });
  const empty = el("p", { class: "tray-empty", text: STRINGS.trayEmpty });
  host.append(list, empty);

  function chip(partId: PartId): HTMLElement {
    const name = game.machine.parts.find((p) => p.id === partId)?.name ?? partId;
    const picture = () => {
      const src = partImage(partId);
      return src ? el("img", { src, alt: "", width: "32", height: "32", draggable: "false" }) : null;
    };
    const li = el("li", { class: "chip", role: "button", tabindex: "0", "data-part": partId }, picture(), el("span", { text: name }));
    let start: { x: number; y: number; id: number } | null = null;
    let ghost: HTMLElement | null = null;

    li.addEventListener("pointerdown", (e) => {
      li.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    li.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= TAP_SLOP) {
        ghost = el("div", { class: "chip ghost" }, picture(), el("span", { text: name }));
        document.body.appendChild(ghost);
        li.classList.add("lifted");
      }
      if (ghost) ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (ghost) {
        ghost.remove();
        ghost = null;
        li.classList.remove("lifted");
        if (!cancelled && overMachine(e.clientX, e.clientY)) game.propose({ type: "install", partId });
      } else if (!cancelled) {
        card.open(partId);
      }
    };
    li.addEventListener("pointerup", (e) => end(e, false));
    li.addEventListener("pointercancel", (e) => end(e, true));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") card.open(partId);
    });
    return li;
  }

  function refresh(): void {
    const tray = game.state.tray;
    // Keep existing chips (a drag may be in progress on one); add and remove only what changed.
    const have = new Map([...list.children].map((c) => [(c as HTMLElement).dataset.part!, c as HTMLElement]));
    for (const [id, node] of have) if (!tray.includes(id)) node.remove();
    for (const id of tray) if (!have.has(id)) list.appendChild(chip(id));
    empty.hidden = tray.length > 0 || !game.running;
  }

  refresh();
  return { refresh };
}
