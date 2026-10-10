// Clock backed by the browser's monotonic timer.

import type { Clock } from "../interfaces/index.ts";

export function createClock(now: () => number = () => performance.now(), today: () => Date = () => new Date()): Clock {
  return { now, today };
}
