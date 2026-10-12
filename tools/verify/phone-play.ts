// Browser check for plan 0003: plays every fault in a Chromium browser at phone size, using real pointer gestures.
// No dependencies: drives Edge or Chrome over the DevTools protocol with Node's own fetch and WebSocket.
//
//   node tools/verify/phone-play.ts [--out <dir>] [--browser <path>] [--lighting fallback]
//   OPEN_AM_PORT=5299 OPEN_AM_DEBUG_PORT=9433 run it beside another copy (defaults 5199 and 9333). The browser profile is a
//   fresh temporary folder on every run.
//
// Starts the Vite dev server, opens the game with ?diag, takes each part off (double tap, then drag to the tray), fixes the culprit, drags the
// chips back, pulls the cord, and repeats with "Next customer" and "Free play" until all six faults are solved. Saves
// screenshots, reports console errors and fails below 30 fps at 4x CPU throttle (ADR 0014). Plan 0014 adds: the loading
// bar with Start disabled, today's fault scored once then practice, Share text on the clipboard, a daily left mid-round
// reading "Not finished" (ADR 0024), the next day's daily, and a round with localStorage throwing. Plan 0013 adds sound
// and vibration: nothing fetched before Start, the moments each action fires (read from a dev hook, so it works with no
// sound files), the vibrations, a blocked part and the walk-out silent, and mute kept over a reload. Plan 0016 adds the
// workbench: the bench under the machine, the generator's share of the width at both phone sizes, a customer's head
// line under the timer, a sideways drag turning the machine and not the camera, and the toolbox on the bench's left end.
// Exits 1 on any failure.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { removalOrder } from "../../game/src/core/rules.ts";
import type { FaultFile, Machine, ScoreBreakdown } from "../../game/src/core/types.ts";
import { shareText } from "../../game/src/ui/format.ts";
import { SILENT_AUDIO_SOURCE } from "./silent-audio.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const outDir = arg("--out") ?? join(tmpdir(), "open-am-phone-play");
mkdirSync(outDir, { recursive: true });
const browserPath =
  arg("--browser") ??
  [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
  ].find((p) => existsSync(p));
if (!browserPath) {
  console.error("No Chromium-based browser found. Pass --browser <path>.");
  process.exit(1);
}

const machineDir = join(root, "game", "public", "machines", "gen950");
const machine = JSON.parse(readFileSync(join(machineDir, "machine.json"), "utf8")) as Machine;
const faultFile = JSON.parse(readFileSync(join(machineDir, "faults.json"), "utf8")) as FaultFile;

/** Ports, overridable so two copies of a check can run at once: OPEN_AM_PORT (Vite) and OPEN_AM_DEBUG_PORT (DevTools). */
const PORT = Number(process.env.OPEN_AM_PORT) || 5199;
const DEBUG_PORT = Number(process.env.OPEN_AM_DEBUG_PORT) || 9333;
const VIEWPORT = { width: 390, height: 844 };
/** The frame-rate budget at 4x CPU throttle (ADR 0014). Below it, or unread, the run fails (plan 0014). */
const FPS_BUDGET = Number(process.env.OPEN_AM_FPS_BUDGET) || 30;
/**
 * A camera drag on empty background, clear of the diagnostic panel in the top-left corner: the same 80 by 20 px drag as
 * before, started higher. Since 0.9.3 frames the machine higher, the old start (290, 300) landed on the tank, so the
 * retry drag took hold of the machine instead of turning the camera, and a part could stay out of view through every
 * retry (0.9.4).
 */
const ROTATE = { x0: 290, y0: 150, x1: 370, y1: 170 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const children: ChildProcess[] = [];
const failures: string[] = [];
const consoleErrors: string[] = [];

/** Stops the dev server and the browser with all its child processes (on Windows a plain kill leaves Edge's helpers running). */
function cleanup(): void {
  for (const c of children) {
    if (c.exitCode !== null || c.pid === undefined) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill();
  }
}
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => process.exit(130));

async function waitFor<T>(what: string, fn: () => Promise<T | null | undefined | false>, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v as T;
    } catch {
      // not ready yet
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// ---- Dev server and browser ----

const vite = spawn(process.execPath, [join(root, "game", "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"], {
  cwd: join(root, "game"),
  stdio: "ignore",
});
children.push(vite);
const lightingArg = arg("--lighting");
const url = `http://localhost:${PORT}/?diag${lightingArg ? `&lighting=${encodeURIComponent(lightingArg)}` : ""}`;
await waitFor("the dev server", async () => (await fetch(`http://localhost:${PORT}/`)).ok, 30000);

const profile = mkdtempSync(join(tmpdir(), "open-am-browser-"));
const browser = spawn(
  browserPath,
  ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--enable-unsafe-swiftshader", "about:blank"],
  { stdio: "ignore" },
);
children.push(browser);
const target = await waitFor("the browser", async () => {
  const list = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
  return list.find((t) => t.type === "page");
});

// ---- DevTools protocol ----

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
let nextId = 1;
/** Requests held back by the Fetch domain, to see the loading screen before the model arrives. */
const heldRequests: string[] = [];
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
ws.onmessage = (msg) => {
  const data = JSON.parse(String(msg.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> };
  if (data.id !== undefined) {
    const p = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) p?.reject(new Error(data.error.message));
    else p?.resolve(data.result);
    return;
  }
  const params = data.params ?? {};
  if (data.method === "Fetch.requestPaused") heldRequests.push(String(params.requestId));
  if (data.method === "Runtime.consoleAPICalled" && params.type === "error") {
    consoleErrors.push((params.args as Array<{ value?: unknown; description?: string }>).map((a) => a.value ?? a.description).join(" "));
  }
  if (data.method === "Runtime.exceptionThrown") {
    const d = params.exceptionDetails as { text: string; exception?: { description?: string } };
    consoleErrors.push(d.exception?.description ?? d.text);
  }
  if (data.method === "Log.entryAdded") {
    const e = params.entry as { level: string; text: string; url?: string };
    if (e.level === "error") consoleErrors.push(`${e.text} ${e.url ?? ""}`.trim());
  }
};
function send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
}
async function evaluate<T>(expression: string): Promise<T> {
  const r = await send<{ result: { value: T }; exceptionDetails?: { text: string } }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text}: ${expression}`);
  return r.result.value;
}
async function screenshot(name: string): Promise<void> {
  const r = await send<{ data: string }>("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  console.log(`   screenshot ${file}`);
}

// ---- Pointer gestures (mouse pointer events; the game treats every pointer type the same) ----

async function mouse(type: "mousePressed" | "mouseMoved" | "mouseReleased", x: number, y: number, pressed: boolean): Promise<void> {
  await send("Input.dispatchMouseEvent", { type, x, y, button: pressed || type !== "mouseMoved" ? "left" : "none", buttons: pressed ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1 });
}
async function drag(x0: number, y0: number, x1: number, y1: number, steps = 10): Promise<void> {
  await mouse("mousePressed", x0, y0, true);
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, true);
    await sleep(16);
  }
  await mouse("mouseReleased", x1, y1, false);
}
async function tapAt(x: number, y: number): Promise<void> {
  await mouse("mousePressed", x, y, true);
  await sleep(30);
  await mouse("mouseReleased", x, y, false);
}
async function tapSelector(selector: string): Promise<void> {
  const r = await waitFor(selector, () =>
    evaluate<{ x: number; y: number } | null>(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    ),
  );
  await tapAt(r.x, r.y);
}

// ---- Game state from the page ----

const idle = () => waitFor("animations to finish", () => evaluate<boolean>("!window.__openAmDevRender.busy()"));
const diag = () => evaluate<string>(`document.querySelector('[data-marker="open-am-diagnostic-overlay"]')?.textContent ?? ""`);
/** Share of opaque pixels in a tray chip picture: 0 means missing or blank. */
const chipPictureFill = (id: string) =>
  evaluate<number>(
    `(() => { const img = document.querySelector(${JSON.stringify(`.tray [data-part="${id}"] img`)}); if (!img || !img.naturalWidth) return 0; const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n / (d.length / 4); })()`,
  );
const trayHas = (id: string) => evaluate<boolean>(`!!document.querySelector('.tray [data-part="${id}"]')`);

type Probe = { x: number; y: number; dir: { x: number; y: number; headOn: boolean } };
type HandState = { visible: boolean; closed: number; action: string; holding: string | null } | null;
const probe = (id: string) => evaluate<Probe | null>(`window.__openAmDevRender.probe(${JSON.stringify(id)})`);
const looseNow = () => evaluate<string[]>("window.__openAmDevRender.loose()");
const handNow = () => evaluate<HandState>("window.__openAmDevRender.hand()");
/** The view (plan 0016): the machine's turn on the bench, the camera's rise, where the camera stands. */
type StageNow = { yaw: number; lift: number; zoom: number; eye: [number, number, number]; pitch: number; framing: { widthShare: number; headPx: number; bottomPx: number; distance: number; pitch: number } };
const stageNow = () => evaluate<StageNow>("window.__openAmDevRender.stage()");
const trayAt = () =>
  evaluate<{ x: number; y: number }>(`(() => { const r = document.querySelector('.tray-host').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
async function doubleTap(x: number, y: number): Promise<void> {
  await tapAt(x, y);
  await sleep(70);
  await tapAt(x, y);
}
async function pressKey(key: string): Promise<void> {
  const code = `Key${key.toUpperCase()}`;
  const vk = key.toUpperCase().charCodeAt(0);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, text: key, windowsVirtualKeyCode: vk });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
}

/** Carries a loose part from (x, y) to (tx, ty) with the button held, watching the hand on the way. */
async function carryTo(id: string, x: number, y: number, tx: number, ty: number): Promise<void> {
  await mouse("mousePressed", x, y, true);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", x + ((tx - x) * i) / steps, y + ((ty - y) * i) / steps, true);
    await sleep(16);
    if (i === 3) await noteHidden(`starting to carry ${id}`);
    if (i === 14) {
      const h = await handNow();
      if (h && h.holding === id && h.closed > 0.5) {
        if (handSeen === null) {
          handSeen = true;
          await screenshot("7-hand-carrying");
        }
        if (pinchSeen === null && PINCHED.has(id) && h.action === "pinch") {
          pinchSeen = true;
          await screenshot("10-hand-pinching");
        }
      }
    }
  }
  await mouse("mouseReleased", tx, ty, false);
}

/** Removes a part as a player does (ADR 0020): double tap to loosen it, then drag it to the tray. */
async function pullOff(id: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await idle();
    const p = await probe(id);
    if (p) {
      await doubleTap(p.x, p.y);
      // Plan 0011: a part held on by fasteners is undone with the right tool, fastener by fastener. Watch the tool in
      // the hand through the whole loosening, not at one moment.
      const count = FASTENED.get(id) ?? 0;
      // Plan 0012: such a part first sends the hand to the toolbox. The hand-inside-the-machine sample is taken where
      // the hand works on the part (the first fastener), as it was before the trip; on the legs to and from the
      // toolbox the check is that the hand's path stays out of the machine's bounds (over it, not through it).
      if (count === 0) {
        await sleep(350);
        await noteHidden(`loosening ${id}`);
      }
      let sampled = count === 0;
      const used = new Set<string>();
      toolsUsed.set(id, used);
      let isLoose = false;
      for (const end = Date.now() + 6000; Date.now() < end; ) {
        if ((await looseNow()).includes(id)) {
          isLoose = true;
          break;
        }
        const phase = await evaluate<string | null>("window.__openAmDevRender.trip()");
        if (!sampled && phase === "fasten") {
          sampled = true;
          await noteHidden(`loosening ${id}`);
        }
        const tool = await evaluate<string | null>("window.__openAmDevRender.tool()");
        if (tool) {
          used.add(tool);
          toolsSeen.add(tool);
          if (!fastenerShots.has(tool)) {
            fastenerShots.add(tool);
            await screenshot(`12-hand-${tool}`);
          }
        }
        await sleep(40);
      }
      if (isLoose) {
        if (count > 0) {
          const outs = await evaluate<number[]>(`window.__openAmDevRender.fasteners(${JSON.stringify(id)})`);
          if (outs.length !== count || outs.some((d) => d < 0.006)) failures.push(`fasteners: ${id} came loose with its fasteners not all out (${outs.map((d) => (d * 1000).toFixed(1)).join(", ")} mm)`);
          else fastenedOut.add(id);
          // The hand still takes the tool back to the toolbox: watch it there, then the tool must be in its slot.
          await waitFor("the trip to end", async () => !(await evaluate<string | null>("window.__openAmDevRender.sequence()")), 4000).catch(() => false);
          await readTrip(`loosening ${id}`);
          if (await evaluate<boolean>("window.__openAmDevRender.toolOut()")) failures.push(`fasteners: the tool was still out after ${id} came loose`);
        }
        await idle();
        const q = (await probe(id)) ?? p; // a loose part sits a few millimetres proud
        const tray = await trayAt();
        await carryTo(id, q.x, q.y, tray.x, tray.y);
        if (await waitFor(`${id} in the tray`, () => trayHas(id), 3000).catch(() => false)) return;
      }
    }
    // Hidden from this angle, or missed: turn the machine and try again, as a player would.
    await drag(ROTATE.x0, ROTATE.y0, ROTATE.x1, ROTATE.y1);
  }
  throw new Error(`could not take ${id} off`);
}

/** Parts with fasteners in machine.json, and how many (plan 0011). */
const FASTENED = new Map(machine.parts.filter((p) => (p.fasteners ?? []).length > 0).map((p) => [p.id, p.fasteners!.length]));
const toolsSeen = new Set<string>();
/** The tools seen in the hand during each part's last loosening. */
const toolsUsed = new Map<string, Set<string>>();
const fastenerShots = new Set<string>();
const fastenedOut = new Set<string>();
const fastenedBackIn = new Set<string>();
/** Parts whose fasteners were seen done up with the tool in the hand after a put-back (plan 0012). */
const doneUpWithTool = new Set<string>();
/**
 * Trips to the toolbox (plan 0012), as the page logged them (`watchTrips`): every leg's path checked against the machine's
 * bounds between its stand-offs, frame by frame, and the most of the hand hidden on the legs.
 */
type TripLog = { planned: number; metres: { pointer: number; machine: number }; armInto: Record<string, number>; phases: string[]; reach: number | null; toolAtBolts: number | null; tools: string[]; through: string[]; legHidden: number };
let tripsRead = 0;
const throughMachine: string[] = [];
const DEFAULT_TRIP = "recoil starter from the default view";
const legHidden = new Map<string, number>();
async function readTrip(where: string): Promise<TripLog> {
  const log = await evaluate<TripLog>("window.__openAmDevRender.tripLog()");
  tripsRead++;
  for (const k of new Set(log.through)) throughMachine.push(`${where} (${k})`);
  legHidden.set(where, Math.max(legHidden.get(where) ?? 0, log.legHidden));
  return log;
}

async function putBack(id: string): Promise<void> {
  await idle();
  const chip = await evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector('.tray [data-part="${id}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  // Drop over the machine, right of centre: clear of the diagnostic panel in the top-left corner.
  await drag(chip.x, chip.y, VIEWPORT.width * 0.72, VIEWPORT.height * 0.5, 12);
  await waitFor(`${id} back on`, async () => !(await trayHas(id)), 3000);
  if (FASTENED.has(id)) {
    // Plan 0012: doing the fasteners up runs the trip too; the tool goes back in its slot after.
    await waitFor("the trip to end", async () => !(await evaluate<string | null>("window.__openAmDevRender.sequence()")), 8000).catch(() => false);
    const log = await readTrip(`doing up ${id}`);
    if (log.phases.includes("fasten") && log.tools.length > 0) doneUpWithTool.add(id);
    await idle();
    if (await evaluate<boolean>("window.__openAmDevRender.toolOut()")) failures.push(`fasteners: the tool was still out after ${id} was done up`);
    const outs = await evaluate<number[]>(`window.__openAmDevRender.fasteners(${JSON.stringify(id)})`);
    if (outs.some((d) => d > 0.0005)) failures.push(`fasteners: ${id} went back on with its fasteners not done up`);
    else fastenedBackIn.add(id);
  }
}

// ---- The run ----

/**
 * The start screen after a page load (plan 0014). Up to 60 s: the first load runs on a throttled network through the dev
 * server, and on a busy build machine it took 22 to 34 s.
 */
const atStart = () => waitFor("the start screen", () => evaluate<boolean>("!!document.querySelector('.start')"), 60000);
/** Text of an element, or null. */
const textOf = (selector: string) => evaluate<string | null>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
/** From the start screen to the briefing through a button, then waits for Start to be enabled (the machine loaded). */
async function toBriefing(button = ".start .free"): Promise<void> {
  await tapSelector(button);
  await waitFor("the briefing", () => evaluate<boolean>("!!document.querySelector('.briefing')"), 20000);
  await waitFor("Start enabled", () => evaluate<boolean>("document.querySelector('.briefing .primary')?.disabled === false"), 60000);
  await sleep(300);
}
async function beginRound(): Promise<void> {
  await tapSelector(".briefing .primary");
  await waitFor("the HUD", () => evaluate<boolean>("!document.querySelector('.hud').hidden"));
  await evaluate("window.__openAmDevRender.watchTrips(true)"); // plan 0012: the page logs each trip to the toolbox
}
async function load(pageUrl: string): Promise<void> {
  await send("Page.navigate", { url: pageUrl });
  await atStart();
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");
// Start from empty saved scores, even if an earlier browser on this debug port is reused (plan 0014).
await send("Storage.clearDataForOrigin", { origin: `http://localhost:${PORT}`, storageTypes: "local_storage" });
await send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
// The headless browser has no share sheet: make sure of it, so Share goes to the clipboard, and note what is copied.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `try { delete Navigator.prototype.share; } catch {} if (navigator.clipboard) { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => { window.__copied = t; return w(t); }; }`,
});
// Plan 0013: record every vibration, and keep every resource timing entry so the sound requests can be counted.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__vibrations = []; Navigator.prototype.vibrate = function (p) { window.__vibrations.push(p); return true; }; try { performance.setResourceTimingBufferSize(5000); } catch {}`,
});
// The real sounds play through the speakers (the owner prefers to hear them, 2026-10-12). OPEN_AM_SILENT=1 routes them
// through a zero gain instead, so the machine stays quiet. Never --mute-audio: see silent-audio.ts.
if (process.env.OPEN_AM_SILENT === "1") await send("Page.addScriptToEvaluateOnNewDocument", { source: SILENT_AUDIO_SOURCE });
await send("Browser.grantPermissions", { origin: `http://localhost:${PORT}`, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch((e: Error) => console.log(`   clipboard permission not granted: ${e.message}`));

// Loading (plan 0014 step 6): the page carries a wordless bar before any script, and with the network throttled and the
// model held back, the start screen and briefing show with a progress bar and Start disabled until the model arrives.
const loadingChecks: string[] = [];
{
  const html = await (await fetch(`http://localhost:${PORT}/`)).text();
  if (/id="boot"/.test(html)) loadingChecks.push("the page has the loading bar before any script runs");
  else failures.push("loading: index.html has no loading bar");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8 });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*model.glb*", requestStage: "Request" }] });
  await load(url);
  await screenshot("0-start");
  await tapSelector(".start .free");
  await waitFor("the briefing", () => evaluate<boolean>("!!document.querySelector('.briefing')"), 20000);
  await waitFor("the model request held", async () => heldRequests.length > 0, 20000).catch(() => false);
  const state = await evaluate<{ bar: boolean; disabled: boolean }>(
    `({ bar: !!document.querySelector('.briefing .progress.loading'), disabled: document.querySelector('.briefing .primary').disabled === true })`,
  );
  await screenshot("1-briefing-loading");
  if (state.bar && state.disabled) loadingChecks.push("the briefing shows a progress bar with Start disabled while the model loads");
  else failures.push(`loading: while the model loaded the bar was ${state.bar ? "shown" : "missing"} and Start was ${state.disabled ? "disabled" : "enabled"}`);
  for (const requestId of heldRequests.splice(0)) await send("Fetch.continueRequest", { requestId });
  await send("Fetch.disable");
  await waitFor("Start enabled", () => evaluate<boolean>("document.querySelector('.briefing .primary')?.disabled === false"), 60000);
  if (await evaluate<boolean>("!document.querySelector('.briefing .progress.loading')")) loadingChecks.push("the bar goes and Start is enabled once the model is in");
  else failures.push("loading: the progress bar stayed after the model loaded");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(500);
  await screenshot("1-briefing");
}

const solved = new Map<string, string>();
const shots = new Set<string>();

// The hand and deliberate removal (ADR 0020), on a fresh round where the fuel tank is blocked by the tap:
// the open hand is the same over a removable and a blocked part; a double tap on a blocked part does nothing; a drag on
// a part that is not loose turns the machine and removes nothing, blocked or not; turning from the floor holds on and
// lets go; G loosens the part under the mouse; a loose part dropped away from the tray goes back, still loose.
let handSeen: boolean | null = null;
let pinchSeen: boolean | null = null;
const PINCHED = new Set(["spark_plug", "plug_cap", "fuel_tap", "capacitor"]);
const checks: string[] = [];
/** The most of the hand's sample points ever seen hidden behind the machine's surface: the hand sinking in. */
let worstHidden = { share: 0, where: "" };
const HIDDEN_LIMIT = 0.1;
async function noteHidden(where: string): Promise<void> {
  const share = await evaluate<number>("window.__openAmDevRender.handHidden()");
  if (process.env.HIDDEN_DEBUG && share > 0.05) {
    const need = await evaluate<number>("window.__openAmDevRender.handNeed()");
    const o = await stageNow();
    // The whole-machine check's last ask and what it applied, capped at HAND.maxPush: "needs" is on top of "applied".
    const push = await evaluate<{ asked: number; applied: number } | null>("window.__openAmDevRender.handPush()");
    console.log(`   hidden ${(share * 100).toFixed(0)}% ${where}; needs ${(need * 100).toFixed(1)} cm more; asked ${((push?.asked ?? 0) * 100).toFixed(1)} cm, applied ${((push?.applied ?? 0) * 100).toFixed(1)} cm; yaw ${o.yaw.toFixed(2)} lift ${o.lift.toFixed(2)}`);
    if (share > HIDDEN_LIMIT) await screenshot(`hidden-${where.replace(/[^a-z0-9]+/gi, "-")}`);
  }
  if (share > worstHidden.share) worstHidden = { share, where };
}
{
  await tapSelector(".briefing .primary");
  await waitFor("the HUD", () => evaluate<boolean>("!document.querySelector('.hud').hidden"));
  await idle();
  if (await evaluate<boolean>("window.__openAmDevRender.hasHand()")) {
    const hose = await probe("fuel_hose");
    const tank = await probe("fuel_tank");
    if (hose && tank) {
      // Hovering: the same open hand over a part that can come off and one that cannot.
      await mouse("mouseMoved", hose.x, hose.y, false);
      await sleep(400);
      const overHose = await handNow();
      await mouse("mouseMoved", tank.x, tank.y, false);
      await sleep(400);
      const overTank = await handNow();
      await screenshot("8-hand-hover");
      if (!overHose?.visible || !overTank?.visible) failures.push("hover: the hand did not follow the mouse");
      else if (overHose.action !== overTank.action || Math.abs(overHose.closed - overTank.closed) > 0.01) failures.push("hover: the hand looked different over a blocked part");
      else checks.push("the open hand follows the mouse and looks the same over a removable and a blocked part");

      // The hand stays out of the machine: hovering over every part in view, and over the base.
      let shot = 0;
      for (const id of machine.parts.map((pp) => pp.id)) {
        const at = await probe(id);
        if (!at) continue;
        await mouse("mouseMoved", at.x, at.y, false);
        await sleep(350);
        await noteHidden(`hovering on ${id}`);
        if (shot < 3 && ["recoil_starter", "air_filter_cover", "alternator_cover", "muffler", "fuel_tap"].includes(id)) await screenshot(`11-hover-${++shot}-${id}`);
      }
      for (const [fx, fy] of [[0.5, 0.62], [0.35, 0.55], [0.65, 0.58]]) {
        await mouse("mouseMoved", VIEWPORT.width * fx!, VIEWPORT.height * fy!, false);
        await sleep(350);
        await noteHidden("hovering on the base");
      }

      // A double tap on the blocked tank does nothing: no movement, no sound, no vibration (ADR 0007, ADR 0018).
      await evaluate<void>("(window.__openAmDevAudio?.clear(), window.__vibrations = [], undefined)");
      await doubleTap(tank.x, tank.y);
      await sleep(900);
      const blockedHeard = await evaluate<unknown[]>("window.__openAmDevAudio?.log() ?? []");
      const blockedBuzz = await evaluate<unknown[]>("window.__vibrations ?? []");
      if ((await looseNow()).includes("fuel_tank") || (await trayHas("fuel_tank"))) failures.push("double tap: the blocked fuel tank loosened");
      else if (blockedHeard.length || blockedBuzz.length) failures.push(`sound: a double tap on the blocked tank fired ${JSON.stringify(blockedHeard)} and vibrated ${JSON.stringify(blockedBuzz)}`);
      else checks.push("a double tap on a blocked part does nothing, silently and without vibrating");

      // A drag on the blocked tank, and on the hose that could come off but is not loose, turns the machine.
      for (const [id, p] of [["fuel_tank", tank], ["fuel_hose", await probe("fuel_hose")]] as const) {
        if (!p) continue;
        const before = await stageNow();
        // Along the part's path, plus 40 px sideways: since plan 0016 the default view is the camera's lowest, so a drag
        // straight up there (the tank's path) has nothing to turn, and the check is that a pull removes nothing.
        const dx = p.dir.headOn ? 0 : p.dir.x;
        const dy = p.dir.headOn ? 1 : p.dir.y;
        await drag(p.x, p.y, p.x + dx * 70 + 40, p.y + dy * 70);
        await sleep(300);
        const after = await stageNow();
        const turned = Math.abs(after.yaw - before.yaw) + Math.abs(after.lift - before.lift) > 0.01;
        if (!turned || (await trayHas(id)) || (await looseNow()).includes(id)) failures.push(`drag: pulling ${id} without loosening it did not just turn the machine`);
        else checks.push(`a drag on ${id} (${id === "fuel_tank" ? "blocked" : "not loose"}) turns the machine`);
      }

      // Turning from the empty floor: the hand holds on during the drag and opens after.
      const fx = VIEWPORT.width * 0.5;
      const fy = VIEWPORT.height * 0.72;
      await idle();
      await mouse("mousePressed", fx, fy, true);
      let held = false;
      for (let i = 1; i <= 24; i++) {
        await mouse("mouseMoved", fx + (90 * i) / 24, fy + (10 * i) / 24, true);
        await sleep(30);
        const h = await handNow();
        if (h?.visible && h.closed > 0.5) held = true;
        if (held && i === 18) await screenshot("9-hand-turning");
      }
      await mouse("mouseReleased", fx + 90, fy + 10, false);
      await sleep(500);
      const afterTurn = await handNow();
      if (!held) failures.push("turning: the hand did not hold on during a turn");
      else if (afterTurn && afterTurn.closed > 0.2) failures.push("turning: the hand stayed closed after the button was released");
      else checks.push("turning from the floor, the hand holds on and opens after");

      // G loosens the part under the mouse.
      await idle();
      const hose2 = await probe("fuel_hose");
      if (hose2) {
        await mouse("mouseMoved", hose2.x, hose2.y, false);
        await sleep(150);
        await pressKey("g");
        if (await waitFor("the hose loose after G", async () => (await looseNow()).includes("fuel_hose"), 3000).catch(() => false)) checks.push("G loosens the part under the mouse");
        else failures.push("G: the part under the mouse did not loosen");

        // Dropped away from the tray, a loose part goes back, still loose, and nothing is logged.
        await idle();
        const hose3 = (await probe("fuel_hose")) ?? hose2;
        await carryTo("fuel_hose", hose3.x, hose3.y, hose3.x + 30, Math.max(40, hose3.y - 150));
        await sleep(600);
        if ((await trayHas("fuel_hose")) || !(await looseNow()).includes("fuel_hose")) failures.push("drop: a part dropped away from the tray did not go back loose");
        else checks.push("a loose part dropped away from the tray goes back, still loose");
      }
    } else failures.push("checks: the fuel hose or tank was not in view");
  }
  // Back to a fresh round for the faults.
  await load(url);
}

/** Plays the running round's fault to the result screen, as a player does. Returns the fault and the shown total. */
async function solveRound(): Promise<{ faultId: string; score: string }> {
  const m = /fault (\S+)\s+culprit (\S+)/.exec(await diag());
  if (!m) throw new Error("diagnostic overlay did not show the fault");
  const fault = faultFile.faults.find((f) => f.id === m[1])!;
  const order = removalOrder(machine, fault);
  for (const id of order) {
    await pullOff(id);
    const fill = await chipPictureFill(id);
    if (fill < 0.03) throw new Error(`tray picture for ${id} is missing or blank (${(fill * 100).toFixed(1)}% opaque)`);
    if (!shots.has("working")) {
      shots.add("working");
      await idle();
      await screenshot("2-working");
    }
  }
  await idle();
  await tapSelector(`.tray [data-part="${fault.culprit}"]`);
  await waitFor("the card", () => evaluate<boolean>("!!document.querySelector('.card .sheet')"));
  if (!shots.has("card")) {
    shots.add("card");
    await screenshot("3-card");
  }
  await tapSelector(".card .primary");
  await waitFor("the fix", async () => /fixed true/.test(await diag()), 5000);
  await tapSelector(".card .close");
  for (const id of [...order].reverse()) await putBack(id);
  await tapSelector(".pull");
  await waitFor("the result screen", () => evaluate<boolean>("!!document.querySelector('.result')"), 5000);
  return { faultId: fault.id, score: await evaluate<string>("document.querySelector('.result .total').textContent") };
}

for (let round = 1; round <= 30 && solved.size < faultFile.faults.length; round++) {
  await toBriefing();
  await beginRound();
  const m = /fault (\S+)\s+culprit (\S+)/.exec(await diag());
  if (!m) throw new Error("diagnostic overlay did not show the fault");
  const fault = faultFile.faults.find((f) => f.id === m[1])!;
  try {
    const { score } = await solveRound();
    if (!shots.has("result")) {
      shots.add("result");
      await screenshot("4-result");
    }
    if (!solved.has(fault.id)) {
      solved.set(fault.id, score);
      console.log(`   solved ${fault.id} (${score})`);
    }
  } catch (e) {
    failures.push(`${fault.id}: ${(e as Error).message}`);
    await screenshot(`fail-${fault.id}`);
    break;
  }
  await tapSelector(".result .primary");
  await atStart();
}
for (const f of faultFile.faults) if (!solved.has(f.id) && !failures.some((x) => x.startsWith(f.id))) failures.push(`${f.id}: never came up or not solved`);

// Plan 0011: no fault needs the fuel tank (four screws) or the recoil starter (four bolts) off, so take them off in a
// round of their own: the screwdriver for the screws, the spanner for the bolts, every fastener out before the part is
// free, and done up again when it goes back.
const toolRound: string[] = [];
{
  const EXPECT: Array<[string, string]> = [["fuel_tank", "screwdriver"], ["recoil_starter", "spanner"]];
  // Ten minutes of patience: with retry turns this round can outlast the shortest customer (80 s).
  await send("Page.navigate", { url: url.replace("?diag", "?diag&patience=600") });
  await atStart();
  await toBriefing();
  await beginRound();
  const order: string[] = [];
  const add = (id: string) => {
    if (order.includes(id)) return;
    for (const dep of machine.parts.find((p) => p.id === id)?.requires ?? []) add(dep);
    order.push(id);
  };
  for (const [id] of EXPECT) add(id);
  try {
    for (const id of order) await pullOff(id);
    for (const [id, want] of EXPECT) {
      const used = [...(toolsUsed.get(id) ?? [])];
      if (used.length !== 1 || used[0] !== want) failures.push(`tools: ${id} was undone with ${used.join(" and ") || "no tool"}, not the ${want}`);
      else if (!fastenedOut.has(id)) failures.push(`tools: ${id} came loose before its fasteners were out`);
      else if (!(await trayHas(id))) failures.push(`tools: ${id} did not reach the tray`);
    }
    for (const id of [...order].reverse()) await putBack(id);
    for (const [id, want] of EXPECT) {
      if (fastenedBackIn.has(id) && !failures.some((f) => f.includes(id))) toolRound.push(`${id} with the ${want}`);
    }
    // The cord pulled while the starter's bolts are coming out: the tool goes away and the bolts are done up again.
    await idle();
    const st = await waitFor("the recoil starter in view", () => probe("recoil_starter"), 3000).catch(() => null);
    if (st) {
      await doubleTap(st.x, st.y);
      const midway = await waitFor("the spanner out", () => evaluate<string | null>("window.__openAmDevRender.tool()"), 2000).catch(() => null);
      await tapSelector(".pull");
      await sleep(800);
      const toolAfter = await evaluate<string | null>("window.__openAmDevRender.tool()");
      const toolShown = await evaluate<boolean>("window.__openAmDevRender.toolOut()");
      const outs = await evaluate<number[]>(`window.__openAmDevRender.fasteners("recoil_starter")`);
      if (!midway) failures.push("tools: the spanner was not out to test pulling the cord mid-loosening");
      else if (toolAfter || toolShown) failures.push(`tools: the ${toolAfter ?? "tool"} stayed out of the toolbox after the cord was pulled mid-loosening`);
      else if (outs.some((d) => d > 0.0005)) failures.push(`tools: the starter's bolts stayed out after the cord was pulled mid-loosening (${outs.map((d) => (d * 1000).toFixed(1)).join(", ")} mm)`);
      else toolRound.push("the cord pulled mid-loosening puts the spanner back in the toolbox and the bolts back in");
    } else failures.push("tools: the recoil starter was not in view to test pulling the cord mid-loosening");
  } catch (e) {
    failures.push(`tools: ${(e as Error).message}`);
    await screenshot("fail-tools");
  }
  await send("Page.navigate", { url });
  await atStart();
}

// Sound and vibration (plan 0013 step 8). No sound files ship until the owner chooses them, so this watches which
// moments fire through the dev hook window.__openAmDevAudio, and every navigator.vibrate call through the recorder
// installed on every page. Whether a moment could be heard depends on its file; the check reports how many arrived.
const soundChecks: string[] = [];
type Heard = { moment: string; audible: boolean };
const heardNow = () => evaluate<Heard[]>("window.__openAmDevAudio?.log() ?? []");
const vibrationsNow = () => evaluate<Array<number | number[]>>("window.__vibrations ?? []");
async function clearSound(): Promise<void> {
  await evaluate<void>("(window.__openAmDevAudio?.clear(), window.__vibrations = [], undefined)");
}
const audioRequests = () => evaluate<Array<{ name: string; size: number }>>(`performance.getEntriesByType("resource").filter((e) => new URL(e.name).pathname.includes("/audio/")).map((e) => ({ name: new URL(e.name).pathname, size: e.transferSize }))`);
const moments = (h: Heard[]) => h.map((x) => x.moment);
const count = (h: Heard[], m: string) => h.filter((x) => x.moment === m).length;
const vibrationMs = (v: Array<number | number[]>) => v.reduce<number>((n, p) => n + (typeof p === "number" ? p : p.reduce((a, b) => a + b, 0)), 0);
function sound(ok: boolean, passed: string, failed: string): void {
  if (ok) soundChecks.push(passed);
  else failures.push(`sound: ${failed}`);
}
const MOMENT_FILES = 10;
let soundFiles = 0;
try {
  await load(url.replace("?diag", "?diag&patience=600"));
  await toBriefing();
  const before = await audioRequests();
  const stateBefore = await evaluate<string>("window.__openAmDevAudio.state()");
  sound(before.length === 0 && stateBefore !== "running", "nothing under /audio/ is fetched before Start, and audio is not running", `before Start: ${before.length} audio request(s), audio ${stateBefore}`);
  await beginRound();
  await waitFor("the sound requests", async () => (await audioRequests()).length >= MOMENT_FILES, 5000).catch(() => false);
  await sleep(500);
  const after = await audioRequests();
  const bytes = after.reduce((n, r) => n + r.size, 0);
  const state = await evaluate<string>("window.__openAmDevAudio.state()");
  soundFiles = (await evaluate<string[]>("window.__openAmDevAudio.loaded()")).length;
  sound(after.length === MOMENT_FILES && bytes <= 250_000, `after Start the ${MOMENT_FILES} sound files are asked for once (${(bytes / 1000).toFixed(1)} KB)`, `after Start ${after.length} audio request(s), ${bytes} bytes`);
  sound(state === "running", "the first tap (Start) unlocks audio", `after Start audio was ${state}`);
  console.log(`   sound files decoded: ${soundFiles} of ${MOMENT_FILES}${soundFiles === 0 ? " (none ship yet: every moment is silent)" : ""}`);
  if (soundFiles > 0 && soundFiles < MOMENT_FILES) failures.push(`sound: only ${soundFiles} of ${MOMENT_FILES} files decoded`);

  // Loosening and removing the alternator cover: four bolts of two turns, one bolt crack, one clunk in the tray.
  await clearSound();
  await pullOff("alternator_cover");
  await idle();
  let h = await heardNow();
  let v = await vibrationsNow();
  sound(
    count(h, "turn") === 8 && count(h, "give-unbolt") === 1 && count(h, "land") === 1 && h.length === 10 && JSON.stringify(v) === "[15]",
    "the alternator cover's 4 bolts click 8 turns, it cracks loose once (15 ms) and lands in the tray",
    `the alternator cover logged ${JSON.stringify(moments(h))} and vibrated ${JSON.stringify(v)}`,
  );

  // The plug cap pops; the spark plug clicks its turns and has no give sound.
  await clearSound();
  await pullOff("plug_cap");
  await idle();
  h = await heardNow();
  v = await vibrationsNow();
  sound(JSON.stringify(moments(h)) === '["give-pull","land"]' && JSON.stringify(v) === "[15]", "the plug cap pops (15 ms) and lands", `the plug cap logged ${JSON.stringify(moments(h))} and vibrated ${JSON.stringify(v)}`);
  await clearSound();
  await pullOff("spark_plug");
  await idle();
  h = await heardNow();
  v = await vibrationsNow();
  sound(
    count(h, "turn") >= 1 && !h.some((x) => x.moment.startsWith("give-")) && count(h, "land") === 1 && v.length === 0,
    `the spark plug clicks ${count(h, "turn")} turns with no give sound and lands`,
    `the spark plug logged ${JSON.stringify(moments(h))} and vibrated ${JSON.stringify(v)}`,
  );

  // Putting back: the part seats (15 ms) and its turns click going in.
  await clearSound();
  await putBack("spark_plug");
  await idle();
  h = await heardNow();
  v = await vibrationsNow();
  sound(count(h, "seat") === 1 && count(h, "turn") === 3 && JSON.stringify(v) === "[15]", "the spark plug goes back with 3 turns and seats (15 ms)", `putting the spark plug back logged ${JSON.stringify(moments(h))} and vibrated ${JSON.stringify(v)}`);
  await putBack("plug_cap");
  await idle(); // the plug cap seats before the log is cleared
  await clearSound();
  await putBack("alternator_cover");
  await idle();
  h = await heardNow();
  v = await vibrationsNow();
  sound(
    JSON.stringify(moments(h)) === JSON.stringify(["seat", ...Array(8).fill("turn")]) && JSON.stringify(v) === "[15]",
    "the alternator cover seats (15 ms), then its bolts click 8 turns going in",
    `putting the alternator cover back logged ${JSON.stringify(moments(h))} and vibrated ${JSON.stringify(v)}`,
  );

  // A failed pull: the cord, then the cough, 0.6 s later, with 40 ms.
  await clearSound();
  await tapSelector(".pull");
  await sleep(1200);
  h = await heardNow();
  v = await vibrationsNow();
  sound(JSON.stringify(moments(h)) === '["cord","fail"]' && JSON.stringify(v) === "[40]", "a failed pull plays the cord then fail (40 ms)", `a failed pull logged ${JSON.stringify(moments(h))} and vibrated ${JSON.stringify(v)}`);

  // The cord pulled while a part with no fasteners is still going back: it seats first, then the cord, then fail.
  await pullOff("plug_cap");
  await idle();
  await clearSound();
  await putBack("plug_cap");
  await tapSelector(".pull");
  await sleep(1500);
  h = await heardNow();
  v = await vibrationsNow();
  const capHome = await evaluate<boolean>(`!document.querySelector('.tray [data-part="plug_cap"]')`);
  // Seat and cord within 50 ms of each other: the pull caught the plug cap on its way back (its put-back takes about
  // 0.85 s), so this is the press home seating it, not the put-back ending by itself before the tap.
  const at = await evaluate<number[]>("(window.__openAmDevAudio?.log() ?? []).map((x) => x.at)");
  const caught = at.length >= 2 && Math.abs(at[1]! - at[0]!) <= 50;
  sound(
    JSON.stringify(moments(h)) === '["seat","cord","fail"]' && JSON.stringify(v) === "[15,40]" && capHome && caught,
    "the cord pulled while the plug cap is still going back: it seats (15 ms) before the cord, then fail (40 ms)",
    `the cord pulled mid put-back logged ${JSON.stringify(moments(h))} at ${JSON.stringify(at)} ms and vibrated ${JSON.stringify(v)}${capHome ? "" : "; the plug cap is still in the tray"}${caught ? "" : "; the seat was not caught by the pull"}`,
  );

  // Mute, then reload: the button stays muted, and every moment is silent with no vibration.
  await tapSelector(".hud .mute");
  const pressed = await evaluate<string | null>("document.querySelector('.hud .mute').getAttribute('aria-pressed')");
  const stored = await evaluate<string | null>(`localStorage.getItem("openam.muted")`);
  await screenshot("17-muted");
  await load(url.replace("?diag", "?diag&patience=600"));
  await toBriefing();
  await beginRound();
  const pressedAfter = await evaluate<string | null>("document.querySelector('.hud .mute').getAttribute('aria-pressed')");
  const label = await evaluate<string | null>("document.querySelector('.hud .mute').getAttribute('aria-label')");
  sound(pressed === "true" && stored === "1" && pressedAfter === "true" && label === "Sound off", "muting is remembered under openam.muted after a reload", `mute: pressed ${pressed}, stored ${stored}, after reload pressed ${pressedAfter}, label ${label}`);
  await clearSound();
  await pullOff("fuel_hose");
  await idle();
  h = await heardNow();
  v = await vibrationsNow();
  sound(h.length >= 2 && h.every((x) => !x.audible) && v.length === 0, "while muted every moment is silent and nothing vibrates", `while muted: ${JSON.stringify(h)} and vibrated ${JSON.stringify(v)}`);
  await tapSelector(".hud .mute");
  sound((await evaluate<string | null>(`localStorage.getItem("openam.muted")`)) === "0", "unmuting is remembered", "unmuting was not stored");

  // The winning pull: the cord, then the engine, with a pattern under 300 ms.
  await load(url.replace("?diag", "?diag&patience=600"));
  await toBriefing();
  await beginRound();
  await solveRound();
  await sleep(1000);
  h = await heardNow();
  v = await vibrationsNow();
  const last = moments(h).slice(-2);
  const startBuzz = v.at(-1);
  sound(
    JSON.stringify(last) === '["cord","start"]' && Array.isArray(startBuzz) && vibrationMs([startBuzz]) < 300,
    `the winning pull plays the cord then start (${Array.isArray(startBuzz) ? vibrationMs([startBuzz]) : "no"} ms pattern)`,
    `the winning pull ended with ${JSON.stringify(last)} and vibrated ${JSON.stringify(startBuzz)}`,
  );
  if (soundFiles > 0) sound(h.every((x) => x.audible), "every moment could be heard", "some moments could not be heard with their files decoded");
  await tapSelector(".result .primary");
  await atStart();
} catch (e) {
  failures.push(`sound: ${(e as Error).message}`);
  await screenshot("fail-sound");
}

// The toolbox (plan 0012, ADR 0021; on the bench's left end since plan 0016). At 390 by 844 and 360 by 640, in the
// default view, with the tray at every size from empty to all twelve chips: the toolbox stands to the left of the
// machine, cut by the left screen edge (with the tray empty), with its tools in view above the controls; no point of
// it is drawn over the machine or under the pull cord or a tray chip. Then a loosening in the default view (the recoil
// starter) and one of the alternator cover: the hand reaches the toolbox, holds the spanner at the bolts, puts it back
// in its slot, and its path never goes through the machine; a second loosen during the sequence is ignored. "Reaches"
// is within 10 cm: the gripping hand sits in front of the tool's grip point by its own thickness. In the default view
// at both sizes the forearm comes from below the toolbox while the hand is there: it reaches at most
// ARM_AT_TOOLBOX_PX into the machine's rectangle.
const toolboxChecks: string[] = [];
type ToolboxRect = { toolbox: Rect | null; machine: Rect | null; slots: Array<{ x: number; y: number }>; overMachine: number; underControls: number; inView: number; screen: { width: number; height: number } };
type Rect = { left: number; top: number; right: number; bottom: number };
/**
 * Fills the tray with `n` stand-in chips (each part's name, a 32 px picture), as it grows when parts come off, so the
 * check can see every tray size without taking every part off. They are removed again with n = 0.
 */
const PART_NAMES = machine.parts.map((p) => p.name);
async function standInChips(n: number): Promise<void> {
  await evaluate<void>(
    `(() => { const t = document.querySelector('.tray'); t.querySelectorAll('.stand-in').forEach((e) => e.remove()); const names = ${JSON.stringify(PART_NAMES)}; for (let i = 0; i < ${n}; i++) { const li = document.createElement('li'); li.className = 'chip stand-in'; const img = document.createElement('img'); img.alt = ''; li.append(img, names[i]); t.append(li); } document.querySelector('.tray-empty').hidden = ${n} > 0; })()`,
  );
}
/**
 * Waits for the machine to finish gliding back down once the stand-in chips are gone (it eases to its place above the
 * controls), so the trip that follows starts from a still view: a double tap on a gliding machine lands off the part.
 */
async function settled(): Promise<void> {
  const bottom = () => evaluate<number>("window.__openAmDevRender.toolboxRect()?.machine?.bottom ?? 0");
  let last = await bottom();
  for (const end = Date.now() + 3000; Date.now() < end; ) {
    await sleep(150);
    const now = await bottom();
    if (Math.abs(now - last) < 0.5) return;
    last = now;
  }
}
async function checkToolboxInView(label: string): Promise<void> {
  let worst = "";
  let ok = true;
  for (let n = 0; n <= PART_NAMES.length; n++) {
    await standInChips(n);
    await idle();
    await sleep(150);
    await settled();
    const avoid = await evaluate<Rect[]>("[...document.querySelectorAll('.controls .pull, .tray .chip')].map((e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })");
    const r = await evaluate<ToolboxRect | null>(`window.__openAmDevRender.toolboxRect(${JSON.stringify(avoid)})`);
    const controlsTop = await evaluate<number>("document.querySelector('.controls').getBoundingClientRect().top");
    if (n === 0 || n === PART_NAMES.length) await screenshot(`17-toolbox-${label}-tray${n}`);
    if (!r || !r.toolbox || !r.machine) {
      failures.push(`toolbox: not in the scene at ${label}`);
      return;
    }
    const at = `${label} with ${n} chip${n === 1 ? "" : "s"} in the tray`;
    const where = `toolbox ${Math.round(r.toolbox.left)} to ${Math.round(r.toolbox.right)} px across, ${Math.round(r.toolbox.top)} to ${Math.round(r.toolbox.bottom)} px down, ${(r.inView * 100).toFixed(0)}% on screen; machine ${Math.round(r.machine.left)} to ${Math.round(r.machine.right)} px across; controls top ${Math.round(controlsTop)} px; tools at ${r.slots.map((p) => `${Math.round(p.x)}, ${Math.round(p.y)}`).join(" and ")}`;
    const slotsShown = r.slots.every((p) => p.x >= 0 && p.x <= r.screen.width && p.y >= 0 && p.y < controlsTop);
    const fail = (why: string) => {
      ok = false;
      failures.push(`toolbox: at ${at} ${why} (${where})`);
    };
    if (!slotsShown) fail("the tools in the toolbox are out of the default view or under the controls");
    else if (!(r.toolbox.left < r.machine.left)) fail("the toolbox is not to the left of the machine");
    else if (n === 0 && !(r.toolbox.left < 0)) fail("the toolbox is not cut by the left edge of the screen");
    else if (r.overMachine > 0) fail(`${(r.overMachine * 100).toFixed(1)}% of the toolbox is drawn over the machine`);
    else if (r.underControls > 0) fail(`${r.underControls} points of the toolbox are under the pull cord or a tray chip`);
    if (n === 0 || n === PART_NAMES.length) worst += `${worst ? "; " : ""}${n} chips: ${where}`;
    if (!ok) break;
  }
  await standInChips(0);
  await settled();
  if (ok) toolboxChecks.push(`at ${label}, with the tray empty to full, the toolbox stands left of the machine, cut by the screen edge, its tools in view, drawn clear of the machine and the controls (${worst})`);
}

// The workbench (plan 0016, ADR 0025), in the default view with the tray empty: the bench model (not the fallback box)
// is drawn under the machine, its near edge below the machine's lowest point; the generator fills 55 to 65 percent of
// the width at 390 by 844 and at least 40 percent on the shorter screen, with a 1.76 m customer's head line under the
// timer; a sideways drag on empty space turns the machine and leaves the camera exactly where it was; the toolbox
// stands on the bench (its lowest point drawn above the bench's near edge, behind it).
const benchChecks: string[] = [];
type BenchRect = { bench: Rect | null; machine: Rect | null; nearEdgeY: number; kind: string; screen: { width: number; height: number } };
const HEAD_LINE_PX = 82; // FRAMING.topPx + FRAMING.headMarginPx in game/src/render/stage.ts
async function checkBench(label: string): Promise<void> {
  await evaluate("window.__openAmDevRender.resetStage()");
  await standInChips(0);
  await idle();
  await settled();
  const b = await evaluate<BenchRect>("window.__openAmDevRender.benchRect()");
  const s = await stageNow();
  const tb = await evaluate<ToolboxRect | null>("window.__openAmDevRender.toolboxRect([])");
  const fail = (why: string): void => {
    failures.push(`bench: at ${label} ${why}`);
  };
  if (!b.bench || !b.machine) return fail("the bench or the machine is not drawn");
  const share = (b.machine.right - b.machine.left) / b.screen.width;
  const say = `machine ${Math.round(b.machine.left)} to ${Math.round(b.machine.right)} px across (${(share * 100).toFixed(1)}% of the width), lowest at ${Math.round(b.machine.bottom)} px; bench near edge at ${Math.round(b.nearEdgeY)} px; camera ${s.eye[1].toFixed(2)} m high, ${s.framing.distance.toFixed(2)} m back, ${((s.pitch * 180) / Math.PI).toFixed(1)} degrees down; a 1.76 m head at ${Math.round(s.framing.headPx)} px`;
  if (b.kind !== "glb") fail(`the bench is the fallback box, not bench.glb (${say})`);
  else if (!(b.bench.top < b.machine.bottom && b.nearEdgeY > b.machine.bottom && b.bench.left < b.machine.left && b.bench.right > b.machine.right)) fail(`the bench is not under the machine (${say})`);
  else if (b.screen.width === 390 && b.screen.height === 844 && !(share >= 0.55 && share <= 0.65)) fail(`the generator is not 55 to 65 percent of the width (${say})`);
  else if (!(share >= 0.4)) fail(`the generator is under 40 percent of the width (${say})`);
  else if (!(s.framing.headPx >= HEAD_LINE_PX - 0.5)) fail(`a 1.76 m customer's head would be under the timer (${say})`);
  else if (!tb?.toolbox || !(tb.toolbox.bottom < b.nearEdgeY)) fail(`the toolbox is not standing on the bench (${say})`);
  else benchChecks.push(`at ${label}: the bench is under the machine; ${say}`);
  // A sideways drag on empty space, clear of the diagnostic panel: the machine turns, the camera does not move.
  const before = await stageNow();
  const y = Math.round(b.screen.height * 0.24);
  await drag(Math.round(b.screen.width * 0.72), y, Math.round(b.screen.width * 0.72) - 70, y, 12);
  await sleep(300);
  const after = await stageNow();
  const moved = Math.hypot(after.eye[0] - before.eye[0], after.eye[1] - before.eye[1], after.eye[2] - before.eye[2]);
  if (!(Math.abs(after.yaw - before.yaw) > 0.2)) fail(`a sideways drag did not turn the machine (yaw ${before.yaw.toFixed(3)} to ${after.yaw.toFixed(3)})`);
  else if (moved > 1e-6 || after.lift !== before.lift) fail(`a sideways drag moved the camera ${(moved * 1000).toFixed(2)} mm (lift ${before.lift} to ${after.lift})`);
  else benchChecks.push(`at ${label} a sideways drag turned the machine ${(((after.yaw - before.yaw) * 180) / Math.PI).toFixed(0)} degrees and left the camera where it was`);
  await idle();
  await screenshot(`20-turned-${label}`);
  await evaluate("window.__openAmDevRender.resetStage()");
  await sleep(200);
}

/** Loosens a part with fasteners and watches the trip. Returns false if the part was never in view. */
/**
 * How far (CSS px) the sleeve may reach into the machine's rectangle on screen while the hand is at the toolbox in the
 * default view (0.11.1 follow-up): the forearm comes up from the bottom edge below the toolbox, not across the machine.
 */
const ARM_AT_TOOLBOX_PX = 32;
async function watchTrip(id: string, label: string, shot: string | null, interrupt: string | null, armChecked = false): Promise<boolean> {
  let p: Probe | null = null;
  for (let i = 0; i < 8 && !(p = await probe(id)); i++) await drag(ROTATE.x0, ROTATE.y0, ROTATE.x1, ROTATE.y1);
  if (!p) return false;
  await idle();
  await doubleTap(p.x, p.y);
  let shotTaken = false;
  let interrupted: string | null = null;
  for (const end = Date.now() + 8000; Date.now() < end; ) {
    const phase = await evaluate<string | null>("window.__openAmDevRender.trip()");
    const seq = await evaluate<string | null>("window.__openAmDevRender.sequence()");
    if (!seq) break;
    // The hand taking the tool out: at the pick, or just after it if the pick was too quick to see.
    if ((phase === "pick" || phase === "toFastener") && shot && !shotTaken) {
      shotTaken = true;
      if (phase === "pick") await sleep(60);
      await screenshot(shot);
    }
    if (phase === "fasten") {
      if (interrupt && !interrupted) {
        // A second loosen while the sequence plays must do nothing.
        const q = await probe(interrupt);
        if (q) {
          await doubleTap(q.x, q.y);
          interrupted = interrupt;
        }
      }
    }
    await sleep(30);
  }
  await idle();
  const log = await readTrip(label);
  const reached = log.reach ?? Infinity;
  const atBolts = log.toolAtBolts ?? Infinity;
  const spannerHeld = log.tools.includes("spanner");
  const phases = log.phases;
  const back = await evaluate<number | null>("window.__openAmDevRender.toolFromSlot('spanner')");
  const out = await evaluate<boolean>("window.__openAmDevRender.toolOut()");
  const loose = (await looseNow()).includes(id);
  const say = `${label}: legs ${log.metres.pointer.toFixed(2)} m from the pointer to the toolbox and ${log.metres.machine.toFixed(2)} m from the toolbox over the machine, ${log.planned.toFixed(2)} s planned; phases ${phases.join(", ")}; hand to the slot ${(reached * 100).toFixed(1)} cm; spanner to the bolts ${(atBolts * 100).toFixed(1)} cm; spanner from its slot after ${((back ?? 0) * 1000).toFixed(1)} mm; the sleeve into the machine's rectangle at the toolbox ${Math.round(log.armInto["atToolbox"] ?? 0)} px (most on any step ${Math.round(Math.max(0, ...Object.values(log.armInto)))} px)`;
  if (!loose) failures.push(`toolbox: ${label}: the part did not come loose (${say})`);
  else if (!(reached < 0.1)) failures.push(`toolbox: ${label}: the hand never reached the toolbox (${say})`);
  else if (!spannerHeld || !(atBolts < 0.03)) failures.push(`toolbox: ${label}: the spanner was not held at the bolts (${say})`);
  else if (out || !(back !== null && back < 0.002)) failures.push(`toolbox: ${label}: the spanner was not back in its slot afterwards (${say})`);
  else if (armChecked && !((log.armInto["atToolbox"] ?? Infinity) <= ARM_AT_TOOLBOX_PX)) failures.push(`toolbox: ${label}: at the toolbox the arm lay across the machine, more than ${ARM_AT_TOOLBOX_PX} px into its rectangle (${say})`);
  else toolboxChecks.push(say);
  if (interrupt) {
    if (!interrupted) failures.push(`toolbox: ${label}: ${interrupt} was not in view to try a second loosen`);
    else if ((await looseNow()).includes(interrupt)) failures.push(`toolbox: ${label}: a second loosen (${interrupt}) during the sequence was not ignored`);
    else toolboxChecks.push(`a second loosen (${interrupt}) during the sequence was ignored`);
  }
  return true;
}

{
  try {
    await load(url.replace("?diag", "?diag&patience=600"));
    await toBriefing();
    await beginRound();
    if (!(await evaluate<boolean>("window.__openAmDevRender.hasToolbox()"))) throw new Error("the game has no toolbox (toolbox.glb missing?)");
    await checkBench("390x844");
    await checkToolboxInView("390x844");
    if (!(await watchTrip("recoil_starter", DEFAULT_TRIP, "18-hand-taking-tool-390x844", null, true))) failures.push("toolbox: the recoil starter was not in view");
    if (!(await watchTrip("alternator_cover", "alternator cover", null, "fuel_hose"))) failures.push("toolbox: the alternator cover was never in view");
    await screenshot("19-after-trip");
    await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
    await load(url);
    await toBriefing();
    await beginRound();
    await checkBench("360x640");
    await checkToolboxInView("360x640");
    if (!(await watchTrip("recoil_starter", "recoil starter from the default view at 360x640", "18-hand-taking-tool-360x640", null, true))) failures.push("toolbox: the recoil starter was not in view at 360x640");
  } catch (e) {
    failures.push(`toolbox: ${(e as Error).message}`);
    await screenshot("fail-toolbox");
  }
  await send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
  await load(url);
}

// Frame rate at 4x CPU throttle, read from the diagnostic overlay while the camera turns.
if (failures.length === 0) {
  await toBriefing();
  await beginRound();
}
await send("Emulation.setCPUThrottlingRate", { rate: 4 });
for (let i = 0; i < 6; i++) await drag(ROTATE.x0, ROTATE.y0, ROTATE.x1, ROTATE.y1, 20);
await sleep(1200);
const fps = Number(/fps (\d+)/.exec(await diag())?.[1] ?? "0");
await send("Emulation.setCPUThrottlingRate", { rate: 1 });
if (!(fps > 0)) failures.push("frame rate: could not be read from the diagnostic overlay");
else if (fps < FPS_BUDGET) failures.push(`frame rate: ${fps} fps at 4x CPU throttle is under the ${FPS_BUDGET} fps budget (ADR 0014)`);

// A forced walk-out (plan 0007): every customer gets 5 seconds of patience. The customer should react at 50 percent,
// leave, and the walked result screen should show.
let walkedOk = false;
if (failures.length === 0) {
  await load(url.replace("?diag", "?diag&patience=5"));
  await toBriefing();
  await tapSelector(".briefing .primary");
  await evaluate<void>("(window.__openAmDevAudio?.clear(), window.__vibrations = [], undefined)");
  await sleep(3000);
  if (await evaluate<boolean>("!document.querySelector('.speech').hidden")) await screenshot("5-customer-line");
  else failures.push("walk-out: the customer said nothing at 50 percent patience");
  walkedOk = await waitFor("the walked result", () => evaluate<boolean>("!!document.querySelector('.result.walked')"), 12000).catch(() => false);
  if (walkedOk) await screenshot("6-walked");
  else failures.push("walk-out: no walked result screen after the patience ran out");
  const walkHeard = await evaluate<unknown[]>("window.__openAmDevAudio?.log() ?? []");
  const walkBuzz = await evaluate<unknown[]>("window.__vibrations ?? []");
  if (walkHeard.length || walkBuzz.length) failures.push(`sound: the walk-out fired ${JSON.stringify(walkHeard)} and vibrated ${JSON.stringify(walkBuzz)}`);
  else soundChecks.push("the walk-out is silent");
  if (await evaluate<boolean>("!!document.querySelector('.result .share')")) failures.push("walk-out: a walked free round offered Share");
}

// Today's fault (plan 0014 step 7). The dates are set with the dev-only ?today= query; day N counts from 2026-10-01.
const dailyChecks: string[] = [];
const dayUrl = (iso: string) => `${url}&today=${encodeURIComponent(iso)}`;
const DAY_A = { iso: "2026-10-21T08:00:00Z", day: 20 };
const DAY_B = { iso: "2026-10-22T08:00:00Z", day: 21 };
const DAY_C = { iso: "2026-10-23T08:00:00Z", day: 22 };
function check(ok: boolean, passed: string, failed: string): void {
  if (ok) dailyChecks.push(passed);
  else failures.push(`daily: ${failed}`);
}
try {
  // Scored once: the button and the briefing name the day; the result offers Share; Share copies ADR 0005's text.
  await load(dayUrl(DAY_A.iso));
  const button = await textOf(".start .daily");
  check(button === `Today's fault · Day ${DAY_A.day}`, `the start screen offers "${button}"`, `the start screen's daily button read "${button}"`);
  await toBriefing(".start .daily");
  const label = await textOf(".briefing .daily-label");
  check(label === `Today's fault · Day ${DAY_A.day}`, "the briefing names the day", `the briefing's daily label read "${label}"`);
  await beginRound();
  await solveRound();
  await waitFor("the best row", () => evaluate<boolean>("!!document.querySelector('.result .best')"), 5000).catch(() => false);
  await screenshot("12-daily-result");
  check(await evaluate<boolean>("!!document.querySelector('.result .best')"), "the result shows the best", "the result screen showed no best");
  check(await evaluate<boolean>("!!document.querySelector('.result .share')"), "the result shows Share", "the scored daily's result had no Share button");
  const saved = await evaluate<string | null>(`localStorage.getItem("openam.scores.v1")`);
  const record = saved ? (JSON.parse(saved) as { daily: Record<string, { score: ScoreBreakdown; unfinished?: boolean }> }).daily[String(DAY_A.day)] : undefined;
  check(!!record && !record.unfinished && record.score.outcome === "fixed", "the day's result is saved under openam.scores.v1", "the day's result was not saved finished");
  await tapSelector(".result .share");
  const status = await waitFor("Copied", async () => ((await textOf(".result .share-status")) === "Copied" ? "Copied" : null), 5000).catch(() => null);
  const copied = await evaluate<string | null>("window.__copied ?? null");
  const expected = record ? shareText(DAY_A.day, record.score, `http://localhost:${PORT}/`) : "(no record)";
  check(status === "Copied" && copied === expected, "Share copies the exact ADR 0005 text and says Copied", `Share copied ${JSON.stringify(copied)}, expected ${JSON.stringify(expected)}, status ${JSON.stringify(status)}`);
  if (copied) console.log(`   shared text:\n      ${copied.split("\n").join("\n      ")}`);
  await screenshot("13-shared");

  // A reload: the daily is now practice, and the start screen shows the day's result.
  await load(dayUrl(DAY_A.iso));
  const again = await textOf(".start .daily");
  const today = await textOf(".start .today");
  check(again === "Today's fault · practice", "after a reload the daily reads practice", `after a reload the daily button read "${again}"`);
  check(!!today && today.startsWith(`Day ${DAY_A.day}: score `), `the start screen shows "${today}"`, `the start screen's result read "${today}"`);
  await screenshot("14-start-practice");
  await toBriefing(".start .daily");
  check((await textOf(".briefing .daily-label")) === "Practice, not scored", "the practice briefing says it is not scored", "the practice briefing did not say it is not scored");
  await beginRound();
  await solveRound();
  await waitFor("Not scored", () => evaluate<boolean>("!!document.querySelector('.result .not-scored')"), 5000).catch(() => false);
  check(
    await evaluate<boolean>("!!document.querySelector('.result .not-scored') && !document.querySelector('.result .share') && !document.querySelector('.result .best')"),
    "a practice result says Not scored, with no best and no Share",
    "the practice result was not marked Not scored, or offered a best or Share",
  );
  const after = await evaluate<string | null>(`localStorage.getItem("openam.scores.v1")`);
  check(after === saved || JSON.stringify(JSON.parse(after ?? "{}").daily?.[String(DAY_A.day)]) === JSON.stringify(record), "practice saves nothing", "practice changed the day's saved result");

  // ADR 0024: a daily left mid-round (a reload) is used up, reads Not finished, and is not scored again.
  await load(dayUrl(DAY_B.iso));
  await toBriefing(".start .daily");
  await beginRound();
  await sleep(1500);
  await load(dayUrl(DAY_B.iso));
  const unfinished = await textOf(".start .today");
  const buttonB = await textOf(".start .daily");
  check(unfinished === `Day ${DAY_B.day}: Not finished`, "a daily left mid-round reads Not finished", `after leaving a daily mid-round the start screen read "${unfinished}"`);
  check(buttonB === "Today's fault · practice", "and is not scored again", `after leaving a daily mid-round the button read "${buttonB}"`);
  await screenshot("15-not-finished");

  // The next day offers a new daily.
  await load(dayUrl(DAY_C.iso));
  const buttonC = await textOf(".start .daily");
  check(buttonC === `Today's fault · Day ${DAY_C.day}`, "the next day offers a new daily", `the next day's daily button read "${buttonC}"`);
  check((await textOf(".start .today")) === null, "with no result yet", "the next day showed a result before it was played");
} catch (e) {
  failures.push(`daily: ${(e as Error).message}`);
  await screenshot("fail-daily");
}

// Storage blocked (ADR 0005): every touch of localStorage throws, and a round still plays to the result with no errors.
let blockedOk = false;
{
  const errorsBefore = consoleErrors.length;
  const { identifier } = await send<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", {
    source: `Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });`,
  });
  try {
    await load(url);
    await toBriefing();
    await beginRound();
    await solveRound();
    await waitFor("the result's hint", () => evaluate<boolean>("!!document.querySelector('.result .hint')"), 5000);
    blockedOk = consoleErrors.length === errorsBefore;
    if (!blockedOk) failures.push("storage blocked: console errors during the round");
    await screenshot("16-storage-blocked");
  } catch (e) {
    failures.push(`storage blocked: ${(e as Error).message}`);
    await screenshot("fail-storage-blocked");
  }
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
}

console.log(`\nFaults solved: ${solved.size} of ${faultFile.faults.length}`);
console.log(`Forced walk-out: ${walkedOk ? "the customer reacted, left, and the walked result showed" : "not run or FAILED"}`);
console.log(`Loading: ${loadingChecks.join("; ") || "not run"}`);
console.log(`Daily: ${dailyChecks.join("; ") || "not run"}`);
console.log(`Storage blocked: ${blockedOk ? "a round played to the result with no console errors" : "FAILED"}`);
console.log(`Hand: ${handSeen ? "seen carrying a part to the tray" : "not seen"}; ${pinchSeen ? "seen pinching a small part" : "pinch not seen"}`);
console.log(`Checks: ${checks.join("; ") || "not run"}`);
console.log(`Sound: ${soundChecks.join("; ") || "not run"}; files decoded: ${soundFiles} of ${MOMENT_FILES}`);
console.log(`Fasteners: undone on ${[...fastenedOut].join(", ") || "none"}; done up again on ${[...fastenedBackIn].join(", ") || "none"}; tools seen: ${[...toolsSeen].join(", ") || "none"}`);
if (fastenedOut.size === 0) failures.push("fasteners: no part was seen with its fasteners undone");
for (const t of ["spanner", "screwdriver"]) if (!toolsSeen.has(t)) failures.push(`fasteners: the ${t} was never seen in the hand`);
console.log(`Bench: ${benchChecks.join("; ") || "not run"}`);
if (benchChecks.length !== 4 && !failures.some((x) => x.startsWith("bench:"))) failures.push("bench: the bench checks did not all run");
console.log(`Toolbox: ${toolboxChecks.join("; ") || "not run"}`);
console.log(`Trips: ${tripsRead} watched frame by frame; the hand's path inside the machine's bounds on ${throughMachine.length}${throughMachine.length ? ` (${[...new Set(throughMachine)].join(", ")})` : ""}`);
// In the default view the toolbox and the machine are both in front of the camera: the trip must not hide the hand.
const defaultLegHidden = legHidden.get(DEFAULT_TRIP);
console.log(`Hand hidden on the legs of the default-view trip: ${defaultLegHidden === undefined ? "not watched" : `at most ${(defaultLegHidden * 100).toFixed(0)}%`}, limit ${HIDDEN_LIMIT * 100}%; worst on any trip ${(Math.max(0, ...legHidden.values()) * 100).toFixed(0)}% (views turned until the part showed, where the toolbox can be behind the machine)`);
if (defaultLegHidden !== undefined && defaultLegHidden > HIDDEN_LIMIT) failures.push(`toolbox: ${(defaultLegHidden * 100).toFixed(0)}% of the hand was hidden on the way to or from the toolbox in the default view`);
if (throughMachine.length) failures.push(`toolbox: the hand went through the machine on its way to or from the toolbox: ${[...new Set(throughMachine)].join(", ")}`);
console.log(`Done up with the tool after a put-back: ${[...doneUpWithTool].join(", ") || "none"}`);
if (doneUpWithTool.size === 0) failures.push("toolbox: no part was seen done up with the tool after a put-back");
console.log(`Tools round: ${toolRound.length ? `undone, to the tray and done up again: ${toolRound.join("; ")}` : "not passed"}`);
if (toolRound.length !== 3 && !failures.some((x) => x.startsWith("tools:"))) failures.push("tools: the fuel tank and recoil starter round did not pass");
console.log(`Hand inside the machine: at most ${(worstHidden.share * 100).toFixed(0)}% of its points hidden${worstHidden.where ? ` (${worstHidden.where})` : ""}, limit ${HIDDEN_LIMIT * 100}%`);
if (worstHidden.share > HIDDEN_LIMIT) failures.push(`hand: ${(worstHidden.share * 100).toFixed(0)}% of it went inside the machine, ${worstHidden.where}`);
if (handSeen === null && (await evaluate<boolean>("window.__openAmDevRender?.hasHand?.() ?? false").catch(() => false))) failures.push("hand: never seen carrying a part");
console.log(`Frame rate at 4x CPU throttle (headless, software GL): ${fps} fps, budget ${FPS_BUDGET} fps`);
console.log(`Console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`   ${e}`);
for (const f of failures) console.log(`FAIL ${f}`);
// Close the browser over DevTools: on Windows the launched msedge.exe hands over to another process, so killing its pid
// can leave a headless browser on the debug port, and the next run would reuse it with this run's saved scores.
await Promise.race([send("Browser.close").catch(() => {}), sleep(1000)]);
ws.close();
cleanup();
process.exit(failures.length || consoleErrors.length ? 1 : 0);
