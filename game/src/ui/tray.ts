// The parts tray: one chip per removed part. Tap a chip to open its card; drag it onto the machine to put it back.
// A refused put-back just returns the chip (ADR 0007).

import type { Game } from "../app/round.ts";
import type { PartId } from "../core/index.ts";
import type { Card } from "./card.ts";
import { el } from "./dom.ts";
import { STRINGS } from "./strings.ts";

/** Movement under this is a tap, CSS px (docs/design/interface.md). */
const TAP_SLOP = 8;
/** How long chips glide to their new places when the tray re-flows, ms (release 0.15.1). */
const CHIP_GLIDE_MS = 180;

export interface Tray {
  refresh(): void;
}

/** Lets the hand carry a part from the tray (ADR 0020): told where a chip is being dragged, and when the drag ends. */
export interface ChipCarry {
  move(partId: PartId, x: number, y: number): void;
  end(partId: PartId): void;
  /** True while the hand plays a sequence (ADR 0021): a chip drag that starts then is ignored. */
  busy?(): boolean;
}

/** `overMachine(x, y)` says whether a release point is over the machine rather than the controls. */
/** `partImage` returns a picture of a part for its chip, or null to show the name alone. */
export function createTray(
  host: HTMLElement,
  game: Game,
  card: Card,
  overMachine: (x: number, y: number) => boolean,
  partImage: (partId: PartId) => string | null,
  carry: ChipCarry | null = null,
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
    /** Set when a drag starts while the hand is busy: the whole drag is ignored, and it is not a tap either. */
    let ignored = false;

    li.addEventListener("pointerdown", (e) => {
      li.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      ignored = false;
    });
    li.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (ignored) return;
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= TAP_SLOP) {
        if (carry?.busy?.()) {
          ignored = true;
          return;
        }
        ghost = el("div", { class: "chip ghost" }, picture(), el("span", { text: name }));
        // With the hand carrying the part itself, the ghost chip stays out of sight; it still marks the drag.
        if (carry) ghost.hidden = true;
        document.body.appendChild(ghost);
        li.classList.add("lifted");
      }
      if (ghost) {
        ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
        carry?.move(partId, e.clientX, e.clientY);
      }
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (ignored) return;
      if (ghost) {
        ghost.remove();
        ghost = null;
        li.classList.remove("lifted");
        if (!cancelled && overMachine(e.clientX, e.clientY)) game.propose({ type: "install", partId });
        carry?.end(partId);
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
    // Where each chip was, so the rows re-flow with a short glide instead of a jump (release 0.15.1).
    const before = new Map([...have].map(([id, node]) => [id, node.getBoundingClientRect()]));
    const added: HTMLElement[] = [];
    for (const [id, node] of have) if (!tray.includes(id)) node.remove();
    for (const id of tray) {
      if (have.has(id)) continue;
      const node = chip(id);
      list.appendChild(node);
      added.push(node);
    }
    empty.hidden = tray.length > 0 || !game.running;
    if (added.length === 0 && before.size === list.children.length) return;
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    for (const node of list.children as HTMLCollectionOf<HTMLElement>) {
      if (typeof node.animate !== "function" || node.classList.contains("lifted")) continue;
      const was = before.get(node.dataset.part!);
      if (was) {
        const now = node.getBoundingClientRect();
        const dx = was.left - now.left;
        const dy = was.top - now.top;
        if (dx !== 0 || dy !== 0) node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: CHIP_GLIDE_MS, easing: "ease-out" });
      } else if (added.includes(node)) {
        node.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }], { duration: CHIP_GLIDE_MS, easing: "ease-out" });
      }
    }
  }

  refresh();
  return { refresh };
}
