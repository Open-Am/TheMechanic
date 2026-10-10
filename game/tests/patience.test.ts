import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FAILED_PULL_PATIENCE_COST, PATIENCE_THRESHOLDS } from "../src/core/constants.ts";
import { dailyCustomerId } from "../src/core/daily.ts";
import { hasWalked, moodFor, patienceAt, walkOutTime } from "../src/core/patience.ts";
import { apply, initialState } from "../src/core/reducer.ts";
import { replay } from "../src/core/replay.ts";
import { score } from "../src/core/score.ts";
import type { Action, Customer, CustomerFile, RoundState } from "../src/core/types.ts";
import { validateCustomers } from "../src/core/validate.ts";
import { faultById, loadFaults, loadMachine, perfectPlay } from "./helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const customersFile = JSON.parse(readFileSync(join(here, "..", "public", "customers.json"), "utf8")) as CustomerFile;
const machine = loadMachine();
const faults = loadFaults();
const plug = faultById(faults, "fouled_plug");
const tunde = customersFile.customers.find((c) => c.id === "tunde")!;

function withPatience(seconds: number): Customer {
  return { ...tunde, patience: seconds };
}

function run(actions: Action[], customer: Customer): RoundState {
  let s = initialState(machine);
  for (const a of actions) {
    const r = apply(machine, plug, s, a, customer);
    if (!r.ok) throw new Error(`refused ${r.refusal.reason} at ${a.t}`);
    s = r.state;
  }
  return s;
}

describe("customers.json (ADR 0015)", () => {
  it("the shipped file is valid, with three customers of different patience", () => {
    const r = validateCustomers(customersFile);
    expect(r.issues).toEqual([]);
    expect(customersFile.customers).toHaveLength(3);
    expect(new Set(customersFile.customers.map((c) => c.patience)).size).toBe(3);
  });

  it("every shipped line is still a draft until the owner or mechanic checks it", () => {
    for (const c of customersFile.customers) expect(c.verified).toBe(false);
  });

  it("rejects duplicates, missing names or looks, bad patience and missing lines, and never throws", () => {
    const bad = JSON.parse(JSON.stringify(customersFile)) as CustomerFile;
    bad.customers.push({ ...bad.customers[0]! });
    bad.customers[1]!.name = " ";
    bad.customers[1]!.look = "";
    bad.customers[2]!.patience = -5;
    bad.customers[2]!.lines.leaving = [];
    const codes = validateCustomers(bad).issues.map((i) => i.code);
    for (const c of ["duplicate_id", "no_name", "no_look", "bad_patience", "missing_line"]) expect(codes).toContain(c);
    expect(validateCustomers({ schema: 1, customers: [] }).ok).toBe(false);
    expect(() => validateCustomers({} as CustomerFile)).not.toThrow();
  });
});

describe("patience (ADR 0015)", () => {
  it("drains one second per second and walks out at the customer's patience", () => {
    const s = initialState(machine);
    const c = withPatience(80);
    expect(patienceAt(s, c, 0)).toBe(1);
    expect(patienceAt(s, c, 40_000)).toBeCloseTo(0.5);
    expect(walkOutTime(s, c)).toBe(80_000);
    expect(hasWalked(s, c, 79_999)).toBe(false);
    expect(hasWalked(s, c, 80_000)).toBe(true);
  });

  it("a failed pull costs FAILED_PULL_PATIENCE_COST seconds", () => {
    const c = withPatience(80);
    const s = run([{ t: 1000, type: "pull" }], c);
    expect(s.failedPulls).toBe(1);
    expect(walkOutTime(s, c)).toBe((80 - FAILED_PULL_PATIENCE_COST) * 1000);
  });

  it("removing a wrong part costs no patience", () => {
    const c = withPatience(80);
    const before = walkOutTime(initialState(machine), c);
    const s = run([{ t: 1000, type: "remove", partId: "muffler" }], c);
    expect(s.removedEver.has("muffler")).toBe(true);
    expect(walkOutTime(s, c)).toBe(before);
    expect(patienceAt(s, c, 1000)).toBeCloseTo(patienceAt(initialState(machine), c, 1000));
  });

  it("refuses every action at or after the walk-out with customer_left", () => {
    const c = withPatience(10);
    const s = initialState(machine);
    const r = apply(machine, plug, s, { t: 10_000, type: "remove", partId: "plug_cap" }, c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.reason).toBe("customer_left");
    expect(apply(machine, plug, s, { t: 9_999, type: "remove", partId: "plug_cap" }, c).ok).toBe(true);
  });

  it("a failed pull that empties the meter makes the customer leave at that pull", () => {
    const c = withPatience(25);
    const s = run([{ t: 6000, type: "pull" }], c);
    expect(walkOutTime(s, c)).toBe(6000);
    expect(hasWalked(s, c, 6000)).toBe(true);
    const next = apply(machine, plug, s, { t: 6000, type: "remove", partId: "plug_cap" }, c);
    expect(next.ok).toBe(false);
  });

  it("without a customer nothing changes: no walk-out, existing logs replay as before", () => {
    const play = perfectPlay(machine, plug, 60_000);
    expect(replay(machine, plug, play).failedAt).toBeNull();
    expect(replay(machine, plug, play, withPatience(30)).failedAt?.refusal.reason).toBe("customer_left");
  });

  it("a replayed log walks out at the same moment, every time", () => {
    const c = withPatience(50);
    // Muffler off and back on (a wrong part, no patience cost), then a failed pull.
    const log: Action[] = [{ t: 1000, type: "remove", partId: "muffler" }, { t: 2000, type: "install", partId: "muffler" }, { t: 5000, type: "pull" }];
    const a = replay(machine, plug, log, c);
    const b = replay(machine, plug, log, c);
    expect(walkOutTime(a.state, c)).toBe(walkOutTime(b.state, c));
    expect(walkOutTime(a.state, c)).toBe(30_000);
  });

  it("moods follow the thresholds", () => {
    expect(moodFor(1)).toBe("arrive");
    expect(moodFor(PATIENCE_THRESHOLDS.waiting - 0.01)).toBe("waiting");
    expect(moodFor(PATIENCE_THRESHOLDS.annoyed - 0.01)).toBe("annoyed");
  });
});

describe("scoring a walked round (ADR 0004, ADR 0015)", () => {
  it("is scored at the walk-out time, with no stars and outcome walked", () => {
    const c = withPatience(40);
    const log: Action[] = [{ t: 2000, type: "remove", partId: "muffler" }, { t: 2500, type: "install", partId: "muffler" }, { t: 3000, type: "pull" }];
    const s = score(machine, plug, log, c, 90_000);
    expect(s.outcome).toBe("walked");
    expect(s.stars).toBe(0);
    expect(s.complete).toBe(false);
    expect(s.elapsedSeconds).toBe(40 - FAILED_PULL_PATIENCE_COST);
    expect(s.wrongParts).toBe(1);
    expect(s.failedPulls).toBe(1);
  });

  it("a round fixed in time is fixed, with stars, whatever the customer", () => {
    const play = perfectPlay(machine, plug, 1000);
    const s = score(machine, plug, play, withPatience(80));
    expect(s.outcome).toBe("fixed");
    expect(s.stars).toBeGreaterThan(0);
  });

  it("a round still going has no outcome", () => {
    const s = score(machine, plug, [{ t: 1000, type: "remove", partId: "plug_cap" }], withPatience(80), 5000);
    expect(s.outcome).toBeNull();
  });

  it("every fault can be finished by a perfect play inside the most impatient customer's patience", () => {
    for (const fault of faults.faults) {
      const s = score(machine, fault, perfectPlay(machine, fault, 1000), tunde);
      expect(s.outcome, fault.id).toBe("fixed");
    }
  });
});

describe("daily customer (ADR 0005, ADR 0015)", () => {
  it("is the same for everyone on a day, and uses every customer over a run of days", () => {
    expect(dailyCustomerId(customersFile.customers, 12)).toBe(dailyCustomerId(customersFile.customers, 12));
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) seen.add(dailyCustomerId(customersFile.customers, d));
    expect(seen.size).toBe(customersFile.customers.length);
    expect(() => dailyCustomerId([], 1)).toThrow();
  });
});
