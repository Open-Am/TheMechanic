import { describe, expect, it } from "vitest";
import { progressCounter } from "../src/render/progress.ts";
import { progressShare } from "../src/ui/format.ts";

describe("loading progress (plan 0014 step 6)", () => {
  it("counts each file as it settles, a failed file too", async () => {
    const seen: Array<[number, number]> = [];
    const counted = progressCounter(3, (d, t) => seen.push([d, t]));
    expect(seen).toEqual([[0, 3]]);
    let fail!: (e: Error) => void;
    const failing = counted(new Promise<null>((_, rej) => (fail = rej)));
    await counted(Promise.resolve(1));
    expect(seen.at(-1)).toEqual([1, 3]);
    fail(new Error("404"));
    await expect(failing).rejects.toThrow("404");
    await counted(Promise.resolve(null));
    expect(seen).toEqual([[0, 3], [1, 3], [2, 3], [3, 3]]);
  });

  it("works without a callback", async () => {
    await expect(progressCounter(1)(Promise.resolve(5))).resolves.toBe(5);
  });

  it("the bar's share is files done out of files requested, and nothing to load is done", () => {
    expect(progressShare(0, 4)).toBe(0);
    expect(progressShare(1, 4)).toBe(0.25);
    expect(progressShare(4, 4)).toBe(1);
    expect(progressShare(5, 4)).toBe(1);
    expect(progressShare(0, 0)).toBe(1);
    expect(progressShare(-1, 4)).toBe(0);
    expect(progressShare(Number.NaN, 4)).toBe(0);
  });
});
