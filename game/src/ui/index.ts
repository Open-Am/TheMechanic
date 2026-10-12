// The interface: screens and widgets over the canvas. Listens to app events and proposes actions (ADR 0010).
// It never imports render; it only knows which element the machine is drawn in, to tell where a chip is dropped.

import type { DailyStatus } from "../app/daily.ts";
import type { Game, RoundRecord } from "../app/round.ts";
import type { ScoreBreakdown } from "../core/index.ts";
import { briefingScreen, setBriefingLoading } from "./briefing.ts";
import { createCard } from "./card.ts";
import { el, speakerIcon } from "./dom.ts";
import { dropLine, dropTarget, formatTime, patienceMood, type ScreenRect, progressShare, shareOffered, shareText, soundButton } from "./format.ts";
import { type ResultExtras, type ShareRoute, resultScreen } from "./result.ts";
import { startScreen } from "./start.ts";
import { STRINGS, SYMPTOM_TEXT, TEMPLATES } from "./strings.ts";
import { type ChipCarry, createTray } from "./tray.ts";
import "./styles.css";

/** How long the failed-pull banner shows, ms (docs/design/animation.md). */
const BANNER_MS = 3000;
/** How long a customer's line shows, ms. */
const SPEECH_MS = 4000;
/** The longest the result screen waits for the round to be saved before showing without the best, ms. */
const RECORD_WAIT_MS = 1500;
/** The most the result screen waits for the customer's ending (plan 0017 reading 2), so a missing figure never blocks it. */
const ENDING_WAIT_MS = 4000;

export interface UiOptions {
  /** A picture of a part for its tray chip, or null. Supplied by main.ts. */
  partImage?: (partId: string) => string | null;
  /** The hand carries a part dragged from the tray (ADR 0020). Supplied by main.ts. */
  carry?: ChipCarry;
  /** Today's fault and whether its scored attempt is used (ADR 0005). Without it only free play is offered. */
  daily?: () => Promise<DailyStatus>;
  /** Sends the share text (ADR 0005). `sheet` is true when the phone has a share sheet; `url` is the page's link. */
  share?: { send(text: string): Promise<ShareRoute>; sheet: boolean; url: string };
  /** Sound and vibration on or off, remembered by main.ts (ADR 0018). Without it there is no mute button. */
  sound?: { muted: boolean; setMuted(muted: boolean): void };
  /** Settles when render's ending (pay and leave, or storm off) is over or skipped (plan 0017). Supplied by main.ts. */
  ending?: () => Promise<void>;
}

export interface Ui {
  /**
   * True if a carried part released with the finger at `finger` (CSS px) and its middle at `part` drops into the tray,
   * where it is removed (ADR 0020). `machine` is the generator's bounds on screen as drawn (release 0.15.1).
   */
  overTray(finger: { x: number; y: number }, part: { x: number; y: number } | null, machine: ScreenRect | null): boolean;
  /**
   * Shows where a carried part can be dropped: "carrying" lights the drop zone, the whole screen below the generator;
   * "over" brightens it while the part is in it or near enough to drop. Called on every move while carrying.
   */
  setDropState(state: "none" | "carrying" | "over", machine: ScreenRect | null): void;
  /**
   * Tells `fn` how many CSS px at the bottom of the screen the controls (pull cord and tray) cover, now and whenever it
   * changes, so the machine can be framed above them (release 0.9.3). 0 while the HUD is hidden.
   */
  onCover(fn: (px: number) => void): void;
  /** Loading progress of the model, environment and hand: files settled out of files requested (plan 0014 step 6). */
  setLoading(done: number, total: number): void;
  /** The scene is mounted: the briefing's Start is enabled. */
  ready(): void;
}

export function mountUi(root: HTMLElement, stage: HTMLElement, game: Game, options: UiOptions = {}): Ui {
  const timer = el("div", { class: "timer", "aria-live": "off", text: "0:00" });
  const meterFill = el("div", { class: "fill" });
  const meter = el("div", { class: "patience", role: "meter", "aria-label": STRINGS.patience, "aria-valuemin": "0", "aria-valuemax": "100" }, meterFill);
  const speech = el("div", { class: "speech", role: "status", hidden: "" });
  const banner = el("div", { class: "banner", role: "status", hidden: "" });
  const pull = el("button", { class: "pull", type: "button", text: STRINGS.pullCord });
  const trayHost = el("div", { class: "tray-host" });
  // While a part is carried, the drop zone: the whole screen from just below the generator down, over the controls
  // (release 0.15.1). It takes no touches; the canvas holds the carrying pointer.
  const dropLabel = el("div", { class: "drop-label", text: STRINGS.dropHere });
  const dropZone = el("div", { class: "drop-zone", hidden: "" }, dropLabel);
  const controls = el("div", { class: "controls" }, banner, pull, trayHost);
  const mute = options.sound ? muteButton(options.sound) : null;
  const hud = el("div", { class: "hud", hidden: "" }, timer, mute, meter, speech, controls, dropZone);
  const overlays = el("div", { class: "overlays" });
  root.append(hud, overlays);

  const card = createCard(overlays, game);
  const overMachine = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y);
    return hit !== null && stage.contains(hit);
  };
  const tray = createTray(trayHost, game, card, overMachine, options.partImage ?? (() => null), options.carry ?? null);

  // How much of the screen the controls cover: they grow a row at a time as chips pile up in the tray.
  let coverFn: ((px: number) => void) | null = null;
  let lastCover = -1;
  const tellCover = (): void => {
    const px = hud.hidden ? 0 : Math.max(0, Math.round(window.innerHeight - controls.getBoundingClientRect().top));
    if (px === lastCover) return;
    lastCover = px;
    coverFn?.(px);
  };
  new ResizeObserver(tellCover).observe(controls);
  window.addEventListener("resize", tellCover);

  let symptomText = "";
  /** Share loaded so far, or null once render is mounted. Start waits for it (plan 0014 reading 10). */
  let loading: number | null = 0;
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;
  let speechTimer: ReturnType<typeof setTimeout> | null = null;

  function say(line: string): void {
    const name = game.customerName;
    if (!name || !line) return;
    speech.textContent = TEMPLATES.speech(name, line);
    speech.hidden = false;
    if (speechTimer) clearTimeout(speechTimer);
    speechTimer = setTimeout(() => (speech.hidden = true), SPEECH_MS);
  }

  let carrying = false;
  function update(): void {
    tray.refresh();
    pull.disabled = carrying || !game.running || game.state.tray.length > 0;
  }

  function showScreen(screen: HTMLElement): void {
    overlays.querySelectorAll(".screen").forEach((s) => s.remove());
    overlays.appendChild(screen);
  }

  /** The start screen: today's fault or free play (plan 0014 reading 1). */
  async function showStart(): Promise<void> {
    card.close();
    hud.hidden = true;
    speech.hidden = true;
    const status = await readDaily();
    showScreen(startScreen(status, () => void playDaily(), () => newRound()));
  }

  async function readDaily(): Promise<DailyStatus | null> {
    if (!options.daily) return null;
    try {
      return await options.daily();
    } catch {
      return null;
    }
  }

  /** The day is fixed here, when the round is chosen (plan 0014 reading 3). */
  async function playDaily(): Promise<void> {
    const status = await readDaily();
    if (!status) return newRound();
    newRound({ day: status.day, faultId: status.faultId, scored: !status.attempted });
  }

  /** What the result screen shows besides the score: the best, and Share for a fixed scored daily. */
  async function extrasFor(score: ScoreBreakdown): Promise<ResultExtras> {
    const pending = game.recorded;
    let record: RoundRecord | null = null;
    if (pending) {
      const late = new Promise<null>((r) => setTimeout(() => r(null), RECORD_WAIT_MS));
      record = await Promise.race([pending, late]);
    }
    const share = options.share;
    const offered = record !== null && record.day !== null && share !== undefined && shareOffered(record.mode, score.outcome);
    return { record, share: offered ? { text: shareText(record!.day!, score, share!.url), send: share!.send, sheet: share!.sheet } : null };
  }

  function newRound(choice?: Parameters<Game["newRound"]>[0]): void {
    card.close();
    const b = game.newRound(choice);
    symptomText = SYMPTOM_TEXT[b.symptom];
    hud.hidden = true;
    meter.hidden = b.customer === null;
    speech.hidden = true;
    showScreen(briefingScreen(b, () => game.arrive(), loading));
  }

  pull.addEventListener("click", () => game.propose({ type: "pull" }));

  // Start pressed: the HUD shows at 0:00 while the customer brings the generator (plan 0017); the clock starts when it
  // lands ("started").
  game.events.on("arriving", () => {
    overlays.querySelectorAll(".screen").forEach((s) => s.remove());
    hud.hidden = false;
    banner.hidden = true;
    trayHost.hidden = false;
    update();
  });
  game.events.on("started", () => {
    overlays.querySelectorAll(".screen").forEach((s) => s.remove());
    hud.hidden = false;
    banner.hidden = true;
    trayHost.hidden = false;
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
  game.events.on("patience", (e) => say(e.line));
  game.events.on("ended", (e) => {
    card.close();
    banner.hidden = true;
    update();
    const name = game.customerName;
    const extras = extrasFor(e.score);
    // The result waits for the ending (the customer pays and leaves, plan 0017) or its skip, never less than the
    // engine-start moment and never more than ENDING_WAIT_MS.
    void afterEnding(900).then(() =>
      extras.then((x) => {
        hud.hidden = true;
        showScreen(resultScreen(e.score, () => void showStart(), name ? { name, line: e.line } : null, x));
      }),
    );
  });
  game.events.on("left", (e) => {
    card.close();
    banner.hidden = true;
    update();
    say(e.line);
    // They take the whole generator: the parts snap back on (render), and the tray empties (plan 0017 reading 3).
    trayHost.hidden = true;
    const name = game.customerName ?? "";
    const extras = extrasFor(e.score);
    void afterEnding(1600).then(() =>
      extras.then((x) => {
        hud.hidden = true;
        showScreen(resultScreen(e.score, () => void showStart(), { name, line: e.line }, x));
      }),
    ); // never less than long enough to read what they said as they leave
  });

  /** At least `least` ms, then the ending (render's, or at once), and never more than ENDING_WAIT_MS in all. */
  function afterEnding(least: number): Promise<void> {
    const ending = options.ending ? options.ending() : Promise.resolve();
    const min = new Promise<void>((r) => setTimeout(r, least));
    const cap = new Promise<void>((r) => setTimeout(r, ENDING_WAIT_MS));
    return Promise.race([Promise.all([ending, min]).then(() => undefined), cap]);
  }

  function tick(): void {
    game.tick();
    timer.textContent = formatTime(game.elapsed());
    const share = game.patience();
    meterFill.style.width = `${Math.round(share * 100)}%`;
    meter.dataset.mood = patienceMood(share);
    meter.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  void showStart();

  return {
    overTray(finger, part, machine) {
      if (hud.hidden) return false;
      return dropTarget(finger, machine, { width: window.innerWidth, height: window.innerHeight }, controls.getBoundingClientRect(), part) === "tray";
    },
    setDropState(state, machine) {
      const on = state !== "none";
      controls.classList.toggle("carrying", on);
      dropZone.classList.toggle("over", state === "over");
      dropZone.hidden = !on;
      if (on) dropZone.style.top = `${Math.max(0, Math.round(dropLine(machine, controls.getBoundingClientRect())))}px`;
      if (on !== carrying) {
        carrying = on;
        pull.disabled = carrying || !game.running || game.state.tray.length > 0;
      }
    },
    setLoading(done, total) {
      if (loading === null) return;
      loading = progressShare(done, total);
      overlays.querySelectorAll<HTMLElement>(".briefing").forEach((s) => setBriefingLoading(s, loading));
    },
    ready() {
      loading = null;
      overlays.querySelectorAll<HTMLElement>(".briefing").forEach((s) => setBriefingLoading(s, null));
    },
    onCover(fn) {
      coverFn = fn;
      lastCover = -1;
      tellCover();
    },
  };
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

/** The mute button at the top right of the working screen (plan 0013 step 7): sound and vibration off or on. */
function muteButton(sound: { muted: boolean; setMuted(muted: boolean): void }): HTMLButtonElement {
  const button = el("button", { class: "mute", type: "button" });
  let muted = sound.muted;
  const show = () => {
    const s = soundButton(muted);
    button.setAttribute("aria-label", s.label);
    button.setAttribute("aria-pressed", s.pressed);
    button.replaceChildren(speakerIcon(muted));
  };
  button.addEventListener("click", () => {
    muted = !muted;
    sound.setMuted(muted);
    show();
  });
  show();
  return button;
}
