// Browser check for plan 0003: plays every fault in a Chromium browser at phone size, using real pointer gestures.
// No dependencies: drives Edge or Chrome over the DevTools protocol with Node's own fetch and WebSocket.
//
//   node tools/verify/phone-play.ts [--out <dir>] [--browser <path>]
//
// Starts the Vite dev server, opens the game with ?diag, pulls each part along its path, fixes the culprit, drags the
// chips back, pulls the cord, and repeats with "Next customer" until all six faults are solved. Saves screenshots,
// reports console errors and a frame-rate sample at 4x CPU throttle. Exits 1 on any failure.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { removalOrder } from "../../game/src/core/rules.ts";
import type { FaultFile, Machine } from "../../game/src/core/types.ts";

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

const PORT = 5199;
const DEBUG_PORT = 9333;
const VIEWPORT = { width: 390, height: 844 };
/** A camera drag on empty background, clear of the diagnostic panel in the top-left corner. */
const ROTATE = { x0: 290, y0: 300, x1: 370, y1: 320 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const children: ChildProcess[] = [];
const failures: string[] = [];
const consoleErrors: string[] = [];

function cleanup(): void {
  for (const c of children) c.kill();
}
process.on("exit", cleanup);

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
const trayHas = (id: string) => evaluate<boolean>(`!!document.querySelector('.tray [data-part="${id}"]')`);

async function pullOff(id: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await idle();
    const p = await evaluate<{ x: number; y: number; dir: { x: number; y: number; headOn: boolean } } | null>(`window.__openAmDevRender.probe(${JSON.stringify(id)})`);
    if (p) {
      const dx = p.dir.headOn ? 0 : p.dir.x;
      const dy = p.dir.headOn ? 1 : p.dir.y;
      await drag(p.x, p.y, p.x + dx * 70, p.y + dy * 70);
      if (await waitFor(`${id} in the tray`, () => trayHas(id), 3000).catch(() => false)) return;
    }
    // Hidden from this angle, or the pull missed: turn the machine and try again, as a player would.
    await drag(ROTATE.x0, ROTATE.y0, ROTATE.x1, ROTATE.y1);
  }
  throw new Error(`could not pull ${id} off`);
}

async function putBack(id: string): Promise<void> {
  await idle();
  const chip = await evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector('.tray [data-part="${id}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  await drag(chip.x, chip.y, VIEWPORT.width / 2, VIEWPORT.height * 0.35, 12);
  await waitFor(`${id} back on`, async () => !(await trayHas(id)), 3000);
}

// ---- The run ----

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url });
await waitFor("the briefing", () => evaluate<boolean>("!!document.querySelector('.briefing')"), 20000);
await sleep(500);
await screenshot("1-briefing");

const solved = new Map<string, string>();
const shots = new Set<string>();
for (let round = 1; round <= 30 && solved.size < faultFile.faults.length; round++) {
  await tapSelector(".briefing .primary");
  await waitFor("the HUD", () => evaluate<boolean>("!document.querySelector('.hud').hidden"));
  const m = /fault (\S+)\s+culprit (\S+)/.exec(await diag());
  if (!m) throw new Error("diagnostic overlay did not show the fault");
  const fault = faultFile.faults.find((f) => f.id === m[1])!;
  const order = removalOrder(machine, fault);
  try {
    for (const id of order) {
      await pullOff(id);
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
    const score = await evaluate<string>("document.querySelector('.result .total').textContent");
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
  await waitFor("the briefing", () => evaluate<boolean>("!!document.querySelector('.briefing')"));
}

for (const f of faultFile.faults) if (!solved.has(f.id) && !failures.some((x) => x.startsWith(f.id))) failures.push(`${f.id}: never came up or not solved`);

// Frame rate at 4x CPU throttle, read from the diagnostic overlay while the camera turns.
if (failures.length === 0) await tapSelector(".briefing .primary");
await send("Emulation.setCPUThrottlingRate", { rate: 4 });
for (let i = 0; i < 6; i++) await drag(ROTATE.x0, ROTATE.y0, ROTATE.x1, ROTATE.y1, 20);
await sleep(1200);
const fps = Number(/fps (\d+)/.exec(await diag())?.[1] ?? "0");
await send("Emulation.setCPUThrottlingRate", { rate: 1 });

console.log(`\nFaults solved: ${solved.size} of ${faultFile.faults.length}`);
console.log(`Frame rate at 4x CPU throttle (headless, software GL): ${fps} fps`);
console.log(`Console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`   ${e}`);
for (const f of failures) console.log(`FAIL ${f}`);
ws.close();
cleanup();
process.exit(failures.length || consoleErrors.length ? 1 : 0);
