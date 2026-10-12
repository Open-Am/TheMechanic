// The moments that make a sound, and which of them vibrate (ADR 0018, plan 0013 reading 1 and 7). Data, not logic:
// app plays its own moments from accepted actions; render reports the finger's moments, and main.ts passes them here.
// render imports Moment from this file, never from platform (ADR 0010).

import type { CheckId, MotionType, Symptom } from "../core/index.ts";
import { MOMENTS, type Audio, type Moment } from "../platform/interfaces/index.ts";

export { MOMENTS, type Moment };

/** Seconds from the cord to the engine's answer: the trimmed length of the cord file (plan 0013 reading 3). */
export const CORD_SECONDS = 0.6;

/** The vibration for each moment, in ms, or null for none (ADR 0018's table). */
export const VIBRATION: Record<Moment, number | readonly number[] | null> = {
  turn: null,
  "give-unbolt": 15,
  "give-unclip": 15,
  "give-pull": 15,
  "give-scrape": 15,
  land: null,
  seat: 15,
  cord: null,
  fail: 40,
  start: [60, 40, 60, 40, 80],
  run: null, // ADR 0028: the catch vibrates, the running engine does not
};

/**
 * The engine running (ADR 0028). After the catch (`start`) the running sound loops until the engine stops. It comes in
 * over the catch's last crossfadeSeconds (start.ogg fades out over the same 0.3 s, assets/audio/sounds.json), and
 * fades out over fadeOutSeconds, the wind-down. Until plan 0018 stops it at the switch press, it runs on for
 * runOnSeconds after the customer's ending is over (main.ts): with the 0.6 s cord and the 4 s catch, about 6 s of engine
 * from the pull, as ADR 0027 times it.
 */
export const RUN = { crossfadeSeconds: 0.3, fadeOutSeconds: 0.8, runOnSeconds: 2 } as const;

/**
 * Where run.ogg repeats, seconds into the file: upward zero crossings checked on the decoded file, 2.249 s apart. The
 * same points are loopStart and loopEnd in assets/audio/sounds.json (seconds into the original); a test holds them
 * together. Re-encoding run.ogg moves its samples slightly, so these are checked again whenever it is re-encoded.
 */
export const RUN_LOOP = { start: 0.110229, end: 2.35875 } as const;

/**
 * Cues that start and stop the running engine, passed like moments (main.ts wires them to the audio). run-start: the
 * loop follows the catch. run-stop: it winds down over RUN.fadeOutSeconds. run-cut: it stops at once (a skip, a new
 * round). Plan 0018 moves run-stop to the switch press.
 */
export const CUES = ["run-start", "run-stop", "run-cut"] as const;
export type Cue = (typeof CUES)[number];

/** The part of Audio the cues need. */
export type CuePlayer = Pick<Audio, "play" | "vibrate" | "startLoop" | "stopLoop">;

/** Plays a moment (and its vibration) or carries out an engine cue, now or after delaySeconds. */
export function playCue(audio: CuePlayer, cue: Moment | Cue, delaySeconds = 0): void {
  switch (cue) {
    case "run-start":
      audio.startLoop("run", { after: "start", delaySeconds, fadeInSeconds: RUN.crossfadeSeconds, loopStart: RUN_LOOP.start, loopEnd: RUN_LOOP.end });
      return;
    case "run-stop":
      audio.stopLoop("run", { fadeOutSeconds: RUN.fadeOutSeconds });
      return;
    case "run-cut":
      audio.stopLoop("run");
      return;
    default:
      playMoment(audio, cue, delaySeconds);
  }
}

/**
 * The sound a part makes as it gives, by how it comes off. An unscrewed part has none: its turns click instead. An
 * unknown type plays as slide (ADR 0008), so it scrapes.
 */
export function giveMoment(type: MotionType | string | undefined): Moment | null {
  switch (type) {
    case "unscrew":
      return null;
    case "unbolt":
      return "give-unbolt";
    case "unclip":
      return "give-unclip";
    case "pull":
      return "give-pull";
    default:
      return "give-scrape";
  }
}

/**
 * The sounds a check makes (ADR 0029): only the existing moments, each with its delay in seconds. Listening, watching
 * the smoke and the volts test pull the cord and run the engine: it fails (`no_start`) or catches (every other symptom;
 * the clue line says whether it then dies, runs weak or gives no output, plan 0019 reading 4). The spark test pulls the
 * cord with the plug out, so the engine cannot answer. Reading the plug and the fuel flow make no sound.
 * The running loop and the switch press wait for plan 0018: a check never starts the engine's loop.
 */
export function checkCues(checkId: CheckId, symptom: Symptom): Array<[Moment, number]> {
  switch (checkId) {
    case "listen_pull":
    case "look_smoke":
    case "volts_test":
      return [["cord", 0], [symptom === "no_start" ? "fail" : "start", CORD_SECONDS]];
    case "spark_test":
      return [["cord", 0]];
    case "look_plug":
    case "fuel_flow":
      return [];
  }
}

/** The part of Audio a moment needs. */
export type MomentPlayer = Pick<Audio, "play" | "vibrate">;

/** Plays a moment and its vibration, now or after delaySeconds. */
export function playMoment(audio: MomentPlayer, moment: Moment, delaySeconds = 0): void {
  audio.play(moment, delaySeconds);
  const pattern = VIBRATION[moment];
  if (pattern !== null) audio.vibrate(pattern, delaySeconds);
}
