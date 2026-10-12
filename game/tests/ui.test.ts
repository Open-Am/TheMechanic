import { describe, expect, it } from "vitest";
import { SYMPTOMS } from "../src/core/types.ts";
import type { ScoreBreakdown } from "../src/core/types.ts";
import { DROP_REACH, dailyButtonText, formatTime, inDropZone, patienceMood, shareOffered, shareText, shareUrl, soundButton, starText, todayResultText } from "../src/ui/format.ts";
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

describe("the tray drop zone (ADR 0020)", () => {
  it("is the whole strip from a little above the controls to the bottom of the screen", () => {
    const top = 700;
    const bottom = 844;
    expect(inDropZone(top, top, bottom)).toBe(true);
    expect(inDropZone(top - DROP_REACH, top, bottom)).toBe(true);
    expect(inDropZone(top - DROP_REACH - 1, top, bottom)).toBe(false);
    expect(inDropZone(bottom, top, bottom)).toBe(true);
    expect(inDropZone(bottom + 1, top, bottom)).toBe(false);
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
