// Sound and vibration on the Web Audio API and navigator.vibrate, both built into the browser (ADR 0018, plan 0013).
// One AudioContext, made on the first unlock() (inside a tap, as browsers require) and resumed there. Each moment's file
// arrives through load() after Start (ADR 0023) and is decoded once; each play starts a fresh source node. A moment
// with no decoded file, a locked context, or mute plays nothing. Every failure is swallowed: sound never breaks a round.
// The context and the vibrate function are injected so this is tested without a browser.

import type { Audio, LoopOptions, Moment, VibrationPattern } from "../interfaces/index.ts";

/** The parts of AudioBufferSourceNode this needs. The loop fields and stop are used by loops only (ADR 0028). */
export interface SourceLike {
  buffer: unknown;
  connect(destination: never): unknown;
  start(when?: number, offset?: number): void;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  stop?(when?: number): void;
  disconnect?(): void;
  onended?: (() => void) | null;
}

/** The parts of GainNode a loop needs: its fades. */
export interface GainLike {
  gain: { value: number; setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown; cancelScheduledValues(t: number): unknown };
  connect(destination: never): unknown;
  disconnect(): void;
}

/** The parts of AudioContext this needs. */
export interface ContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): SourceLike;
  /** Loops only (ADR 0028). */
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
  /** Told when a loop starts (playing true) or stops (false), and whether it could be heard. For the development hooks. */
  onLoop?: (moment: Moment, playing: boolean, audible: boolean) => void;
}

/** The local audio, with what the development hooks read. */
export interface LocalAudio extends Audio {
  /** The context's state: "none" before the first unlock or without Web Audio, else "suspended", "running"... */
  contextState(): string;
  /** Moments with a decoded file. */
  loaded(): Moment[];
  muted(): boolean;
  /** The loop playing now, if any (ADR 0028). */
  looping(): Moment[];
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
  /** Files that arrived before the context existed; decoded on the first unlock. */
  const pending = new Map<Moment, { data: ArrayBuffer; resolve: (ok: boolean) => void }>();
  const later = env.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  /** The one loop playing, with its source and its fader (ADR 0028). */
  let loop: { moment: Moment; source: SourceLike; gain: GainLike } | null = null;

  const duration = (moment: Moment | undefined): number => {
    const d = moment ? (buffers.get(moment) as { duration?: unknown } | undefined)?.duration : undefined;
    return typeof d === "number" && Number.isFinite(d) ? d : 0;
  };
  const free = (source: SourceLike, gain: GainLike): void => {
    try {
      source.disconnect?.();
      gain.disconnect();
    } catch {
      // Already gone.
    }
  };

  /** Stops the loop over fadeOut seconds, or at once; frees its nodes once it has stopped. */
  function endLoop(fadeOut: number): void {
    const l = loop;
    if (!l) return;
    loop = null;
    try {
      const now = ctx ? ctx.currentTime : 0;
      if (fadeOut > 0) {
        const p = l.gain.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(0, now + fadeOut);
        l.source.onended = () => free(l.source, l.gain);
        l.source.stop?.(now + fadeOut);
      } else {
        l.source.onended = null;
        l.source.stop?.(now);
        free(l.source, l.gain);
      }
    } catch {
      free(l.source, l.gain);
    }
    env.onLoop?.(l.moment, false, true);
  }

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
    play(moment, delaySeconds = 0) {
      let audible = false;
      try {
        const buffer = buffers.get(moment);
        if (!muted && ctx && ctx.state === "running" && buffer) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination as never);
          source.start(ctx.currentTime + Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0));
          audible = true;
        }
      } catch {
        audible = false;
      }
      env.onPlay?.(moment, audible);
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
      if (m) endLoop(0); // mute is silence now, not after a fade
    },

    startLoop(moment, options: LoopOptions = {}) {
      if (loop?.moment === moment) return;
      endLoop(0); // one loop at a time
      const buffer = buffers.get(moment);
      if (muted || !ctx || ctx.state !== "running" || !buffer || !ctx.createGain) {
        env.onLoop?.(moment, true, false);
        return;
      }
      try {
        const fadeIn = Math.max(0, Number.isFinite(options.fadeInSeconds) ? options.fadeInSeconds! : 0);
        const delay = Math.max(0, Number.isFinite(options.delaySeconds) ? options.delaySeconds! : 0);
        // After the one-shot it follows, overlapping its last fadeIn seconds: the crossfade.
        const begin = ctx.currentTime + delay + (options.after ? Math.max(0, duration(options.after) - fadeIn) : 0);
        const gain = ctx.createGain();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        if (options.loopStart !== undefined) source.loopStart = options.loopStart;
        if (options.loopEnd !== undefined) source.loopEnd = options.loopEnd;
        gain.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, begin);
        if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, begin + fadeIn);
        source.connect(gain as never);
        gain.connect(ctx.destination as never);
        source.start(begin, options.loopStart ?? 0);
        loop = { moment, source, gain };
        env.onLoop?.(moment, true, true);
      } catch {
        loop = null;
        env.onLoop?.(moment, true, false);
      }
    },

    stopLoop(moment, options = {}) {
      if (loop?.moment !== moment) return;
      const fadeOut = options.fadeOutSeconds;
      endLoop(fadeOut !== undefined && Number.isFinite(fadeOut) && fadeOut > 0 ? fadeOut : 0);
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
    looping() {
      return loop ? [loop.moment] : [];
    },
  };
}
