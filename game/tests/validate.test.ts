import { describe, expect, it } from "vitest";
import { validateAll, validateFaults, validateMachine } from "../src/core/validate.ts";
import type { Machine } from "../src/core/types.ts";
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
    const empty = { id: "x", name: "x", schema: 1, verified: false, size: [0, 0, 0], base: [], parts: [] } as Machine;
    expect(() => validateMachine(empty)).not.toThrow();
    expect(validateFaults({ machine: "x", schema: 1, faults: [] }, empty).ok).toBe(false);
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
    expect(held).toEqual(["air_filter_cover", "alternator_cover", "carburetor", "fuel_tank", "muffler", "recoil_starter"]);
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
