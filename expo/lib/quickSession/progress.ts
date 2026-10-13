/**
 * NATIVE QUICK-SESSION PROGRESS (NP-224).
 *
 * Port of `webapp/lib/quickSession/progress.ts` (key `qs_progress_<id>`) off
 * `localStorage` onto the injected `KeyValueStore` contract from
 * `@/lib/live/liveWorkoutCache` (the same DI pattern `workoutPosition.ts`
 * already uses), so unit tests hand it an in-memory map instead of
 * AsyncStorage.
 *
 * The Track (form) view and the Live view hand progress off to each other
 * with NO data loss when the user flips the Track|Live tab: both views read
 * on mount and write on every change. A reopened live view restores from
 * this snapshot. This is the quick-session analogue of the server-persisted
 * resume that program workouts get (programs share via the /api/workouts log
 * keyed by programId+day; quick sessions have no such GET, so we share
 * client-side).
 *
 * The snapshot shape is structurally identical to the live `LiveGrid`
 * (`exerciseSlug → ordered set states`), so the live view restores it
 * directly with no translation.
 */

import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";

const KEY = (id: string) => `qs_progress_${id}`;

/** One set as the live grid holds it — numbers, the way native inputs hand them over. */
export interface QuickSetSnapshot {
  reps: number | null;
  weight: number | null;
  completed: boolean;
  /** Seconds — for time / time_distance / intervals tracking types. */
  durationSec?: number | null;
  /** Meters — for time_distance tracking types. */
  distance?: number | null;
}

/** exerciseSlug → ordered set snapshots. Restores straight into the live grid. */
export type QuickProgressGrid = Record<string, QuickSetSnapshot[]>;

export interface QuickProgressDraft {
  savedAt: number;
  grid: QuickProgressGrid;
}

/** Read back a progress snapshot by sessionId (null if missing/corrupt). */
export async function readQuickProgress(
  sessionId: string,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<QuickProgressDraft | null> {
  if (!sessionId) return null;
  try {
    const raw = await store.get(KEY(sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as QuickProgressDraft;
  } catch {
    return null;
  }
}

/** Persist the current grid for a session (called on every change). */
export async function writeQuickProgress(
  sessionId: string,
  grid: QuickProgressGrid,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<void> {
  if (!sessionId) return;
  try {
    const draft: QuickProgressDraft = { savedAt: Date.now(), grid };
    await store.set(KEY(sessionId), JSON.stringify(draft));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/** Forget the progress (the workout is over, or was restarted). */
export async function clearQuickProgress(
  sessionId: string,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<void> {
  if (!sessionId) return;
  try {
    await store.remove(KEY(sessionId));
  } catch {
    /* ignore */
  }
}
