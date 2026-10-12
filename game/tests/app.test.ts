import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Emitter } from "../src/app/emitter.ts";
import { pickFault } from "../src/app/faults.ts";
import { dailyStatus } from "../src/app/daily.ts";
import { createGame, type GameEvents } from "../src/app/round.ts";
import { dailyCustomerId, dailyFaultId, dayNumber } from "../src/core/daily.ts";
import { conditionText } from "../src/core/reducer.ts";
import { removalOrder } from "../src/core/rules.ts";
import { score } from "../src/core/score.ts";
import type { CustomerFile } from "../src/core/types.ts";
import type { Moment, ScoreStore, StoredResult, VibrationPattern } from "../src/platform/interfaces/index.ts";
import { CORD_SECONDS, ENGINE_LOOP, MOMENTS, VIBRATION, giveMoment, playMoment } from "../src/app/moments.ts";
import { MOTION_TYPES } from "../src/core/types.ts";
import { createDailyProvider } from "../src/platform/local/daily.ts";
import { loadFaults, loadMachine } from "./helpers.ts";

const machine = loadMachine();
const faults = loadFaults();

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, today: () => new Date(0), advance: (ms: number) => (t += ms), set: (ms: number) => (t = ms) };
}

/** Records every moment played (with its delay) and every vibration. */
function recorder() {
  const sounds: Moment[] = [];
  const calls: Array<[Moment, number]> = [];
  const vibrations: Array<[VibrationPattern, number]> = [];
  const audio = {
    play: (m: Moment, delay = 0) => void (sounds.push(m), calls.push([m, delay])),
    vibrate: (p: VibrationPattern, delay = 0) => void vibrations.push([p, delay]),
  };
  return { audio, sounds, calls, vibrations };
}
const silent = { play: () => {}, vibrate: () => {} };

/** A game whose random always picks the fault with this ID. */
function setup(faultId: string) {
  const clock = fakeClock();
  const { audio, sounds, calls, vibrations } = recorder();
  const index = faults.faults.findIndex((f) => f.id === faultId);
  const random = () => (index + 0.5) / faults.faults.length;
  const game = createGame({ machine, faults, clock, audio, random });
  const seen: Array<keyof GameEvents> = [];
  for (const name of ["started", "removed", "installed", "inspected", "fixed", "pulled", "refused", "ended"] as const) {
    game.events.on(name, () => seen.push(name));
  }
  return { game, clock, sounds, calls, vibrations, seen };
}

describe("emitter", () => {
  it("delivers to every listener and stops after unsubscribe", () => {
    const e = new Emitter<{ ping: number }>();
    const got: number[] = [];
    const off = e.on("ping", (n) => got.push(n));
    e.on("ping", (n) => got.push(n * 10));
    e.emit("ping", 1);
    off();
    e.emit("ping", 2);
    expect(got).toEqual([1, 10, 20]);
  });

  it("a listener that unsubscribes during emit does not skip the next", () => {
    const e = new Emitter<{ ping: null }>();
    const got: string[] = [];
    const off = e.on("ping", () => {
      got.push("a");
      off();
    });
    e.on("ping", () => got.push("b"));
    e.emit("ping", null);
    expect(got).toEqual(["a", "b"]);
  });
});

describe("pickFault", () => {
  it("never picks the previous fault when there is another", () => {
    for (const prev of faults.faults) {
      for (let r = 0; r < 1; r += 0.05) expect(pickFault(faults.faults, prev.id, () => r).id).not.toBe(prev.id);
    }
  });

  it("reaches every fault and is the same for the same random value", () => {
    const ids = new Set<string>();
    for (let r = 0; r < 1; r += 0.01) ids.add(pickFault(faults.faults, null, () => r).id);
    expect(ids.size).toBe(faults.faults.length);
    expect(pickFault(faults.faults, null, () => 0.42).id).toBe(pickFault(faults.faults, null, () => 0.42).id);
  });

  it("copes with a random of exactly 1 and with a single fault", () => {
    expect(pickFault(faults.faults, null, () => 1)).toBeDefined();
    const one = [faults.faults[0]!];
    expect(pickFault(one, one[0]!.id, () => 0.5)).toBe(one[0]);
    expect(() => pickFault([], null, () => 0)).toThrow();
  });
});

describe("game", () => {
  it("ignores proposals before begin, and starts the timer at begin", () => {
    const { game, clock, seen } = setup("fouled_plug");
    const b = game.newRound();
    expect(b.symptom).toBe("no_start");
    expect(game.propose({ type: "remove", partId: "plug_cap" })).toBe(false);
    expect(game.elapsed()).toBe(0);
    game.begin();
    clock.advance(2500);
    expect(game.elapsed()).toBe(2500);
    expect(seen).toEqual(["started"]);
  });

  it("emits one event per accepted action and logs it with the elapsed time", () => {
    const { game, clock, seen, sounds } = setup("fouled_plug");
    game.newRound();
    game.begin();
    clock.advance(1000);
    expect(game.propose({ type: "remove", partId: "plug_cap" })).toBe(true);
    clock.advance(1000);
    expect(game.propose({ type: "remove", partId: "spark_plug" })).toBe(true);
    game.propose({ type: "inspect", partId: "spark_plug" });
    game.propose({ type: "fix", partId: "spark_plug" });
    expect(seen).toEqual(["started", "removed", "removed", "inspected", "fixed"]);
    expect(game.log.map((a) => a.t)).toEqual([1000, 2000, 2000, 2000]);
    expect(sounds).toEqual(["land", "land"]); // the part lands on the tray (ADR 0018)
  });

  it("a refusal emits refused, logs nothing and plays nothing", () => {
    const { game, seen, sounds } = setup("fouled_plug");
    game.newRound();
    game.begin();
    const refusals: string[] = [];
    game.events.on("refused", (r) => refusals.push(r.reason));
    expect(game.propose({ type: "remove", partId: "spark_plug" })).toBe(false);
    expect(refusals).toEqual(["blocked_by"]);
    expect(game.log).toEqual([]);
    expect(sounds).toEqual([]);
    expect(seen).toEqual(["started", "refused"]);
  });

  it("a failed pull plays the cord then fail and continues; a good pull ends the round with the log's score", () => {
    const { game, clock, sounds, calls, vibrations } = setup("fouled_plug");
    game.newRound();
    game.begin();
    let ended: GameEvents["ended"] | null = null;
    game.events.on("ended", (e) => (ended = e));
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(calls).toEqual([["cord", 0], ["fail", CORD_SECONDS]]);
    expect(vibrations).toEqual([[40, CORD_SECONDS]]);
    expect(game.running).toBe(true);
    for (const [type, partId] of [["remove", "plug_cap"], ["remove", "spark_plug"], ["fix", "spark_plug"], ["install", "spark_plug"], ["install", "plug_cap"]] as const) {
      clock.advance(1000);
      expect(game.propose({ type, partId }), `${type} ${partId}`).toBe(true);
    }
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(sounds.slice(-2)).toEqual(["cord", "start"]);
    expect(calls.at(-1)).toEqual(["start", CORD_SECONDS]);
    expect(vibrations.at(-1)).toEqual([VIBRATION.start, CORD_SECONDS]);
    expect(sounds.filter((m) => m === "seat")).toEqual([]); // the seat comes from render, when the part reaches home
    expect(game.running).toBe(false);
    expect(ended).not.toBeNull();
    const e = ended!;
    expect(e.t).toBe(7000);
    expect(e.score).toEqual(score(machine, faults.faults.find((f) => f.id === "fouled_plug")!, e.log));
    expect(e.score.failedPulls).toBe(1);
    clock.advance(5000);
    expect(game.elapsed()).toBe(7000);
  });

  it("tells 'pulled' before the cord plays, so a part still going back seats before the cord (plan 0013)", () => {
    const clock = fakeClock();
    const { audio, sounds, vibrations } = recorder();
    const index = faults.faults.findIndex((f) => f.id === "fouled_plug");
    const game = createGame({ machine, faults, clock, audio, random: () => (index + 0.5) / faults.faults.length });
    // What render does on "pulled": a part caught mid put-back is pressed home and seats.
    game.events.on("pulled", () => playMoment(audio, "seat"));
    game.newRound();
    game.begin();
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(sounds).toEqual(["seat", "cord", "fail"]);
    expect(vibrations).toEqual([[VIBRATION.seat, 0], [40, CORD_SECONDS]]);
    for (const [type, partId] of [["remove", "plug_cap"], ["remove", "spark_plug"], ["fix", "spark_plug"], ["install", "spark_plug"], ["install", "plug_cap"]] as const) {
      clock.advance(1000);
      game.propose({ type, partId });
    }
    sounds.length = 0;
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(sounds).toEqual(["seat", "cord", "start"]);
  });

  it("leaves the cord and the engine's answer to render once told to (plan 0018), and plays them itself otherwise", () => {
    const { game, clock, sounds } = setup("fouled_plug");
    game.setPullSoundsByRender(true);
    game.newRound();
    game.begin();
    clock.advance(1000);
    let pulled = 0;
    game.events.on("pulled", () => pulled++);
    game.propose({ type: "pull" });
    expect(pulled).toBe(1);
    expect(sounds).toEqual([]);
    game.setPullSoundsByRender(false);
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(sounds).toEqual(["cord", "fail"]);
  });

  it("the engine's loop lies inside the trimmed start file (plan 0018)", () => {
    expect(ENGINE_LOOP.from).toBeGreaterThan(0);
    expect(ENGINE_LOOP.to).toBeGreaterThan(ENGINE_LOOP.from + 0.5);
    expect(ENGINE_LOOP.to).toBeLessThan(2.56 - 0.04 - 0.25); // before the file's fade-out (assets/audio/sounds.json)
  });

  it("every fault plays to completion through the game", () => {
    for (const fault of faults.faults) {
      const { game, clock } = setup(fault.id);
      game.newRound();
      expect(game.faultId).toBe(fault.id);
      game.begin();
      const order = removalOrder(machine, fault);
      const steps: Array<[ "remove" | "fix" | "install", string]> = [
        ...order.map((id) => ["remove", id] as ["remove", string]),
        ["fix", fault.culprit],
        ...[...order].reverse().map((id) => ["install", id] as ["install", string]),
      ];
      for (const [type, partId] of steps) {
        clock.advance(500);
        expect(game.propose({ type, partId }), `${fault.id}: ${type} ${partId}`).toBe(true);
      }
      expect(game.propose({ type: "pull" })).toBe(true);
      expect(game.state.endedAt).not.toBeNull();
    }
  });

  it("conditionOf matches core's conditionText", () => {
    const { game } = setup("dead_capacitor");
    game.newRound();
    game.begin();
    const fault = faults.faults.find((f) => f.id === "dead_capacitor")!;
    for (const p of machine.parts) expect(game.conditionOf(p.id)).toBe(conditionText(machine, fault, game.state, p.id));
    expect(game.conditionOf("ghost")).toBeNull();
  });

  it("fixLabel is shown only for the unfixed culprit in the tray", () => {
    const { game } = setup("fouled_plug");
    game.newRound();
    game.begin();
    expect(game.fixLabel("spark_plug")).toBeNull();
    game.propose({ type: "remove", partId: "plug_cap" });
    expect(game.fixLabel("plug_cap")).toBeNull();
    game.propose({ type: "remove", partId: "spark_plug" });
    expect(game.fixLabel("spark_plug")).toBe(faults.faults.find((f) => f.id === "fouled_plug")!.fix);
    game.propose({ type: "fix", partId: "spark_plug" });
    expect(game.fixLabel("spark_plug")).toBeNull();
  });

  it("a clock that steps back never makes an action earlier than the last", () => {
    const { game, clock } = setup("fouled_plug");
    game.newRound();
    game.begin();
    clock.advance(3000);
    game.propose({ type: "remove", partId: "muffler" });
    clock.advance(-2000);
    expect(game.propose({ type: "install", partId: "muffler" })).toBe(true);
    expect(game.log.map((a) => a.t)).toEqual([3000, 3000]);
  });

  it("newRound resets the state and never repeats the last fault", () => {
    const clock = fakeClock();
    const game = createGame({ machine, faults, clock, audio: silent, random: () => 0 });
    game.newRound();
    const first = game.faultId;
    game.begin();
    game.propose({ type: "remove", partId: "muffler" });
    game.newRound();
    expect(game.faultId).not.toBe(first);
    expect(game.state.tray).toEqual([]);
    expect(game.log).toEqual([]);
    expect(game.running).toBe(false);
  });
});

describe("the round's customer (ADR 0015)", () => {
  const customers = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "customers.json"), "utf8")) as CustomerFile;
  const impatient = { schema: 1, customers: [{ ...customers.customers.find((c) => c.id === "tunde")!, patience: 30 }] } satisfies CustomerFile;

  function withCustomers(file: CustomerFile, faultId = "fouled_plug") {
    const clock = fakeClock();
    const { audio, sounds, vibrations } = recorder();
    const index = faults.faults.findIndex((f) => f.id === faultId);
    const game = createGame({ machine, faults, clock, audio, random: () => (index + 0.5) / faults.faults.length, customers: file });
    const patience: string[] = [];
    const left: GameEvents["left"][] = [];
    game.events.on("patience", (e) => patience.push(e.mood));
    game.events.on("left", (e) => left.push(e));
    return { game, clock, sounds, vibrations, patience, left };
  }

  it("every round has a customer, never the same one twice running, with an arrival line on the briefing", () => {
    const { game } = withCustomers(customers);
    const names: string[] = [];
    for (let i = 0; i < 6; i++) {
      const b = game.newRound();
      expect(b.customer).not.toBeNull();
      expect(b.customer!.line.length).toBeGreaterThan(0);
      names.push(b.customer!.name);
    }
    for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
  });

  it("reacts at 50 percent and 20 percent, once each, from the clock", () => {
    const { game, clock, patience } = withCustomers(impatient);
    game.newRound();
    game.begin();
    clock.advance(14_000);
    game.tick();
    expect(patience).toEqual([]);
    clock.advance(2_000);
    game.tick();
    game.tick();
    expect(patience).toEqual(["waiting"]);
    clock.advance(9_000);
    game.tick();
    expect(patience).toEqual(["waiting", "annoyed"]);
    expect(game.patience()).toBeCloseTo(5 / 30, 2);
  });

  it("a wrong part never makes the customer react", () => {
    const { game, clock, patience } = withCustomers(impatient);
    game.newRound();
    game.begin();
    clock.advance(1000);
    game.propose({ type: "remove", partId: "muffler" });
    game.tick();
    expect(patience).toEqual([]);
    expect(game.patience()).toBeCloseTo(29 / 30, 2);
  });

  it("walks out when patience runs out: emits left once, ends the round, refuses everything after, silently", () => {
    const { game, clock, left, sounds, vibrations } = withCustomers(impatient);
    game.newRound();
    game.begin();
    clock.advance(31_000);
    game.tick();
    game.tick();
    expect(left).toHaveLength(1);
    expect(left[0]!.t).toBe(30_000);
    expect(left[0]!.score.outcome).toBe("walked");
    expect(left[0]!.score.stars).toBe(0);
    expect(left[0]!.line.length).toBeGreaterThan(0);
    expect(game.running).toBe(false);
    expect(game.outcome).toBe("walked");
    expect(game.elapsed()).toBe(30_000);
    expect(game.propose({ type: "remove", partId: "plug_cap" })).toBe(false);
    expect(sounds).toEqual([]); // ADR 0018 has no walk-out moment (plan 0013 reading 4)
    expect(vibrations).toEqual([]);
  });

  it("a failed pull that empties the meter ends the round at that pull", () => {
    const { game, clock, left } = withCustomers({ schema: 1, customers: [{ ...impatient.customers[0]!, patience: 25 }] });
    game.newRound();
    game.begin();
    clock.advance(6000);
    game.propose({ type: "pull" });
    expect(left).toHaveLength(1);
    expect(left[0]!.t).toBe(6000);
  });

  it("a round fixed in time ends pleased, with the customer's line", () => {
    const { game, clock } = withCustomers(customers);
    game.newRound();
    game.begin();
    let ended: GameEvents["ended"] | null = null;
    game.events.on("ended", (e) => (ended = e));
    for (const [type, partId] of [["remove", "plug_cap"], ["remove", "spark_plug"], ["fix", "spark_plug"], ["install", "spark_plug"], ["install", "plug_cap"]] as const) {
      clock.advance(1000);
      game.propose({ type, partId });
    }
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(ended).not.toBeNull();
    expect(ended!.score.outcome).toBe("fixed");
    expect(ended!.line).toBeTruthy();
  });

  it("without customers there is no patience", () => {
    const { game, clock } = setup("fouled_plug");
    expect(game.newRound().customer).toBeNull();
    game.begin();
    clock.advance(10_000_000);
    game.tick();
    expect(game.running).toBe(true);
    expect(game.patience()).toBe(1);
  });
});

describe("today's fault and saved results (ADR 0005, ADR 0022, ADR 0024)", () => {
  const customers = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "customers.json"), "utf8")) as CustomerFile;

  /** An in-memory store with ADR 0022's rules: lowest fixed total per fault, one record per day. */
  function memoryStore() {
    const best = new Map<string, StoredResult>();
    const daily = new Map<number, StoredResult>();
    const writes: StoredResult[] = [];
    const store: ScoreStore = {
      async best(id) {
        return best.get(id) ?? null;
      },
      async bestDaily(day) {
        return daily.get(day) ?? null;
      },
      async record(r) {
        writes.push(r);
        if (r.day !== null) daily.set(r.day, r);
        const b = best.get(r.faultId);
        if (!r.unfinished && r.score.outcome === "fixed" && (!b || r.score.total < b.score.total)) best.set(r.faultId, r);
      },
      async dailyAttempted(day) {
        return daily.has(day);
      },
    };
    return { store, writes, daily, best };
  }

  function dailyGame(iso: string, store: ScoreStore, file: CustomerFile = customers) {
    let today = new Date(iso);
    const timer = fakeClock();
    const clock = { now: timer.now, today: () => today };
    const provider = createDailyProvider(clock, dayNumber, (d) => dailyFaultId(faults.faults, d));
    const game = createGame({ machine, faults, clock, audio: silent, random: () => 0.5, customers: file, scores: store });
    return { game, provider, advance: timer.advance, setToday: (s: string) => (today = new Date(s)) };
  }

  /** Plays the round's fault to a running engine, a second per action. */
  function fix(game: ReturnType<typeof createGame>, advance: (ms: number) => void) {
    const fault = faults.faults.find((f) => f.id === game.faultId)!;
    const order = removalOrder(machine, fault);
    const steps: Array<["remove" | "fix" | "install", string]> = [
      ...order.map((id) => ["remove", id] as ["remove", string]),
      ["fix", fault.culprit],
      ...[...order].reverse().map((id) => ["install", id] as ["install", string]),
    ];
    for (const [type, partId] of steps) {
      advance(1000);
      game.propose({ type, partId });
    }
    advance(1000);
    game.propose({ type: "pull" });
  }

  it("gives the same fault and customer to two games on the same day, and a different fault the next day", async () => {
    const a = dailyGame("2026-10-11T08:00:00Z", memoryStore().store);
    const b = dailyGame("2026-10-11T21:00:00Z", memoryStore().store);
    const sa = await dailyStatus(a.provider, undefined);
    const sb = await dailyStatus(b.provider, undefined);
    expect(sb).toEqual(sa);
    const ba = a.game.newRound({ day: sa.day, faultId: sa.faultId, scored: true });
    const bb = b.game.newRound({ day: sb.day, faultId: sb.faultId, scored: true });
    expect(a.game.faultId).toBe(sa.faultId);
    expect(b.game.faultId).toBe(sa.faultId);
    expect(ba.customer!.name).toBe(bb.customer!.name);
    expect(ba.customer!.name).toBe(customers.customers.find((c) => c.id === dailyCustomerId(customers.customers, sa.day))!.name);
    expect(ba.daily).toEqual({ day: 10, scored: true });
    const next = await dailyStatus(dailyGame("2026-10-12T08:00:00Z", memoryStore().store).provider, undefined);
    expect(next.day).toBe(sa.day + 1);
    expect(next.faultId).not.toBe(sa.faultId);
  });

  it("free play has no daily on its briefing", () => {
    const { game } = dailyGame("2026-10-11T08:00:00Z", memoryStore().store);
    expect(game.newRound().daily).toBeNull();
  });

  it("records a daily started on day N and ended after Lagos midnight for day N", async () => {
    const { store, daily } = memoryStore();
    const g = dailyGame("2026-10-11T22:59:00Z", store);
    const s = await dailyStatus(g.provider, store);
    g.game.newRound({ day: s.day, faultId: s.faultId, scored: true });
    g.game.begin();
    g.setToday("2026-10-11T23:05:00Z");
    fix(g.game, g.advance);
    await g.game.recorded;
    expect([...daily.keys()]).toEqual([s.day]);
    expect(daily.get(s.day)!.unfinished).toBeUndefined();
    // The provider has moved on to the next day, whose daily is still open.
    const next = await dailyStatus(g.provider, store);
    expect(next.day).toBe(s.day + 1);
    expect(next.attempted).toBe(false);
  });

  it("a fixed daily uses up the attempt", async () => {
    const { store } = memoryStore();
    const g = dailyGame("2026-10-11T08:00:00Z", store);
    const s = await dailyStatus(g.provider, store);
    expect(s.attempted).toBe(false);
    g.game.newRound({ day: s.day, faultId: s.faultId, scored: true });
    g.game.begin();
    fix(g.game, g.advance);
    const r = await g.game.recorded;
    expect(r).toMatchObject({ mode: "daily", day: s.day, newBest: true });
    const after = await dailyStatus(g.provider, store);
    expect(after.attempted).toBe(true);
    expect(after.result!.score.outcome).toBe("fixed");
  });

  it("a walked daily uses up the attempt and is never a best", async () => {
    const { store, best } = memoryStore();
    const quick = { schema: 1, customers: customers.customers.map((c) => ({ ...c, patience: 5 })) } satisfies CustomerFile;
    const g = dailyGame("2026-10-11T08:00:00Z", store, quick);
    const s = await dailyStatus(g.provider, store);
    g.game.newRound({ day: s.day, faultId: s.faultId, scored: true });
    g.game.begin();
    g.advance(6000);
    g.game.tick();
    expect(g.game.outcome).toBe("walked");
    expect(await g.game.recorded).toEqual({ mode: "daily", day: s.day, best: null, newBest: false });
    const after = await dailyStatus(g.provider, store);
    expect(after.attempted).toBe(true);
    expect(after.result!.score.outcome).toBe("walked");
    expect(after.result!.unfinished).toBeUndefined();
    expect(best.size).toBe(0);
  });

  it("a daily whose timer started and never ends uses up the attempt, saved unfinished, never a best", async () => {
    const { store, best, writes } = memoryStore();
    const g = dailyGame("2026-10-11T08:00:00Z", store);
    const s = await dailyStatus(g.provider, store);
    g.game.newRound({ day: s.day, faultId: s.faultId, scored: true });
    expect(writes).toEqual([]); // choosing the daily does not use it
    g.game.begin();
    g.advance(3000);
    g.game.propose({ type: "remove", partId: "muffler" });
    expect(g.game.recorded).toBeNull();
    const after = await dailyStatus(g.provider, store);
    expect(after.attempted).toBe(true);
    expect(after.result).toMatchObject({ faultId: s.faultId, day: s.day, unfinished: true, log: [] });
    expect(best.size).toBe(0);
    // The page reloads: a new game on the same store sees the attempt as used.
    const reloaded = dailyGame("2026-10-11T09:00:00Z", store);
    expect((await dailyStatus(reloaded.provider, store)).attempted).toBe(true);
  });

  it("a practice round is not recorded and shows no best", async () => {
    const { store, writes } = memoryStore();
    const g = dailyGame("2026-10-11T08:00:00Z", store);
    const s = await dailyStatus(g.provider, store);
    const b = g.game.newRound({ day: s.day, faultId: s.faultId, scored: false });
    expect(b.daily).toEqual({ day: s.day, scored: false });
    g.game.begin();
    fix(g.game, g.advance);
    expect(await g.game.recorded).toEqual({ mode: "practice", day: s.day, best: null, newBest: false });
    expect(writes).toEqual([]);
  });

  it("free play is recorded with day null", async () => {
    const { store, writes } = memoryStore();
    const g = dailyGame("2026-10-11T08:00:00Z", store);
    const b = g.game.newRound();
    g.game.begin();
    fix(g.game, g.advance);
    expect(await g.game.recorded).toMatchObject({ mode: "free", day: null, newBest: true });
    expect(b.daily).toBeNull();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ day: null, faultId: g.game.faultId });
    expect(writes[0]!.unfinished).toBeUndefined();
  });

  it("only a lower total is a new best; the best shown is the lowest", async () => {
    const { store } = memoryStore();
    // A game with one fault, so free play repeats it.
    const one = { ...faults, faults: [faults.faults[0]!] };
    const timer = fakeClock();
    const game = createGame({ machine, faults: one, clock: { now: timer.now, today: () => new Date(0) }, audio: silent, random: () => 0.5, scores: store });
    const round = async (waitMs: number) => {
      game.newRound();
      game.begin();
      timer.advance(waitMs);
      fix(game, timer.advance);
      return (await game.recorded)!;
    };
    const first = await round(0);
    expect(first.newBest).toBe(true);
    const slower = await round(30_000);
    expect(slower).toEqual({ mode: "free", day: null, best: first.best, newBest: false });
    const same = await round(0);
    expect(same.newBest).toBe(false);
    expect(same.best).toBe(first.best);
  });

  it("the recorded score equals score() replayed from the recorded log", async () => {
    const { store, writes } = memoryStore();
    const g = dailyGame("2026-10-11T08:00:00Z", store);
    const s = await dailyStatus(g.provider, store);
    const b = g.game.newRound({ day: s.day, faultId: s.faultId, scored: true });
    g.game.begin();
    g.advance(2000);
    g.game.propose({ type: "pull" });
    fix(g.game, g.advance);
    await g.game.recorded;
    const saved = writes.at(-1)!;
    const customer = customers.customers.find((c) => c.name === b.customer!.name)!;
    expect(saved.score).toEqual(score(machine, faults.faults.find((f) => f.id === s.faultId)!, saved.log, customer));
    expect(saved.score.failedPulls).toBe(1);
  });

  it("a store that fails never breaks the round", async () => {
    const broken: ScoreStore = {
      best: () => Promise.reject(new Error("x")),
      bestDaily: () => Promise.reject(new Error("x")),
      record: () => Promise.reject(new Error("x")),
      dailyAttempted: () => Promise.reject(new Error("x")),
    };
    const g = dailyGame("2026-10-11T08:00:00Z", broken);
    const s = await dailyStatus(g.provider, broken);
    expect(s.attempted).toBe(false);
    g.game.newRound({ day: s.day, faultId: s.faultId, scored: true });
    g.game.begin();
    fix(g.game, g.advance);
    expect(await g.game.recorded).toEqual({ mode: "daily", day: s.day, best: null, newBest: false });
  });

  it("refuses a daily fault that does not exist", () => {
    const { game } = dailyGame("2026-10-11T08:00:00Z", memoryStore().store);
    expect(() => game.newRound({ day: 1, faultId: "ghost", scored: true })).toThrow();
  });
});

describe("moments (ADR 0018, plan 0013 step 2)", () => {
  it("has the ten moments of plan 0013, one file name each", () => {
    expect([...MOMENTS]).toEqual(["turn", "give-unbolt", "give-unclip", "give-pull", "give-scrape", "land", "seat", "cord", "fail", "start"]);
  });

  it("vibrates as ADR 0018's table says: gives and seat about 15 ms, fail about 40 ms, start a pattern under 300 ms", () => {
    const vibrating = MOMENTS.filter((m) => VIBRATION[m] !== null);
    expect(vibrating).toEqual(["give-unbolt", "give-unclip", "give-pull", "give-scrape", "seat", "fail", "start"]);
    for (const m of ["give-unbolt", "give-unclip", "give-pull", "give-scrape", "seat"] as const) expect(VIBRATION[m]).toBe(15);
    expect(VIBRATION.fail).toBe(40);
    const start = VIBRATION.start as readonly number[];
    expect(Array.isArray(start)).toBe(true);
    const total = start.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(300);
    expect(total).toBeGreaterThan(40); // longer than the fail
    for (const m of ["turn", "land", "cord"] as const) expect(VIBRATION[m]).toBeNull();
  });

  it("maps every motion type to its give: unscrew has none, an unknown type scrapes", () => {
    const map = Object.fromEntries(MOTION_TYPES.map((t) => [t, giveMoment(t)]));
    expect(map).toEqual({ slide: "give-scrape", lift: "give-scrape", pull: "give-pull", unscrew: null, unbolt: "give-unbolt", unclip: "give-unclip" });
    expect(giveMoment("twist")).toBe("give-scrape");
    expect(giveMoment(undefined)).toBe("give-scrape");
  });

  it("playMoment plays the sound and, only where the table has one, the vibration, with the same delay", () => {
    const r = recorder();
    playMoment(r.audio, "turn");
    playMoment(r.audio, "seat");
    playMoment(r.audio, "fail", 0.6);
    expect(r.calls).toEqual([["turn", 0], ["seat", 0], ["fail", 0.6]]);
    expect(r.vibrations).toEqual([[15, 0], [40, 0.6]]);
  });

  it("a blocked removal plays nothing and vibrates nothing", () => {
    const { game, sounds, vibrations } = setup("fouled_plug");
    game.newRound();
    game.begin();
    expect(game.propose({ type: "remove", partId: "spark_plug" })).toBe(false); // the plug cap is still on
    expect(sounds).toEqual([]);
    expect(vibrations).toEqual([]);
  });

  it("an install and a refused pull play nothing", () => {
    const { game, clock, sounds } = setup("fouled_plug");
    game.newRound();
    game.begin();
    clock.advance(1000);
    game.propose({ type: "remove", partId: "plug_cap" });
    clock.advance(1000);
    game.propose({ type: "install", partId: "plug_cap" });
    expect(sounds).toEqual(["land"]);
    clock.advance(1000);
    game.propose({ type: "remove", partId: "plug_cap" });
    expect(game.propose({ type: "pull" })).toBe(false); // a part is in the tray
    expect(sounds).toEqual(["land", "land"]);
  });
});

describe("the round's customer look and the next one (plan 0015 step 6, ADR 0023)", () => {
  const customers = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "customers.json"), "utf8")) as CustomerFile;
  /** A random that walks through a list, so each pick is known. */
  function sequence(values: number[]) {
    let i = 0;
    return () => values[i++ % values.length]!;
  }

  it("customerLook follows the picked customer; both are null before a round", () => {
    const game = createGame({ machine, faults, clock: fakeClock(), audio: silent, random: sequence([0.1, 0.5, 0.9, 0.3]), customers });
    expect(game.customerLook).toBeNull();
    expect(game.nextCustomerLook).toBeNull();
    for (let i = 0; i < 5; i++) {
      game.newRound();
      const c = customers.customers.find((x) => x.name === game.customerName)!;
      expect(game.customerLook).toBe(c.look);
      game.begin();
    }
  });

  it("the next customer is chosen when the round starts, is never this round's, and the next free-play round plays them", () => {
    const game = createGame({ machine, faults, clock: fakeClock(), audio: silent, random: sequence([0.2, 0.7, 0.4, 0.95, 0.05]), customers });
    game.newRound();
    expect(game.nextCustomerLook).toBeNull();
    for (let i = 0; i < 8; i++) {
      game.begin();
      const next = game.nextCustomerLook;
      expect(next).not.toBeNull();
      expect(next).not.toBe(game.customerLook);
      game.newRound();
      expect(game.customerLook).toBe(next);
    }
  });

  it("a daily plays the day's customer, whatever was announced; free play then picks afresh", () => {
    const day = 40;
    const game = createGame({ machine, faults, clock: fakeClock(), audio: silent, random: sequence([0.3, 0.6, 0.9]), customers });
    game.newRound();
    game.begin();
    game.newRound({ day, faultId: dailyFaultId(faults.faults, day), scored: false });
    const daily = customers.customers.find((c) => c.id === dailyCustomerId(customers.customers, day))!;
    expect(game.customerLook).toBe(daily.look);
    expect(game.nextCustomerLook).toBeNull();
    game.begin();
    expect(game.nextCustomerLook).not.toBe(daily.look);
  });

  it("without customers both stay null", () => {
    const game = createGame({ machine, faults, clock: fakeClock(), audio: silent, random: () => 0.5 });
    game.newRound();
    game.begin();
    expect(game.customerLook).toBeNull();
    expect(game.nextCustomerLook).toBeNull();
  });
});

describe("the customer brings the generator before the clock starts (plan 0017 step 3, ADR 0026)", () => {
  const customers = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "customers.json"), "utf8")) as CustomerFile;

  it("arrive() sends arriving once and does not start the clock; begin() starts it when the generator lands", () => {
    const clock = fakeClock();
    const game = createGame({ machine, faults, clock, audio: silent, random: () => 0.5, customers });
    const seen: string[] = [];
    game.events.on("arriving", () => seen.push("arriving"));
    game.events.on("started", () => seen.push("started"));
    game.newRound();
    game.arrive();
    game.arrive();
    expect(seen).toEqual(["arriving"]);
    expect(game.arriving).toBe(true);
    expect(game.running).toBe(false);
    clock.advance(3000);
    expect(game.elapsed()).toBe(0);
    expect(game.patience()).toBe(1);
    expect(game.propose({ type: "pull" })).toBe(false);
    game.begin();
    expect(seen).toEqual(["arriving", "started"]);
    expect(game.arriving).toBe(false);
    clock.advance(1500);
    expect(game.elapsed()).toBe(1500);
    game.arrive();
    expect(seen).toEqual(["arriving", "started"]);
  });

  it("a skipped arrival begins at once, and a new round arrives again", () => {
    const clock = fakeClock();
    const game = createGame({ machine, faults, clock, audio: silent, random: () => 0.5, customers });
    let arrivals = 0;
    game.events.on("arriving", () => arrivals++);
    game.newRound();
    game.arrive();
    game.begin();
    expect(game.running).toBe(true);
    game.newRound();
    expect(game.arriving).toBe(false);
    game.arrive();
    expect(arrivals).toBe(2);
  });

  it("the daily is unchanged: its score counts from the landing, not from Start", () => {
    const clock = fakeClock();
    const day = 30;
    const game = createGame({ machine, faults, clock, audio: silent, random: () => 0.5, customers });
    game.newRound({ day, faultId: dailyFaultId(faults.faults, day), scored: false });
    game.arrive();
    clock.advance(10_000);
    game.begin();
    clock.advance(2000);
    expect(game.elapsed()).toBe(2000);
  });

  it("a round with no customers begins straight from begin(), as before", () => {
    const clock = fakeClock();
    const game = createGame({ machine, faults, clock, audio: silent, random: () => 0.5 });
    game.newRound();
    game.begin();
    expect(game.running).toBe(true);
  });
});
