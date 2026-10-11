import { describe, expect, it } from "vitest";
import { createAudio } from "../src/platform/local/audio.ts";
import { createClock } from "../src/platform/local/clock.ts";
import { createDailyProvider } from "../src/platform/local/daily.ts";
import { SCORES_KEY, createScoreStore, parseSaved, safeStorage } from "../src/platform/local/scores.ts";
import type { StoredResult } from "../src/platform/interfaces/index.ts";
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

describe("score store (ADR 0005, ADR 0022, ADR 0024)", () => {
  function fakeStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  }

  function result(faultId: string, total: number, opts: { day?: number | null; outcome?: "fixed" | "walked"; unfinished?: boolean } = {}): StoredResult {
    const outcome = opts.outcome ?? "fixed";
    const r: StoredResult = {
      faultId,
      day: opts.day ?? null,
      log: [{ t: 1000, type: "pull" }],
      score: { elapsedSeconds: total, wrongParts: 0, failedPulls: 0, total, stars: outcome === "walked" ? 0 : 1, complete: outcome === "fixed", outcome },
      playedAt: "2026-10-11T08:00:00.000Z",
    };
    if (opts.unfinished) r.unfinished = true;
    return r;
  }

  it("the lowest total wins, and a tie keeps the first", async () => {
    const store = createScoreStore(fakeStorage());
    await store.record(result("fouled_plug", 60));
    await store.record(result("fouled_plug", 40));
    await store.record(result("fouled_plug", 50));
    expect((await store.best("fouled_plug"))!.score.total).toBe(40);
    const tie = { ...result("fouled_plug", 40), playedAt: "later" };
    await store.record(tie);
    expect((await store.best("fouled_plug"))!.playedAt).toBe("2026-10-11T08:00:00.000Z");
    expect(await store.best("dead_capacitor")).toBeNull();
  });

  it("a walked round never becomes a best", async () => {
    const store = createScoreStore(fakeStorage());
    await store.record(result("fouled_plug", 5, { outcome: "walked" }));
    expect(await store.best("fouled_plug")).toBeNull();
    await store.record(result("fouled_plug", 80));
    await store.record(result("fouled_plug", 5, { outcome: "walked" }));
    expect((await store.best("fouled_plug"))!.score.total).toBe(80);
  });

  it("remembers the daily attempt, walked or fixed, and keeps the first finished one", async () => {
    const store = createScoreStore(fakeStorage());
    expect(await store.dailyAttempted(10)).toBe(false);
    await store.record(result("fouled_plug", 90, { day: 10, outcome: "walked" }));
    expect(await store.dailyAttempted(10)).toBe(true);
    expect(await store.dailyAttempted(11)).toBe(false);
    await store.record(result("fouled_plug", 30, { day: 10 }));
    expect((await store.bestDaily(10))!.score.outcome).toBe("walked");
  });

  it("an unfinished daily counts as attempted, is never a best, and is replaced when the round ends (ADR 0024)", async () => {
    const store = createScoreStore(fakeStorage());
    await store.record(result("fouled_plug", 0, { day: 10, unfinished: true }));
    expect(await store.dailyAttempted(10)).toBe(true);
    expect((await store.bestDaily(10))!.unfinished).toBe(true);
    expect(await store.best("fouled_plug")).toBeNull();
    await store.record(result("fouled_plug", 42, { day: 10 }));
    expect((await store.bestDaily(10))!.unfinished).toBeUndefined();
    expect((await store.bestDaily(10))!.score.total).toBe(42);
    expect((await store.best("fouled_plug"))!.score.total).toBe(42);
  });

  it("saves under openam.scores.v1 in the ADR 0022 shape", async () => {
    const storage = fakeStorage();
    await createScoreStore(storage).record(result("fouled_plug", 42, { day: 10 }));
    expect([...storage.data.keys()]).toEqual([SCORES_KEY]);
    expect(SCORES_KEY).toBe("openam.scores.v1");
    const saved = JSON.parse(storage.data.get(SCORES_KEY)!);
    expect(Object.keys(saved).sort()).toEqual(["best", "daily", "v"]);
    expect(saved.v).toBe(1);
    expect(saved.best.fouled_plug.score.total).toBe(42);
    expect(saved.daily["10"].faultId).toBe("fouled_plug");
  });

  it("two stores on one storage see each other's records (a reload)", async () => {
    const storage = fakeStorage();
    const first = createScoreStore(storage);
    await first.record(result("fouled_plug", 42, { day: 10, unfinished: true }));
    const reloaded = createScoreStore(storage);
    expect(await reloaded.dailyAttempted(10)).toBe(true);
    await first.record(result("fouled_plug", 42, { day: 10 }));
    expect((await reloaded.bestDaily(10))!.unfinished).toBeUndefined();
    expect((await reloaded.best("fouled_plug"))!.score.total).toBe(42);
    await reloaded.record(result("dead_capacitor", 70));
    expect((await first.best("dead_capacitor"))!.score.total).toBe(70);
    expect((await first.best("fouled_plug"))!.score.total).toBe(42);
  });

  it("a storage that throws on every call leaves a working store for this session", async () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const store = createScoreStore(throwing);
    await store.record(result("fouled_plug", 42, { day: 10 }));
    expect(await store.dailyAttempted(10)).toBe(true);
    expect((await store.best("fouled_plug"))!.score.total).toBe(42);
  });

  it("a setItem that throws a quota error keeps results in memory", async () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const store = createScoreStore(storage);
    await store.record(result("fouled_plug", 42, { day: 10 }));
    expect(await store.dailyAttempted(10)).toBe(true);
    expect((await store.best("fouled_plug"))!.score.total).toBe(42);
  });

  it("unparseable or foreign values read as empty and are replaced on the next write", async () => {
    for (const bad of ["{not json", "null", "42", JSON.stringify({ v: 2, best: {}, daily: {} }), JSON.stringify({ v: 1, best: { x: { nope: true } }, daily: "no" })]) {
      const storage = fakeStorage();
      storage.data.set(SCORES_KEY, bad);
      const store = createScoreStore(storage);
      expect(await store.dailyAttempted(10)).toBe(false);
      expect(await store.best("x")).toBeNull();
      await store.record(result("fouled_plug", 42, { day: 10 }));
      expect(parseSaved(storage.data.get(SCORES_KEY)!).best.fouled_plug!.score.total).toBe(42);
    }
  });

  it("works with no storage at all", async () => {
    const store = createScoreStore(null);
    await store.record(result("fouled_plug", 42));
    expect((await store.best("fouled_plug"))!.score.total).toBe(42);
  });

  it("safeStorage gives null when touching storage throws or there is none", () => {
    expect(
      safeStorage(() => {
        throw new Error("SecurityError");
      }),
    ).toBeNull();
    expect(safeStorage(() => undefined)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {},
    };
    expect(safeStorage(() => broken)).toBeNull();
    const ok = fakeStorage();
    expect(safeStorage(() => ok)).toBe(ok);
  });

  it("a saved record is a copy the caller cannot change later", async () => {
    const store = createScoreStore(null);
    const r = result("fouled_plug", 42);
    await store.record(r);
    r.score.total = 1;
    expect((await store.best("fouled_plug"))!.score.total).toBe(42);
  });
});
