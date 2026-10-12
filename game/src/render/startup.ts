// Pulling the cord and the engine starting, running, stopping or coughing (ADR 0027, plan 0018 step 2). Pure timing:
// every function here is a function of its inputs and a time in seconds, so the same pull always plays the same way
// (ADR 0007) and the tests can check it frame by frame. The view (plan 0018 step 3) turns these into transforms.
//
// Frames: the starter's pull runs along the machine's +X (the recoil starter's face looks along +X; see the model's
// recoil_starter.rope node, which runs along +X from the housing's outlet to the handle), "up" is the machine's +Y.

import type { Vec3 } from "../core/index.ts";
import { clamp01, ease } from "./tween.ts";

const DEG = Math.PI / 180;

/** Tuning, in seconds, metres and radians. ADR 0027's figures are noted beside the ones it sets. */
export const STARTUP = {
  // The turn on the bench (ADR 0025): only if the starter is more than faceTolerance off facing the camera; then by the
  // shortest way to turnSettle off facing, so the machine keeps a little of its three-quarter look.
  faceTolerance: 40 * DEG,
  turnSettle: 25 * DEG,
  turnMinSeconds: 0.25,
  turnSecondsPerRadian: 0.3,
  turnMaxSeconds: 0.8,
  // The pull: about 1 second (ADR 0027). The hand reaches the handle and grips it, pulls it sharply out, lets go, and
  // the rope recoils into the housing.
  reach: 0.22,
  grip: 0.1,
  pull: 0.3,
  release: 0.06,
  recoil: 0.3,
  /** How far the handle comes out along the starter's axis (about 40 cm, ADR 0027), and how far it rises on the way. */
  pullDistance: 0.4,
  pullLift: 0.05,
  /** The rope's length at rest, from the housing's outlet to the handle: STARTER_GRIP - STARTER_OUTLET in model.py. */
  ropeRest: 0.0195,
  // The run, from the catch (ADR 0027: about 4 to 5 seconds from the catch to the customer leaving).
  /** The catch: the shake jumps to catchKick times the running shake and settles over rampIn. */
  rampIn: 0.35,
  catchKick: 2.2,
  /** The exhaust haze builds up over hazeIn. */
  hazeIn: 0.6,
  /** The customer starts paying payDelay after the catch and the hand has the notes payHold later (ADR 0026). */
  payDelay: 0.4,
  payHold: 1.5,
  /** The hand moves from the notes to the red switch and presses it; the rocker flips by switchAngle about X. */
  switchReach: 0.45,
  press: 0.15,
  switchAngle: -16 * DEG,
  /** The engine winds down after the press: the shake, the haze and the `start` sound fade out (about 0.8 s). */
  windDown: 0.8,
  /** The customer lifts the stopped generator and walks off (their clip, plan 0017; step 3 fits it to this). */
  carryOff: 1.2,
  // The running shake (plan 0018 reading 4): a small random walk of offset and roll at about 25 Hz, 1.5 mm.
  shakeHz: 25,
  shakeAmplitude: 0.0015,
  /** Up and down on the rubber feet, as a share of the sideways shake. */
  shakeUpShare: 0.4,
  /** Roll, radians: 1.5 mm at the top of a 35 cm machine. */
  rollAmplitude: 0.0043,
  /** How much of its last value the walk keeps each step (0 forgets at once, 1 never moves). */
  walkKeep: 0.55,
  // The cough (ADR 0027: about 1.5 s): the engine turns over, coughs with a dark puff, shudders and stops.
  coughSeconds: 1.5,
  coughAt: [0.45, 0.9] as readonly number[],
  /** Shake while turning over, and the peak of each cough, as shares of the running shake. */
  turnOverShare: 0.5,
  coughShare: 1.4,
  coughDecay: 0.12,
} as const;

/** The yaw at which the recoil starter faces the camera: the machine's +X turned to the world's +Z. */
export const STARTER_FACE_YAW = -Math.PI / 2;

/** An angle brought into (-pi, pi]. */
function wrap(a: number): number {
  const t = 2 * Math.PI;
  const r = (((a + Math.PI) % t) + t) % t;
  return r === 0 ? Math.PI : r - Math.PI;
}

export interface Turn {
  from: number;
  to: number;
  seconds: number;
}

/**
 * The machine's turn on the bench before the pull, from its yaw now. None (to = from, 0 s) when the starter already
 * faces the camera within STARTUP.faceTolerance; otherwise the shortest way round to STARTUP.turnSettle off facing.
 * `faceYaw` is the yaw at which the starter faces the camera exactly.
 */
export function starterTurn(yaw: number, faceYaw: number = STARTER_FACE_YAW): Turn {
  const off = wrap(yaw - faceYaw);
  if (Math.abs(off) <= STARTUP.faceTolerance) return { from: yaw, to: yaw, seconds: 0 };
  const target = faceYaw + Math.sign(off) * STARTUP.turnSettle;
  const delta = wrap(target - yaw);
  const seconds = Math.min(STARTUP.turnMaxSeconds, STARTUP.turnMinSeconds + Math.abs(delta) * STARTUP.turnSecondsPerRadian);
  return { from: yaw, to: yaw + delta, seconds };
}

/** The machine's yaw during the turn, `t` seconds from its start. */
export function turnYaw(turn: Turn, t: number): number {
  if (turn.seconds <= 0) return turn.to;
  return turn.from + (turn.to - turn.from) * ease.inOutCubic(clamp01(t / turn.seconds));
}

/** When each step of the pull happens, seconds from the start of the whole start-up. */
export interface PullTimes {
  /** The turn ends and the hand sets off for the handle. */
  reach: number;
  /** The hand is on the handle and closes on it. */
  grip: number;
  /** The handle starts out: the `cord` moment. */
  pull: number;
  /** The handle is fully out; the hand lets go: the engine catches or starts turning over. */
  release: number;
  /** The rope starts running back in. */
  recoil: number;
  /** The handle is home in its housing. */
  home: number;
}

export function pullTimes(turnSeconds: number): PullTimes {
  const reach = Math.max(0, turnSeconds);
  const grip = reach + STARTUP.reach;
  const pull = grip + STARTUP.grip;
  const release = pull + STARTUP.pull;
  const recoil = release + STARTUP.release;
  return { reach, grip, pull, release, recoil, home: recoil + STARTUP.recoil };
}

/** How far out the handle is along the pull, 0 to STARTUP.pullDistance, at `t`. */
export function pullOut(p: PullTimes, t: number): number {
  const D = STARTUP.pullDistance;
  if (t <= p.pull || t >= p.home) return 0;
  if (t < p.release) {
    // Sharp: fast at the start, slowing as the rope runs out.
    const u = (t - p.pull) / (p.release - p.pull);
    return D * (1 - (1 - u) ** 2);
  }
  if (t < p.recoil) return D;
  // The spring takes it back fast, and it settles into the housing.
  const v = (t - p.recoil) / (p.home - p.recoil);
  return D * (1 - ease.outCubic(v));
}

/** The handle's offset from its rest place, in the starter's frame: out along +X with a slight rise in +Y. */
export function handleOffset(p: PullTimes, t: number): Vec3 {
  const d = pullOut(p, t);
  const s = d / STARTUP.pullDistance;
  return [d, STARTUP.pullLift * s * s, 0];
}

/** The rope's length from the housing's outlet to the handle at `t`: its rest length or more, never less. */
export function ropeLength(p: PullTimes, t: number, rest: number = STARTUP.ropeRest): number {
  const [x, y] = handleOffset(p, t);
  return Math.hypot(rest + x, y);
}

/** When each step of the run happens after a pull that starts the engine, seconds from the start of the start-up. */
export interface RunTimes {
  /** The engine catches: the `start` moment, the first puff, the kick. */
  catch: number;
  /** The kick has settled into the running shake. */
  running: number;
  /** The customer holds out the notes (ADR 0026), and the hand has them. */
  payStart: number;
  payEnd: number;
  /** The hand reaches the red switch and presses it; the rocker has flipped and the engine starts winding down. */
  press: number;
  pressed: number;
  /** The engine has stopped: no shake, no haze, no sound. */
  stopped: number;
  /** The customer has carried the stopped generator off; the result follows. */
  gone: number;
}

export function runTimes(catchAt: number): RunTimes {
  const payStart = catchAt + STARTUP.payDelay;
  const payEnd = payStart + STARTUP.payHold;
  const press = payEnd + STARTUP.switchReach;
  const pressed = press + STARTUP.press;
  const stopped = pressed + STARTUP.windDown;
  return { catch: catchAt, running: catchAt + STARTUP.rampIn, payStart, payEnd, press, pressed, stopped, gone: stopped + STARTUP.carryOff };
}

/** The shake's size as a share of the running shake: 0 before the catch, a kick, 1 while running, 0 once stopped. */
export function runShake(r: RunTimes, t: number): number {
  if (t <= r.catch || t >= r.stopped) return 0;
  if (t < r.running) {
    const u = (t - r.catch) / (r.running - r.catch);
    const peak = 0.3;
    return u < peak ? (u / peak) * STARTUP.catchKick : STARTUP.catchKick + (1 - STARTUP.catchKick) * ease.inOutCubic((u - peak) / (1 - peak));
  }
  if (t < r.pressed) return 1;
  return windDownFade(r, t);
}

/** 1 until the switch is pressed, then down to 0 over the wind-down: the shake, the haze and the `start` sound. */
export function windDownFade(r: RunTimes, t: number): number {
  if (t <= r.pressed) return 1;
  if (t >= r.stopped) return 0;
  const v = (t - r.pressed) / (r.stopped - r.pressed);
  return (1 - v) ** 2;
}

/** The exhaust haze, 0 to 1: builds after the catch, fades in the wind-down. */
export function hazeLevel(r: RunTimes, t: number): number {
  if (t <= r.catch || t >= r.stopped) return 0;
  return clamp01((t - r.catch) / STARTUP.hazeIn) * windDownFade(r, t);
}

/** The red rocker's angle about its hinge's X: 0 (on) until the press, STARTUP.switchAngle (off) after it. */
export function switchAngle(r: RunTimes, t: number): number {
  if (t <= r.press) return 0;
  return STARTUP.switchAngle * ease.outCubic(clamp01((t - r.press) / (r.pressed - r.press)));
}

/** The cough after a pull that does not start the engine: from `start` (the `fail` moment) to `end`. */
export interface CoughTimes {
  start: number;
  /** A dark puff from the outlet at each. */
  coughs: number[];
  end: number;
}

export function coughTimes(start: number): CoughTimes {
  return { start, coughs: STARTUP.coughAt.map((c) => start + c), end: start + STARTUP.coughSeconds };
}

/** The shake's size during the cough, as a share of the running shake: turning over, a jolt at each cough, then still. */
export function coughShake(c: CoughTimes, t: number): number {
  if (t <= c.start || t >= c.end) return 0;
  const left = c.end - t;
  const turning = STARTUP.turnOverShare * clamp01((t - c.start) / 0.1);
  let jolts = 0;
  for (const at of c.coughs) if (t >= at) jolts += STARTUP.coughShare * Math.exp(-(t - at) / STARTUP.coughDecay);
  return Math.min(turning + jolts, STARTUP.coughShare + STARTUP.turnOverShare) * clamp01(left / 0.25);
}

/** A number from -1 to 1 for each seed, step and channel: a small integer hash, no state. */
function noise(seed: number, step: number, channel: number): number {
  let h = (seed ^ Math.imul(step, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const WALK_STEPS = 16;

/** The walk's value at a step: each step keeps STARTUP.walkKeep of the last and adds the rest of a new random number. */
function walk(seed: number, step: number, channel: number): number {
  const k = STARTUP.walkKeep;
  let v = 0;
  let w = 1 - k;
  // Older steps weigh k^j less; past WALK_STEPS they no longer show (0.55^16 is under 1/10,000).
  for (let j = 0; j < WALK_STEPS; j++) {
    v += w * noise(seed, step - j, channel);
    w *= k;
  }
  return v;
}

export interface Shake {
  /** Metres, in the machine's frame. */
  offset: Vec3;
  /** Radians about the machine's front-to-back axis. */
  roll: number;
}

/**
 * The machine's shake at `t` seconds for a shake size `share` (from runShake or coughShake): a random walk stepped at
 * STARTUP.shakeHz and blended between steps, at most STARTUP.shakeAmplitude times `share` on each axis. The same seed
 * and time always give the same shake; a share of 0 gives none.
 */
export function shakeAt(seed: number, t: number, share: number): Shake {
  if (share <= 0) return { offset: [0, 0, 0], roll: 0 };
  const k = t * STARTUP.shakeHz;
  const i = Math.floor(k);
  const f = k - i;
  const at = (channel: number) => walk(seed, i, channel) * (1 - f) + walk(seed, i + 1, channel) * f;
  const a = STARTUP.shakeAmplitude * share;
  return { offset: [at(0) * a, at(1) * a * STARTUP.shakeUpShare, at(2) * a], roll: at(3) * STARTUP.rollAmplitude * share };
}

/** The whole start-up after Pull cord, all times in seconds from the press. */
export interface StartupPlan {
  turn: Turn;
  /** Null when the recoil starter is off the machine: the hand pulls nothing (ADR 0027). */
  pull: PullTimes | null;
  /** When the engine starts (the fault is fixed). */
  run: RunTimes | null;
  /** When it does not. */
  cough: CoughTimes | null;
  /** When the sounds and moments of ADR 0018 land. */
  moments: { cord: number | null; start: number | null; fail: number | null };
  /** When the start-up is over: the customer gone after a run, the engine still after a cough. */
  end: number;
}

/**
 * Plans the start-up. `fixed` is whether the pull starts the engine; `starterOn` whether the recoil starter is on the
 * machine; `yaw` the machine's yaw on the bench now. Without the starter there is no turn and no pull, only the cough.
 */
export function startupPlan(opts: { yaw: number; fixed: boolean; starterOn: boolean; faceYaw?: number }): StartupPlan {
  const turn = opts.starterOn ? starterTurn(opts.yaw, opts.faceYaw) : { from: opts.yaw, to: opts.yaw, seconds: 0 };
  const pull = opts.starterOn ? pullTimes(turn.seconds) : null;
  const after = pull ? pull.release : 0;
  // Without a starter nothing can start the engine.
  const fixed = opts.fixed && opts.starterOn;
  const run = fixed ? runTimes(after) : null;
  const cough = fixed ? null : coughTimes(after);
  return {
    turn,
    pull,
    run,
    cough,
    moments: { cord: pull ? pull.pull : null, start: run ? run.catch : null, fail: cough ? cough.start : null },
    end: Math.max(run ? run.gone : cough!.end, pull ? pull.home : 0),
  };
}

/** The shake size at `t` for a plan: the run's or the cough's. */
export function planShake(plan: StartupPlan, t: number): number {
  if (plan.run) return runShake(plan.run, t);
  if (plan.cough) return coughShake(plan.cough, t);
  return 0;
}
