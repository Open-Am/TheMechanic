import { describe, expect, it } from "vitest";
import { SILENT_AUDIO_SOURCE, silenceAudio } from "../../tools/verify/silent-audio.ts";

/** A stand-in for the browser's audio graph: nodes record what they connect to. */
class FakeNode {
  readonly connections: unknown[] = [];
  connect(to: unknown): unknown {
    this.connections.push(to);
    return to;
  }
}
class FakeGain extends FakeNode {
  readonly gain = { value: 1 };
}
function fakeScope() {
  const speakers = new FakeNode();
  class FakeBase {
    createGain(): FakeGain {
      return new FakeGain();
    }
  }
  Object.defineProperty(FakeBase.prototype, "destination", { configurable: true, get: () => speakers });
  class FakeContext extends FakeBase {}
  return { scope: { BaseAudioContext: FakeBase, AudioContext: FakeContext } as unknown as Parameters<typeof silenceAudio>[0], speakers, FakeContext };
}

describe("the browser checks' silent audio (plan 0013)", () => {
  it("sends every context's sound through one gain of zero to the real destination", () => {
    const { scope, speakers, FakeContext } = fakeScope();
    silenceAudio(scope);
    const ctx = new FakeContext() as unknown as { destination: FakeGain };
    const out = ctx.destination;
    expect(out).toBeInstanceOf(FakeGain);
    expect(out.gain.value).toBe(0);
    expect(out.connections).toEqual([speakers]);
    expect(ctx.destination).toBe(out); // the same node every time, not one per play
  });

  it("gives each context its own silent destination", () => {
    const { scope, FakeContext } = fakeScope();
    silenceAudio(scope);
    const a = (new FakeContext() as unknown as { destination: unknown }).destination;
    const b = (new FakeContext() as unknown as { destination: unknown }).destination;
    expect(a).not.toBe(b);
  });

  it("does nothing where Web Audio is missing, and the page source runs it on window", () => {
    expect(() => silenceAudio({} as Parameters<typeof silenceAudio>[0])).not.toThrow();
    expect(SILENT_AUDIO_SOURCE).toContain("(window)");
  });
});
