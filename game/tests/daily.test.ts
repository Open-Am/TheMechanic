import { describe, expect, it } from "vitest";
import { DAILY_EPOCH } from "../src/core/constants.ts";
import { dailyFaultId, dayNumber, hashDay } from "../src/core/daily.ts";
import { loadFaults } from "./helpers.ts";

const faults = loadFaults().faults;

describe("dayNumber in Lagos time", () => {
  it("is 0 on the epoch date", () => {
    expect(dayNumber(new Date(`${DAILY_EPOCH}T12:00:00Z`))).toBe(0);
  });

  it("rolls over at Lagos midnight, which is 23:00 UTC the evening before", () => {
    expect(dayNumber(new Date(`${DAILY_EPOCH}T22:59:59Z`))).toBe(0);
    expect(dayNumber(new Date(`${DAILY_EPOCH}T23:00:00Z`))).toBe(1);
  });

  it("counts whole days", () => {
    expect(dayNumber(new Date("2026-10-11T12:00:00Z"))).toBe(10);
    expect(dayNumber(new Date("2026-09-30T12:00:00Z"))).toBe(-1);
  });
});

describe("dailyFaultId", () => {
  it("never repeats the previous day across 400 days", () => {
    let prev = dailyFaultId(faults, 0);
    for (let d = 1; d <= 400; d++) {
      const cur = dailyFaultId(faults, d);
      expect(cur, `day ${d}`).not.toBe(prev);
      prev = cur;
    }
  });

  it("is deterministic", () => {
    expect(dailyFaultId(faults, 12)).toBe(dailyFaultId(faults, 12));
    expect(dailyFaultId(faults, 300)).toBe(dailyFaultId(faults, 300));
  });

  it("uses every fault over a long run", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) seen.add(dailyFaultId(faults, d));
    expect(seen.size).toBe(faults.length);
  });

  it("handles one fault and no faults", () => {
    expect(dailyFaultId([faults[0]!], 5)).toBe(faults[0]!.id);
    expect(() => dailyFaultId([], 5)).toThrow();
  });

  it("hash spreads consecutive days", () => {
    const a = hashDay(1), b = hashDay(2), c = hashDay(3);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
