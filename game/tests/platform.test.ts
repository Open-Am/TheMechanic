import { describe, expect, it } from "vitest";
import { createAudio } from "../src/platform/local/audio.ts";
import { createClock } from "../src/platform/local/clock.ts";

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
