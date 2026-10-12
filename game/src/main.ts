// Entry point: the only file that imports every layer (ADR 0010). Loads the machine data, builds platform and app,
// mounts ui (start and briefing screens), then loads the model, environment and hand behind them with progress and
// mounts render (plan 0014 step 6). Diagnostic mode loads only in development builds with ?diag (ADR 0007).
// Sound (plan 0013): the first tap unlocks audio, the files download once after the first Start (ADR 0023), app plays
// the moments of accepted actions and render's moments are passed to playMoment here (ADR 0010).

import { dailyStatus } from "./app/daily.ts";
import { MOMENTS, type Moment, playCue } from "./app/moments.ts";
import { createGame } from "./app/round.ts";
import { dailyFaultId, dayNumber, validateAll, validateCustomers, type CustomerFile, type FaultFile, type Machine } from "./core/index.ts";
import { browserContext, browserVibrate, createAudio, type LocalAudio } from "./platform/local/audio.ts";
import { createClock } from "./platform/local/clock.ts";
import { createDailyProvider } from "./platform/local/daily.ts";
import { createScoreStore, safeStorage } from "./platform/local/scores.ts";
import { createShare, hasShareSheet } from "./platform/local/share.ts";
import { createFlag, MUTED_KEY } from "./platform/local/storage.ts";
import { loadCustomer, loadRenderAssets } from "./render/model.ts";
import { mountRender, type RenderView } from "./render/view.ts";
import { shareUrl } from "./ui/format.ts";
import { mountUi, showCannotRun } from "./ui/index.ts";

const MACHINE_ID = "gen950";

async function loadMachine(id: string): Promise<{ machine: Machine; faults: FaultFile }> {
  const base = `${import.meta.env.BASE_URL}machines/${id}/`;
  const [m, f] = await Promise.all([fetch(`${base}machine.json`), fetch(`${base}faults.json`)]);
  if (!m.ok || !f.ok) throw new Error(`Could not load ${id}: ${m.status} ${f.status}`);
  return { machine: (await m.json()) as Machine, faults: (await f.json()) as FaultFile };
}

/** customers.json (ADR 0015). If it is missing or invalid the game still runs, without customers. */
async function loadCustomers(): Promise<CustomerFile | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}customers.json`);
    if (!r.ok) return null;
    const file = (await r.json()) as CustomerFile;
    const check = validateCustomers(file);
    for (const issue of check.issues) console.warn(issue.message);
    if (!check.ok) return null;
    // Development only: ?patience=5 gives every customer 5 seconds, to see a walk-out quickly.
    const forced = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("patience")) : NaN;
    if (forced > 0) for (const c of file.customers) c.patience = forced;
    return file;
  } catch (e) {
    console.warn("Customers could not be loaded; playing without them.", e);
    return null;
  }
}

/**
 * Downloads every moment's file once and hands it to the audio (plan 0013 reading 9). Nothing waits on it: a missing,
 * failed or undecodable file leaves its moment silent (ADR 0023), noted in one warning in development only.
 */
async function loadSounds(audio: LocalAudio): Promise<void> {
  const silent: string[] = [];
  await Promise.all(
    MOMENTS.map(async (m: Moment) => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}audio/${m}.ogg`);
        // The dev server answers a missing file with the page itself.
        if (!r.ok || (r.headers.get("content-type") ?? "").includes("text/html")) throw new Error("missing");
        if (!(await audio.load(m, await r.arrayBuffer()))) throw new Error("undecodable");
      } catch (e) {
        silent.push(`${m}.ogg (${e instanceof Error ? e.message : "failed"})`);
      }
    }),
  );
  if (import.meta.env.DEV && silent.length) console.warn(`Sound: ${silent.length} of ${MOMENTS.length} moments will be silent: ${silent.join(", ")}. See game/public/audio/LICENCE.md and plan 0013.`);
}

/**
 * Downloads a customer's file by look (plan 0015, ADR 0023). In development, ?nocustomer=<look> makes that look's file
 * missing and ?slowcustomer=<look>:<ms> delays it, for the browser check's fallback cases.
 */
function customerLoader(): (look: string) => ReturnType<typeof loadCustomer> {
  const q = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
  const missing = new Set(q?.getAll("nocustomer") ?? []);
  const slow = new Map((q?.getAll("slowcustomer") ?? []).map((v) => v.split(":") as [string, string]).map(([l, ms]) => [l, Number(ms) || 0] as const));
  return async (look) => {
    if (missing.has(look)) return null;
    const wait = slow.get(look);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return loadCustomer(`${import.meta.env.BASE_URL}customers/${look}.glb`);
  };
}

async function start(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const stage = document.createElement("div");
  stage.className = "stage";
  const ui = document.createElement("div");
  ui.className = "ui";
  root.append(stage, ui);

  let data: { machine: Machine; faults: FaultFile };
  try {
    data = await loadMachine(MACHINE_ID);
  } catch (e) {
    console.error(e);
    showCannotRun(root, "data");
    return;
  }
  const check = validateAll(data.machine, data.faults);
  for (const issue of check.issues) (issue.level === "error" ? console.error : console.warn)(issue.message);
  if (!check.ok) {
    showCannotRun(root, "data");
    return;
  }

  const customers = await loadCustomers();
  // Development only: ?today=2026-10-12T08:00:00Z sets the date, to see a day change in the browser.
  const forcedToday = import.meta.env.DEV ? new URLSearchParams(location.search).get("today") : null;
  const clock = forcedToday && !Number.isNaN(Date.parse(forcedToday)) ? createClock(() => performance.now(), () => new Date(forcedToday)) : createClock();
  // Scores live in the browser under one key, with a memory fallback when storage is blocked (ADR 0005, ADR 0022).
  const scores = createScoreStore(safeStorage());
  // The day and fault functions come from core and are injected, so platform imports none (ADR 0010).
  const faultList = data.faults.faults;
  const daily = createDailyProvider(clock, dayNumber, (d) => dailyFaultId(faultList, d));
  const share = createShare(navigator);
  // Sound and vibration (ADR 0018): on by default, the mute choice remembered under its own key.
  const muted = createFlag(safeStorage(), MUTED_KEY);
  const heard: Array<{ moment: Moment; audible: boolean; at: number }> = [];
  const loops: Array<{ moment: Moment; playing: boolean; audible: boolean; at: number }> = [];
  const audio = createAudio(
    {
      createContext: browserContext,
      vibrate: browserVibrate(navigator),
      ...(import.meta.env.DEV
        ? {
            onPlay: (moment: Moment, audible: boolean) => void heard.push({ moment, audible, at: Math.round(performance.now()) }),
            onLoop: (moment: Moment, playing: boolean, audible: boolean) => void loops.push({ moment, playing, audible, at: Math.round(performance.now()) }),
          }
        : {}),
    },
    muted.get(),
  );
  const game = createGame({ ...data, clock, audio, random: Math.random, scores, ...(customers ? { customers } : {}) });
  // Browsers start audio only inside a gesture. Start unlocks it: "arriving" is sent from inside its tap (ADR 0018). If
  // the browser still holds it back, every later tap or key tries again until the context runs. Nothing before Start.
  const unlock = (): void => {
    if (audio.contextState() === "running") {
      window.removeEventListener("click", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      return;
    }
    audio.unlock();
  };
  // The files download once, after the first Start (ADR 0023): never before, and not again on later rounds. Start's tap
  // sends "arriving" (plan 0017), so audio is unlocked inside the gesture.
  const stopLoading = game.events.on("arriving", () => {
    stopLoading();
    audio.unlock();
    window.addEventListener("click", unlock, true);
    window.addEventListener("keydown", unlock, true);
    void loadSounds(audio);
  });
  if (import.meta.env.DEV) {
    // Development only: what each moment asked for and whether it could be heard, for tools/verify (plan 0013 step 6).
    (window as unknown as Record<string, unknown>).__openAmDevAudio = {
      log: () => heard.map((h) => ({ ...h })),
      clear: () => void ((heard.length = 0), (loops.length = 0)),
      // ADR 0028: each loop start and stop, and the loop playing now.
      loops: () => loops.map((l) => ({ ...l })),
      looping: () => audio.looping(),
      state: () => audio.contextState(),
      loaded: () => audio.loaded(),
      muted: () => audio.muted(),
    };
  }

  // ui shows at once, before the model arrives. It gets the part pictures and the hand's carry as functions that wait
  // for render; it never imports render (ADR 0010). A round cannot start until render is mounted.
  let view: RenderView | null = null;
  const mounted = mountUi(ui, stage, game, {
    partImage: (id) => view?.partImage(id) ?? null,
    carry: { move: (id, x, y) => view?.carryChip(id, x, y), end: (id) => view?.endChipCarry(id), busy: () => view?.busy() ?? false },
    daily: () => dailyStatus(daily, scores),
    share: { send: (text) => share.share(text), sheet: hasShareSheet(navigator), url: shareUrl(location.href, import.meta.env.BASE_URL) },
    // ADR 0028: the engine runs while the customer pays and leaves, and winds down as the ending ends (a skip has
    // already cut it at once). Plan 0018 moves the stop to the switch press, through the same "run-stop" cue.
    ending: () => (view?.ending() ?? Promise.resolve()).then(() => playCue(audio, "run-stop")),
    sound: {
      muted: muted.get(),
      setMuted: (m) => {
        audio.setMuted(m);
        muted.set(m);
      },
    },
  });
  document.getElementById("boot")?.remove();

  // The model, its ground shadow, the environment, the hand, the tools and the toolbox load behind the start and briefing screens (ADR 0014).
  const assets = await loadRenderAssets(`${import.meta.env.BASE_URL}machines/${MACHINE_ID}/`, `${import.meta.env.BASE_URL}env/workshop.hdr`, `${import.meta.env.BASE_URL}hand/hand.glb`, `${import.meta.env.BASE_URL}hand/tools.glb`, `${import.meta.env.BASE_URL}hand/toolbox.glb`, `${import.meta.env.BASE_URL}scene/bench.glb`, mounted.setLoading);
  try {
    view = mountRender(stage, game, assets, customers ? customerLoader() : null);
  } catch (e) {
    console.error(e);
    showCannotRun(root, "webgl");
    return;
  }
  mounted.ready();
  view.setTrayTest(mounted.overTray);
  view.onCarry(mounted.setDropState);
  // render's moments and the engine cues ("run-start", "run-stop", "run-cut": ADR 0028) go to the audio here.
  view.onMoment((m) => playCue(audio, m));
  // Start pressed: the customer brings the generator; the clock starts when it lands (plan 0017 reading 1).
  game.events.on("arriving", () => (view ? view.playArrival(() => game.begin()) : game.begin()));
  mounted.onCover(view.setBottomCover);

  if (import.meta.env.DEV && new URLSearchParams(location.search).has("diag")) {
    const { mountDiagnostic } = await import("./diagnostic/overlay.ts");
    mountDiagnostic(root, game);
  }
}

void start();
