import { describe, expect, it } from "vitest";
import { behindBench, carriedYaw, clearOfToolbox, clipFor, CUSTOMER_CLIPS, customerPlace, ENDINGS, gapBehindMachine, generatorIn, HANDLE_RIGHT, moodAfter, notesShown, restingClip, SETTLE, settleShare, STORY, storyOver, type CustomerEvent, type CustomerMood } from "../src/render/customerpose.ts";
import { DEFAULT_YAW, FRAMING, frameBench, machineToWorld, projectWorld } from "../src/render/stage.ts";
import type { Vec3 } from "../src/core/types.ts";
import { loadFaults, loadMachine } from "./helpers.ts";

const machine = loadMachine();
const faults = loadFaults();
const moods: CustomerMood[] = ["calm", "waiting", "annoyed"];

describe("where the customer stands (plan 0015 reading 7 as revised for ADR 0025)", () => {
  it("about 0.35 m behind the bench's far edge, facing the mechanic, the same every round", () => {
    expect(behindBench()).toBeCloseTo(0.35, 5);
    expect(customerPlace()).toEqual(customerPlace());
    expect(customerPlace().rotationY).toBe(0);
  });

  it("is always farther from the camera than the generator, however it is turned on the bench", () => {
    for (let k = 0; k < 72; k++) {
      const yaw = -Math.PI + (k * Math.PI) / 36;
      expect(gapBehindMachine(machine.size, yaw)).toBeGreaterThan(0.1);
    }
  });

  it("stands well clear of the toolbox on the bench's left end", () => {
    expect(clearOfToolbox()).toBeGreaterThan(0.6);
  });

  for (const [w, h] of [[390, 844], [360, 640]] as const) {
    it(`at ${w} by ${h} the head is below the timer and the face above the generator at the default turn`, () => {
      const s = machine.size;
      const corners: Vec3[] = [];
      for (const x of [-s[0] / 2, s[0] / 2]) for (const y of [0, s[1]]) for (const z of [-s[2] / 2, s[2] / 2]) corners.push([x, y, z]);
      const fov = (40 * Math.PI) / 180;
      // The controls with an empty tray: about 134 CSS px (ui/styles.css).
      const f = frameBench(corners, DEFAULT_YAW, fov, w, h, 134);
      const toPx = (p: Vec3) => ((1 - projectWorld(f, p, fov, w / h)![1]) / 2) * h;
      const spot = customerPlace().position;
      // The tallest customer's head, and the shortest one's chin (Mama Ngozi: 1.57 m tall, chin about 1.36 m).
      expect(toPx([spot[0], FRAMING.headHeight, spot[2]])).toBeGreaterThan(FRAMING.topPx);
      const chin = toPx([spot[0], 1.36, spot[2]]);
      const top = Math.min(...corners.map((c) => toPx(machineToWorld(c, DEFAULT_YAW))));
      expect(chin).toBeLessThan(top);
    });
  }
});

describe("which clip plays (plan 0015 reading 5, ADR 0007)", () => {
  it("nothing done to a part moves the customer, for every part, every fault and every mood", () => {
    const partEvents: CustomerEvent["type"][] = ["removed", "installed", "inspected", "fixed", "refused"];
    for (const fault of faults.faults) {
      for (const part of machine.parts) {
        for (const type of partEvents) {
          for (const mood of moods) {
            expect(clipFor({ type } as CustomerEvent, mood), `${fault.id} ${part.id} ${type}`).toBeNull();
            expect(moodAfter({ type } as CustomerEvent, mood)).toBe(mood);
          }
        }
      }
    }
  });

  it("the clock and the cord choose the clips, the same for every fault", () => {
    expect(clipFor({ type: "started" }, "annoyed")).toEqual({ clip: "idle", then: "loop" });
    expect(clipFor({ type: "patience", mood: "waiting" }, "calm")).toEqual({ clip: "waiting", then: "idle" });
    expect(clipFor({ type: "patience", mood: "annoyed" }, "waiting")).toEqual({ clip: "annoyed", then: "annoyed_idle" });
    expect(clipFor({ type: "pulled", started: false }, "calm")).toEqual({ clip: "failed_pull", then: "idle" });
    expect(clipFor({ type: "pulled", started: false }, "annoyed")).toEqual({ clip: "failed_pull", then: "annoyed_idle" });
    expect(clipFor({ type: "pulled", started: true }, "calm")).toBeNull();
    expect(clipFor({ type: "ended" }, "waiting")).toEqual(ENDINGS.fixed);
    expect(clipFor({ type: "left" }, "annoyed")).toEqual(ENDINGS.walked);
  });

  it("moods follow the patience events, and a new round starts calm", () => {
    expect(moodAfter({ type: "patience", mood: "waiting" }, "calm")).toBe("waiting");
    expect(moodAfter({ type: "patience", mood: "annoyed" }, "waiting")).toBe("annoyed");
    expect(moodAfter({ type: "started" }, "annoyed")).toBe("calm");
    expect(restingClip("calm")).toBe("idle");
    expect(restingClip("waiting")).toBe("idle");
    expect(restingClip("annoyed")).toBe("annoyed_idle");
  });

  it("every clip it can ask for is one the files carry", () => {
    const asked = new Set<string>();
    const events: CustomerEvent[] = [{ type: "started" }, { type: "patience", mood: "waiting" }, { type: "patience", mood: "annoyed" }, { type: "pulled", started: false }, { type: "ended" }, { type: "left" }];
    for (const e of events) {
      for (const m of moods) {
        const p = clipFor(e, m);
        if (!p) continue;
        asked.add(p.clip);
        if (!["loop", "hold", "hide"].includes(p.then)) asked.add(p.then);
      }
    }
    for (const c of asked) expect(CUSTOMER_CLIPS as readonly string[]).toContain(c);
  });
});

describe("bringing the generator, paying, storming off (plan 0017 step 2, ADR 0026)", () => {
  it("the generator is carried until it lands, then on the bench", () => {
    expect(generatorIn("arrive", 0)).toBe("carried");
    expect(generatorIn("arrive", STORY.arrive.lands - 0.01)).toBe("carried");
    expect(generatorIn("arrive", STORY.arrive.lands)).toBe("bench");
    expect(STORY.arrive.lands).toBeLessThan(STORY.arrive.length);
  });

  it("the endings leave it on the bench until it is lifted, then carry it off", () => {
    for (const clip of ["pay_leave", "storm_off"] as const) {
      expect(generatorIn(clip, 0)).toBe("bench");
      expect(generatorIn(clip, STORY[clip].lifted - 0.01)).toBe("bench");
      expect(generatorIn(clip, STORY[clip].lifted)).toBe("carried");
      expect(storyOver(clip, STORY[clip].length)).toBe(true);
      expect(storyOver(clip, STORY[clip].length - 0.01)).toBe(false);
    }
  });

  it("the notes show only while paying, before the hold and before the generator is lifted", () => {
    const p = STORY.pay_leave;
    expect(notesShown("pay_leave", p.notesShown - 0.01)).toBe(false);
    expect(notesShown("pay_leave", p.notesShown)).toBe(true);
    expect(notesShown("pay_leave", p.notesTaken - 0.01)).toBe(true);
    expect(notesShown("pay_leave", p.notesTaken)).toBe(false);
    expect(notesShown("storm_off", 1)).toBe(false);
    expect(notesShown("arrive", 1)).toBe(false);
    expect(p.notesTaken).toBeLessThan(p.hold);
    expect(p.hold).toBeLessThan(p.lifted);
  });

  it("eases in over SETTLE seconds before it lands or is lifted, and the walk-out's parts snap home within 0.3 s", () => {
    expect(settleShare("arrive", STORY.arrive.lands - SETTLE - 0.01)).toBe(0);
    expect(settleShare("arrive", STORY.arrive.lands)).toBeCloseTo(1, 6);
    expect(settleShare("storm_off", STORY.storm_off.lifted - SETTLE / 2)).toBeCloseTo(0.5, 5);
    expect(STORY.storm_off.snapBack).toBeLessThanOrEqual(0.3);
  });

  it("a carried generator turns with the line from the right hand's grip to the left hand's", () => {
    expect(carriedYaw([0, 1, 0], [0.1, 1, 0])).toBeCloseTo(0, 6);
    expect(carriedYaw([0, 1, 0], [0, 1, -0.1])).toBeCloseTo(Math.PI / 2, 6);
    expect(HANDLE_RIGHT[1]).toBeGreaterThan(0.36);
  });

  it("the endings are the same for every fault: fixed pays and leaves, walked storms off (ADR 0007)", () => {
    for (const mood of moods) {
      expect(clipFor({ type: "ended" }, mood)).toEqual({ clip: "pay_leave", then: "hide" });
      expect(clipFor({ type: "left" }, mood)).toEqual({ clip: "storm_off", then: "hide" });
    }
  });
});
