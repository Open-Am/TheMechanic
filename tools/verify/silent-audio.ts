// The browser checks play the game's real sounds (plan 0013), and must not play them through the machine's speakers.
// Edge's --mute-audio switch did that, but on 2026-10-12 it was found to hold headless Edge to about 27 fps and 60 to
// 90 ms of input lag once a round was under way, even with no sound playing, against 105 to 120 fps and 7 to 20 ms
// without it. So the checks leave the browser as it is and silence the page instead: every AudioContext's destination
// becomes one gain of zero in front of the real one. The game still decodes, schedules and plays every moment, and the
// sound checks read its development hook, so nothing they observe changes.

interface Scope {
  BaseAudioContext?: { prototype: object };
  AudioContext?: { prototype: object };
}

/** Puts a zero gain in front of every audio context's destination, one per context. Self-contained: it runs in the page. */
export function silenceAudio(scope: Scope): void {
  const base = scope.BaseAudioContext ?? scope.AudioContext;
  if (!base) return;
  let proto: object | null = base.prototype;
  let real: PropertyDescriptor | undefined;
  while (proto && !(real = Object.getOwnPropertyDescriptor(proto, "destination"))) proto = Object.getPrototypeOf(proto);
  if (!proto || !real || !real.get) return;
  const speakers = real.get;
  const silent = new WeakMap<object, unknown>();
  Object.defineProperty(proto, "destination", {
    configurable: true,
    get(this: { createGain(): { gain: { value: number }; connect(to: unknown): unknown } }) {
      let gain = silent.get(this);
      if (!gain) {
        const g = this.createGain();
        g.gain.value = 0;
        g.connect(speakers.call(this));
        silent.set(this, g);
        gain = g;
      }
      return gain;
    },
  });
}

/** The page script that silences audio, for Page.addScriptToEvaluateOnNewDocument. */
export const SILENT_AUDIO_SOURCE = `(${silenceAudio.toString()})(window);`;
