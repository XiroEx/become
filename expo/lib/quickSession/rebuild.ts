/**
 * REBUILD A QUICK SESSION FROM ITS SERVER LOG (NP-224).
 *
 * Native port of `webapp/lib/quickSession/openQuick.ts` (`continueQuickSession`,
 * l.33-80): fetch `GET /api/workouts/session?id=` through `apiFetch` with
 * `QuickSessionResponseSchema`, map each logged exercise back into a
 * `DraftExercise` EXACTLY the way the web does, then stash the draft under the
 * SAME sessionId with the server's `needsName` — so finishing consumes the
 * same log instead of creating a new one.
 *
 * A 404 (or `{ session: null }`, which is how the endpoint answers a 404 —
 * same shape, one branch) returns null and stashes nothing. Any other failure
 * is fail-soft too: null, never a throw, as the web does.
 */

import {
  apiFetch,
  ApiError,
  QuickSessionResponseSchema,
  type QuickSessionResponse,
} from "@become/api-client";
import { normalizeTracking, type DraftExercise } from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";
import {
  stashQuickSessionWithId,
  type StoredQuickSession,
} from "@/lib/quickSession/store";

/**
 * The web's `isFocusKey` (`webapp/lib/quickSession/types.ts`): a draft only
 * carries a focus the catalog knows, so a stale/unknown server value cannot
 * leak into the stash. `@become/core` does not export the focus catalog, so
 * the list lives here — it must stay identical to the web's `FocusKey` union.
 */
const FOCUS_KEYS = new Set([
  "full_body",
  "upper",
  "lower",
  "push",
  "pull",
  "legs",
  "glutes",
  "core",
  "arms",
  "chest",
  "back",
  "shoulders",
  "cardio",
]);

function isFocusKey(v: unknown): v is string {
  return typeof v === "string" && FOCUS_KEYS.has(v);
}

export interface RebuildQuickSessionDeps {
  store?: KeyValueStore;
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  /** Fetch implementation, threaded through to `apiFetch` (tests). */
  fetchImpl?: typeof fetch;
  /**
   * Full override for the session read (tests): return the parsed
   * `QuickSessionResponse` body, or null for "no such session". Throwing an
   * `ApiError` with `status: 404` models the endpoint's 404.
   */
  fetchSession?: (sessionId: string) => Promise<QuickSessionResponse | null>;
}

async function defaultFetchSession(
  sessionId: string,
  deps: RebuildQuickSessionDeps,
): Promise<QuickSessionResponse | null> {
  return apiFetch(
    `/api/workouts/session?id=${encodeURIComponent(sessionId)}`,
    QuickSessionResponseSchema,
    {
      baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
      ...(deps.getToken ? { getToken: deps.getToken } : {}),
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    },
  );
}

/**
 * Rebuild the draft for a server-side quick session and stash it under the
 * SAME sessionId. Returns the stashed session, or null when the log is gone
 * (404) or unreadable — stashing nothing in that case.
 */
export async function rebuildQuickSession(
  sessionId: string,
  deps: RebuildQuickSessionDeps = {},
): Promise<StoredQuickSession | null> {
  if (!sessionId) return null;
  const store = deps.store ?? asyncStorageKeyValueStore;
  try {
    const data = deps.fetchSession
      ? await deps.fetchSession(sessionId)
      : await defaultFetchSession(sessionId, deps);
    const s = data?.session;
    if (!s) return null;
    // The mapping below mirrors `continueQuickSession` set-for-set: the
    // endpoint resolves the tracking type now (prescription, else the
    // catalog, else what the sets imply) — inventing 'reps' here is what
    // left a resumed session with no weight box.
    const exercises: DraftExercise[] = (s.exercises ?? []).map((ex) => {
      const first = ex.sets?.[0];
      const isTime = !!first && first.duration != null && first.reps == null;
      const p = ex.prescription;
      return {
        exerciseSlug: ex.exerciseSlug || "",
        name: ex.name,
        trackingType: normalizeTracking(
          ex.trackingType || p?.trackingType || (isTime ? "time" : undefined),
        ),
        sets: p?.sets ?? (ex.sets?.length || 1),
        reps: p?.reps ?? (first?.reps != null ? String(first.reps) : ""),
        ...(p?.duration
          ? { duration: p.duration }
          : first?.duration != null
            ? { duration: String(first.duration) }
            : {}),
        ...(p?.rest ? { rest: p.rest } : {}),
        ...(ex.equipment ? { equipment: ex.equipment } : {}),
        ...(ex.laterality ? { laterality: ex.laterality } : {}),
        ...(ex.movementPatterns ? { movementPatterns: ex.movementPatterns } : {}),
        // A superset built mid-session is part of the session, not a detail of
        // one run of it — reopening has to bring it back.
        ...(ex.groupId ? { groupId: ex.groupId } : {}),
        ...(ex.groupType ? { groupType: ex.groupType } : {}),
        ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
        ...(ex.groupRest ? { groupRest: ex.groupRest } : {}),
        ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
        ...(ex.addedAdHoc ? { addedAdHoc: true } : {}),
      };
    });
    await stashQuickSessionWithId(
      {
        title: s.title || "Quick Session",
        ...(isFocusKey(s.focus) ? { focus: s.focus } : {}),
        exercises,
      },
      sessionId,
      { needsName: s.needsName },
      store,
    );
    // The draft uses the same id as this in-progress server log, so edits must
    // write back instead of stopping at the stash.
    const stashed: StoredQuickSession = {
      title: s.title || "Quick Session",
      ...(isFocusKey(s.focus) ? { focus: s.focus } : {}),
      exercises,
      sessionId,
      ...(s.needsName !== undefined ? { needsName: s.needsName } : {}),
    };
    return stashed;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return null;
  }
}
