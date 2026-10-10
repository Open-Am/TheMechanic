// Entry point: the only file that imports every layer (ADR 0010). Loads the machine folder, builds platform and app,
// mounts render and ui, and loads diagnostic mode only in development builds with ?diag (ADR 0007).

import { createGame } from "./app/round.ts";
import { validateAll, type FaultFile, type Machine } from "./core/index.ts";
import { createAudio } from "./platform/local/audio.ts";
import { createClock } from "./platform/local/clock.ts";
import { mountRender } from "./render/view.ts";
import { mountUi, showCannotRun } from "./ui/index.ts";

const MACHINE_ID = "gen950";

async function loadMachine(id: string): Promise<{ machine: Machine; faults: FaultFile }> {
  const base = `${import.meta.env.BASE_URL}machines/${id}/`;
  const [m, f] = await Promise.all([fetch(`${base}machine.json`), fetch(`${base}faults.json`)]);
  if (!m.ok || !f.ok) throw new Error(`Could not load ${id}: ${m.status} ${f.status}`);
  return { machine: (await m.json()) as Machine, faults: (await f.json()) as FaultFile };
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

  const game = createGame({ ...data, clock: createClock(), audio: createAudio(), random: Math.random });

  let view;
  try {
    view = mountRender(stage, game);
  } catch (e) {
    console.error(e);
    showCannotRun(root, "webgl");
    return;
  }
  // ui gets the part pictures as a function; it never imports render (ADR 0010).
  mountUi(ui, stage, game, { partImage: view.partImage });

  if (import.meta.env.DEV && new URLSearchParams(location.search).has("diag")) {
    const { mountDiagnostic } = await import("./diagnostic/overlay.ts");
    mountDiagnostic(root, game);
  }
}

void start();
