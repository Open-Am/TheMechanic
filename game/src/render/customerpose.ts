// The customer's place and which clip plays when (plan 0015 steps 7 and 8, ADRs 0007, 0015 and 0025). Pure: no Three.js,
// so it is unit tested. render/customer.ts plays what this decides.
//
// ADR 0025: the customer stands about 0.35 m behind the bench's far edge, facing the mechanic, fixed in the scene. The
// camera does not orbit and the generator turns on the bench, so the spot never moves.
// ADR 0007: the customer reacts only to the clock and the cord. Nothing done to a part moves them, and every fault plays
// the same clips.

import type { Vec3 } from "../core/index.ts";
import { BENCH, CUSTOMER_SPOT, TOOLBOX_ON_BENCH } from "./stage.ts";

/** The clips render plays (plan 0015 reading 5). The files also hold plan 0017's arrive, pay_leave and storm_off. */
export const CUSTOMER_CLIPS = ["idle", "waiting", "annoyed", "annoyed_idle", "failed_pull", "pleased", "leaving"] as const;
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
 * The round's two endings (ADR 0015 as plan 0015 builds it): the engine starts and they nod and clap; patience runs out
 * and they turn and walk off. Kept apart so plan 0017 (ADR 0026: pay and leave, storm off) can replace them.
 */
export const ENDINGS: Record<"fixed" | "walked", ClipPlan> = {
  fixed: { clip: "pleased", then: "hold" },
  walked: { clip: "leaving", then: "hide" },
};

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
