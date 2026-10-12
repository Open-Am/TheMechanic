import { describe, expect, it } from "vitest";
import { validateAll, validateFaults, validateMachine } from "../src/core/validate.ts";
import { CHECK_IDS, type Machine } from "../src/core/types.ts";
import { FAULT_SCHEMA } from "../src/core/validate.ts";
import { loadFaults, loadMachine } from "./helpers.ts";

const machine = loadMachine();
const faults = loadFaults();

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

describe("validator on the shipped data", () => {
  it("accepts machine.json and faults.json", () => {
    const r = validateAll(machine, faults);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("validateMachine rejections", () => {
  it("duplicate IDs", () => {
    const m = clone(machine);
    m.parts.push({ ...m.parts[0]! });
    const r = validateMachine(m);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("duplicate_id");
  });

  it("requires naming no part", () => {
    const m = clone(machine);
    m.parts[0]!.requires = ["ghost"];
    const r = validateMachine(m);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("unknown_requires");
  });

  it("a cycle in requires", () => {
    const m = clone(machine);
    const hose = m.parts.find((p) => p.id === "fuel_hose")!;
    hose.requires = ["fuel_tank"]; // tank -> tap -> hose -> tank
    const r = validateMachine(m);
    expect(r.ok).toBe(false);
    const cycle = r.issues.find((i) => i.code === "requires_cycle");
    for (const id of ["fuel_tank", "fuel_tap", "fuel_hose"]) expect(cycle?.message).toContain(id);
  });

  it("hiddenBy naming no part", () => {
    const m = clone(machine);
    m.parts.find((p) => p.id === "spark_plug")!.hiddenBy = ["ghost"];
    const r = validateMachine(m);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("unknown_hidden_by");
  });

  it("warns on a hiddenBy entry that is not in requires and still accepts", () => {
    const m = clone(machine);
    m.parts.find((p) => p.id === "spark_plug")!.hiddenBy = ["plug_cap", "muffler"];
    const r = validateMachine(m);
    expect(r.ok).toBe(true);
    const warnings = r.issues.filter((i) => i.code === "hidden_by_not_required");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.level).toBe("warning");
    expect(warnings[0]!.message).toContain("muffler");
  });

  it("accepts an empty hiddenBy with no issue", () => {
    const m = clone(machine);
    expect(m.parts.find((p) => p.id === "fuel_tank")!.hiddenBy).toEqual([]);
    expect(validateMachine(m).issues).toEqual([]);
  });

  it("warns on an unknown motion type and still accepts", () => {
    const m = clone(machine);
    m.parts[0]!.motion = { type: "teleport" };
    const r = validateMachine(m);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("unknown_motion");
  });
});

describe("validateFaults rejections", () => {
  it("a culprit naming no part", () => {
    const f = clone(faults);
    f.faults[0]!.culprit = "ghost";
    const r = validateFaults(f, machine);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("unknown_culprit");
  });

  it("an unknown symptom", () => {
    const f = clone(faults);
    (f.faults[0] as unknown as { symptom: string }).symptom = "explodes";
    const r = validateFaults(f, machine);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("unknown_symptom");
  });

  it("a fault file for another machine", () => {
    const f = clone(faults);
    f.machine = "gen2000";
    expect(validateFaults(f, machine).ok).toBe(false);
  });

  it("never throws on empty input", () => {
    const empty = { id: "x", name: "x", schema: 1, verified: false, size: [0, 0, 0], base: [], parts: [] } as unknown as Machine;
    expect(() => validateMachine(empty)).not.toThrow();
    expect(validateFaults({ machine: "x", schema: 1, faults: [] }, empty).ok).toBe(false);
    expect(() => validateFaults({ machine: "x", schema: 2, faults: [{} as never] }, empty)).not.toThrow();
  });
});

describe("fasteners (ADR 0020, plan 0011)", () => {
  const codes = (m: Machine) => validateMachine(m).issues.map((i) => i.code);
  const withCover = (edit: (f: NonNullable<Machine["parts"][number]["fasteners"]>[number]) => void) => {
    const m = clone(machine);
    const cover = m.parts.find((p) => p.id === "alternator_cover")!;
    edit(cover.fasteners![0]!);
    return m;
  };

  it("the shipped draft fasteners are valid, and only on parts that are held on by them", () => {
    expect(validateMachine(machine).issues.filter((i) => i.code.includes("fastener"))).toEqual([]);
    const held = machine.parts.filter((p) => (p.fasteners ?? []).length > 0).map((p) => p.id).sort();
    expect(held).toEqual(["air_filter_cover", "alternator_cover", "carburetor", "fuel_tank", "ignition_coil", "muffler", "recoil_starter"]);
  });

  it("ids must be written <part id>.<name> and be unique across the machine", () => {
    expect(codes(withCover((f) => (f.id = "bolt_1")))).toContain("bad_fastener_id");
    expect(codes(withCover((f) => (f.id = "alternator_cover.")))).toContain("bad_fastener_id");
    expect(codes(withCover((f) => (f.id = "alternator_cover.bolt_2")))).toContain("duplicate_id");
  });

  it("kind, position and a unit axis are checked", () => {
    expect(codes(withCover((f) => ((f as { kind: string }).kind = "rivet")))).toContain("bad_fastener_kind");
    expect(codes(withCover((f) => ((f as { position: unknown }).position = [0, 0])))).toContain("bad_fastener_position");
    expect(codes(withCover((f) => (f.axis = [0, 2, 0])))).toContain("bad_fastener_axis");
  });

  it("a part with no fasteners is fine, and fasteners that are not a list are not", () => {
    const m = clone(machine);
    delete m.parts.find((p) => p.id === "alternator_cover")!.fasteners;
    expect(validateMachine(m).ok).toBe(true);
    (m.parts[0] as unknown as { fasteners: unknown }).fasteners = "four bolts";
    expect(codes(m)).toContain("bad_fasteners");
  });
});

describe("checks in machine.json (ADR 0029)", () => {
  const codes = (m: Machine) => validateMachine(m).issues.map((i) => i.code);

  it("the shipped machine has all six checks and no issue with them", () => {
    expect(Object.keys(machine.checks).sort()).toEqual([...CHECK_IDS].sort());
    expect(validateMachine(machine).issues.filter((i) => i.code.includes("check"))).toEqual([]);
  });

  it("rejects a machine with no checks", () => {
    const m = clone(machine) as Partial<Machine>;
    delete m.checks;
    expect(codes(m as Machine)).toContain("no_checks");
  });

  it("rejects a machine that leaves out any of the six", () => {
    for (const id of CHECK_IDS) {
      const m = clone(machine);
      delete (m.checks as Record<string, unknown>)[id];
      const r = validateMachine(m);
      expect(r.ok, id).toBe(false);
      expect(r.issues.find((i) => i.code === "missing_check")?.message).toContain(id);
    }
  });

  it("rejects an unknown check id", () => {
    const m = clone(machine);
    (m.checks as Record<string, unknown>)["compression"] = { allOn: true };
    expect(codes(m)).toContain("unknown_check");
  });

  it("rejects a part id that is not a part", () => {
    const m = clone(machine);
    m.checks.look_plug = { off: ["ghost"] };
    expect(codes(m)).toContain("unknown_check_part");
    const n = clone(machine);
    n.checks.spark_test = { off: ["spark_plug"], on: ["ghost"] };
    expect(codes(n)).toContain("unknown_check_part");
  });

  it("rejects needs of the wrong shape", () => {
    const m = clone(machine);
    (m.checks as Record<string, unknown>)["look_plug"] = { off: "spark_plug" };
    expect(codes(m)).toContain("bad_check");
    const n = clone(machine);
    (n.checks as Record<string, unknown>)["listen_pull"] = { allOn: "yes" };
    expect(codes(n)).toContain("bad_check");
    const o = clone(machine);
    (o.checks as Record<string, unknown>)["volts_test"] = null;
    expect(codes(o)).toContain("bad_check");
  });

  it("rejects a check that could never be done", () => {
    const m = clone(machine);
    m.checks.look_plug = { off: ["spark_plug"], on: ["spark_plug"] };
    expect(codes(m)).toContain("check_contradiction");
    const n = clone(machine);
    n.checks.listen_pull = { allOn: true, off: ["muffler"] };
    expect(codes(n)).toContain("check_contradiction");
  });
});

describe("clues and difficulty in faults.json (ADR 0029, ADR 0030)", () => {
  const codes = (f: typeof faults) => validateFaults(f, machine).issues.map((i) => i.code);

  it("the shipped faults are schema 2, each with a difficulty and a line for every check", () => {
    expect(faults.schema).toBe(FAULT_SCHEMA);
    expect(FAULT_SCHEMA).toBe(2);
    for (const f of faults.faults) {
      expect([1, 2, 3], f.id).toContain(f.difficulty);
      expect(Object.keys(f.clues).sort(), f.id).toEqual([...CHECK_IDS].sort());
      for (const id of CHECK_IDS) expect(f.clues[id].trim().length, `${f.id} ${id}`).toBeGreaterThan(0);
    }
  });

  it("no shipped line names the fault's bad part, and every one is still an unverified draft", () => {
    expect(validateFaults(faults, machine).issues).toEqual([]);
    for (const f of faults.faults) expect(f.verified, f.id).toBe(false);
  });

  it("only schema 2 is read", () => {
    for (const schema of [1, 3]) {
      const f = clone(faults);
      f.schema = schema;
      expect(codes(f)).toContain("bad_schema");
    }
  });

  it("rejects a fault missing a check's line, or with an empty one", () => {
    for (const id of CHECK_IDS) {
      const f = clone(faults);
      delete (f.faults[0]!.clues as Record<string, unknown>)[id];
      expect(validateFaults(f, machine).issues.find((i) => i.code === "missing_clue")?.message, id).toContain(id);
    }
    const g = clone(faults);
    g.faults[1]!.clues.look_smoke = "   ";
    expect(codes(g)).toContain("missing_clue");
  });

  it("rejects a fault with no clues, or a line for an unknown check", () => {
    const f = clone(faults);
    delete (f.faults[0] as Partial<(typeof f.faults)[0]>).clues;
    expect(codes(f)).toContain("no_clues");
    const g = clone(faults);
    (g.faults[0]!.clues as Record<string, string>)["compression"] = "Good.";
    expect(codes(g)).toContain("unknown_clue");
  });

  it("warns, and still accepts, when a line names the bad part", () => {
    const f = clone(faults);
    const plug = f.faults.find((x) => x.culprit === "spark_plug")!;
    plug.clues.look_plug = "The spark plug is black.";
    const r = validateFaults(f, machine);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("clue_names_culprit");
  });

  it("rejects a difficulty that is not 1, 2 or 3", () => {
    for (const bad of [0, 4, 1.5, "2", undefined]) {
      const f = clone(faults);
      (f.faults[0] as unknown as Record<string, unknown>)["difficulty"] = bad;
      expect(codes(f), String(bad)).toContain("bad_difficulty");
    }
  });
});

describe("the twelve faults are fair puzzles (ADR 0029, ADR 0030)", () => {
  it("every two faults differ in at least one check's line", () => {
    const all = faults.faults;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        expect(CHECK_IDS.some((id) => a.clues[id] !== b.clues[id]), `${a.id} and ${b.id}`).toBe(true);
      }
    }
  });

  it("has the twelve faults of ADR 0030 with their culprits and draft difficulty", () => {
    const want: Record<string, [string, number]> = {
      fouled_plug: ["spark_plug", 1],
      clogged_jet: ["carburetor", 2],
      blocked_fuel_tap: ["fuel_tap", 2],
      dead_capacitor: ["capacitor", 2],
      choked_muffler: ["muffler", 1],
      dirty_air_filter: ["air_filter", 1],
      fuel_cap_vent_blocked: ["fuel_cap", 1],
      fuel_filter_or_pickup_blocked: ["fuel_filter", 2],
      float_stuck_or_needle_leak: ["carburetor", 3],
      recoil_rope_or_spring: ["recoil_starter", 1],
      weak_capacitor_low_output: ["capacitor", 2],
      ignition_coil_or_magneto: ["ignition_coil", 3],
    };
    expect(Object.fromEntries(faults.faults.map((f) => [f.id, [f.culprit, f.difficulty]]))).toEqual(want);
    expect(machine.parts).toHaveLength(15);
  });
});
