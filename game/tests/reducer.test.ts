import { describe, expect, it } from "vitest";
import { apply, clueText, conditionText, initialState } from "../src/core/reducer.ts";
import { blockers, canInstall, canRemove, checkPossible, checkSeconds, hiders, isCheckId, isVisible, necessarySet, removableNow, removalOrder, unmetNeeds } from "../src/core/rules.ts";
import { replay } from "../src/core/replay.ts";
import { score } from "../src/core/score.ts";
import { CHECK_IDS, type Action, type CheckId, type RoundState } from "../src/core/types.ts";
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
    expect(conditionText(machine, fouledPlug, s, "spark_plug")).toBe(machine.parts.find((p) => p.id === "spark_plug")!.inspectOk);
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

  it("the fuel hose cannot go back until the carburetor, the filter and the tap are on (ADR 0030)", () => {
    let s = initialState(machine);
    s = step(s, { t: 1, type: "remove", partId: "fuel_hose" });
    s = step(s, { t: 2, type: "remove", partId: "fuel_filter" });
    s = step(s, { t: 3, type: "remove", partId: "fuel_tap" });
    s = step(s, { t: 4, type: "remove", partId: "air_filter_cover" });
    s = step(s, { t: 5, type: "remove", partId: "air_filter" });
    s = step(s, { t: 6, type: "remove", partId: "carburetor" });
    expect(refusal(s, { t: 7, type: "install", partId: "fuel_hose" }).parts?.sort()).toEqual(["carburetor", "fuel_filter", "fuel_tap"]);
    s = step(s, { t: 7, type: "install", partId: "carburetor" });
    // The filter sits on the tap's outlet: the tap goes back first, then the filter, then the hose.
    expect(refusal(s, { t: 8, type: "install", partId: "fuel_filter" }).parts).toEqual(["fuel_tap"]);
    s = step(s, { t: 8, type: "install", partId: "fuel_tap" });
    expect(refusal(s, { t: 9, type: "install", partId: "fuel_hose" }).parts).toEqual(["fuel_filter"]);
    s = step(s, { t: 9, type: "install", partId: "fuel_filter" });
    s = step(s, { t: 10, type: "install", partId: "fuel_hose" });
    expect(s.installed.has("fuel_hose")).toBe(true);
  });

  it("the new parts' removal orders (ADR 0030): the tank needs the cap off, the tap the filter, the coil the starter", () => {
    const s = initialState(machine);
    expect(blockers(machine, s, "fuel_cap")).toEqual([]);
    expect(blockers(machine, s, "fuel_filter")).toEqual(["fuel_hose"]);
    expect(blockers(machine, s, "fuel_tap").sort()).toEqual(["fuel_filter", "fuel_hose"]);
    expect(blockers(machine, s, "fuel_tank").sort()).toEqual(["fuel_cap", "fuel_tap"]);
    expect(blockers(machine, s, "ignition_coil")).toEqual(["recoil_starter"]);
    expect(hiders(machine, s, "ignition_coil")).toEqual(["recoil_starter"]);
    const byId = (id: string) => faults.faults.find((f) => f.culprit === id && f.id !== "clogged_jet" && f.id !== "dead_capacitor")!;
    expect(removalOrder(machine, byId("fuel_cap"))).toEqual(["fuel_cap"]);
    expect(removalOrder(machine, byId("fuel_filter"))).toEqual(["fuel_hose", "fuel_filter"]);
    expect(removalOrder(machine, byId("fuel_tap"))).toEqual(["fuel_hose", "fuel_filter", "fuel_tap"]);
    expect(removalOrder(machine, byId("ignition_coil"))).toEqual(["recoil_starter", "ignition_coil"]);
    expect(removalOrder(machine, byId("recoil_starter"))).toEqual(["recoil_starter"]);
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

describe("checks (ADR 0029)", () => {
  const check = (t: number, checkId: string): Action => ({ t, type: "check", checkId: checkId as CheckId });
  /** A state with these parts taken off, in an order the rules allow (the removal order of each, deps first). */
  function without(...ids: string[]): RoundState {
    let s = initialState(machine);
    let t = 0;
    const order: string[] = [];
    const add = (id: string) => {
      if (order.includes(id)) return;
      for (const dep of machine.parts.find((p) => p.id === id)!.requires) add(dep);
      order.push(id);
    };
    for (const id of ids) add(id);
    for (const id of order) s = step(s, { t: ++t, type: "remove", partId: id });
    return s;
  }

  it("the machine has all six checks, and the round starts with none done", () => {
    expect(Object.keys(machine.checks).sort()).toEqual([...CHECK_IDS].sort());
    expect(initialState(machine).checksDone).toEqual([]);
  });

  it("listen, look at the smoke and the volts test need every part on", () => {
    for (const id of ["listen_pull", "look_smoke", "volts_test"] as const) {
      expect(checkPossible(machine, initialState(machine), id), id).toBe(true);
      const s = without("muffler");
      expect(checkPossible(machine, s, id), id).toBe(false);
      expect(unmetNeeds(machine, s, id)).toEqual({ off: [], on: [], allOn: true });
      expect(refusal(s, check(10, id)).reason).toBe("check_unavailable");
    }
  });

  it("reading the plug needs the spark plug in the tray", () => {
    expect(checkPossible(machine, initialState(machine), "look_plug")).toBe(false);
    expect(unmetNeeds(machine, initialState(machine), "look_plug")).toEqual({ off: ["spark_plug"], on: [], allOn: false });
    expect(checkPossible(machine, without("plug_cap"), "look_plug")).toBe(false);
    expect(checkPossible(machine, without("spark_plug"), "look_plug")).toBe(true);
  });

  it("the spark test needs the spark plug in the tray and the recoil starter on", () => {
    expect(checkPossible(machine, without("spark_plug"), "spark_test")).toBe(true);
    const s = without("spark_plug", "recoil_starter");
    expect(checkPossible(machine, s, "spark_test")).toBe(false);
    expect(unmetNeeds(machine, s, "spark_test")).toEqual({ off: [], on: ["recoil_starter"], allOn: false });
  });

  it("the fuel flow test needs the hose off and everything that feeds it on", () => {
    expect(checkPossible(machine, initialState(machine), "fuel_flow")).toBe(false);
    expect(checkPossible(machine, without("fuel_hose"), "fuel_flow")).toBe(true);
    const feeds = machine.checks.fuel_flow.on ?? [];
    expect(feeds).toEqual(expect.arrayContaining(["fuel_tank", "fuel_tap"]));
    const s = without("fuel_tap");
    expect(checkPossible(machine, s, "fuel_flow")).toBe(false);
    expect(unmetNeeds(machine, s, "fuel_flow")!.on).toContain("fuel_tap");
  });

  it("is applied and logged in order, changing nothing else", () => {
    const s0 = initialState(machine);
    const s1 = step(s0, check(500, "listen_pull"));
    expect(s1.checksDone).toEqual(["listen_pull"]);
    expect(s1.t).toBe(500);
    expect(s1.installed).toEqual(s0.installed);
    expect(s1.failedPulls).toBe(0);
    expect(s1.endedAt).toBeNull();
    const s2 = step(s1, check(600, "volts_test"));
    expect(s2.checksDone).toEqual(["listen_pull", "volts_test"]);
  });

  it("can be done once per round", () => {
    const s = step(initialState(machine), check(1, "look_smoke"));
    const r = refusal(s, check(2, "look_smoke"));
    expect(r.reason).toBe("already_checked");
  });

  it("is refused once the fault is fixed", () => {
    let s = without("spark_plug");
    s = step(s, { t: 50, type: "fix", partId: "spark_plug" });
    expect(refusal(s, check(51, "look_plug")).reason).toBe("already_fixed");
  });

  it("refuses an id that is not a check, or no id", () => {
    expect(refusal(initialState(machine), check(1, "compression")).reason).toBe("check_unavailable");
    expect(refusal(initialState(machine), { t: 1, type: "check" }).reason).toBe("check_unavailable");
    expect(isCheckId("listen_pull")).toBe(true);
    expect(isCheckId("compression")).toBe(false);
    expect(isCheckId(undefined)).toBe(false);
  });

  it("is refused after the round is over, or with time going backwards", () => {
    const ended = replay(machine, fouledPlug, perfectPlay(machine, fouledPlug)).state;
    expect(refusal(ended, check(ended.t + 1, "listen_pull")).reason).toBe("round_over");
    const s = step(initialState(machine), { t: 100, type: "remove", partId: "muffler" });
    expect(refusal(s, check(50, "look_plug")).reason).toBe("time_went_backwards");
  });

  it("does not depend on the fault: the same check is possible or refused for every fault", () => {
    const states = [initialState(machine), without("spark_plug"), without("fuel_hose"), without("muffler")];
    for (const s of states) {
      for (const id of CHECK_IDS) {
        const results = faults.faults.map((f) => apply(machine, f, s, check(s.t + 1, id)).ok);
        expect(new Set(results).size, id).toBe(1);
      }
    }
  });

  it("its result is the fault's line, and only after the check is done", () => {
    let s = initialState(machine);
    expect(clueText(fouledPlug, s, "listen_pull")).toBeNull();
    s = step(s, check(1, "listen_pull"));
    expect(clueText(fouledPlug, s, "listen_pull")).toBe(fouledPlug.clues.listen_pull);
    expect(clueText(cloggedJet, s, "listen_pull")).toBe(cloggedJet.clues.listen_pull);
    expect(clueText(fouledPlug, s, "look_smoke")).toBeNull();
    expect(clueText(fouledPlug, s, "nothing" as CheckId)).toBeNull();
  });

  it("the checks' seconds add up from CHECK_SECONDS", () => {
    expect(checkSeconds([])).toBe(0);
    expect(checkSeconds(["listen_pull", "spark_test"])).toBe(7);
    expect(checkSeconds([...CHECK_IDS])).toBe(19);
  });

  it("the same state and check always give the same result", () => {
    const s = without("spark_plug");
    expect(apply(machine, fouledPlug, s, check(99, "spark_test"))).toEqual(apply(machine, fouledPlug, s, check(99, "spark_test")));
  });
});
