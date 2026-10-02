import { isMoodLevel, moodGateway } from "@become/core";
import type { MoodLevel } from "@become/core";
import type { MindSummaryResponse } from "@become/api-client";

/**
 * The dashboard Mindset card's words, as pure functions.
 *
 * Mirrors `webapp/components/dashboard/MindsetCard.tsx` exactly: the CTA
 * precedence (done → low-mood gateway invitation → session availability),
 * the status line, the 24-hour window on the last reported state, and the
 * chapter progress percent. The component in
 * `components/dashboard/MindsetCard.tsx` renders these; the tests hold them
 * to the web's copy word-for-word.
 */

export type MindsetMood = MoodLevel | null;

export function resolveMindsetMood(
  todaysMood: MoodLevel | number | null | undefined,
  summary: MindSummaryResponse | null,
): MoodLevel | null {
  if (isMoodLevel(todaysMood)) return todaysMood;
  if (summary && isMoodLevel(summary.todayMood)) return summary.todayMood;
  return null;
}

/**
 * What the button says. A low mood gets the gentle invitation; otherwise it
 * is about today's session. Mirrors the web's `cta` IIFE.
 */
export function mindsetCta(
  summary: MindSummaryResponse | null,
  mood: MindsetMood,
): string {
  if (!summary) return "Open Mindset";
  if (summary.sessionDoneToday) return "Training Grounds";
  if (mood != null && mood <= 2) {
    const gateway = moodGateway(mood);
    if (gateway) return gateway.cta;
  }
  return summary.mainSessionAvailable ? "Start today's session" : "Training Grounds";
}

export interface MindsetStatus {
  done: boolean;
  text: string;
}

/** Mirrors the web's `status` IIFE. */
export function mindsetStatus(
  summary: MindSummaryResponse | null,
): MindsetStatus | null {
  if (!summary) return null;
  if (summary.sessionDoneToday)
    return { done: true, text: "Today's session done" };
  if (summary.mainSessionAvailable)
    return { done: false, text: "Today's session is ready" };
  return { done: false, text: "Session done · Training Grounds open" };
}

const STATE_WORD: Record<string, string> = {
  stressed: "stressed",
  distracted: "distracted",
  low_energy: "low energy",
  locked_in: "locked in",
};

export function hoursAgo(at: number, now: number = Date.now()): number {
  return Math.max(0, Math.round((now - at) / 3_600_000));
}

/**
 * The last reported state, shown only within 24 hours — mirrors the web's
 * `lastState` guard. Returns the display word (the feeling when there is one,
 * else the state word), or null when there is nothing fresh to show.
 */
export function visibleLastState(
  summary: MindSummaryResponse | null,
  now: number = Date.now(),
): string | null {
  const last = summary?.lastState;
  if (!last) return null;
  if (hoursAgo(last.at, now) > 24) return null;
  return last.feeling?.toLowerCase() || STATE_WORD[last.state] || last.state;
}

/** Chapter progress percent for the bar. Mirrors the web's inline maths. */
export function chapterProgressPct(
  summary: Pick<
    MindSummaryResponse,
    "sessionsIntoChapter" | "sessionsPerChapter"
  >,
): number {
  if (summary.sessionsPerChapter <= 0) return 0;
  return Math.round(
    (summary.sessionsIntoChapter / summary.sessionsPerChapter) * 100,
  );
}
