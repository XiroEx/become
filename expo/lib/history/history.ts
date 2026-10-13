/**
 * TRAINING HISTORY HELPERS (NP-112).
 *
 * Native port of the rules inside
 * `webapp/app/dashboard/history/HistoryClient.tsx`:
 *
 *   - the list is `GET /api/workouts/logs` in history mode (no programId,
 *     completed sessions only, the whole history in one response, newest
 *     first). The client never re-sorts: the server's order is the order.
 *   - filters All / Programs / Quick with counts, derived during render.
 *   - log dates are INSTANTS labelled on the device's local day: Today,
 *     Yesterday, a weekday (< 7 days ago) or a date — built from the local
 *     calendar fields, never from `toISOString().slice(0, 10)`.
 */

import type { WorkoutHistoryEntry } from "@become/api-client";

export type HistoryFilter = "all" | "program" | "quick";

export const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "program", label: "Programs" },
  { key: "quick", label: "Quick" },
];

export interface HistoryCounts {
  all: number;
  program: number;
  quick: number;
}

export function countHistoryLogs(logs: WorkoutHistoryEntry[]): HistoryCounts {
  return {
    all: logs.length,
    program: logs.filter((l) => l.kind === "program").length,
    quick: logs.filter((l) => l.kind === "quick").length,
  };
}

/**
 * The web's filter, verbatim: `all` keeps the server order untouched,
 * otherwise keep the matching kind — still in server order.
 */
export function filterHistoryLogs(
  logs: WorkoutHistoryEntry[],
  filter: HistoryFilter,
): WorkoutHistoryEntry[] {
  if (filter === "all") return logs;
  return logs.filter((l) => l.kind === filter);
}

/**
 * The web's `formatDate` (`HistoryClient.tsx` l.41-51), verbatim: the diff is
 * measured between local midnights, so a 9pm session is Today even though it
 * is already tomorrow in UTC.
 */
export function formatHistoryDateLabel(
  iso: string,
  now: Date = new Date(),
): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDay.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/**
 * Stable React key for a history row — the web's
 * `` `${log.sessionId ?? log.date}-${i}` ``.
 */
export function historyRowKey(
  log: WorkoutHistoryEntry,
  index: number,
): string {
  return `${log.sessionId ?? log.date}-${index}`;
}
