/**
 * Mindset card copy and presentation logic (NP-150).
 *
 * Parity with webapp/components/dashboard/MindsetCard.tsx and
 * webapp/lib/mind/moodBridge.ts.
 *
 * The dashboard reads GET /api/mind/summary?tz= (read-only, no upserts or
 * migrations) and displays level, chapter progress, session readiness, and a
 * CTA reflecting today's mood.
 */

import type { MindSummaryResponse } from "@become/api-client";
import { moodGateway, isMoodLevel, type MoodLevel } from "@become/core";

export const STATE_WORD: Record<string, string> = {
  stressed: "stressed",
  distracted: "distracted",
  low_energy: "low energy",
  locked_in: "locked in",
};

/** Compute hours elapsed since given epoch milliseconds timestamp. */
export function hoursAgo(ms: number, now = Date.now()): number {
  return Math.max(0, Math.round((now - ms) / 3_600_000));
}

/** Check if the last state timestamp falls within the 24h window. */
export function isLastStateWithin24Hours(
  lastState: { at: number } | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastState || typeof lastState.at !== "number") return false;
  return hoursAgo(lastState.at, now) <= 24;
}

/**
 * Resolve effective mood for today: caller-provided todaysMood takes precedence,
 * falling back to summary.todayMood if valid 1–5 mood level.
 */
export function getEffectiveMood(
  todaysMood: MoodLevel | null | undefined,
  summary: MindSummaryResponse | null | undefined,
): MoodLevel | null {
  if (todaysMood != null && isMoodLevel(todaysMood)) return todaysMood;
  if (summary && isMoodLevel(summary.todayMood)) return summary.todayMood;
  return null;
}

/**
 * CTA copy for the Mindset button.
 *
 * Web parity:
 * - If no summary: "Open Mindset"
 * - If today's session is done: "Training Grounds"
 * - If mood <= 2 and gateway exists: gateway.cta ("Take five in Mindset" for 1, "Reset in Mindset" for 2)
 * - Else if mainSessionAvailable: "Start today's session"
 * - Else: "Training Grounds"
 */
export function computeMindsetCta(
  summary: MindSummaryResponse | null | undefined,
  mood: MoodLevel | null | undefined,
): string {
  if (!summary) return "Open Mindset";
  if (summary.sessionDoneToday) return "Training Grounds";
  const gateway = mood ? moodGateway(mood) : null;
  if (mood && mood <= 2 && gateway) return gateway.cta;
  return summary.mainSessionAvailable
    ? "Start today's session"
    : "Training Grounds";
}

/**
 * Session status badge / line.
 *
 * Web parity:
 * - If no summary: null
 * - If sessionDoneToday: { done: true, text: "Today's session done" }
 * - If mainSessionAvailable: { done: false, text: "Today's session is ready" }
 * - Else: { done: false, text: "Session done · Training Grounds open" }
 */
export function computeMindsetStatus(
  summary: MindSummaryResponse | null | undefined,
): { done: boolean; text: string } | null {
  if (!summary) return null;
  if (summary.sessionDoneToday) {
    return { done: true, text: "Today's session done" };
  }
  if (summary.mainSessionAvailable) {
    return { done: false, text: "Today's session is ready" };
  }
  return { done: false, text: "Session done · Training Grounds open" };
}

/** Progress percentage (0–100) through the current chapter. */
export function computeChapterProgress(
  sessionsIntoChapter: number,
  sessionsPerChapter: number,
): number {
  if (sessionsPerChapter <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((sessionsIntoChapter / sessionsPerChapter) * 100)),
  );
}

/** Format the feeling name or mapped state word for last check-in. */
export function formatLastStateFeeling(lastState: {
  state: string;
  feeling?: string | null;
}): string {
  return (
    lastState.feeling?.toLowerCase() ||
    STATE_WORD[lastState.state] ||
    lastState.state
  );
}
