import { describe, expect, it } from "vitest";
import { createAudio } from "../src/platform/local/audio.ts";
import { createClock } from "../src/platform/local/clock.ts";
import { createDailyProvider } from "../src/platform/local/daily.ts";
import { dailyFaultId, dayNumber } from "../src/core/daily.ts";
import { loadFaults } from "./helpers.ts";

describe("daily provider (ADR 0005)", () => {
  const faults = loadFaults().faults;
  const provider = (iso: string) => createDailyProvider(createClock(() => 0, () => new Date(iso)), dayNumber, (d) => dailyFaultId(faults, d));

  it("gives the core's day and fault for the clock's date", async () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const today = await provider(now.toISOString()).today();
    expect(today.day).toBe(dayNumber(now));
    expect(today.day).toBe(10);
    expect(today.faultId).toBe(dailyFaultId(faults, 10));
  });

  it("rolls to the next day and a different fault at Lagos midnight (23:00 UTC)", async () => {
    const before = await provider("2026-10-11T22:59:59Z").today();
    const after = await provider("2026-10-11T23:00:00Z").today();
    expect(after.day).toBe(before.day + 1);
    expect(after.faultId).not.toBe(before.faultId);
  });
});

describe("audio", () => {
  it("does nothing when a sound is missing", () => {
    expect(() => createAudio().play("remove")).not.toThrow();
  });

  it("rewinds and plays a sound that is present", () => {
    const s = { currentTime: 3, plays: 0, play() { this.plays++; } };
    createAudio({ start: s }).play("start");
    expect(s.currentTime).toBe(0);
    expect(s.plays).toBe(1);
  });

  it("swallows a refused play, sync or async", async () => {
    const rejecting = { currentTime: 0, play: () => Promise.reject(new Error("NotAllowedError")) };
    const throwing = { currentTime: 0, play: () => { throw new Error("broken"); } };
    const audio = createAudio({ remove: rejecting, fail: throwing });
    expect(() => audio.play("remove")).not.toThrow();
    expect(() => audio.play("fail")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("clock", () => {
  it("uses the functions it is given", () => {
    const c = createClock(() => 42, () => new Date(0));
    expect(c.now()).toBe(42);
    expect(c.today().getTime()).toBe(0);
  });

  it("defaults to a monotonic timer", () => {
    const c = createClock();
    const a = c.now();
    expect(c.now()).toBeGreaterThanOrEqual(a);
  });
});
