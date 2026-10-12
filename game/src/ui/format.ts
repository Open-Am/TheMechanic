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

/** A rectangle on screen, CSS px, y down. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The tray's drop zone while a part is carried (ADR 0020 tuning, release 0.15.1). CSS px.
 * - margin: how far below the generator's lowest point on screen the zone starts.
 * - reach: without the generator's bounds, how far above the controls it starts (the old rule, before 0.15.1).
 * - magnet: how close to the zone a release still counts, as a share of the screen's height, kept within min and max.
 */
export const DROP = { margin: 8, reach: 64, magnetShare: 0.09, magnetMin: 56, magnetMax: 80 } as const;

/** How close above the zone's edge a carried part still drops into the tray, for a screen this tall. */
export function magnetPx(screenHeight: number): number {
  return Math.min(DROP.magnetMax, Math.max(DROP.magnetMin, Math.round(screenHeight * DROP.magnetShare)));
}

/**
 * The zone's top edge: just below the generator's lowest point on screen, and never below the controls' top, so the pull
 * cord, the hint and the chips always count. Without the generator's bounds, a strip above the controls.
 */
export function dropLine(machine: ScreenRect | null, controls: ScreenRect): number {
  if (!machine) return controls.top - DROP.reach;
  return Math.min(machine.bottom + DROP.margin, controls.top);
}

/**
 * Where a carried part released at `finger` goes: "tray" removes it, "back" sends it back to the machine, loose
 * (ADR 0020). The zone is the whole width of the screen from `dropLine` down, past the bottom edge. A point within
 * `magnetPx` above the zone counts too, unless it is over the generator itself (inside its bounds, above the
 * controls). `part` is the carried part's middle on screen: the drop counts if either the finger or the part is in.
 */
export function dropTarget(finger: { x: number; y: number }, machine: ScreenRect | null, screen: { width: number; height: number }, controls: ScreenRect, part?: { x: number; y: number } | null): "tray" | "back" {
  const line = dropLine(machine, controls);
  const reach = line - magnetPx(screen.height);
  const near = (p: { x: number; y: number }): boolean => {
    if (p.y >= line) return true;
    if (p.y < reach) return false;
    const overMachine = machine !== null && p.x >= machine.left && p.x <= machine.right && p.y >= machine.top && p.y <= machine.bottom;
    return !overMachine;
  };
  return near(finger) || (part ? near(part) : false) ? "tray" : "back";
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
/** The mute button's label and pressed state (plan 0013 step 7). Pressed means muted: no sound and no vibration. */
export function soundButton(muted: boolean): { label: string; pressed: "true" | "false" } {
  return muted ? { label: STRINGS.soundOff, pressed: "true" } : { label: STRINGS.soundOn, pressed: "false" };
}

export function patienceMood(share: number): "calm" | "waiting" | "annoyed" {
  if (share < 0.2) return "annoyed";
  if (share < 0.5) return "waiting";
  return "calm";
}
