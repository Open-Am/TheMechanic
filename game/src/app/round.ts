// The running game (ADR 0010): picks a fault (free play) or plays the day's (ADR 0005), runs the timer, passes proposals
// to the reducer, keeps the action log, emits events and saves results (ADR 0022, ADR 0024).
// render and ui only propose and listen. Condition text reaches them only through conditionOf.

import { apply, conditionText, hasWalked, initialState, moodFor, patienceAt, scoreState, walkOutTime } from "../core/index.ts";
import type { Action, ActionType, Customer, CustomerFile, CustomerMoment, Fault, FaultFile, FaultId, Machine, PartId, Refusal, RoundState, ScoreBreakdown, Symptom } from "../core/index.ts";
import type { Clock, ScoreStore, StoredResult } from "../platform/interfaces/index.ts";
import { dailyCustomer, recordResult, recordUnfinished } from "./daily.ts";
import { Emitter } from "./emitter.ts";
import { CORD_SECONDS, type CuePlayer, playCue, playMoment } from "./moments.ts";
import { pickCustomer, pickFault } from "./faults.ts";

export interface PartEvent {
  partId: PartId;
  t: number;
}

export interface GameEvents {
  /**
   * Start was pressed (plan 0017, ADR 0026): the customer is bringing the generator. The clock does not run yet; render
   * plays the arrival and main.ts calls begin() when the generator lands (at once without a figure).
   */
  arriving: Record<string, never>;
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
  /** Today's fault (ADR 0005): its day and whether this attempt is scored. Null in free play. */
  daily: { day: number; scored: boolean } | null;
}

/** Which round to play. Omitted for free play. A daily's day is fixed here, when the round is chosen. */
export interface RoundChoice {
  day: number;
  faultId: FaultId;
  /** False for practice: today's attempt is already used (ADR 0005, ADR 0024). Practice is never recorded. */
  scored: boolean;
}

/** What was saved when a round ended, for the result screen. */
export interface RoundRecord {
  mode: "free" | "daily" | "practice";
  day: number | null;
  /** The lowest fixed total for this fault after this round, or null if there is none or nothing is stored. */
  best: number | null;
  /** This round set the best. */
  newBest: boolean;
}

export interface Proposal {
  type: ActionType;
  partId?: PartId;
}

export interface GameDeps {
  machine: Machine;
  faults: FaultFile;
  clock: Clock;
  /** Sound and vibration for the moments that come from accepted actions (ADR 0018), and the engine running (ADR 0028). */
  audio: CuePlayer;
  /** Returns [0, 1). Injected so tests are repeatable. */
  random: () => number;
  /** Customers (ADR 0015). Without them there is no patience, as before. */
  customers?: CustomerFile;
  /** Where results are saved (ADR 0005, ADR 0022). Without it nothing is saved. */
  scores?: ScoreStore;
}

export interface Game {
  readonly events: Emitter<GameEvents>;
  readonly machine: Machine;
  /** Resets the round: free play picks a fault at random; a daily choice plays its fault with the day's customer. */
  newRound(choice?: RoundChoice): Briefing;
  /**
   * What the last round saved. Settles once the round has ended and its result is stored; null before any round has
   * ended. Never rejects.
   */
  readonly recorded: Promise<RoundRecord> | null;
  /** Start pressed: sends "arriving" once per round. The clock starts only with begin() (plan 0017 reading 1). */
  arrive(): void;
  /** True between arrive() and begin(): the customer is bringing the generator. */
  readonly arriving: boolean;
  /** Starts the timer: the generator has landed on the bench. */
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
  /** The round's customer's look (ADR 0015), the file render shows; null without customers. */
  readonly customerLook: string | null;
  /**
   * The next round's customer's look, chosen when this round starts (ADR 0023), so render can download it during the
   * round. The next free-play round plays that customer; a daily plays the day's customer instead. Null before the first
   * round starts and without customers.
   */
  readonly nextCustomerLook: string | null;
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
  /** The next free-play round's customer, chosen when a round starts (ADR 0023). */
  let nextCustomer: Customer | null = null;
  let walkedAt: number | null = null;
  let mood: CustomerMoment = "arrive";
  let choice: RoundChoice | null = null;
  let recorded: Promise<RoundRecord> | null = null;
  let arriving = false;

  function mode(): RoundRecord["mode"] {
    return choice === null ? "free" : choice.scored ? "daily" : "practice";
  }

  /** The round as saved (ADR 0022). `score` is the end score, or the start score for an unfinished daily. */
  function stored(score: ScoreBreakdown, unfinished: boolean): StoredResult {
    const result: StoredResult = { faultId: fault!.id, day: choice?.day ?? null, log: [...log], score, playedAt: clock.today().toISOString() };
    if (unfinished) result.unfinished = true;
    return result;
  }

  /** Saves the ended round: free play and a scored daily, never practice (ADR 0005). */
  function finish(score: ScoreBreakdown): void {
    recorded = recordResult(deps.scores, stored(score, false), mode());
  }

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
      // Silent: ADR 0018 has no walk-out moment (plan 0013 reading 4).
      const score = scoreState(machine, fault, state, walkedAt, customer);
      finish(score);
      events.emit("left", { t: walkedAt, score, log: [...log], line: line("leaving") });
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

    newRound(c) {
      playCue(audio, "run-cut"); // an engine still running from the last round stops at once (ADR 0028)
      if (c) {
        const daily = faults.faults.find((f) => f.id === c.faultId);
        if (!daily) throw new Error(`newRound: no fault ${c.faultId}`);
        fault = daily;
        customer = deps.customers ? dailyCustomer(deps.customers.customers, c.day) : null;
      } else {
        fault = pickFault(faults.faults, fault?.id ?? null, random);
        customer = deps.customers ? (nextCustomer ?? pickCustomer(deps.customers.customers, customer?.id ?? null, random)) : null;
      }
      choice = c ? { ...c } : null;
      nextCustomer = null;
      recorded = null;
      state = initialState(machine);
      log = [];
      startedAt = null;
      arriving = false;
      walkedAt = null;
      mood = "arrive";
      return {
        complaint: fault.complaint,
        symptom: fault.symptom,
        customer: customer ? { name: customer.name, line: line("arrive") } : null,
        daily: choice ? { day: choice.day, scored: choice.scored } : null,
      };
    },

    arrive() {
      if (!fault || startedAt !== null || arriving) return;
      arriving = true;
      events.emit("arriving", {});
    },

    begin() {
      if (!fault || startedAt !== null) return;
      arriving = false;
      startedAt = clock.now();
      // The next free-play round's customer is chosen now, so its file can download during this round (ADR 0023).
      nextCustomer = deps.customers ? pickCustomer(deps.customers.customers, customer?.id ?? null, random) : null;
      // The day's scored attempt is used up now, saved unfinished until the round ends (ADR 0024).
      if (choice?.scored) recordUnfinished(deps.scores, stored(scoreState(machine, fault, state, 0, customer ?? undefined), true));
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
          playMoment(audio, "land");
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
          // "pulled" first: render presses loose parts home, and a part still going back seats (and plays `seat`)
          // before the cord. Then the cord at once, the engine's answer once the cord has run (plan 0013 reading 3).
          events.emit("pulled", { t: action.t, started, failedPulls: state.failedPulls });
          playMoment(audio, "cord");
          playMoment(audio, started ? "start" : "fail", CORD_SECONDS);
          // ADR 0028: the engine runs on after the catch until render's ending stops it (run-stop, or run-cut on a skip).
          if (started) playCue(audio, "run-start", CORD_SECONDS);
          if (started) {
            const score = scoreState(machine, fault, state, action.t, customer ?? undefined);
            finish(score);
            events.emit("ended", { t: action.t, score, log: [...log], line: customer ? line("pleased") : null });
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
    get arriving() {
      return arriving;
    },
    get recorded() {
      return recorded;
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
    get customerLook() {
      return customer?.look ?? null;
    },
    get nextCustomerLook() {
      return nextCustomer?.look ?? null;
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
