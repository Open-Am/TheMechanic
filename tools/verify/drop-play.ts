// Browser check for removal (ADR 0020, release 0.9.3): takes all twelve parts off one after another, as a player does,
// and records how many tries each step needed. No dependencies: drives Edge or Chrome over the DevTools protocol.
//
//   node tools/verify/drop-play.ts [--out <dir>] [--browser <path>] [--input mouse,touch] [--drop chips,above-cord,bottom,cord]
//                                [--viewport 390x844]
//   npm run verify:drop -- --out <dir>
//   OPEN_AM_PORT=5299 OPEN_AM_DEBUG_PORT=9433 run it beside another copy (defaults 5199 and 9333). The browser profile is
//   a fresh temporary folder on every run.
//
// For every input (mouse events, or touch events with touch emulation so pointerType is "touch") and every drop place
// (on the tray chips, just above the pull cord, at the very bottom of the screen, on the pull cord button) it plays one
// round, taking the twelve parts off in an order the rules allow. Each removal is:
//   1. a double tap (double click) where a player would aim: the visible point of the part nearest the middle of its
//      picture, not a point searched out of its hit volume;
//   2. a press on the loose part, again where it shows, and a drag; the carry must start on that press;
//   3. a drop at the drop place; the part must be in the tray after it.
// The double tap's second tap lands 3 px off the first, as a thumb's does. A part out of sight is brought into view by
// turning the machine first, which is not counted as a try; one that never shows (the capacitor) is aimed at through
// its hit volume. It prints a table per round (tries for each step, what the finger landed on, the controls' top edge
// and the machine's lowest point on screen, the double tap's lift-to-lift time and input lag as the page saw them, the
// frame rate from the diagnostic overlay, running tweens), saves screenshots after 0, 4, 8, 11 and 12 removals, and
// exits 1 unless every step of every removal worked on the first try, the machine never went under the controls, the
// frame rate held, and the console stayed clean. DROP_DEBUG=1 prints every aim, press and pointer event.
// The game must be the development build: it reads the dev hook window.__openAmDevRender.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Machine } from "../../game/src/core/types.ts";
import { SILENT_AUDIO_SOURCE } from "./silent-audio.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const outDir = arg("--out") ?? join(tmpdir(), "open-am-drop-play");
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

type Input = "mouse" | "touch";
type DropPlace = "chips" | "above-cord" | "bottom" | "cord";
const INPUTS = (arg("--input") ?? "mouse,touch").split(",") as Input[];
const DROPS = (arg("--drop") ?? "chips,above-cord,bottom,cord").split(",") as DropPlace[];

const machine = JSON.parse(readFileSync(join(root, "game", "public", "machines", "gen950", "machine.json"), "utf8")) as Machine;
/** Every part, each after the parts it requires. */
const ORDER: string[] = (() => {
  const order: string[] = [];
  const visit = (id: string) => {
    if (order.includes(id)) return;
    for (const dep of machine.parts.find((p) => p.id === id)?.requires ?? []) visit(dep);
    order.push(id);
  };
  for (const p of machine.parts) visit(p.id);
  return order;
})();

const PORT = Number(process.env.OPEN_AM_PORT) || 5199;
const DEBUG_PORT = Number(process.env.OPEN_AM_DEBUG_PORT) || 9333;
const VIEWPORT = (() => {
  const m = /^(\d+)x(\d+)$/.exec(arg("--viewport") ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 390, height: 844 };
})();
/** A camera drag on empty background, to bring a hidden part into view. */
const ROTATE = { x0: Math.round(VIEWPORT.width * 0.6), y0: 140, x1: Math.min(VIEWPORT.width - 5, Math.round(VIEWPORT.width * 0.6) + 140), y1: 140 };
const TRIES = 5;
/** DROP_DEBUG=1 prints every try's aim point and the pointer events the page saw. */
const DEBUG = !!process.env.DROP_DEBUG;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const children: ChildProcess[] = [];
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
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// ---- Dev server and browser ----

const vite = spawn(process.execPath, [join(root, "game", "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"], {
  cwd: join(root, "game"),
  stdio: "ignore",
});
children.push(vite);
const url = `http://localhost:${PORT}/?diag`;
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
  if (data.method === "Runtime.consoleAPICalled" && params.type === "error") {
    consoleErrors.push((params.args as Array<{ value?: unknown; description?: string }>).map((a) => a.value ?? a.description).join(" "));
  }
  if (data.method === "Runtime.exceptionThrown") {
    const d = params.exceptionDetails as { text: string; exception?: { description?: string } };
    consoleErrors.push(d.exception?.description ?? d.text);
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
async function screenshot(name: string): Promise<string> {
  const r = await send<{ data: string }>("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  return file;
}

// ---- Pointers: mouse events, or touch events (pointerType "touch", as on a phone) ----

let input: Input = "mouse";
async function down(x: number, y: number, clickCount = 1): Promise<void> {
  if (input === "mouse") await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount });
  else await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
}
async function move(x: number, y: number): Promise<void> {
  if (input === "mouse") await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
  else await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
}
async function up(x: number, y: number, clickCount = 1): Promise<void> {
  if (input === "mouse") await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount });
  else await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
/** Two quick taps, the second landing a few pixels off the first, as a thumb does. */
async function doubleTap(x: number, y: number): Promise<void> {
  await down(x, y, 1);
  await sleep(50);
  await up(x, y, 1);
  await sleep(90);
  await down(x + 3, y + 2, 2);
  await sleep(50);
  await up(x + 3, y + 2, 2);
}
async function drag(x0: number, y0: number, x1: number, y1: number, steps = 10): Promise<void> {
  await down(x0, y0);
  for (let i = 1; i <= steps; i++) {
    await move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await sleep(16);
  }
  await up(x1, y1);
}

// ---- Game state from the page ----

type Aim = { x: number; y: number; pick: string | null; solid: boolean; hidden?: boolean };
const hook = (call: string) => `window.__openAmDevRender.${call}`;
const idle = () => waitFor("animations to finish", () => evaluate<boolean>(`!${hook("busy()")}`), 8000);
const aim = (id: string) => evaluate<Aim | null>(hook(`aim(${JSON.stringify(id)})`));
const looseNow = () => evaluate<string[]>(hook("loose()"));
const pressPart = (x: number, y: number) => evaluate<string | null>(hook(`pressPart(${x}, ${y})`));
const carrying = () =>evaluate<string | null>(hook("carrying()"));
const trayHas = (id: string) => evaluate<boolean>(`!!document.querySelector('.tray [data-part="${id}"]')`);
/** The diagnostic overlay's frame rate after a second and a bit with nothing happening, so it is a whole fresh reading. */
const steadyFps = async () => {
  await sleep(1100);
  return fps();
};
const fps = async () => Number(/(\d+) fps/.exec(await evaluate<string>(`document.querySelector('[data-marker="open-am-diagnostic-overlay"]')?.textContent ?? ""`))?.[1] ?? "0");
/** What a press at (x, y) lands on: "canvas" when it reaches the 3D view, otherwise the element's class. */
const landsOn = (x: number, y: number) =>
  evaluate<string>(`(() => { const e = document.elementFromPoint(${x}, ${y}); return !e ? "nothing" : e.tagName === "CANVAS" ? "canvas" : (e.closest(".chip") ? "chip" : e.className || e.tagName.toLowerCase()); })()`);
const rect = (selector: string) =>
  evaluate<{ top: number; bottom: number; left: number; right: number } | null>(
    `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`,
  );
async function tapSelector(selector: string): Promise<void> {
  const r = await waitFor(selector, () => rect(selector));
  const x = (r.left + r.right) / 2;
  const y = (r.top + r.bottom) / 2;
  await down(x, y);
  await sleep(40);
  await up(x, y);
}

/** The drop point for a place, read while the part is carried (the controls are laid out for carrying then). */
async function dropPoint(place: DropPlace, x: number): Promise<{ x: number; y: number }> {
  const pull = (await rect(".pull"))!;
  const tray = (await rect(".tray-host"))!;
  const dx = Math.min(VIEWPORT.width - 30, Math.max(30, x));
  switch (place) {
    case "chips":
      return { x: dx, y: (tray.top + tray.bottom) / 2 };
    case "above-cord":
      return { x: dx, y: pull.top - 24 };
    case "bottom":
      return { x: dx, y: VIEWPORT.height - 2 };
    case "cord":
      return { x: (pull.left + pull.right) / 2, y: (pull.top + pull.bottom) / 2 };
  }
}

interface Row {
  n: number;
  id: string;
  turns: number;
  loosenTries: number;
  carryTries: number;
  dropTries: number;
  landed: string;
  /** "solid" if the finger lands with the part all round it, "edge" if only a sliver shows, "hid" if it never shows and is aimed at by its hit volume. */
  spot: string;
  pickedOther: string;
  controlsTop: number;
  /** The lowest screen y of the machine's bounding box: below controlsTop, the controls cover part of the machine. */
  machineBottom: number;
  /** Time between the two pointerups of the first double tap as the page saw them, ms (the double tap allows 300). */
  gap: number;
  /** Longest wait between an input event happening and the page handling it, during the first double tap, ms. */
  lag: number;
  fps: number;
  tweens: number;
  ok: boolean;
  note: string;
}

/** Turns the machine until the part shows somewhere a finger can reach it. Returns the aim point and the turns used. */
async function bringIntoView(id: string): Promise<{ at: Aim | null; turns: number }> {
  // A player turns the machine until the part shows clearly where a finger reaches the 3D view; a part that only ever
  // shows a sliver is aimed at where it shows, after a full turn (a second round of turns takes the first sliver seen).
  let turns = 0;
  for (; turns < 14; turns++) {
    await idle();
    const at = await aim(id);
    if (DEBUG) console.log(`   view ${id} turn ${turns}: aim ${JSON.stringify(at)} lands ${at ? await landsOn(at.x, at.y) : "-"} probe ${JSON.stringify(await evaluate(hook(`probe(${JSON.stringify(id)})`)))}`);
    if (at && at.y > 90 && (await landsOn(at.x, at.y)) === "canvas" && (at.solid || turns >= 7)) return { at, turns };
    // A part that never shows from any side (the capacitor sits inside the alternator end) is aimed at through its
    // finger-sized hit volume, where a player who knows where it is would tap.
    if (turns >= 7) {
      const p = await evaluate<{ x: number; y: number } | null>(hook(`probe(${JSON.stringify(id)})`));
      if (p && p.y > 90 && (await landsOn(p.x, p.y)) === "canvas") return { at: { x: p.x, y: p.y, pick: id, solid: false, hidden: true }, turns };
    }
    await drag(ROTATE.x0, ROTATE.y0, ROTATE.x1, ROTATE.y1);
  }
  return { at: null, turns };
}

async function removeOne(n: number, id: string, place: DropPlace): Promise<Row> {
  const row: Row = { n, id, turns: 0, loosenTries: 0, carryTries: 0, dropTries: 0, landed: "", spot: "", pickedOther: "", controlsTop: Math.round((await rect(".controls"))!.top), machineBottom: 0, gap: 0, lag: 0, fps: await steadyFps(), tweens: await evaluate<number>(hook("tweenCount()")), ok: false, note: "" };
  const low = await evaluate<{ y: number; part: string | null } | null>(hook("machineBottom()"));
  row.machineBottom = low?.y ?? 0;
  if (low && low.y > row.controlsTop) row.note = `under the controls: ${low.part ?? "base"}; `;
  // 1. Loosen.
  while (row.loosenTries < TRIES) {
    const v = await bringIntoView(id);
    row.turns += v.turns;
    if (!v.at) {
      row.note += "never in view";
      return row;
    }
    row.loosenTries++;
    const lands = await landsOn(v.at.x, v.at.y);
    if (row.loosenTries === 1) {
      row.landed = lands;
      row.spot = v.at.hidden ? "hid" : v.at.solid ? "solid" : "edge";
    }
    if (v.at.pick !== id && !row.pickedOther) row.pickedOther = v.at.pick ?? "none";
    await evaluate("window.__pe = []");
    await doubleTap(v.at.x, v.at.y);
    // A part with fasteners first makes the trip to the toolbox for its tool (plan 0012): up to about 3 s.
    const worked = await waitFor("loose", async () => (await looseNow()).includes(id), 5000).catch(() => false);
    if (row.loosenTries === 1) {
      const ev = await evaluate<Array<[string, string, number, number, number, number, string]>>("window.__pe");
      const ups = ev.filter((e) => e[0] === "pointerup").map((e) => e[4]);
      row.gap = ups.length >= 2 ? Math.round(ups[1]! - ups[0]!) : -1;
      row.lag = Math.round(Math.max(0, ...ev.map((e) => e[5])));
    }
    if (DEBUG) console.log(`   ${id} aim ${JSON.stringify(v.at)} press ${await pressPart(v.at.x, v.at.y)} / ${await pressPart(v.at.x + 3, v.at.y + 2)} lands ${lands} loose ${worked} events ${JSON.stringify(await evaluate("window.__pe"))}`);
    if (worked) break;
  }
  if (!(await looseNow()).includes(id)) {
    row.note += "did not loosen";
    return row;
  }
  // 2 and 3. Carry and drop.
  while (row.dropTries < TRIES) {
    await idle();
    const v = await bringIntoView(id);
    row.turns += v.turns;
    if (!v.at) {
      row.note += "loose part out of view";
      return row;
    }
    const start = v.at;
    const before = DEBUG ? await pressPart(start.x, start.y) : null;
    await down(start.x, start.y);
    await sleep(20);
    for (let i = 1; i <= 3; i++) {
      await move(start.x, start.y + 5 * i);
      await sleep(16);
    }
    row.carryTries++;
    const carried = (await carrying()) === id;
    if (DEBUG) console.log(`   carry ${id} at ${JSON.stringify(start)} press ${before} carrying ${await carrying()}`);
    if (!carried) {
      // The press turned the machine instead; let go where we are and try again.
      await up(start.x, start.y + 15);
      continue;
    }
    row.dropTries++;
    const to = await dropPoint(place, start.x);
    const from = { x: start.x, y: start.y + 15 };
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      await move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await sleep(16);
    }
    await sleep(30);
    await up(to.x, to.y);
    if (await waitFor("in the tray", () => trayHas(id), 2000).catch(() => false)) {
      row.ok = row.loosenTries === 1 && row.carryTries === 1 && row.dropTries === 1;
      return row;
    }
    if (!(await looseNow()).includes(id)) {
      row.note += "no longer loose after a drop";
      return row;
    }
    if (row.carryTries >= TRIES * 2) break;
  }
  row.note += "never dropped";
  return row;
}

// ---- The run ----

await send("Runtime.enable");
await send("Page.enable");
// The real sounds play through the speakers (the owner prefers to hear them, 2026-10-12). OPEN_AM_SILENT=1 routes them
// through a zero gain instead, so the machine stays quiet. Never --mute-audio: see silent-audio.ts.
if (process.env.OPEN_AM_SILENT === "1") await send("Page.addScriptToEvaluateOnNewDocument", { source: SILENT_AUDIO_SOURCE });
await send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });

const SHOTS = new Set([0, 4, 8, 11]);
const summary: string[] = [];
let allOk = true;
/** Removals that started with part of the machine under the controls. */
let covered = 0;
const fpsSeen: number[][] = [];

for (const inp of INPUTS) {
  input = inp;
  await send("Emulation.setTouchEmulationEnabled", { enabled: inp === "touch", maxTouchPoints: 5 });
  for (const place of DROPS) {
    await send("Page.navigate", { url });
    await tapSelector(".start .free"); // the start screen (plan 0014): free play
    await waitFor("the briefing", () => evaluate<boolean>("!!document.querySelector('.briefing')"), 20000);
    await sleep(300);
    // Start stays disabled until the machine has loaded (plan 0014).
    await waitFor("Start enabled", () => evaluate<boolean>("document.querySelector('.briefing .primary')?.disabled === false"), 30000);
    await tapSelector(".briefing .primary");
    await waitFor("the HUD", () => evaluate<boolean>("!document.querySelector('.hud').hidden"));
    // Plan 0017: the customer brings the generator; a tap skips the arrival, then the clock runs.
    await sleep(250);
    if (await evaluate<boolean>("!!window.__openAmDevRender.story()")) await tapSelector("canvas");
    await waitFor("the clock running", () => evaluate<boolean>("window.__openAmDevRender.running()"), 15000);
    // Collapse the diagnostic panel to its one-line frame rate so it covers nothing a player would touch.
    await tapSelector('[data-marker="open-am-diagnostic-overlay"]');
    // Every pointer event the page handles: type, pointer type, where, when it was handled, how long after it happened.
    await evaluate(
      `window.__pe = []; for (const t of ["pointerdown", "pointerup", "pointercancel"]) window.addEventListener(t, (e) => window.__pe.push([e.type, e.pointerType, Math.round(e.clientX), Math.round(e.clientY), performance.now(), performance.now() - e.timeStamp, e.target.tagName]), true); true`,
    );
    await sleep(1200);
    await idle();
    const rows: Row[] = [];
    const roundFps: number[] = [];
    for (let i = 0; i < ORDER.length; i++) {
      if (SHOTS.has(i)) console.log(`   screenshot ${await screenshot(`${inp}-${place}-after-${i}`)}`);
      const row = await removeOne(i + 1, ORDER[i]!, place);
      rows.push(row);
      roundFps.push(row.fps);
      if (!row.ok) allOk = false;
      if (row.machineBottom > row.controlsTop) covered++;
      if (!(await trayHas(ORDER[i]!))) break; // the rest depend on it, or the round is broken
    }
    if (rows.length === ORDER.length && rows[rows.length - 1]!.ok) console.log(`   screenshot ${await screenshot(`${inp}-${place}-after-12`)}`);
    fpsSeen.push(roundFps);
    console.log(`\n${inp}, dropped ${place}:`);
    console.log(" #  part              spot  turns loosen carry drop  lands on  picks      ctrl-top mach-bot  gap  lag fps tweens  result");
    for (const r of rows) {
      console.log(
        `${String(r.n).padStart(2)}  ${r.id.padEnd(17)} ${r.spot.padEnd(5)} ${String(r.turns).padStart(5)} ${String(r.loosenTries).padStart(6)} ${String(r.carryTries).padStart(5)} ${String(r.dropTries).padStart(4)}  ${r.landed.padEnd(9)} ${(r.pickedOther || "-").padEnd(10)} ${String(r.controlsTop).padStart(8)} ${String(r.machineBottom).padStart(8)} ${String(r.gap).padStart(4)} ${String(r.lag).padStart(4)} ${String(r.fps).padStart(3)} ${String(r.tweens).padStart(6)}  ${r.ok ? `ok ${r.note}` : `RETRY ${r.note}`}`,
      );
    }
    const first = rows.filter((r) => r.ok).length;
    summary.push(`${inp.padEnd(5)} ${place.padEnd(10)} ${first} of ${ORDER.length} removals worked first time${rows.length < ORDER.length ? `, stopped after ${rows.length}` : ""}`);
  }
}

// The frame rate must not fall as parts come off: the median of the last third of each round against the first third.
// The reading before the first removal is left out: until the first touch of a round the hand has never been drawn, and
// with a mouse it stays in view after that, which costs the same at every removal.
let fpsOk = true;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
for (const all of fpsSeen) {
  const f = all.slice(1);
  if (f.length < 3) continue;
  const third = Math.max(1, Math.floor(f.length / 3));
  const early = median(f.slice(0, third));
  const late = median(f.slice(-third));
  if (late < early * 0.8) fpsOk = false;
}

console.log("\nSummary:");
for (const s of summary) console.log(`   ${s}`);
console.log(`Machine under the controls: at the start of ${covered} removal${covered === 1 ? "" : "s"}`);
console.log(`Frame rate: ${fpsOk ? "held through every round" : "FELL as parts came off"}`);
console.log(`Console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`   ${e}`);
// Close the browser over DevTools: on Windows the launched msedge.exe hands over to another process, so killing its pid
// can leave a headless browser on the debug port, and the next run would reuse it with this run's saved scores.
await Promise.race([send("Browser.close").catch(() => {}), sleep(1000)]);
ws.close();
process.exit(allOk && fpsOk && covered === 0 && consoleErrors.length === 0 ? 0 : 1);
