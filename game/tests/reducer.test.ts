import { describe, expect, it } from "vitest";
import { apply, conditionText, initialState } from "../src/core/reducer.ts";
import { blockers, canInstall, canRemove, hiders, isVisible, necessarySet, removableNow, removalOrder } from "../src/core/rules.ts";
import { replay } from "../src/core/replay.ts";
import { score } from "../src/core/score.ts";
import type { Action, RoundState } from "../src/core/types.ts";
import { faultById, loadFaults, loadMachine, perfectPlay } from "./helpers.ts";

const machine = loadMachine();
const faults = loadFaults();
const fouledPlug = faultById(faults, "fouled_plug");
const cloggedJet = faultById(faults, "clogged_jet");

function step(state: RoundState, action: Action): RoundState {
  const r = apply(machine, fouledPlug, state, action);
  if (!r.ok) throw new Error(`refused: ${r.refusal.reason} ${JSON.stringify(r.refusal.parts ?? [])}`);
  return r.state;
}

function refusal(state: RoundState, action: Action) {
  const r = apply(machine, fouledPlug, state, action);
  if (r.ok) throw new Error("expected a refusal");
  return r.refusal;
}

describe("initial state", () => {
  it("has every part installed and nothing in the tray", () => {
    const s = initialState(machine);
    expect(s.installed.size).toBe(machine.parts.length);
    expect(s.tray).toEqual([]);
    expect(s.fixed).toBe(false);
    expect(s.endedAt).toBeNull();
  });

  it("only parts with no requires are removable at the start", () => {
    const s = initialState(machine);
    expect(removableNow(machine, s).sort()).toEqual(
      machine.parts.filter((p) => p.requires.length === 0).map((p) => p.id).sort(),
    );
  });
});

describe("remove", () => {
  it("removes a free part into the tray and records it", () => {
    const s = step(initialState(machine), { t: 100, type: "remove", partId: "muffler" });
    expect(s.installed.has("muffler")).toBe(false);
    expect(s.tray).toEqual(["muffler"]);
    expect(s.removedEver.has("muffler")).toBe(true);
    expect(s.t).toBe(100);
  });

  it("refuses a part whose requires are still on, naming the blocker", () => {
    const r = refusal(initialState(machine), { t: 100, type: "remove", partId: "spark_plug" });
    expect(r.reason).toBe("blocked_by");
    expect(r.parts).toEqual(["plug_cap"]);
  });

  it("refuses a part that is already off", () => {
    const s = step(initialState(machine), { t: 100, type: "remove", partId: "muffler" });
    expect(refusal(s, { t: 200, type: "remove", partId: "muffler" }).reason).toBe("not_installed");
  });

  it("refuses an unknown part", () => {
    expect(refusal(initialState(machine), { t: 100, type: "remove", partId: "flux_capacitor" }).reason).toBe("unknown_part");
    expect(refusal(initialState(machine), { t: 100, type: "remove" }).reason).toBe("unknown_part");
  });

  it("allows a part once its requires are off", () => {
    let s = initialState(machine);
    expect(canRemove(machine, s, "spark_plug")).toBe(false);
    s = step(s, { t: 100, type: "remove", partId: "plug_cap" });
    expect(canRemove(machine, s, "spark_plug")).toBe(true);
    expect(blockers(machine, s, "spark_plug")).toEqual([]);
  });

  it("the carburetor needs both the air filter and the fuel hose off", () => {
    let s = initialState(machine);
    s = step(s, { t: 1, type: "remove", partId: "air_filter_cover" });
    s = step(s, { t: 2, type: "remove", partId: "air_filter" });
    expect(refusal(s, { t: 3, type: "remove", partId: "carburetor" }).parts).toEqual(["fuel_hose"]);
    s = step(s, { t: 3, type: "remove", partId: "fuel_hose" });
    expect(canRemove(machine, s, "carburetor")).toBe(true);
  });
});

describe("visibility (ADR 0011)", () => {
  it("parts with no requires are visible at the start", () => {
    const s = initialState(machine);
    for (const p of machine.parts.filter((x) => x.requires.length === 0)) expect(isVisible(machine, s, p.id), p.id).toBe(true);
  });

  it("the fuel tank is visible at the start although it cannot come off", () => {
    const s = initialState(machine);
    expect(canRemove(machine, s, "fuel_tank")).toBe(false);
    expect(hiders(machine, s, "fuel_tank")).toEqual([]);
    expect(isVisible(machine, s, "fuel_tank")).toBe(true);
  });

  it("an absent hiddenBy defaults to requires", () => {
    let s = initialState(machine);
    expect(hiders(machine, s, "spark_plug")).toEqual(["plug_cap"]);
    expect(hiders(machine, s, "capacitor")).toEqual(["alternator_cover"]);
    expect(hiders(machine, s, "carburetor").sort()).toEqual(["air_filter", "fuel_hose"]);
    s = step(s, { t: 1, type: "remove", partId: "plug_cap" });
    expect(hiders(machine, s, "spark_plug")).toEqual([]);
    expect(isVisible(machine, s, "spark_plug")).toBe(true);
  });

  it("a part in the tray is not visible in place, and an unknown part hides behind nothing", () => {
    const s = step(initialState(machine), { t: 1, type: "remove", partId: "muffler" });
    expect(isVisible(machine, s, "muffler")).toBe(false);
    expect(hiders(machine, s, "ghost")).toEqual([]);
    expect(isVisible(machine, s, "ghost")).toBe(false);
  });
});

describe("inspect and fix", () => {
  it("inspect works from the tray", () => {
    const s1 = step(initialState(machine), { t: 1, type: "remove", partId: "muffler" });
    const s2 = step(s1, { t: 2, type: "inspect", partId: "muffler" });
    expect(s2.t).toBe(2);
    expect(s2.tray).toEqual(["muffler"]);
  });

  it("inspect works in place on a visible installed part and changes nothing but time", () => {
    const s0 = initialState(machine);
    const s1 = step(s0, { t: 5, type: "inspect", partId: "muffler" });
    expect(s1.t).toBe(5);
    expect(s1.installed).toEqual(s0.installed);
    expect(s1.tray).toEqual([]);
    expect(s1.removedEver.size).toBe(0);
  });

  it("the fuel tank can be inspected at the start", () => {
    const s = step(initialState(machine), { t: 1, type: "inspect", partId: "fuel_tank" });
    expect(s.installed.has("fuel_tank")).toBe(true);
  });

  it("refuses the hidden spark plug, naming the cap, then allows it once the cap is off", () => {
    let s = initialState(machine);
    const r = refusal(s, { t: 1, type: "inspect", partId: "spark_plug" });
    expect(r.reason).toBe("hidden_by");
    expect(r.parts).toEqual(["plug_cap"]);
    s = step(s, { t: 1, type: "remove", partId: "plug_cap" });
    s = step(s, { t: 2, type: "inspect", partId: "spark_plug" });
    expect(s.installed.has("spark_plug")).toBe(true);
  });

  it("refuses the capacitor while the alternator cover is on", () => {
    let s = initialState(machine);
    const r = refusal(s, { t: 1, type: "inspect", partId: "capacitor" });
    expect(r.reason).toBe("hidden_by");
    expect(r.parts).toEqual(["alternator_cover"]);
    s = step(s, { t: 1, type: "remove", partId: "alternator_cover" });
    expect(apply(machine, fouledPlug, s, { t: 2, type: "inspect", partId: "capacitor" }).ok).toBe(true);
  });

  it("names only the hiders still installed", () => {
    let s = initialState(machine);
    expect(refusal(s, { t: 1, type: "inspect", partId: "carburetor" }).parts?.sort()).toEqual(["air_filter", "fuel_hose"]);
    s = step(s, { t: 1, type: "remove", partId: "fuel_hose" });
    expect(refusal(s, { t: 2, type: "inspect", partId: "carburetor" }).parts).toEqual(["air_filter"]);
  });

  it("inspecting in place is never a wrong part and costs no score", () => {
    const base = perfectPlay(machine, fouledPlug);
    const withLook = [{ t: 0, type: "inspect" as const, partId: "muffler" }, { t: 0, type: "inspect" as const, partId: "fuel_tank" }, ...base];
    const a = replay(machine, fouledPlug, base);
    const b = replay(machine, fouledPlug, withLook);
    expect(b.failedAt).toBeNull();
    expect(b.state.endedAt).not.toBeNull();
    expect(b.state.removedEver).toEqual(a.state.removedEver);
    expect(score(machine, fouledPlug, withLook)).toEqual(score(machine, fouledPlug, base));
  });

  it("refuses an unknown part", () => {
    expect(refusal(initialState(machine), { t: 1, type: "inspect", partId: "ghost" }).reason).toBe("unknown_part");
  });

  it("condition text is the bad text for the unfixed culprit only", () => {
    let s = initialState(machine);
    expect(conditionText(machine, fouledPlug, s, "spark_plug")).toBe(fouledPlug.inspectBad);
    expect(conditionText(machine, fouledPlug, s, "muffler")).toBe("A thin layer of soot. Gas passes freely.");
    s = step(s, { t: 1, type: "remove", partId: "plug_cap" });
    s = step(s, { t: 2, type: "remove", partId: "spark_plug" });
    s = step(s, { t: 3, type: "fix", partId: "spark_plug" });
    expect(conditionText(machine, fouledPlug, s, "spark_plug")).toBe("Tip is light brown. Healthy.");
    expect(conditionText(machine, fouledPlug, s, "nothing")).toBeNull();
  });

  it("fix refuses a healthy part, an installed culprit, and a second fix", () => {
    let s = initialState(machine);
    expect(refusal(s, { t: 1, type: "fix", partId: "spark_plug" }).reason).toBe("not_in_tray");
    s = step(s, { t: 1, type: "remove", partId: "muffler" });
    expect(refusal(s, { t: 2, type: "fix", partId: "muffler" }).reason).toBe("not_culprit");
    s = step(s, { t: 2, type: "remove", partId: "plug_cap" });
    s = step(s, { t: 3, type: "remove", partId: "spark_plug" });
    s = step(s, { t: 4, type: "fix", partId: "spark_plug" });
    expect(s.fixed).toBe(true);
    expect(refusal(s, { t: 5, type: "fix", partId: "spark_plug" }).reason).toBe("already_fixed");
  });
});

describe("install", () => {
  // spark_plug requires plug_cap: the cap had to come off first, so the cap sits on top of the plug.
  // Going back, the plug must go in before the cap.
  it("goes back in reverse order of removal", () => {
    let s = initialState(machine);
    s = step(s, { t: 1, type: "remove", partId: "plug_cap" });
    s = step(s, { t: 2, type: "remove", partId: "spark_plug" });
    expect(canInstall(machine, s, "spark_plug")).toBe(true);
    expect(canInstall(machine, s, "plug_cap")).toBe(false);
    s = step(s, { t: 3, type: "install", partId: "spark_plug" });
    expect(s.installed.has("spark_plug")).toBe(true);
    s = step(s, { t: 4, type: "install", partId: "plug_cap" });
    expect(s.tray).toEqual([]);
  });

  it("refuses the cap while the plug is still in the tray, naming the plug", () => {
    let s = initialState(machine);
    s = step(s, { t: 1, type: "remove", partId: "plug_cap" });
    s = step(s, { t: 2, type: "remove", partId: "spark_plug" });
    const r = refusal(s, { t: 3, type: "install", partId: "plug_cap" });
    expect(r.reason).toBe("dependents_missing");
    expect(r.parts).toEqual(["spark_plug"]);
  });

  it("the fuel hose cannot go back until both the carburetor and the tap are on", () => {
    let s = initialState(machine);
    s = step(s, { t: 1, type: "remove", partId: "fuel_hose" });
    s = step(s, { t: 2, type: "remove", partId: "fuel_tap" });
    s = step(s, { t: 3, type: "remove", partId: "air_filter_cover" });
    s = step(s, { t: 4, type: "remove", partId: "air_filter" });
    s = step(s, { t: 5, type: "remove", partId: "carburetor" });
    expect(refusal(s, { t: 6, type: "install", partId: "fuel_hose" }).parts?.sort()).toEqual(["carburetor", "fuel_tap"]);
    s = step(s, { t: 6, type: "install", partId: "carburetor" });
    expect(refusal(s, { t: 7, type: "install", partId: "fuel_hose" }).parts).toEqual(["fuel_tap"]);
    s = step(s, { t: 7, type: "install", partId: "fuel_tap" });
    s = step(s, { t: 8, type: "install", partId: "fuel_hose" });
    expect(s.installed.has("fuel_hose")).toBe(true);
  });

  it("refuses a part that is not in the tray", () => {
    expect(refusal(initialState(machine), { t: 1, type: "install", partId: "muffler" }).reason).toBe("not_in_tray");
  });
});

describe("pull", () => {
  it("refuses while parts are missing, naming them", () => {
    const s = step(initialState(machine), { t: 1, type: "remove", partId: "muffler" });
    const r = refusal(s, { t: 2, type: "pull" });
    expect(r.reason).toBe("parts_missing");
    expect(r.parts).toEqual(["muffler"]);
  });

  it("counts a failed pull when the culprit is unfixed and keeps the round going", () => {
    const s = step(initialState(machine), { t: 1, type: "pull" });
    expect(s.failedPulls).toBe(1);
    expect(s.endedAt).toBeNull();
  });

  it("ends the round when the culprit is fixed and everything is back", () => {
    let s = initialState(machine);
    s = step(s, { t: 1, type: "remove", partId: "plug_cap" });
    s = step(s, { t: 2, type: "remove", partId: "spark_plug" });
    s = step(s, { t: 3, type: "fix", partId: "spark_plug" });
    s = step(s, { t: 4, type: "install", partId: "spark_plug" });
    s = step(s, { t: 5, type: "install", partId: "plug_cap" });
    s = step(s, { t: 6000, type: "pull" });
    expect(s.endedAt).toBe(6000);
    expect(refusal(s, { t: 7000, type: "remove", partId: "muffler" }).reason).toBe("round_over");
  });
});

describe("time", () => {
  it("refuses an action earlier than the last one", () => {
    const s = step(initialState(machine), { t: 500, type: "remove", partId: "muffler" });
    expect(refusal(s, { t: 400, type: "inspect", partId: "muffler" }).reason).toBe("time_went_backwards");
    expect(refusal(s, { t: Number.NaN, type: "inspect", partId: "muffler" }).reason).toBe("time_went_backwards");
  });

  it("never mutates the previous state", () => {
    const s0 = initialState(machine);
    const before = JSON.stringify([...s0.installed].sort());
    step(s0, { t: 1, type: "remove", partId: "muffler" });
    expect(JSON.stringify([...s0.installed].sort())).toBe(before);
    expect(s0.tray).toEqual([]);
  });
});

describe("necessary set and removal order", () => {
  it("is the culprit plus its requires, transitively", () => {
    expect([...necessarySet(machine, cloggedJet)].sort()).toEqual(["air_filter", "air_filter_cover", "carburetor", "fuel_hose"]);
    expect([...necessarySet(machine, fouledPlug)].sort()).toEqual(["plug_cap", "spark_plug"]);
  });

  it("removal order is valid when applied", () => {
    for (const f of faults.faults) {
      let s = initialState(machine);
      for (const id of removalOrder(machine, f)) {
        const r = apply(machine, f, s, { t: s.t + 1, type: "remove", partId: id });
        expect(r.ok, `${f.id}: ${id}`).toBe(true);
        if (r.ok) s = r.state;
      }
      expect(s.tray).toContain(f.culprit);
    }
  });
});
