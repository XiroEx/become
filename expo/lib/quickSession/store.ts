/**
 * NATIVE QUICK-SESSION DRAFT STORE (NP-224).
 *
 * Port of `webapp/lib/quickSession/store.ts` (l.1-213) off `localStorage` onto
 * the injected `KeyValueStore` contract from `@/lib/live/liveWorkoutCache`
 * (the same DI pattern `workoutPosition.ts` already uses), so unit tests hand
 * it an in-memory map instead of AsyncStorage.
 *
 * Rules that travel from the web:
 *  - `stashQuickSession` ALWAYS mints a fresh id. A repeat keeps its
 *    `sourceSessionId` apart from its own `sessionId`, so completing the
 *    repeat cannot overwrite the historical workout it was copied from.
 *  - Storage failures never throw; reads/updates return null, as the web does.
 *  - Key prefix `quick_session_` is unchanged, so the two apps describe a
 *    stash the same way even though the storage behind them is per-device.
 *
 * The href builders are the native equivalents of the web's
 * `quickSessionOverviewHref` / `quickSessionLiveHref`: expo-router routes
 * under `/(tabs)/programming/quick` instead of `/dashboard/workout/...`.
 */

import type { DraftExercise } from "@become/core";
import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";

export const QUICK_PROGRAM_ID = "quick";

const KEY_PREFIX = "quick_session_";

/** Storage key for a stashed session — the web's prefix, unchanged. */
export function quickSessionStorageKey(sessionId: string): string {
  return KEY_PREFIX + sessionId;
}

/** An in-flight, program-less session (mirrors `webapp/lib/quickSession/types.ts`). */
export interface DraftSession {
  title: string;
  focus?: string;
  exercises: DraftExercise[];
  source?: "generated" | "saved";
}

export interface StoredQuickSession extends DraftSession {
  sessionId: string;
  /** Explicit lifecycle state. Automatic titles can sound meaningful, so the
   * title text alone cannot tell whether the member chose a name. */
  needsName?: boolean;
  /** Server log this repeat was copied from. Kept separate from sessionId so
   *  completing the repeat cannot overwrite the historical workout. */
  sourceSessionId?: string;
  /** Carried over from a favorited source session so repeating it doesn't
   *  silently drop the star — see openQuickSession call sites. */
  favorite?: boolean;
}

export interface StashQuickSessionOptions {
  sourceSessionId?: string;
  needsName?: boolean;
  favorite?: boolean;
}

function genId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } })
      .crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* fall through to the Math.random fallback */
  }
  // Fallback id — AsyncStorage-scoped, collision risk is negligible here.
  return `qs_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Persist a draft session and return its sessionId (used in the live URL). */
export async function stashQuickSession(
  session: DraftSession,
  options?: StashQuickSessionOptions,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<string> {
  const sessionId = genId();
  const payload: StoredQuickSession = {
    ...session,
    sessionId,
    ...(options?.needsName !== undefined
      ? { needsName: options.needsName }
      : {}),
    ...(options?.sourceSessionId
      ? { sourceSessionId: options.sourceSessionId }
      : {}),
    ...(options?.favorite ? { favorite: true } : {}),
  };
  try {
    await store.set(quickSessionStorageKey(sessionId), JSON.stringify(payload));
  } catch {
    /* storage full / unavailable — the live client falls back gracefully */
  }
  return sessionId;
}

/**
 * Persist a draft under a SPECIFIC id (used to resume/start a planned session by
 * its existing sessionId, so completing it updates the same log — consuming the
 * plan — rather than creating a new one).
 */
export async function stashQuickSessionWithId(
  session: DraftSession,
  sessionId: string,
  options?: Pick<StashQuickSessionOptions, "needsName">,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<string> {
  const payload: StoredQuickSession = {
    ...session,
    sessionId,
    ...(options?.needsName !== undefined
      ? { needsName: options.needsName }
      : {}),
  };
  try {
    await store.set(quickSessionStorageKey(sessionId), JSON.stringify(payload));
  } catch {
    /* storage unavailable — live client falls back gracefully */
  }
  return sessionId;
}

/**
 * Persist an exercise swap into the stashed quick session so BOTH the Track and Live
 * views (which build their exercise list from this stash on load) reflect the swap.
 * Replaces the exercise identity at exIdx, preserving its sets/reps/rest prescription.
 */
export async function swapQuickSessionExercise(
  sessionId: string,
  exIdx: number,
  next: {
    name: string;
    exerciseSlug?: string;
    trackingType?: string;
    primaryMuscles?: string[];
    /** Always passed by the caller (possibly []) so a swap fully replaces the
     *  old exercise's catalog metadata rather than leaving stale values —
     *  e.g. swapping a dumbbell row for a bodyweight one must drop `equipment`,
     *  not just skip setting the new one. */
    equipment?: string[];
    laterality?: string;
    movementPatterns?: string[];
  },
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<void> {
  const s = await readQuickSession(sessionId, store);
  if (!s || !Array.isArray(s.exercises) || !s.exercises[exIdx]) return;
  const exercises = s.exercises.map((ex, i) => {
    if (i !== exIdx) return ex;
    const patched = { ...ex, name: next.name };
    if (next.exerciseSlug !== undefined)
      patched.exerciseSlug = next.exerciseSlug;
    if (next.trackingType) patched.trackingType = next.trackingType;
    if (next.primaryMuscles) patched.primaryMuscles = next.primaryMuscles;
    if (next.equipment !== undefined) patched.equipment = next.equipment;
    if (next.laterality !== undefined) patched.laterality = next.laterality;
    if (next.movementPatterns !== undefined)
      patched.movementPatterns = next.movementPatterns;
    return patched;
  });
  const { sessionId: _keep, ...rest } = s;
  void _keep;
  await stashQuickSessionWithId({ ...rest, exercises }, sessionId, {}, store);
}

/** Read back a stashed session by id (null if missing/corrupt). */
export async function readQuickSession(
  sessionId: string,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<StoredQuickSession | null> {
  if (!sessionId) return null;
  try {
    const raw = await store.get(quickSessionStorageKey(sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as StoredQuickSession;
  } catch {
    return null;
  }
}

/**
 * Overwrite a stashed session's title/exercises in place, keeping its id.
 *
 * Backs the overview's edit mode. Kept separate from stashQuickSessionWithId so
 * the intent reads at the call site — this is "the user changed this session",
 * not "start this plan".
 */
export async function updateQuickSession(
  sessionId: string,
  patch: { title?: string; exercises?: DraftExercise[] },
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<StoredQuickSession | null> {
  const current = await readQuickSession(sessionId, store);
  if (!current) return null;
  const next: StoredQuickSession = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    // Saving a non-empty title in the editor is an explicit naming action.
    ...(patch.title !== undefined ? { needsName: !patch.title.trim() } : {}),
    ...(patch.exercises !== undefined ? { exercises: patch.exercises } : {}),
  };
  try {
    await store.set(quickSessionStorageKey(sessionId), JSON.stringify(next));
  } catch {
    /* storage unavailable — the caller still gets the updated object back */
  }
  return next;
}

/** Remove a stashed session (call once it's completed). */
export async function clearQuickSession(
  sessionId: string,
  store: KeyValueStore = asyncStorageKeyValueStore,
): Promise<void> {
  if (!sessionId) return;
  try {
    await store.remove(quickSessionStorageKey(sessionId));
  } catch {
    /* ignore */
  }
}

/**
 * The overview ("regular view") route for a stashed quick session.
 *
 * `saved` marks a session that already exists server-side under this exact
 * sessionId (a planned session). The overview uses it to decide whether editing
 * should write back to that log — for an unsaved draft it must not, or the edit
 * would insert a stray log nobody asked for.
 *
 * `date` (a local YYYY-MM-DD) pre-fills the overview's Log/Plan date — used
 * when the session was started from a specific day on the Calendar, so the
 * user isn't left to re-pick a date the app already knew.
 */
export function quickSessionOverviewHref(
  sessionId: string,
  opts?: { saved?: boolean; started?: boolean; date?: string },
): string {
  const q = [
    `session=${encodeURIComponent(sessionId)}`,
    ...(opts?.saved ? ["saved=1"] : []),
    ...(opts?.started ? ["started=1"] : []),
    ...(opts?.date ? [`date=${encodeURIComponent(opts.date)}`] : []),
  ].join("&");
  return `/(tabs)/programming/quick?${q}`;
}

/** The live route for a stashed quick session. */
export function quickSessionLiveHref(sessionId: string): string {
  return `/(tabs)/programming/quick/live?session=${encodeURIComponent(sessionId)}`;
}
