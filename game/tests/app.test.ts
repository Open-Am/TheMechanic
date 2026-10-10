import { describe, expect, it } from "vitest";
import { Emitter } from "../src/app/emitter.ts";
import { pickFault } from "../src/app/faults.ts";
import { createGame, type GameEvents } from "../src/app/round.ts";
import { conditionText } from "../src/core/reducer.ts";
import { removalOrder } from "../src/core/rules.ts";
import { score } from "../src/core/score.ts";
import type { SoundName } from "../src/platform/interfaces/index.ts";
import { loadFaults, loadMachine } from "./helpers.ts";

const machine = loadMachine();
const faults = loadFaults();

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, today: () => new Date(0), advance: (ms: number) => (t += ms), set: (ms: number) => (t = ms) };
}

/** A game whose random always picks the fault with this ID. */
function setup(faultId: string) {
  const clock = fakeClock();
  const sounds: SoundName[] = [];
  const index = faults.faults.findIndex((f) => f.id === faultId);
  const random = () => (index + 0.5) / faults.faults.length;
  const game = createGame({ machine, faults, clock, audio: { play: (s) => sounds.push(s) }, random });
  const seen: Array<keyof GameEvents> = [];
  for (const name of ["started", "removed", "installed", "inspected", "fixed", "pulled", "refused", "ended"] as const) {
    game.events.on(name, () => seen.push(name));
  }
  return { game, clock, sounds, seen };
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
    expect(sounds).toEqual(["remove", "remove"]);
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

  it("a failed pull plays fail and continues; a good pull ends the round with the log's score", () => {
    const { game, clock, sounds } = setup("fouled_plug");
    game.newRound();
    game.begin();
    let ended: GameEvents["ended"] | null = null;
    game.events.on("ended", (e) => (ended = e));
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(sounds).toEqual(["fail"]);
    expect(game.running).toBe(true);
    for (const [type, partId] of [["remove", "plug_cap"], ["remove", "spark_plug"], ["fix", "spark_plug"], ["install", "spark_plug"], ["install", "plug_cap"]] as const) {
      clock.advance(1000);
      expect(game.propose({ type, partId }), `${type} ${partId}`).toBe(true);
    }
    clock.advance(1000);
    game.propose({ type: "pull" });
    expect(sounds.at(-1)).toBe("start");
    expect(game.running).toBe(false);
    expect(ended).not.toBeNull();
    const e = ended!;
    expect(e.t).toBe(7000);
    expect(e.score).toEqual(score(machine, faults.faults.find((f) => f.id === "fouled_plug")!, e.log));
    expect(e.score.failedPulls).toBe(1);
    clock.advance(5000);
    expect(game.elapsed()).toBe(7000);
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
    const game = createGame({ machine, faults, clock, audio: { play: () => {} }, random: () => 0 });
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
