// Tweens and easing, written in the project (ADR 0002, ADR 0008). Pure: time comes in through update(dt).

export type Ease = (x: number) => number;

export const ease = {
  linear: (x: number) => x,
  outCubic: (x: number) => 1 - (1 - x) ** 3,
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
} satisfies Record<string, Ease>;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export interface TweenSpec {
  /** Seconds. Zero or less finishes on the next update. */
  duration: number;
  /** Called with eased progress from 0 to 1. */
  update: (p: number) => void;
  ease?: Ease;
  done?: () => void;
}

interface Running extends TweenSpec {
  elapsed: number;
}

/**
 * Runs tweens on named channels. Starting a tween on a busy channel finishes the old one first,
 * so a part that is removed and put back quickly never has two animations fighting.
 */
export class Tweens {
  private channels = new Map<string, Running[]>();

  /** Runs specs one after another on a channel. */
  play(channel: string, ...specs: TweenSpec[]): void {
    this.finish(channel);
    if (specs.length) this.channels.set(channel, specs.map((s) => ({ ...s, elapsed: 0 })));
  }

  /** Jumps every tween on the channel to its end, in order, calling update(1) and done. */
  finish(channel: string): void {
    const queue = this.channels.get(channel);
    if (!queue) return;
    this.channels.delete(channel);
    for (const t of queue) {
      t.update(1);
      t.done?.();
    }
  }

  /** Drops a channel without finishing it. */
  cancel(channel: string): void {
    this.channels.delete(channel);
  }

  busy(channel: string): boolean {
    return this.channels.has(channel);
  }

  get size(): number {
    return this.channels.size;
  }

  /** Advances every channel by dt seconds. Leftover time carries into the next tween in the queue. */
  update(dt: number): void {
    for (const [channel, queue] of [...this.channels]) {
      let left = dt;
      while (queue.length && left >= 0) {
        const t = queue[0]!;
        t.elapsed += left;
        const raw = t.duration <= 0 ? 1 : clamp01(t.elapsed / t.duration);
        t.update((t.ease ?? ease.linear)(raw));
        if (raw < 1) break;
        left = t.duration <= 0 ? left : t.elapsed - t.duration;
        queue.shift();
        if (!queue.length) this.channels.delete(channel);
        t.done?.();
        // done() may have started or finished something on this channel; this queue is then no longer ours.
        if (!queue.length || this.channels.get(channel) !== queue) break;
        queue[0]!.elapsed = 0;
      }
    }
  }
}
