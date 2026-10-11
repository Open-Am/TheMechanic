// Browser check for plan 0003: plays every fault in a Chromium browser at phone size, using real pointer gestures.
// No dependencies: drives Edge or Chrome over the DevTools protocol with Node's own fetch and WebSocket.
//
//   node tools/verify/phone-play.ts [--out <dir>] [--browser <path>] [--lighting fallback]
//
// Starts the Vite dev server, opens the game with ?diag, takes each part off (double tap, then drag to the tray), fixes the culprit, drags the
// chips back, pulls the cord, and repeats with "Next customer" until all six faults are solved. Saves screenshots,
// reports console errors and a frame-rate sample at 4x CPU throttle. Exits 1 on any failure.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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

/** Stops Vite and the browser. On Windows, kill() stops only the top process and leaves the browser's helpers running
 *  (hundreds of headless Edge processes piled up), so the whole process tree is ended with taskkill. */
function cleanup(): void {
  for (const c of children) {
    if (process.platform === "win32" && c.pid !== undefined && c.exitCode === null) {
      spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    } else c.kill();
  }
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
const orbitNow = () => evaluate<{ azimuth: number; polar: number }>("window.__openAmDevRender.orbit()");
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
      await sleep(350);
      await noteHidden(`loosening ${id}`);
      // Plan 0011: a part held on by fasteners is undone with the right tool, fastener by fastener.
      const count = FASTENED.get(id) ?? 0;
      if (count > 0) {
        const tool = await evaluate<string | null>("window.__openAmDevRender.tool()");
        if (tool) toolsSeen.add(tool);
        if (tool && !fastenerShots.has(tool)) {
          fastenerShots.add(tool);
          await screenshot(`12-hand-${tool}`);
        }
      }
      if (await waitFor(`${id} loose`, async () => (await looseNow()).includes(id), 4000).catch(() => false)) {
        if (count > 0) {
          const outs = await evaluate<number[]>(`window.__openAmDevRender.fasteners(${JSON.stringify(id)})`);
          if (outs.length !== count || outs.some((d) => d < 0.006)) failures.push(`fasteners: ${id} came loose with its fasteners not all out (${outs.map((d) => (d * 1000).toFixed(1)).join(", ")} mm)`);
          else fastenedOut.add(id);
          if (await evaluate<string | null>("window.__openAmDevRender.tool()")) failures.push(`fasteners: the tool was still out after ${id} came loose`);
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
const fastenerShots = new Set<string>();
const fastenedOut = new Set<string>();
const fastenedBackIn = new Set<string>();

async function putBack(id: string): Promise<void> {
  await idle();
  const chip = await evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector('.tray [data-part="${id}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  // Drop over the machine, right of centre: clear of the diagnostic panel in the top-left corner.
  await drag(chip.x, chip.y, VIEWPORT.width * 0.72, VIEWPORT.height * 0.5, 12);
  await waitFor(`${id} back on`, async () => !(await trayHas(id)), 3000);
  if (FASTENED.has(id)) {
    await idle();
    const outs = await evaluate<number[]>(`window.__openAmDevRender.fasteners(${JSON.stringify(id)})`);
    if (outs.some((d) => d > 0.0005)) failures.push(`fasteners: ${id} went back on with its fasteners not done up`);
    else fastenedBackIn.add(id);
  }
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
  if (process.env.HIDDEN_DEBUG && share > 0.05) console.log(`   hidden ${(share * 100).toFixed(0)}% ${where}`);
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

      // A double tap on the blocked tank does nothing.
      await doubleTap(tank.x, tank.y);
      await sleep(900);
      if ((await looseNow()).includes("fuel_tank") || (await trayHas("fuel_tank"))) failures.push("double tap: the blocked fuel tank loosened");
      else checks.push("a double tap on a blocked part does nothing");

      // A drag on the blocked tank, and on the hose that could come off but is not loose, turns the machine.
      for (const [id, p] of [["fuel_tank", tank], ["fuel_hose", await probe("fuel_hose")]] as const) {
        if (!p) continue;
        const before = await orbitNow();
        const dx = p.dir.headOn ? 0 : p.dir.x;
        const dy = p.dir.headOn ? 1 : p.dir.y;
        await drag(p.x, p.y, p.x + dx * 70, p.y + dy * 70);
        await sleep(300);
        const after = await orbitNow();
        const turned = Math.abs(after.azimuth - before.azimuth) + Math.abs(after.polar - before.polar) > 0.01;
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
  await send("Page.navigate", { url });
  await waitFor("the briefing", () => evaluate<boolean>("!!document.querySelector('.briefing')"), 20000);
  await sleep(300);
}
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

// A forced walk-out (plan 0007): every customer gets 5 seconds of patience. The customer should react at 50 percent,
// leave, and the walked result screen should show.
let walkedOk = false;
if (failures.length === 0) {
  await send("Page.navigate", { url: url.replace("?diag", "?diag&patience=5") });
  await waitFor("the briefing", () => evaluate<boolean>("!!document.querySelector('.briefing')"), 20000);
  await sleep(300);
  await tapSelector(".briefing .primary");
  await sleep(3000);
  if (await evaluate<boolean>("!document.querySelector('.speech').hidden")) await screenshot("5-customer-line");
  else failures.push("walk-out: the customer said nothing at 50 percent patience");
  walkedOk = await waitFor("the walked result", () => evaluate<boolean>("!!document.querySelector('.result.walked')"), 12000).catch(() => false);
  if (walkedOk) await screenshot("6-walked");
  else failures.push("walk-out: no walked result screen after the patience ran out");
}

console.log(`\nFaults solved: ${solved.size} of ${faultFile.faults.length}`);
console.log(`Forced walk-out: ${walkedOk ? "the customer reacted, left, and the walked result showed" : "not run or FAILED"}`);
console.log(`Hand: ${handSeen ? "seen carrying a part to the tray" : "not seen"}; ${pinchSeen ? "seen pinching a small part" : "pinch not seen"}`);
console.log(`Checks: ${checks.join("; ") || "not run"}`);
console.log(`Fasteners: undone on ${[...fastenedOut].join(", ") || "none"}; done up again on ${[...fastenedBackIn].join(", ") || "none"}; tools seen: ${[...toolsSeen].join(", ") || "none"}`);
if (fastenedOut.size === 0) failures.push("fasteners: no part was seen with its fasteners undone");
if (!toolsSeen.has("spanner")) failures.push("fasteners: the spanner was never seen in the hand");
console.log(`Hand inside the machine: at most ${(worstHidden.share * 100).toFixed(0)}% of its points hidden${worstHidden.where ? ` (${worstHidden.where})` : ""}, limit ${HIDDEN_LIMIT * 100}%`);
if (worstHidden.share > HIDDEN_LIMIT) failures.push(`hand: ${(worstHidden.share * 100).toFixed(0)}% of it went inside the machine, ${worstHidden.where}`);
if (handSeen === null && (await evaluate<boolean>("window.__openAmDevRender?.hasHand?.() ?? false").catch(() => false))) failures.push("hand: never seen carrying a part");
console.log(`Frame rate at 4x CPU throttle (headless, software GL): ${fps} fps`);
console.log(`Console errors: ${consoleErrors.length}`);
for (const e of consoleErrors) console.log(`   ${e}`);
for (const f of failures) console.log(`FAIL ${f}`);
ws.close();
cleanup();
process.exit(failures.length || consoleErrors.length ? 1 : 0);
