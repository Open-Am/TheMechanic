// Entry point: the only file that imports every layer (ADR 0010). Loads the machine folder, builds platform and app,
// mounts render and ui, and loads diagnostic mode only in development builds with ?diag (ADR 0007).

import { createGame } from "./app/round.ts";
import { validateAll, validateCustomers, type CustomerFile, type FaultFile, type Machine } from "./core/index.ts";
import { createAudio } from "./platform/local/audio.ts";
import { createClock } from "./platform/local/clock.ts";
import { loadRenderAssets } from "./render/model.ts";
import { mountRender } from "./render/view.ts";
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
  const game = createGame({ ...data, clock: createClock(), audio: createAudio(), random: Math.random, ...(customers ? { customers } : {}) });

  // The model, its ground shadow and the environment come with the machine folder; nothing is fetched later (ADR 0010).
  const assets = await loadRenderAssets(`${import.meta.env.BASE_URL}machines/${MACHINE_ID}/`, `${import.meta.env.BASE_URL}env/workshop.hdr`, `${import.meta.env.BASE_URL}hand/hand.glb`);
  let view;
  try {
    view = mountRender(stage, game, assets);
  } catch (e) {
    console.error(e);
    showCannotRun(root, "webgl");
    return;
  }
  // ui gets the part pictures and the hand's carry as functions; it never imports render (ADR 0010).
  const mounted = mountUi(ui, stage, game, { partImage: view.partImage, carry: { move: view.carryChip, end: view.endChipCarry } });
  view.setTrayTest(mounted.overTray);
  view.onCarry(mounted.setDropState);
  mounted.onCover(view.setBottomCover);

  if (import.meta.env.DEV && new URLSearchParams(location.search).has("diag")) {
    const { mountDiagnostic } = await import("./diagnostic/overlay.ts");
    mountDiagnostic(root, game);
  }
}

void start();
