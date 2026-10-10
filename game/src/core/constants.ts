// Every tunable number in one place (ADR 0004, ADR 0005). Change these only through an ADR.

/** Score penalty per distinct part removed that did not need to come off. */
export const WRONG_PART_PENALTY = 10;

/** Score penalty per failed pull of the cord. */
export const FAILED_PULL_PENALTY = 15;

/** Three stars at or under this score, two at or under the second, otherwise one. */
export const STAR_THRESHOLDS = { three: 45, two: 90 } as const;

/** Day 0 of the daily fault, as a UTC date string. Lagos midnight on this date is day 0. */
export const DAILY_EPOCH = "2026-10-01";

/** Lagos is UTC+1 all year, no daylight saving. */
export const LAGOS_UTC_OFFSET_MINUTES = 60;

/** Seed mixed into the daily hash so the sequence differs from any other project using the same algorithm. */
export const DAILY_SEED = 0x6f70616d; // "opam"
