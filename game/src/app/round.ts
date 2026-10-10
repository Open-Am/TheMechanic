// The running game (ADR 0010): picks a fault, runs the timer, passes proposals to the reducer, keeps the action log, emits events.
// render and ui only propose and listen. Condition text reaches them only through conditionOf.

import { apply, conditionText, initialState, scoreState } from "../core/index.ts";
import type { Action, ActionType, Fault, FaultFile, FaultId, Machine, PartId, Refusal, RoundState, ScoreBreakdown, Symptom } from "../core/index.ts";
import type { Audio, Clock } from "../platform/interfaces/index.ts";
import { Emitter } from "./emitter.ts";
import { pickFault } from "./faults.ts";

export interface PartEvent {
  partId: PartId;
  t: number;
}

export interface GameEvents {
  started: { t: number };
  removed: PartEvent;
  installed: PartEvent;
  inspected: PartEvent;
  fixed: PartEvent;
  pulled: { t: number; started: boolean; failedPulls: number };
  refused: Refusal;
  ended: { t: number; score: ScoreBreakdown; log: readonly Action[] };
}

export interface Briefing {
  complaint: string;
  symptom: Symptom;
}

export interface Proposal {
  type: ActionType;
  partId?: PartId;
}

export interface GameDeps {
  machine: Machine;
  faults: FaultFile;
  clock: Clock;
  audio: Audio;
  /** Returns [0, 1). Injected so tests are repeatable. */
  random: () => number;
}

export interface Game {
  readonly events: Emitter<GameEvents>;
  readonly machine: Machine;
  /** Picks the next fault and resets the round. The timer does not run until begin(). */
  newRound(): Briefing;
  /** Starts the timer. */
  begin(): void;
  /** Proposes an action at the current time. Returns true if the reducer accepted it. */
  propose(p: Proposal): boolean;
  /** The one path to a part's condition text (ADR 0010). */
  conditionOf(partId: PartId): string | null;
  /** The fix label if this part is the unfixed culprit and is in the tray, otherwise null. */
  fixLabel(partId: PartId): string | null;
  /** Milliseconds since begin(), or 0 before it. Stops at the end of the round. */
  elapsed(): number;
  readonly state: RoundState;
  readonly log: readonly Action[];
  readonly running: boolean;
  /** For diagnostic mode only. */
  readonly faultId: FaultId | null;
  readonly culprit: PartId | null;
}

export function createGame(deps: GameDeps): Game {
  const { machine, faults, clock, audio, random } = deps;
  const events = new Emitter<GameEvents>();
  let fault: Fault | null = null;
  let state: RoundState = initialState(machine);
  let log: Action[] = [];
  let startedAt: number | null = null;

  function now(): number {
    if (startedAt === null) return 0;
    if (state.endedAt !== null) return state.endedAt;
    // Never earlier than the last action, so a clock that steps back cannot make the reducer refuse.
    return Math.max(state.t, Math.round(clock.now() - startedAt));
  }

  return {
    events,
    machine,

    newRound() {
      fault = pickFault(faults.faults, fault?.id ?? null, random);
      state = initialState(machine);
      log = [];
      startedAt = null;
      return { complaint: fault.complaint, symptom: fault.symptom };
    },

    begin() {
      if (!fault || startedAt !== null) return;
      startedAt = clock.now();
      events.emit("started", { t: 0 });
    },

    propose(p) {
      if (!fault || startedAt === null) return false;
      const action: Action = p.partId === undefined ? { t: now(), type: p.type } : { t: now(), type: p.type, partId: p.partId };
      const r = apply(machine, fault, state, action);
      if (!r.ok) {
        events.emit("refused", r.refusal);
        return false;
      }
      state = r.state;
      log.push(action);
      const partId = action.partId ?? "";
      switch (action.type) {
        case "remove":
          audio.play("remove");
          events.emit("removed", { partId, t: action.t });
          break;
        case "install":
          events.emit("installed", { partId, t: action.t });
          break;
        case "inspect":
          events.emit("inspected", { partId, t: action.t });
          break;
        case "fix":
          events.emit("fixed", { partId, t: action.t });
          break;
        case "pull": {
          const started = state.endedAt !== null;
          audio.play(started ? "start" : "fail");
          events.emit("pulled", { t: action.t, started, failedPulls: state.failedPulls });
          if (started) events.emit("ended", { t: action.t, score: scoreState(machine, fault, state, action.t), log: [...log] });
          break;
        }
      }
      return true;
    },

    conditionOf(partId) {
      return fault ? conditionText(machine, fault, state, partId) : null;
    },

    fixLabel(partId) {
      if (!fault || state.fixed || partId !== fault.culprit || !state.tray.includes(partId)) return null;
      return fault.fix;
    },

    elapsed: now,

    get state() {
      return state;
    },
    get log() {
      return log;
    },
    get running() {
      return startedAt !== null && state.endedAt === null;
    },
    get faultId() {
      return fault?.id ?? null;
    },
    get culprit() {
      return fault?.culprit ?? null;
    },
  };
}
