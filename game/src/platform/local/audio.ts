// Sound and vibration on the Web Audio API and navigator.vibrate, both built into the browser (ADR 0018, plan 0013).
// One AudioContext, made on the first unlock() (inside a tap, as browsers require) and resumed there. Each moment's file
// arrives through load() after Start (ADR 0023) and is decoded once; each play starts a fresh source node. A moment
// with no decoded file, a locked context, or mute plays nothing. Every failure is swallowed: sound never breaks a round.
// The context and the vibrate function are injected so this is tested without a browser.

import type { Audio, Moment, VibrationPattern } from "../interfaces/index.ts";

/** The parts of AudioBufferSourceNode this needs. */
export interface SourceLike {
  buffer: unknown;
  connect(destination: never): unknown;
  start(when?: number): void;
  /** For a looped moment (plan 0018). */
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  stop?(when?: number): void;
}

/** The parts of a GainNode this needs, to fade a looped moment out. */
export interface GainLike {
  gain: { value: number; setValueAtTime?(v: number, t: number): unknown; linearRampToValueAtTime?(v: number, t: number): unknown };
  connect(destination: never): unknown;
}

/** The parts of AudioContext this needs. */
export interface ContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): SourceLike;
  createGain?(): GainLike;
}

export interface AudioEnv {
  /** Makes the AudioContext, or null where Web Audio is missing. Called once, from the first unlock(). */
  createContext?: () => ContextLike | null;
  /** navigator.vibrate, bound, or undefined where the phone has none. */
  vibrate?: ((pattern: number | number[]) => boolean) | undefined;
  /** Defaults to the global setTimeout. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  /** Told of every play: the moment and whether it could be heard. For the development hooks. */
  onPlay?: (moment: Moment, audible: boolean) => void;
}

/** The local audio, with what the development hooks read. */
export interface LocalAudio extends Audio {
  /** The context's state: "none" before the first unlock or without Web Audio, else "suspended", "running"... */
  contextState(): string;
  /** Moments with a decoded file. */
  loaded(): Moment[];
  muted(): boolean;
}

/** The browser's AudioContext, or null if it is missing or refuses. */
export function browserContext(): ContextLike | null {
  try {
    const g = globalThis as unknown as { AudioContext?: new () => ContextLike; webkitAudioContext?: new () => ContextLike };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

/** navigator.vibrate bound to navigator, or undefined where it does not exist. */
export function browserVibrate(nav: { vibrate?: (p: number | number[]) => boolean } | null | undefined): AudioEnv["vibrate"] {
  return nav && typeof nav.vibrate === "function" ? (p) => nav.vibrate!(p) : undefined;
}

export function createAudio(env: AudioEnv = {}, startMuted = false): LocalAudio {
  let muted = startMuted;
  let ctx: ContextLike | null = null;
  let tried = false;
  const buffers = new Map<Moment, unknown>();
  /** Copies of each moment still playing that can be faded: the looped ones. */
  const playing = new Map<Moment, Array<{ source: SourceLike; gain: GainLike | null }>>();
  /** Files that arrived before the context existed; decoded on the first unlock. */
  const pending = new Map<Moment, { data: ArrayBuffer; resolve: (ok: boolean) => void }>();
  const later = env.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));

  async function decode(moment: Moment, data: ArrayBuffer): Promise<boolean> {
    if (!ctx) return false;
    try {
      const buffer = await ctx.decodeAudioData(data);
      if (!buffer) return false;
      buffers.set(moment, buffer);
      return true;
    } catch {
      return false;
    }
  }

  function context(): ContextLike | null {
    if (!tried) {
      tried = true;
      try {
        ctx = env.createContext ? env.createContext() : null;
      } catch {
        ctx = null;
      }
      for (const [moment, p] of pending) void decode(moment, p.data).then(p.resolve);
      pending.clear();
    }
    return ctx;
  }

  return {
    play(moment, delaySeconds = 0, loop) {
      let audible = false;
      try {
        const buffer = buffers.get(moment);
        if (!muted && ctx && ctx.state === "running" && buffer) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = loop && ctx.createGain ? ctx.createGain() : null;
          if (gain) {
            source.connect(gain as never);
            gain.connect(ctx.destination as never);
          } else source.connect(ctx.destination as never);
          if (loop) {
            source.loop = true;
            source.loopStart = loop.from;
            source.loopEnd = loop.to;
            playing.set(moment, [...(playing.get(moment) ?? []), { source, gain }]);
          }
          source.start(ctx.currentTime + Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0));
          audible = true;
        }
      } catch {
        audible = false;
      }
      env.onPlay?.(moment, audible);
    },

    fade(moment, seconds) {
      const list = playing.get(moment) ?? [];
      playing.delete(moment);
      if (!ctx) return;
      const now = ctx.currentTime;
      const end = now + Math.max(0, Number.isFinite(seconds) ? seconds : 0);
      for (const { source, gain } of list) {
        try {
          if (gain?.gain.setValueAtTime && gain.gain.linearRampToValueAtTime) {
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, end);
          }
          source.stop?.(end);
        } catch {
          // Already stopped.
        }
      }
    },

    vibrate(pattern: VibrationPattern, delaySeconds = 0) {
      const vibrate = env.vibrate;
      if (muted || !vibrate) return;
      const p = typeof pattern === "number" ? pattern : [...pattern];
      const go = () => {
        if (muted) return; // muted while it waited
        try {
          vibrate(p);
        } catch {
          // Refused (no tap yet, or not allowed): nothing happens.
        }
      };
      if (delaySeconds > 0) later(go, delaySeconds * 1000);
      else go();
    },

    setMuted(m) {
      muted = m;
    },

    unlock() {
      const c = context();
      if (!c || c.state === "running") return;
      try {
        c.resume().catch(() => {});
      } catch {
        // A browser that will not start audio plays nothing.
      }
    },

    load(moment, data) {
      if (!tried) {
        pending.get(moment)?.resolve(false); // replaced by the newer file
        return new Promise((resolve) => pending.set(moment, { data, resolve }));
      }
      return decode(moment, data);
    },

    contextState() {
      return ctx ? ctx.state : "none";
    },
    loaded() {
      return [...buffers.keys()];
    },
    muted() {
      return muted;
    },
  };
}
