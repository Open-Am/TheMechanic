// Every player-facing string that is not in the machine data (brief section 3, AGENTS.md).

import type { Symptom } from "../core/index.ts";

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
  trayEmpty: "Pull a part off along its path",
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
} as const;
