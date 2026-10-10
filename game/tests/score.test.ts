import { describe, expect, it } from "vitest";
import { FAILED_PULL_PENALTY, STAR_THRESHOLDS, WRONG_PART_PENALTY } from "../src/core/constants.ts";
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
      expect(s.total).toBe(play.length);
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
