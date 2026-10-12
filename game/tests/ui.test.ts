import { describe, expect, it } from "vitest";
import { SYMPTOMS } from "../src/core/types.ts";
import type { ScoreBreakdown } from "../src/core/types.ts";
import { DROP, dailyButtonText, dropLine, dropTarget, formatTime, magnetPx, patienceMood, shareOffered, shareText, shareUrl, soundButton, starText, todayResultText } from "../src/ui/format.ts";
import { SHARE, STRINGS, SYMPTOM_TEXT, TEMPLATES } from "../src/ui/strings.ts";
import { loadFaults } from "./helpers.ts";

describe("formatTime", () => {
  it("shows minutes and two-digit seconds, rounding down", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5999)).toBe("0:05");
    expect(formatTime(65_000)).toBe("1:05");
    expect(formatTime(600_000)).toBe("10:00");
  });

  it("shows 0:00 for negative or invalid input", () => {
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});

describe("starText", () => {
  it("is always three characters", () => {
    expect(starText(3)).toBe("★★★");
    expect(starText(1)).toBe("★☆☆");
    expect(starText(0)).toBe("☆☆☆");
    expect(starText(7)).toBe("★★★");
  });
});

describe("strings", () => {
  it("every symptom has text, including every symptom used by a shipped fault", () => {
    for (const s of SYMPTOMS) expect(SYMPTOM_TEXT[s].length).toBeGreaterThan(0);
    for (const f of loadFaults().faults) expect(SYMPTOM_TEXT[f.symptom]).toBeDefined();
  });

  it("the pull cord label is the brief's wording", () => {
    expect(STRINGS.pullCord).toBe("Pull cord");
  });

  it("no string is empty", () => {
    for (const [k, v] of Object.entries(STRINGS)) expect(v.length, k).toBeGreaterThan(0);
  });
});

describe("customers in the interface (ADR 0015)", () => {
  it("the meter's colour follows the 50 and 20 percent thresholds", () => {
    expect(patienceMood(1)).toBe("calm");
    expect(patienceMood(0.5)).toBe("calm");
    expect(patienceMood(0.49)).toBe("waiting");
    expect(patienceMood(0.19)).toBe("annoyed");
    expect(patienceMood(0)).toBe("annoyed");
  });

  it("text that names a customer comes from one place", () => {
    expect(TEMPLATES.walkedTitle("Tunde")).toBe("Tunde took the generator to another mechanic.");
    expect(TEMPLATES.speech("Tunde", "You never finish?")).toBe("Tunde: “You never finish?”");
    expect(TEMPLATES.customerSays("Mama Ngozi")).toBe("Mama Ngozi says");
  });
});

describe("the tray drop zone (ADR 0020, release 0.15.1)", () => {
  // Measured at 390 by 844 with nothing off: the generator's lowest point at 650, the controls from 710.
  const phone = { width: 390, height: 844 };
  const machine = { left: 70, top: 250, right: 320, bottom: 650 };
  const controls = { left: 0, top: 710, right: 390, bottom: 844 };
  const line = dropLine(machine, controls);
  const at = (x: number, y: number) => dropTarget({ x, y }, machine, phone, controls);

  it("starts just below the generator's lowest point, not at the controls", () => {
    expect(line).toBe(650 + DROP.margin);
    expect(line).toBeLessThan(controls.top);
  });

  it("is the whole lower region, full width: just below the generator, the bench edge, the pull cord, the chips, the bottom", () => {
    for (const x of [0, 30, 195, 360, 390]) {
      expect(at(x, line)).toBe("tray");
      expect(at(x, 690)).toBe("tray"); // the bench's front edge
      expect(at(x, 740)).toBe("tray"); // the pull cord
      expect(at(x, 800)).toBe("tray"); // the chips
      expect(at(x, 844)).toBe("tray");
    }
  });

  it("was missing the strip just below the generator before 0.15.1 (64 px above the controls was the edge)", () => {
    // The owner's "it goes back to machine": the old edge sat 4 px above the generator's lowest point at 390 by 844, but
    // on a shorter screen with the tray grown it was well below it. Here the controls are 150 px under the generator.
    const lowControls = { ...controls, top: 800 };
    expect(dropTarget({ x: 195, y: 700 }, machine, phone, lowControls)).toBe("tray");
  });

  it("over the generator itself puts the part back, even within the magnet's reach", () => {
    expect(at(195, 400)).toBe("back");
    expect(at(195, 640)).toBe("back");
    expect(at(195, machine.bottom)).toBe("back");
    expect(at(195, 100)).toBe("back"); // above the generator, far from the tray
  });

  it("counts a release close to the zone beside the generator (the magnet)", () => {
    const m = magnetPx(phone.height);
    expect(at(30, line - m + 1)).toBe("tray");
    expect(at(30, line - m - 1)).toBe("back");
    expect(at(360, line - 20)).toBe("tray");
  });

  it("judges the carried part's place as well as the finger's", () => {
    // The finger still over the generator, the part hanging below it at the bench's edge: a drop.
    expect(dropTarget({ x: 195, y: 600 }, machine, phone, controls, { x: 195, y: 690 })).toBe("tray");
    // The finger in the zone counts whatever the part does.
    expect(dropTarget({ x: 195, y: 760 }, machine, phone, controls, { x: 195, y: 500 })).toBe("tray");
    // Both over the generator: back.
    expect(dropTarget({ x: 195, y: 500 }, machine, phone, controls, { x: 200, y: 520 })).toBe("back");
  });

  it("the magnet reach scales with the screen: 56 to 80 px", () => {
    expect(magnetPx(640)).toBeGreaterThanOrEqual(56);
    expect(magnetPx(844)).toBeGreaterThan(magnetPx(640));
    expect(magnetPx(2000)).toBe(80);
    expect(magnetPx(300)).toBe(56);
  });

  it("the controls always count, even if the generator is drawn down over them (zoomed in)", () => {
    const low = { ...machine, bottom: 760 };
    expect(dropLine(low, controls)).toBe(controls.top);
    expect(dropTarget({ x: 195, y: 720 }, low, phone, controls)).toBe("tray");
    expect(dropTarget({ x: 195, y: 700 }, low, phone, controls)).toBe("back");
  });

  it("without the generator's bounds falls back to a strip above the controls", () => {
    expect(dropLine(null, controls)).toBe(controls.top - DROP.reach);
    expect(dropTarget({ x: 195, y: controls.top - DROP.reach }, null, phone, controls)).toBe("tray");
    expect(dropTarget({ x: 195, y: 100 }, null, phone, controls)).toBe("back");
  });

  it("a point below the screen's bottom (a flick's point ahead) is in the zone", () => {
    expect(at(195, 1000)).toBe("tray");
  });

  it("gives the same answer for the same input", () => {
    expect(at(120, 655)).toBe(at(120, 655));
  });
});

describe("share text (ADR 0005)", () => {
  const fixed = (elapsedSeconds: number, wrongParts: number, stars: 1 | 2 | 3): ScoreBreakdown => ({
    elapsedSeconds,
    wrongParts,
    failedPulls: 0,
    total: elapsedSeconds + 10 * wrongParts,
    stars,
    complete: true,
    outcome: "fixed",
  });

  it("matches ADR 0005's example exactly", () => {
    expect(shareText(12, fixed(38, 1, 3), "https://example.org/")).toBe("Open Am · Day 12\nFixed in 38s · 1 wrong part · ★★★\nhttps://example.org/");
  });

  it("says 0 wrong parts and 2 wrong parts", () => {
    expect(shareText(1, fixed(20, 0, 3), "u").split("\n")[1]).toBe("Fixed in 20s · 0 wrong parts · ★★★");
    expect(shareText(1, fixed(20, 2, 3), "u").split("\n")[1]).toBe("Fixed in 20s · 2 wrong parts · ★★★");
  });

  it("always counts in seconds, and shows two stars as ★★☆", () => {
    expect(shareText(3, fixed(95, 0, 2), "u")).toBe("Open Am · Day 3\nFixed in 95s · 0 wrong parts · ★★☆\nu");
  });

  it("never shows failed pulls", () => {
    const s = { ...fixed(40, 0, 2), failedPulls: 2, total: 70 };
    expect(shareText(3, s, "u")).not.toMatch(/pull/i);
  });

  it("links to the page's origin and base path, with no query", () => {
    expect(shareUrl("https://openam.example/?diag&today=2026-10-12T08:00:00Z#x", "./")).toBe("https://openam.example/");
    expect(shareUrl("https://host.example/game/index.html?diag", "./")).toBe("https://host.example/game/");
    expect(shareUrl("http://192.168.1.5:5173/", "/")).toBe("http://192.168.1.5:5173/");
  });
});

describe("start screen text (plan 0014 readings 1, 5; ADR 0024)", () => {
  const sc = (total: number, outcome: "fixed" | "walked", stars: 0 | 1 | 2 | 3): ScoreBreakdown => ({ elapsedSeconds: total, wrongParts: 0, failedPulls: 0, total, stars, complete: outcome === "fixed", outcome });

  it("offers today's day until the attempt is used, then practice", () => {
    expect(dailyButtonText({ day: 10, attempted: false, result: null })).toBe("Today's fault · Day 10");
    expect(dailyButtonText({ day: 10, attempted: true, result: null })).toBe("Today's fault · practice");
  });

  it("shows today's scored result, a walk-out, or Not finished", () => {
    expect(todayResultText({ day: 10, attempted: false, result: null })).toBeNull();
    expect(todayResultText({ day: 10, attempted: true, result: { score: sc(52, "fixed", 2) } })).toBe("Day 10: score 52 ★★☆");
    expect(todayResultText({ day: 10, attempted: true, result: { score: sc(30, "walked", 0) } })).toBe("Day 10: the customer walked");
    expect(todayResultText({ day: 10, attempted: true, result: { unfinished: true, score: sc(0, "fixed", 3) } })).toBe("Day 10: Not finished");
  });

  it("Share is offered only for a fixed scored daily", () => {
    expect(shareOffered("daily", "fixed")).toBe(true);
    expect(shareOffered("daily", "walked")).toBe(false);
    expect(shareOffered("practice", "fixed")).toBe(false);
    expect(shareOffered("free", "fixed")).toBe(false);
    expect(shareOffered(null, "fixed")).toBe(false);
  });

  it("every share and daily template gives text", () => {
    expect(TEMPLATES.dailyDay(0)).toBe("Today's fault · Day 0");
    expect(SHARE.wrongParts(1)).toBe("1 wrong part");
  });
});

describe("the mute button (plan 0013 step 7)", () => {
  it("is pressed and reads Sound off when muted, and reads Sound on otherwise", () => {
    expect(soundButton(true)).toEqual({ label: "Sound off", pressed: "true" });
    expect(soundButton(false)).toEqual({ label: "Sound on", pressed: "false" });
    expect(soundButton(true).label).toBe(STRINGS.soundOff);
    expect(soundButton(false).label).toBe(STRINGS.soundOn);
  });
});
