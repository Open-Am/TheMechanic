// Every tunable number in one place (ADR 0004, ADR 0005). Change these only through an ADR.

import type { CheckId } from "./types.ts";

/** Score penalty per distinct part removed that did not need to come off. */
export const WRONG_PART_PENALTY = 10;

/** Score penalty per failed pull of the cord. */
export const FAILED_PULL_PENALTY = 15;

/**
 * What each check costs, in seconds (ADR 0029): added to the score and taken from the customer's patience, on top of
 * the real time it takes.
 */
export const CHECK_SECONDS: Readonly<Record<CheckId, number>> = {
  listen_pull: 3,
  look_smoke: 3,
  look_plug: 2,
  spark_test: 4,
  fuel_flow: 3,
  volts_test: 4,
};

/** Taken off the score of a round fixed with no wrong parts and no failed pulls: a clean diagnosis (ADR 0029). */
export const CLEAN_BONUS = 10;

/** Three stars at or under this score, two at or under the second, otherwise one. */
export const STAR_THRESHOLDS = { three: 45, two: 90 } as const;

/** Seconds of patience a failed pull of the cord costs (ADR 0015). Checks cost patience too (ADR 0029). */
export const FAILED_PULL_PATIENCE_COST = 20;

/** Share of patience left at which the customer reacts: "waiting" below the first, "annoyed" below the second. */
export const PATIENCE_THRESHOLDS = { waiting: 0.5, annoyed: 0.2 } as const;

/** Mixed into the day hash for the daily customer, so the customer and the fault are chosen independently. */
export const DAILY_CUSTOMER_SALT = 0x63757374; // "cust"

/** Day 0 of the daily fault, as a UTC date string. Lagos midnight on this date is day 0. */
export const DAILY_EPOCH = "2026-10-01";

/** Lagos is UTC+1 all year, no daylight saving. */
export const LAGOS_UTC_OFFSET_MINUTES = 60;

/** Seed mixed into the daily hash so the sequence differs from any other project using the same algorithm. */
export const DAILY_SEED = 0x6f70616d; // "opam"
