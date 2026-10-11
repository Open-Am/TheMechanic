// Pure formatting helpers for the interface.

import type { ScoreBreakdown } from "../core/index.ts";
import { SHARE, STRINGS, TEMPLATES } from "./strings.ts";

/** What the start screen needs to know about today's fault. */
export interface DailyView {
  day: number;
  attempted: boolean;
  result: { unfinished?: boolean; score: ScoreBreakdown } | null;
}

/** The daily button: today's day while the scored attempt is open, then practice (ADR 0005, ADR 0024). */
export function dailyButtonText(s: DailyView): string {
  return s.attempted ? STRINGS.dailyPractice : TEMPLATES.dailyDay(s.day);
}

/** Today's scored result for the start screen, or null before it is played. Unfinished shows as "Not finished". */
export function todayResultText(s: DailyView): string | null {
  const r = s.result;
  if (!r) return null;
  if (r.unfinished) return TEMPLATES.todayUnfinished(s.day);
  if (r.score.outcome === "walked") return TEMPLATES.todayWalked(s.day);
  return TEMPLATES.todayFixed(s.day, r.score.total, starText(r.score.stars));
}

/** CSS px above the controls (pull cord and tray) that still count as dropping on the tray (ADR 0020 tuning). */
export const DROP_REACH = 64;

/**
 * True if a screen point is in the tray's drop zone: the whole strip of the screen from a little above the controls to
 * the bottom, across its full width, so a carried part does not have to land on the tray itself.
 */
export function inDropZone(y: number, controlsTop: number, screenBottom: number): boolean {
  return y >= controlsTop - DROP_REACH && y <= screenBottom;
}

/**
 * Share is offered only for a scored daily that ended with the engine running: ADR 0005 defines a text only for that.
 * Free play, practice, walked and unfinished rounds get none (plan 0014 reading 8).
 */
export function shareOffered(mode: "free" | "daily" | "practice" | null, outcome: "fixed" | "walked" | null): boolean {
  return mode === "daily" && outcome === "fixed";
}

/** The loading bar's share from files settled out of files requested, 0 to 1. Nothing to load counts as done. */
export function progressShare(done: number, total: number): number {
  if (!(total > 0)) return 1;
  if (!(done > 0)) return 0;
  return Math.min(1, done / total);
}

/** Milliseconds as m:ss. Negative or invalid input shows 0:00. */
export function formatTime(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The share text for a fixed daily (ADR 0005): title, result, link. Seconds are the score's whole seconds, never m:ss.
 * Failed pulls are not shown, as in ADR 0005's example.
 */
export function shareText(day: number, score: ScoreBreakdown, url: string): string {
  return [SHARE.title(day), SHARE.fixed(score.elapsedSeconds, SHARE.wrongParts(score.wrongParts), starText(score.stars)), url].join("\n");
}

/**
 * The link in the share text: the build's base path (relative, "./") resolved against the page's address, with no
 * query or hash, so ?diag and ?today never leak.
 */
export function shareUrl(pageHref: string, basePath: string): string {
  const u = new URL(basePath, pageHref);
  u.search = "";
  u.hash = "";
  return u.href;
}

/** Filled and empty stars, always three characters. */
export function starText(stars: number): string {
  const n = Math.max(0, Math.min(3, Math.round(stars)));
  return "★".repeat(n) + "☆".repeat(3 - n);
}

/** The meter's colour band for a share of patience left (ADR 0015 thresholds: 50 and 20 percent). */
export function patienceMood(share: number): "calm" | "waiting" | "annoyed" {
  if (share < 0.2) return "annoyed";
  if (share < 0.5) return "waiting";
  return "calm";
}
