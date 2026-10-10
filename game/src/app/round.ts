// The running game (ADR 0010): picks a fault, runs the timer, passes proposals to the reducer, keeps the action log, emits events.
// render and ui only propose and listen. Condition text reaches them only through conditionOf.

import { apply, conditionText, hasWalked, initialState, moodFor, patienceAt, scoreState, walkOutTime } from "../core/index.ts";
import type { Action, ActionType, Customer, CustomerFile, CustomerMoment, Fault, FaultFile, FaultId, Machine, PartId, Refusal, RoundState, ScoreBreakdown, Symptom } from "../core/index.ts";
import type { Audio, Clock } from "../platform/interfaces/index.ts";
import { Emitter } from "./emitter.ts";
import { pickCustomer, pickFault } from "./faults.ts";

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
  ended: { t: number; score: ScoreBreakdown; log: readonly Action[]; line: string | null };
  /** The customer's patience crossed a threshold (ADR 0015). Never sent for a part removal. */
  patience: { t: number; share: number; mood: "waiting" | "annoyed"; line: string };
  /** The customer ran out of patience and took the generator away. The round is over. */
  left: { t: number; score: ScoreBreakdown; log: readonly Action[]; line: string };
}

export interface Briefing {
  complaint: string;
  symptom: Symptom;
  /** The round's customer, or null when the game has no customers. */
  customer: { name: string; line: string } | null;
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
  /** Customers (ADR 0015). Without them there is no patience, as before. */
  customers?: CustomerFile;
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
  /** Checks the clock against the customer's patience: emits patience and left. Call once a frame. */
  tick(): void;
  /** Share of the customer's patience left, from 1 to 0 (1 with no customer). */
  patience(): number;
  readonly customerName: string | null;
  /** For diagnostic mode: the round time the customer leaves at, or null. */
  readonly walkOutAt: number | null;
  readonly outcome: "fixed" | "walked" | null;
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
  let customer: Customer | null = null;
  let walkedAt: number | null = null;
  let mood: CustomerMoment = "arrive";

  function now(): number {
    if (startedAt === null) return 0;
    if (state.endedAt !== null) return state.endedAt;
    if (walkedAt !== null) return walkedAt;
    // Never earlier than the last action, so a clock that steps back cannot make the reducer refuse.
    return Math.max(state.t, Math.round(clock.now() - startedAt));
  }

  function line(moment: CustomerMoment): string {
    const lines = customer?.lines[moment] ?? [];
    return lines[Math.min(lines.length - 1, Math.floor(random() * lines.length))] ?? "";
  }

  /** Walk-out and mood changes, from the clock. Returns true if the customer has left. */
  function check(): boolean {
    if (!fault || !customer || startedAt === null || state.endedAt !== null) return walkedAt !== null;
    if (walkedAt !== null) return true;
    const t = Math.max(state.t, Math.round(clock.now() - startedAt));
    if (hasWalked(state, customer, t)) {
      walkedAt = walkOutTime(state, customer);
      audio.play("fail");
      events.emit("left", { t: walkedAt, score: scoreState(machine, fault, state, walkedAt, customer), log: [...log], line: line("leaving") });
      return true;
    }
    const share = patienceAt(state, customer, t);
    const next = moodFor(share);
    if (next !== mood && next !== "arrive") {
      mood = next;
      events.emit("patience", { t, share, mood: next, line: line(next) });
    }
    return false;
  }

  return {
    events,
    machine,

    newRound() {
      fault = pickFault(faults.faults, fault?.id ?? null, random);
      customer = deps.customers ? pickCustomer(deps.customers.customers, customer?.id ?? null, random) : null;
      state = initialState(machine);
      log = [];
      startedAt = null;
      walkedAt = null;
      mood = "arrive";
      return { complaint: fault.complaint, symptom: fault.symptom, customer: customer ? { name: customer.name, line: line("arrive") } : null };
    },

    begin() {
      if (!fault || startedAt !== null) return;
      startedAt = clock.now();
      events.emit("started", { t: 0 });
    },

    propose(p) {
      if (!fault || startedAt === null) return false;
      if (check()) return false; // the customer has gone; nothing more can happen this round
      const action: Action = p.partId === undefined ? { t: now(), type: p.type } : { t: now(), type: p.type, partId: p.partId };
      const r = apply(machine, fault, state, action, customer ?? undefined);
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
          if (started) {
            events.emit("ended", { t: action.t, score: scoreState(machine, fault, state, action.t, customer ?? undefined), log: [...log], line: customer ? line("pleased") : null });
          } else {
            check(); // a failed pull costs patience: it may change the mood, or empty the meter at once
          }
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

    tick() {
      check();
    },

    patience() {
      if (!customer || startedAt === null) return 1;
      if (walkedAt !== null) return 0;
      return patienceAt(state, customer, now());
    },

    get state() {
      return state;
    },
    get log() {
      return log;
    },
    get running() {
      return startedAt !== null && state.endedAt === null && walkedAt === null;
    },
    get customerName() {
      return customer?.name ?? null;
    },
    get walkOutAt() {
      return customer && fault ? walkOutTime(state, customer) : null;
    },
    get outcome() {
      return state.endedAt !== null ? "fixed" : walkedAt !== null ? "walked" : null;
    },
    get faultId() {
      return fault?.id ?? null;
    },
    get culprit() {
      return fault?.culprit ?? null;
    },
  };
}
