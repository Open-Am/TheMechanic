import { describe, expect, it } from "vitest";
import { browserVibrate, createAudio } from "../src/platform/local/audio.ts";
import { MUTED_KEY, createFlag } from "../src/platform/local/storage.ts";
import { createClock } from "../src/platform/local/clock.ts";
import { createDailyProvider } from "../src/platform/local/daily.ts";
import { type NavigatorLike, createShare, hasShareSheet } from "../src/platform/local/share.ts";
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

describe("audio (ADR 0018, plan 0013 step 1)", () => {
  /** A fake AudioContext: records each source started and when; decodes any buffer except one starting 0xff. */
  function fakeContext(startState = "suspended") {
    const started: Array<{ buffer: unknown; when: number }> = [];
    const ctx = {
      state: startState,
      currentTime: 10,
      destination: {},
      resumes: 0,
      async resume() {
        ctx.resumes++;
        ctx.state = "running";
      },
      async decodeAudioData(data: ArrayBuffer) {
        if (new Uint8Array(data)[0] === 0xff) throw new Error("EncodingError");
        return { decoded: data.byteLength };
      },
      createBufferSource(): { buffer: unknown; connect: () => unknown; start: (when?: number) => void } {
        const node = { buffer: null as unknown, connect: () => node, start: (when = 0) => void started.push({ buffer: node.buffer, when }) };
        return node;
      },
    };
    return { ctx, started };
  }
  const good = () => new Uint8Array([1, 2, 3]).buffer;
  const bad = () => new Uint8Array([0xff]).buffer;

  function ready(muted = false) {
    const { ctx, started } = fakeContext();
    const vibrations: Array<number | number[]> = [];
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const heard: Array<[string, boolean]> = [];
    const audio = createAudio(
      {
        createContext: () => ctx,
        vibrate: (p) => (vibrations.push(p), true),
        setTimeout: (fn, ms) => timers.push({ fn, ms }),
        onPlay: (m, a) => void heard.push([m, a]),
      },
      muted,
    );
    return { audio, ctx, started, vibrations, timers, heard };
  }

  it("plays nothing before unlock, even with the file loaded", async () => {
    const t = ready();
    const loading = t.audio.load("land", good());
    t.audio.play("land");
    expect(t.started).toHaveLength(0);
    expect(t.audio.contextState()).toBe("none");
    t.audio.unlock();
    expect(await loading).toBe(true);
    t.audio.play("land");
    expect(t.started).toHaveLength(1);
    expect(t.heard).toEqual([["land", false], ["land", true]]);
  });

  it("makes one context on the first unlock and resumes it only until it runs", async () => {
    let made = 0;
    const { ctx } = fakeContext();
    const audio = createAudio({ createContext: () => (made++, ctx) });
    audio.unlock();
    await Promise.resolve();
    audio.unlock();
    audio.unlock();
    expect(made).toBe(1);
    expect(ctx.resumes).toBe(1);
    expect(audio.contextState()).toBe("running");
  });

  it("plays nothing while muted, and plays again when unmuted", async () => {
    const t = ready(true);
    t.audio.unlock();
    expect(await t.audio.load("seat", good())).toBe(true);
    t.audio.play("seat");
    expect(t.started).toHaveLength(0);
    t.audio.setMuted(false);
    t.audio.play("seat");
    expect(t.started).toHaveLength(1);
    expect(t.audio.muted()).toBe(false);
  });

  it("plays nothing for a missing moment or a file that will not decode", async () => {
    const t = ready();
    t.audio.unlock();
    expect(await t.audio.load("fail", bad())).toBe(false);
    t.audio.play("fail");
    t.audio.play("start");
    expect(t.started).toHaveLength(0);
    expect(t.audio.loaded()).toEqual([]);
    expect(t.heard).toEqual([["fail", false], ["start", false]]);
  });

  it("schedules a delayed moment on the context's clock", async () => {
    const t = ready();
    t.audio.unlock();
    await t.audio.load("start", good());
    t.audio.play("start", 0.6);
    t.audio.play("start");
    t.audio.play("start", -1);
    expect(t.started.map((s) => s.when)).toEqual([10.6, 10, 10]);
  });

  it("vibrates now or after a delay, and not while muted", () => {
    const t = ready();
    t.audio.vibrate(15);
    t.audio.vibrate([60, 40, 80], 0.6);
    expect(t.vibrations).toEqual([15]);
    expect(t.timers.map((x) => x.ms)).toEqual([600]);
    t.timers[0]!.fn();
    expect(t.vibrations).toEqual([15, [60, 40, 80]]);
    t.audio.vibrate(40, 0.6);
    t.audio.setMuted(true);
    t.timers[1]!.fn(); // muted while it waited
    t.audio.vibrate(40);
    expect(t.vibrations).toEqual([15, [60, 40, 80]]);
  });

  it("skips vibration where the phone has none, and swallows a refusal", () => {
    expect(() => createAudio({}).vibrate(15)).not.toThrow();
    expect(browserVibrate({})).toBeUndefined();
    expect(browserVibrate(null)).toBeUndefined();
    const audio = createAudio({
      vibrate: () => {
        throw new Error("refused");
      },
    });
    expect(() => audio.vibrate(15)).not.toThrow();
  });

  it("plays nothing and throws nothing without Web Audio", async () => {
    const audio = createAudio({ createContext: () => null });
    audio.unlock();
    expect(await audio.load("turn", good())).toBe(false);
    expect(() => audio.play("turn")).not.toThrow();
    const throwing = createAudio({
      createContext: () => {
        throw new Error("no audio");
      },
    });
    expect(() => throwing.unlock()).not.toThrow();
    expect(throwing.contextState()).toBe("none");
  });

  it("swallows a source that fails to start", async () => {
    const { ctx } = fakeContext("running");
    ctx.createBufferSource = () => {
      throw new Error("broken");
    };
    const audio = createAudio({ createContext: () => ctx });
    audio.unlock();
    await audio.load("cord", good());
    expect(() => audio.play("cord")).not.toThrow();
  });
});

describe("storage and the mute setting (ADR 0018, plan 0013 reading 10)", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  }

  it("remembers the choice under openam.muted, with sound on by default", () => {
    const s = memoryStorage();
    expect(MUTED_KEY).toBe("openam.muted");
    const flag = createFlag(s, MUTED_KEY);
    expect(flag.get()).toBe(false);
    flag.set(true);
    expect(s.data.get("openam.muted")).toBe("1");
    expect(createFlag(s, MUTED_KEY).get()).toBe(true); // after a reload
    flag.set(false);
    expect(createFlag(s, MUTED_KEY).get()).toBe(false);
  });

  it("falls back to memory when localStorage throws", () => {
    const throwing = {
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const flag = createFlag(throwing, MUTED_KEY);
    expect(flag.get()).toBe(false);
    expect(() => flag.set(true)).not.toThrow();
    expect(flag.get()).toBe(true);
    const none = createFlag(null, MUTED_KEY);
    none.set(true);
    expect(none.get()).toBe(true);
  });

  it("reads a value it does not know as the default", () => {
    const s = memoryStorage();
    s.data.set(MUTED_KEY, "yes");
    expect(createFlag(s, MUTED_KEY).get()).toBe(false);
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

describe("share (ADR 0005, plan 0014 reading 9)", () => {
  function nav(opts: { sheet?: "ok" | "cancel" | "fail"; clipboard?: "ok" | "fail" }) {
    const sent: Array<[string, string]> = [];
    const n: NavigatorLike = {};
    if (opts.sheet) {
      n.share = async ({ text }) => {
        if (opts.sheet === "cancel") throw Object.assign(new Error("cancelled"), { name: "AbortError" });
        if (opts.sheet === "fail") throw Object.assign(new Error("no"), { name: "NotAllowedError" });
        sent.push(["sheet", text]);
      };
    }
    if (opts.clipboard) {
      n.clipboard = {
        async writeText(text) {
          if (opts.clipboard === "fail") throw new Error("denied");
          sent.push(["clipboard", text]);
        },
      };
    }
    return { n, sent };
  }

  it("uses the share sheet when there is one", async () => {
    const { n, sent } = nav({ sheet: "ok", clipboard: "ok" });
    expect(await createShare(n).share("hi")).toBe("sheet");
    expect(sent).toEqual([["sheet", "hi"]]);
    expect(hasShareSheet(n)).toBe(true);
  });

  it("a cancelled sheet returns none and never touches the clipboard", async () => {
    const { n, sent } = nav({ sheet: "cancel", clipboard: "ok" });
    expect(await createShare(n).share("hi")).toBe("none");
    expect(sent).toEqual([]);
  });

  it("another sheet error falls back to the clipboard", async () => {
    const { n, sent } = nav({ sheet: "fail", clipboard: "ok" });
    expect(await createShare(n).share("hi")).toBe("clipboard");
    expect(sent).toEqual([["clipboard", "hi"]]);
  });

  it("no sheet uses the clipboard", async () => {
    const { n, sent } = nav({ clipboard: "ok" });
    expect(await createShare(n).share("hi")).toBe("clipboard");
    expect(sent).toEqual([["clipboard", "hi"]]);
    expect(hasShareSheet(n)).toBe(false);
  });

  it("both missing or both failing returns none", async () => {
    expect(await createShare({}).share("hi")).toBe("none");
    expect(await createShare(null).share("hi")).toBe("none");
    expect(await createShare(nav({ clipboard: "fail" }).n).share("hi")).toBe("none");
    expect(await createShare(nav({ sheet: "fail", clipboard: "fail" }).n).share("hi")).toBe("none");
    expect(hasShareSheet(null)).toBe(false);
  });
});
