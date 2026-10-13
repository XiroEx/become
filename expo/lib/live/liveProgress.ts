import type { LiveGrid } from "@/components/live/LiveWorkoutClient";

/**
 * LIVE HEADER PROGRESS + ELAPSED TIME (NP-236).
 *
 * Web equivalents live in
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`:
 * `getOverallProgress` (~line 1833) and `formatTime` (~line 1046). Pure on
 * purpose: the header renders them, the route ticks the seconds, and jest
 * pins the maths here without mounting anything.
 */

/**
 * Overall workout progress, 0–100 — the web's `getOverallProgress` verbatim.
 * It counts SETS, not steps: every set in every exercise is one unit, done
 * when its `completed` flag is set. No sets at all reads as 0, never NaN.
 */
export function overallProgressPercent(grid: LiveGrid): number {
  let completed = 0;
  let total = 0;
  for (const sets of Object.values(grid)) {
    for (const set of sets) {
      total += 1;
      if (set.completed) completed += 1;
    }
  }
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Elapsed seconds as `m:ss` — the web's `formatTime` verbatim: `65` →
 * `1:05`, `3600` → `60:00` (minutes are unbounded, never hours).
 */
export function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
