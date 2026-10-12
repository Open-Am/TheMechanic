// The customer's place and which clip plays when (plan 0015 steps 7 and 8, ADRs 0007, 0015 and 0025). Pure: no Three.js,
// so it is unit tested. render/customer.ts plays what this decides.
//
// ADR 0025: the customer stands about 0.35 m behind the bench's far edge, facing the mechanic, fixed in the scene. The
// camera does not orbit and the generator turns on the bench, so the spot never moves.
// ADR 0007: the customer reacts only to the clock and the cord. Nothing done to a part moves them, and every fault plays
// the same clips.

import type { Vec3 } from "../core/index.ts";
import { BENCH, CUSTOMER_SPOT, TOOLBOX_ON_BENCH } from "./stage.ts";

/** The clips render plays: plan 0015 reading 5's, and plan 0017's arrive, pay_leave and storm_off (ADR 0026). */
export const CUSTOMER_CLIPS = ["idle", "waiting", "annoyed", "annoyed_idle", "failed_pull", "pleased", "leaving", "arrive", "pay_leave", "storm_off"] as const;
export type CustomerClip = (typeof CUSTOMER_CLIPS)[number];

/** How the customer feels as the round goes, from the patience events (ADR 0015). */
export type CustomerMood = "calm" | "waiting" | "annoyed";

/** The game events render listens to, and those it must ignore (ADR 0007). */
export type CustomerEvent =
  | { type: "started" }
  | { type: "patience"; mood: "waiting" | "annoyed" }
  | { type: "pulled"; started: boolean }
  | { type: "ended" }
  | { type: "left" }
  | { type: "removed" | "installed" | "inspected" | "fixed" | "refused" };

/**
 * What to play: `clip`, then `then`: "loop" plays it round and round; a clip name plays that one looping after it;
 * "hold" stops on its last frame; "hide" hides the customer when it ends.
 */
export interface ClipPlan {
  clip: CustomerClip;
  then: "loop" | "hold" | "hide" | CustomerClip;
}

/** The loop the customer rests in for a mood. */
export function restingClip(mood: CustomerMood): CustomerClip {
  return mood === "annoyed" ? "annoyed_idle" : "idle";
}

/**
 * The round's two endings (ADR 0026, plan 0017): fixed, they pay and leave with the generator; patience run out, they
 * storm off with it. Both end with the customer and the generator gone.
 */
export const ENDINGS: Record<"fixed" | "walked", ClipPlan> = {
  fixed: { clip: "pay_leave", then: "hide" },
  walked: { clip: "storm_off", then: "hide" },
};

/** The three clips that carry the generator, and their moments in seconds (customer.py's CLIP_TIMES, STATUS.md). */
export type StoryClip = "arrive" | "pay_leave" | "storm_off";
export const STORY = {
  /** Walks in carrying the generator, sets it on the bench (lands), steps back. */
  arrive: { length: 3.1, lands: 2.5 },
  /**
   * Nods, takes the notes out (shown), holds them across the bench and lets go (taken), stands smiling (hold: plan
   * 0018's engine runs and is switched off here, ADR 0027), takes the generator (lifted) and walks off.
   */
  pay_leave: { length: 3.6, notesShown: 0.55, notesTaken: 1.45, hold: 1.7, lifted: 2.0 },
  /** Shakes the head, snatches the generator (lifted), storms off. Parts snap home in the first `snapBack` seconds. */
  storm_off: { length: 2.5, lifted: 0.85, snapBack: 0.3 },
} as const;

/** Seconds over which the generator eases between the hands and its place on the bench. */
export const SETTLE = 0.3;

/** Where the generator is at time t of a story clip: carried by the customer, or on the bench. */
export function generatorIn(clip: StoryClip, t: number): "carried" | "bench" {
  if (clip === "arrive") return t < STORY.arrive.lands ? "carried" : "bench";
  return t >= STORY[clip].lifted ? "carried" : "bench";
}

/** Whether the notes are in the customer's hand at time t (ADR 0026: only while paying). */
export function notesShown(clip: StoryClip, t: number): boolean {
  return clip === "pay_leave" && t >= STORY.pay_leave.notesShown && t < STORY.pay_leave.notesTaken;
}

/**
 * How far (0 to 1) the generator has eased from the customer's hands to the bench (arrive, just before it lands) or the
 * bench has been turned back to the landed turn before they reach for it (the endings): 0 not yet, 1 done.
 */
export function settleShare(clip: StoryClip, t: number): number {
  const at = clip === "arrive" ? STORY.arrive.lands : STORY[clip].lifted;
  const from = at - SETTLE;
  return Math.max(0, Math.min(1, (t - from) / SETTLE));
}

/** True once the story clip has run to its end: the customer is gone (endings) or standing at the bench (arrive). */
export function storyOver(clip: StoryClip, t: number): boolean {
  return t >= STORY[clip].length;
}

/** The turn (radians) of a carried generator whose handle runs from the right hand's grip to the left hand's. */
export function carriedYaw(right: Vec3, left: Vec3): number {
  // The machine's +X turned by yaw about +Y is (cos, 0, -sin).
  return Math.atan2(-(left[2] - right[2]), left[0] - right[0]);
}

/** Where the right hand holds the handle, in the machine's own axes (glTF: x right, y up, z towards its front). */
export const HANDLE_RIGHT: Vec3 = [-0.05, 0.386, -0.03];

/**
 * The clip a game event starts, given the mood before it, or null for an event that must not move the customer. Part
 * events (removed, installed, inspected, fixed, refused) always give null, for every part and every fault (ADR 0007).
 */
export function clipFor(event: CustomerEvent, mood: CustomerMood): ClipPlan | null {
  switch (event.type) {
    case "started":
      // Plan 0015: the round starts with the customer already at the bench, resting. (Plan 0017 adds the arrival.)
      return { clip: "idle", then: "loop" };
    case "patience":
      return event.mood === "waiting" ? { clip: "waiting", then: "idle" } : { clip: "annoyed", then: "annoyed_idle" };
    case "pulled":
      // A good pull ends the round: "ended" follows and plays the ending.
      return event.started ? null : { clip: "failed_pull", then: restingClip(mood) };
    case "ended":
      return ENDINGS.fixed;
    case "left":
      return ENDINGS.walked;
    default:
      return null;
  }
}

/** The mood after an event. */
export function moodAfter(event: CustomerEvent, mood: CustomerMood): CustomerMood {
  if (event.type === "started") return "calm";
  if (event.type === "patience") return event.mood;
  return mood;
}

/** Where the customer stands and which way they face: fixed in the scene (ADR 0025), facing the camera (+Z). */
export function customerPlace(): { position: Vec3; rotationY: number } {
  return { position: [CUSTOMER_SPOT.x, 0, CUSTOMER_SPOT.z], rotationY: CUSTOMER_SPOT.rotationY };
}

/**
 * How far (metres) the customer's front stands behind the farthest the generator can reach from the camera, at a turn
 * `yaw`: the generator turns on the bench about the pivot (x 0, z 0), its footprint `size` (x, y, z metres). The camera
 * looks along -Z from +Z, so a larger gap means the customer is always farther than the machine. `bodyDepth` is how
 * far in front of the spot the customer's body reaches.
 */
export function gapBehindMachine(size: Vec3, yaw: number, bodyDepth = 0.2): number {
  const hx = size[0] / 2;
  const hz = size[2] / 2;
  let far = Infinity;
  for (const [x, z] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]] as const) {
    // Three.js rotation about +Y: z' = -x sin + z cos.
    far = Math.min(far, -x * Math.sin(yaw) + z * Math.cos(yaw));
  }
  const front = customerPlace().position[2] + bodyDepth;
  return far - front;
}

/** Distance (metres, on the floor) from the customer's spot to the toolbox on the bench. */
export function clearOfToolbox(): number {
  const p = customerPlace().position;
  return Math.hypot(p[0] - TOOLBOX_ON_BENCH.x, p[2] - TOOLBOX_ON_BENCH.z);
}

/** The customer stands behind the bench: how far (metres) behind its far edge. */
export function behindBench(): number {
  return BENCH.centre[2] - BENCH.depth / 2 - customerPlace().position[2];
}
