// Entry point: the only file that imports every layer (ADR 0010). Loads the machine data, builds platform and app,
// mounts ui (start and briefing screens), then loads the model, environment and hand behind them with progress and
// mounts render (plan 0014 step 6). Diagnostic mode loads only in development builds with ?diag (ADR 0007).

import { dailyStatus } from "./app/daily.ts";
import { createGame } from "./app/round.ts";
import { dailyFaultId, dayNumber, validateAll, validateCustomers, type CustomerFile, type FaultFile, type Machine } from "./core/index.ts";
import { createAudio } from "./platform/local/audio.ts";
import { createClock } from "./platform/local/clock.ts";
import { createDailyProvider } from "./platform/local/daily.ts";
import { createScoreStore, safeStorage } from "./platform/local/scores.ts";
import { createShare, hasShareSheet } from "./platform/local/share.ts";
import { loadRenderAssets } from "./render/model.ts";
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
  const game = createGame({ ...data, clock, audio: createAudio(), random: Math.random, scores, ...(customers ? { customers } : {}) });

  // ui shows at once, before the model arrives. It gets the part pictures and the hand's carry as functions that wait
  // for render; it never imports render (ADR 0010). A round cannot start until render is mounted.
  let view: RenderView | null = null;
  const mounted = mountUi(ui, stage, game, {
    partImage: (id) => view?.partImage(id) ?? null,
    carry: { move: (id, x, y) => view?.carryChip(id, x, y), end: (id) => view?.endChipCarry(id) },
    daily: () => dailyStatus(daily, scores),
    share: { send: (text) => share.share(text), sheet: hasShareSheet(navigator), url: shareUrl(location.href, import.meta.env.BASE_URL) },
  });
  document.getElementById("boot")?.remove();

  // The model, its ground shadow, the environment and the hand load behind the start and briefing screens (ADR 0014).
  const assets = await loadRenderAssets(`${import.meta.env.BASE_URL}machines/${MACHINE_ID}/`, `${import.meta.env.BASE_URL}env/workshop.hdr`, `${import.meta.env.BASE_URL}hand/hand.glb`, mounted.setLoading);
  try {
    view = mountRender(stage, game, assets);
  } catch (e) {
    console.error(e);
    showCannotRun(root, "webgl");
    return;
  }
  mounted.ready();
  view.setTrayTest(mounted.overTray);
  view.onCarry(mounted.setDropState);
  mounted.onCover(view.setBottomCover);

  if (import.meta.env.DEV && new URLSearchParams(location.search).has("diag")) {
    const { mountDiagnostic } = await import("./diagnostic/overlay.ts");
    mountDiagnostic(root, game);
  }
}

void start();
