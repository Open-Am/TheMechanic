// The interface: screens and widgets over the canvas. Listens to app events and proposes actions (ADR 0010).
// It never imports render; it only knows which element the machine is drawn in, to tell where a chip is dropped.

import type { Game } from "../app/round.ts";
import { briefingScreen } from "./briefing.ts";
import { createCard } from "./card.ts";
import { el } from "./dom.ts";
import { formatTime } from "./format.ts";
import { resultScreen } from "./result.ts";
import { STRINGS, SYMPTOM_TEXT } from "./strings.ts";
import { createTray } from "./tray.ts";
import "./styles.css";

/** How long the failed-pull banner shows, ms (docs/design/animation.md). */
const BANNER_MS = 3000;

export interface UiOptions {
  /** A picture of a part for its tray chip, or null. Supplied by main.ts. */
  partImage?: (partId: string) => string | null;
}

export function mountUi(root: HTMLElement, stage: HTMLElement, game: Game, options: UiOptions = {}): void {
  const timer = el("div", { class: "timer", "aria-live": "off", text: "0:00" });
  const banner = el("div", { class: "banner", role: "status", hidden: "" });
  const pull = el("button", { class: "pull", type: "button", text: STRINGS.pullCord });
  const trayHost = el("div", { class: "tray-host" });
  const controls = el("div", { class: "controls" }, banner, pull, trayHost);
  const hud = el("div", { class: "hud", hidden: "" }, timer, controls);
  const overlays = el("div", { class: "overlays" });
  root.append(hud, overlays);

  const card = createCard(overlays, game);
  const overMachine = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y);
    return hit !== null && stage.contains(hit);
  };
  const tray = createTray(trayHost, game, card, overMachine, options.partImage ?? (() => null));

  let symptomText = "";
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;

  function update(): void {
    tray.refresh();
    pull.disabled = !game.running || game.state.tray.length > 0;
  }

  function showScreen(screen: HTMLElement): void {
    overlays.querySelectorAll(".screen").forEach((s) => s.remove());
    overlays.appendChild(screen);
  }

  function newRound(): void {
    card.close();
    const b = game.newRound();
    symptomText = SYMPTOM_TEXT[b.symptom];
    hud.hidden = true;
    showScreen(briefingScreen(b, () => game.begin()));
  }

  pull.addEventListener("click", () => game.propose({ type: "pull" }));

  game.events.on("started", () => {
    overlays.querySelectorAll(".screen").forEach((s) => s.remove());
    hud.hidden = false;
    banner.hidden = true;
    update();
  });
  game.events.on("removed", update);
  game.events.on("installed", (e) => {
    if (card.partId === e.partId) card.close();
    update();
  });
  game.events.on("pulled", (e) => {
    if (e.started) return;
    banner.textContent = symptomText;
    banner.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (banner.hidden = true), BANNER_MS);
  });
  game.events.on("ended", (e) => {
    card.close();
    banner.hidden = true;
    update();
    setTimeout(() => {
      hud.hidden = true;
      showScreen(resultScreen(e.score, newRound));
    }, 900); // let the engine-start moment register first
  });

  function tick(): void {
    timer.textContent = formatTime(game.elapsed());
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  newRound();
}

export function showCannotRun(root: HTMLElement, reason: "webgl" | "data"): void {
  root.replaceChildren(
    el(
      "section",
      { class: "screen cannot-run" },
      el("h1", { text: STRINGS.cannotRunTitle }),
      el("p", { text: reason === "webgl" ? STRINGS.cannotRunWebgl : STRINGS.cannotRunData }),
    ),
  );
}
