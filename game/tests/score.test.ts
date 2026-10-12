import { describe, expect, it } from "vitest";
import { CHECK_SECONDS, CLEAN_BONUS, FAILED_PULL_PENALTY, STAR_THRESHOLDS, WRONG_PART_PENALTY } from "../src/core/constants.ts";
import { replay } from "../src/core/replay.ts";
import { score, stars } from "../src/core/score.ts";
import type { Action } from "../src/core/types.ts";
import { faultById, loadFaults, loadMachine, log, perfectPlay } from "./helpers.ts";

const machine = loadMachine();
const faults = loadFaults();

describe("every fault plays to completion from a log", () => {
  for (const fault of faults.faults) {
    it(fault.id, () => {
      const play = perfectPlay(machine, fault);
      const r = replay(machine, fault, play);
      expect(r.failedAt).toBeNull();
      expect(r.state.endedAt).not.toBeNull();
      expect(r.state.tray).toEqual([]);
      const s = score(machine, fault, play);
      expect(s.complete).toBe(true);
      expect(s.wrongParts).toBe(0);
      expect(s.failedPulls).toBe(0);
      expect(s.elapsedSeconds).toBe(play.length);
      // ADR 0029: a perfect play is a clean diagnosis, so the bonus comes off.
      expect(s.clean).toBe(true);
      expect(s.checkSeconds).toBe(0);
      expect(s.total).toBe(Math.max(0, play.length - CLEAN_BONUS));
    });
  }
});

describe("score formula", () => {
  const fault = faultById(faults, "fouled_plug");

  it("counts distinct wrong parts, not repeats", () => {
    const play: Action[] = log([
      ["remove", "muffler"],
      ["install", "muffler"],
      ["remove", "muffler"], // same wrong part again: still one
      ["install", "muffler"],
      ["remove", "recoil_starter"],
      ["install", "recoil_starter"],
      ["remove", "plug_cap"],
      ["remove", "spark_plug"],
      ["fix", "spark_plug"],
      ["install", "spark_plug"],
      ["install", "plug_cap"],
      ["pull"],
    ]);
    const s = score(machine, fault, play);
    expect(s.wrongParts).toBe(2);
    expect(s.failedPulls).toBe(0);
    expect(s.total).toBe(12 + 2 * WRONG_PART_PENALTY);
    expect(s.complete).toBe(true);
  });

  it("adds a penalty per failed pull", () => {
    const play: Action[] = log([
      ["pull"],
      ["pull"],
      ["remove", "plug_cap"],
      ["remove", "spark_plug"],
      ["fix", "spark_plug"],
      ["install", "spark_plug"],
      ["install", "plug_cap"],
      ["pull"],
    ]);
    const s = score(machine, fault, play);
    expect(s.failedPulls).toBe(2);
    expect(s.total).toBe(8 + 2 * FAILED_PULL_PENALTY);
  });

  it("elapsed is the time of the successful pull, rounded to seconds", () => {
    const play = perfectPlay(machine, fault, 1000);
    play[play.length - 1]!.t = 38_400;
    expect(score(machine, fault, play).elapsedSeconds).toBe(38);
  });

  it("an invalid log stops at the bad action and is incomplete", () => {
    const play: Action[] = log([
      ["remove", "spark_plug"], // blocked by plug_cap
      ["pull"],
    ]);
    const r = replay(machine, fault, play);
    expect(r.failedAt?.index).toBe(0);
    expect(r.failedAt?.refusal.reason).toBe("blocked_by");
    expect(score(machine, fault, play).complete).toBe(false);
  });

  it("the same log always gives the same score", () => {
    const play = perfectPlay(machine, fault, 1234);
    expect(score(machine, fault, play)).toEqual(score(machine, fault, JSON.parse(JSON.stringify(play))));
  });
});

describe("stars", () => {
  it("follow the thresholds", () => {
    expect(stars(STAR_THRESHOLDS.three)).toBe(3);
    expect(stars(STAR_THRESHOLDS.three + 1)).toBe(2);
    expect(stars(STAR_THRESHOLDS.two)).toBe(2);
    expect(stars(STAR_THRESHOLDS.two + 1)).toBe(1);
  });
});

describe("checks and the clean job in the score (ADR 0029)", () => {
  const fault = faultById(faults, "fouled_plug");
  /** fouled_plug's perfect play with checks: listen first, then read the plug and test the spark once it is out. */
  const withChecks = (): Action[] => [
    { t: 1000, type: "check", checkId: "listen_pull" },
    { t: 2000, type: "remove", partId: "plug_cap" },
    { t: 3000, type: "remove", partId: "spark_plug" },
    { t: 4000, type: "check", checkId: "look_plug" },
    { t: 5000, type: "check", checkId: "spark_test" },
    { t: 6000, type: "fix", partId: "spark_plug" },
    { t: 7000, type: "install", partId: "spark_plug" },
    { t: 8000, type: "install", partId: "plug_cap" },
    { t: 60_000, type: "pull" },
  ];

  it("adds the cost of every check done to the score", () => {
    const s = score(machine, fault, withChecks());
    expect(s.checkSeconds).toBe(CHECK_SECONDS.listen_pull + CHECK_SECONDS.look_plug + CHECK_SECONDS.spark_test);
    expect(s.total).toBe(60 + s.checkSeconds - CLEAN_BONUS);
  });

  it("each check costs what constants.ts says: listen 3, smoke 3, plug 2, spark 4, fuel 3, volts 4", () => {
    expect(CHECK_SECONDS).toEqual({ listen_pull: 3, look_smoke: 3, look_plug: 2, spark_test: 4, fuel_flow: 3, volts_test: 4 });
    expect(CLEAN_BONUS).toBe(10);
  });

  it("the clean bonus needs the round fixed, no wrong parts and no failed pulls", () => {
    const clean = score(machine, fault, withChecks());
    expect(clean.clean).toBe(true);

    const wrong = withChecks();
    wrong.splice(1, 0, { t: 1500, type: "remove", partId: "muffler" }, { t: 1600, type: "install", partId: "muffler" });
    const w = score(machine, fault, wrong);
    expect(w.clean).toBe(false);
    expect(w.total).toBe(60 + w.checkSeconds + WRONG_PART_PENALTY);

    const pulled = withChecks();
    pulled.splice(1, 0, { t: 1500, type: "pull" });
    const p = score(machine, fault, pulled);
    expect(p.clean).toBe(false);
    expect(p.total).toBe(60 + p.checkSeconds + FAILED_PULL_PENALTY);

    const unfinished = withChecks().slice(0, -1);
    const u = score(machine, fault, unfinished, undefined, 30_000);
    expect(u.complete).toBe(false);
    expect(u.clean).toBe(false);
  });

  it("is never below 0", () => {
    const quick = perfectPlay(machine, fault, 100); // 0.5 s in all
    const s = score(machine, fault, quick);
    expect(s.clean).toBe(true);
    expect(s.elapsedSeconds).toBeLessThan(CLEAN_BONUS);
    expect(s.total).toBe(0);
  });

  it("a log with checks replays to the same state and score every time", () => {
    const a = replay(machine, fault, withChecks());
    const b = replay(machine, fault, JSON.parse(JSON.stringify(withChecks())) as Action[]);
    expect(a.failedAt).toBeNull();
    expect(a.state.checksDone).toEqual(["listen_pull", "look_plug", "spark_test"]);
    expect(b.state).toEqual(a.state);
    expect(score(machine, fault, withChecks())).toEqual(score(machine, fault, withChecks()));
  });

  it("a refused check stops the replay there and is not counted", () => {
    const log2: Action[] = [{ t: 1000, type: "check", checkId: "look_plug" }, ...withChecks().map((a) => ({ ...a, t: a.t + 1000 }))];
    const r = replay(machine, fault, log2);
    expect(r.failedAt?.refusal.reason).toBe("check_unavailable");
    expect(score(machine, fault, log2).checkSeconds).toBe(0);
  });
});
