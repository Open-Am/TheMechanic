// The local daily (ADR 0005): today's day number and fault from the clock. The day and fault functions come from core,
// injected by main.ts, so platform imports no core functions (ADR 0010). A server can replace this later (ADR 0002).

import type { FaultId } from "../../core/types.ts";
import type { Clock, DailyProvider } from "../interfaces/index.ts";

export function createDailyProvider(clock: Clock, dayOf: (now: Date) => number, faultOf: (day: number) => FaultId): DailyProvider {
  return {
    async today() {
      const day = dayOf(clock.today());
      return { day, faultId: faultOf(day) };
    },
  };
}
