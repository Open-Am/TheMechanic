import { describe, expect, it } from "vitest";
import { SYMPTOMS } from "../src/core/types.ts";
import { formatTime, patienceMood, starText } from "../src/ui/format.ts";
import { STRINGS, SYMPTOM_TEXT, TEMPLATES } from "../src/ui/strings.ts";
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
