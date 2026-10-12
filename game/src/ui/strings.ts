// Every player-facing string that is not in the machine data (brief section 3, AGENTS.md).

import type { CheckId, Symptom } from "../core/index.ts";

/** What the player reads when the cord is pulled (brief section 5.2). Wording from the brief. */
export const SYMPTOM_TEXT: Record<Symptom, string> = {
  no_start: "You pull the cord. Nothing. Not even a cough.",
  starts_then_dies: "It fires, runs a few seconds, then dies.",
  runs_no_output: "The engine runs sweetly. The bulb stays dark.",
  runs_weak: "It runs, but it smokes and struggles under load.",
};

export const STRINGS = {
  title: "Open Am",
  briefingLabel: "The customer says",
  symptomLabel: "When you pull the cord",
  start: "Start",
  pullCord: "Pull cord",
  trayEmpty: "Double tap a part to loosen it, then drag it to the tray",
  dropHere: "Drop it here",
  close: "Close",
  fixing: "Working on it…",
  conditionLabel: "Condition",
  resultTitle: "It starts!",
  time: "Time",
  wrongParts: "Wrong parts",
  failedPulls: "Failed pulls",
  total: "Score",
  scoreHint: "Lower is better",
  nextCustomer: "Next customer",
  cannotRunTitle: "This phone cannot run the game",
  cannotRunWebgl: "Its browser does not support 3D graphics (WebGL).",
  cannotRunData: "The machine data could not be loaded.",
  patience: "Patience",
  walkedHint: "They ran out of patience. Nothing was fixed.",
  startLabel: "Choose a job",
  freePlay: "Free play",
  dailyPractice: "Today's fault · practice",
  practiceLabel: "Practice, not scored",
  notScored: "Not scored",
  best: "Best",
  newBest: "New best",
  share: "Share",
  copied: "Copied",
  copyByHand: "Copy this to share it",
  loadingLabel: "Loading the machine",
  soundOn: "Sound on",
  soundOff: "Sound off",
  // Diagnosis checks (ADR 0029).
  check: "Check",
  checksTitle: "Check the engine",
  checksHint: "Each check costs a few seconds and some of the customer's patience.",
  resultLabel: "Result",
  notes: "Notes",
  notesTitle: "What you found",
  notesEmpty: "No checks done yet.",
  back: "Back",
  checkFixed: "Not needed: you have fixed it.",
  checks: "Checks",
  cleanJob: "Clean job",
} as const;

/** The checks' names, as the Check sheet lists them (ADR 0029). */
export const CHECK_NAMES: Record<CheckId, string> = {
  listen_pull: "Listen to a pull",
  look_smoke: "Watch the smoke",
  look_plug: "Read the plug",
  spark_test: "Spark test",
  fuel_flow: "Fuel flow",
  volts_test: "Volts test",
};

/**
 * What a greyed check still needs, in words about what the player can see (ADR 0029, ADR 0007). Part names come from
 * machine.json; needsText in format.ts puts the pieces together.
 */
export const NEEDS = {
  off: (part: string) => `the ${part} out`,
  on: (part: string) => `the ${part} on`,
  allOn: "every part on",
  and: " and ",
  needs: (list: string) => `Needs ${list}`,
} as const;

/** Player-facing text that names someone. */
export const TEMPLATES = {
  customerSays: (name: string) => `${name} says`,
  walkedTitle: (name: string) => `${name} took the generator to another mechanic.`,
  speech: (name: string, line: string) => `${name}: “${line}”`,
  /** The daily button and the briefing's label (ADR 0005). */
  dailyDay: (day: number) => `Today's fault · Day ${day}`,
  /** Today's scored result on the start screen. */
  todayFixed: (day: number, total: number, stars: string) => `Day ${day}: score ${total} ${stars}`,
  todayWalked: (day: number) => `Day ${day}: the customer walked`,
  todayUnfinished: (day: number) => `Day ${day}: Not finished`,
  /** A check's cost on the Check sheet, and the checks' seconds on the result screen. */
  seconds: (n: number) => `${n} s`,
  /** The clean-job bonus on the result screen (ADR 0029). */
  bonus: (n: number) => `−${n}`,
  /** The Notes button with how many results it holds. */
  notesCount: (n: number) => `Notes (${n})`,
} as const;

/** The share text's words (ADR 0005). Its three lines are put together by shareText in format.ts. */
export const SHARE = {
  title: (day: number) => `Open Am · Day ${day}`,
  fixed: (seconds: number, wrong: string, stars: string) => `Fixed in ${seconds}s · ${wrong} · ${stars}`,
  wrongParts: (n: number) => (n === 1 ? "1 wrong part" : `${n} wrong parts`),
} as const;
