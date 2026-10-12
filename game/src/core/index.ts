// Public surface of core. Other layers import from here (ADR 0010).

export * from "./types.ts";
export * from "./constants.ts";
export { validateMachine, validateFaults, validateAll, validateCustomers, findRequiresCycle, FAULT_SCHEMA } from "./validate.ts";
export { walkOutTime, patienceAt, hasWalked, moodFor } from "./patience.ts";
export { blockers, hiders, isVisible, canRemove, canInstall, missingDependents, necessarySet, removableNow, removalOrder, partById, isCheckId, unmetNeeds, checkPossible, checkSeconds, type UnmetNeeds } from "./rules.ts";
export { initialState, apply, conditionText, clueText } from "./reducer.ts";
export { replay, type ReplayResult } from "./replay.ts";
export { score, scoreState, stars } from "./score.ts";
export { dayNumber, hashDay, dailyFaultId, dailyCustomerId } from "./daily.ts";
