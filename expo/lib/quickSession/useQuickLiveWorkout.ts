/**
 * THE QUICK-SESSION LIVE HOOK (NP-226).
 *
 * Loads the stashed draft for `?session=` (missing or empty -> rebuild from
 * the server log via `rebuildQuickSession`, i.e. opened on another device),
 * merges demo video fields from `POST /api/exercises/hydrate` BY INDEX (the
 * web's `mergeHydratedVideos`, `webapp/lib/quickSession/hydrateVideos.ts`
 * l.36-85), restores the grid from `progress.ts`, and saves with the web's
 * quick body (`quickSave.ts`): once when the screen opens, then debounced on
 * grid changes, so the session is in progress server-side within seconds.
 * The grid is persisted to `progress.ts` on every change.
 *
 * Finish: `onFinish(grid)` checks `shouldPromptForQuickSessionName(stored)`;
 * when true the route opens `QuickSessionNamePrompt` instead of saving.
 * Confirm or Skip does the completing save with that title and
 * `needsName: false`, then `updateQuickSession`, clears the stash and
 * progress, and shows `WorkoutSummary`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExerciseHydrateResponseSchema,
  LastPerformanceResponseSchema,
  WorkoutSaveResponseSchema,
  type ExerciseHistoryEntry,
  type ExerciseHydrateVideoFields,
  type WorkoutSaveResponse,
} from "@become/api-client";
import { quickScope, shouldPromptForQuickSessionName } from "@become/core";
import {
  addIntoGroup,
  appendExercise,
  applyOrder,
  type GroupKind,
} from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { localDateKey } from "@/lib/time/localDay";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import type {
  LiveGrid,
  LiveWorkoutExercise,
  LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import {
  asyncStorageKeyValueStore,
  type KeyValueStore,
} from "@/lib/live/liveWorkoutCache";
import {
  clearQuickProgress,
  readQuickProgress,
  writeQuickProgress,
  type QuickProgressGrid,
} from "@/lib/quickSession/progress";
import {
  clearQuickSession,
  readQuickSession,
  updateQuickSession,
  type StoredQuickSession,
} from "@/lib/quickSession/store";
import { rebuildQuickSession } from "@/lib/quickSession/rebuild";
import { buildQuickSaveRequest } from "@/lib/quickSession/quickSave";
import {
  buildQuickHistory,
  quickHistorySlugs,
} from "@/lib/quickSession/quickHistory";

export { quickScope };

/** One exercise as the hydrate endpoint answers it: video fields only. */
export type QuickHydratedVideo = ExerciseHydrateVideoFields;

/**
 * Merge hydrated video fields onto each exercise, BY INDEX — the web's
 * `mergeHydratedVideos` (`webapp/lib/quickSession/hydrateVideos.ts` l.36-57),
 * verbatim: only fill a field the exercise doesn't already carry.
 */
export function mergeHydratedVideos<T extends QuickHydratedVideoFields>(
  exercises: T[],
  hydrated: QuickHydratedVideo[],
): T[] {
  return exercises.map((ex, i) => {
    const h = hydrated[i];
    if (!h) return ex;
    return {
      ...ex,
      ...(ex.videoUrl == null && h.videoUrl ? { videoUrl: h.videoUrl } : {}),
      ...(ex.thumbnailUrl == null && h.thumbnailUrl
        ? { thumbnailUrl: h.thumbnailUrl }
        : {}),
      ...(ex.videoWidth == null && h.videoWidth != null
        ? { videoWidth: h.videoWidth }
        : {}),
      ...(ex.videoHeight == null && h.videoHeight != null
        ? { videoHeight: h.videoHeight }
        : {}),
      ...(ex.videoFraming == null && h.videoFraming
        ? { videoFraming: h.videoFraming }
        : {}),
      ...(ex.videoTrim == null && h.videoTrim
        ? { videoTrim: h.videoTrim }
        : {}),
    };
  });
}

interface QuickHydratedVideoFields {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: LiveWorkoutExercise["videoFraming"];
  videoTrim?: LiveWorkoutExercise["videoTrim"];
}

export interface UseQuickLiveWorkoutOptions {
  /** DI for tests — defaults to the AsyncStorage-backed store. */
  store?: KeyValueStore;
  /** Fetch implementation override for tests. */
  fetchImpl?: typeof fetch;
  /** Debounce for the grid-change autosave (defaults to 1500ms). */
  autoSaveDelayMs?: number;
  /** Clock injection point for tests. */
  getNow?: () => Date;
  /** Origin day key override for tests (YYYY-MM-DD). */
  initialOriginKey?: string;
}

export interface UseQuickLiveWorkoutResult {
  loading: boolean;
  error: Error | null;
  saveError: Error | null;
  workout: LiveWorkoutViewModel | null;
  stored: StoredQuickSession | null;
  needsName: boolean;
  restoredGrid: LiveGrid | null;
  /**
   * Last-time numbers keyed by exercise NAME (`quickHistory.ts`) — the
   * `exerciseHistory` prop `LiveWorkoutClient` and `WorkoutSummary` already
   * take. Best-effort: `{}` when the fetch fails or nothing is recorded.
   * References only, never prefill.
   */
  exerciseHistory: Record<string, ExerciseHistoryEntry>;
  finishing: boolean;
  finishedGrid: LiveGrid | null;
  /**
   * The title the finished save actually went out under — captured at the
   * moment of `finishWithTitle`, because `stored` (and its `.title`) is
   * cleared right after a successful finish. `WorkoutSummary` reading
   * `stored?.title` once it is gone is exactly what showed the session's OLD
   * title twice (`Core Session — Core Session`) after renaming it to
   * `FP test core` on the way out.
   */
  finishedTitle: string | null;
  finishedElapsedSeconds: number;
  activeSeconds: number;
  originKey: string;
  onGridChange: (grid: LiveGrid) => void;
  onFinish: (grid: LiveGrid) => void;
  /** Finish under this title with `needsName: false` (prompt Confirm/Skip). */
  finishWithTitle: (title: string) => Promise<boolean>;
  reload: () => void;
  /**
   * Reshape the session mid-workout (NP-138, build as you go): the new
   * exercise list plus the `order` permutation through the shared rules.
   * The grid, the stash, the progress snapshot and the server save all
   * follow at once — the same "saved at once" the web's `applyWorkoutChange`
   * gives — so an added exercise survives a resume on either client.
   */
  applyExerciseChange: (input: {
    exercises: LiveWorkoutExercise[];
    order: number[];
  }) => void;
  /**
   * Add an exercise mid-session: `placement: 'end'` appends it,
   * `placement: 'group'` slides it into the group at `anchorIndex` (or
   * starts a superset of the two when the anchor has none) — the web's
   * `handleAddExercise` in `LiveWorkoutClient`.
   */
  addExercise: (input: {
    exercise: LiveWorkoutExercise;
    placement: "end" | "group";
    groupKind?: GroupKind;
    anchorIndex?: number;
  }) => void;
}

function parseRestSeconds(rest: string | null | undefined): number {
  if (!rest) return 60;
  const match = rest.match(/(\d+)/);
  if (!match) return 60;
  const num = parseInt(match[1]!, 10);
  if (rest.includes("min")) return num * 60;
  return num;
}

function draftToLiveExercise(d: {
  exerciseSlug: string;
  name: string;
  trackingType: string;
  sets: number;
  reps: string;
  rest?: string;
  duration?: string;
  primaryMuscles?: string[];
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
  addedAdHoc?: boolean;
}): LiveWorkoutExercise {
  return {
    slug: d.exerciseSlug,
    name: d.name,
    sets: Math.max(1, d.sets ?? 1),
    ...(d.reps ? { repsLabel: d.reps } : {}),
    trackingType: d.trackingType,
    ...(d.equipment ? { equipment: d.equipment } : {}),
    ...(d.laterality ? { laterality: d.laterality } : {}),
    ...(d.movementPatterns ? { movementPatterns: d.movementPatterns } : {}),
    ...(d.groupId ? { groupId: d.groupId } : {}),
    ...(d.groupType ? { groupType: d.groupType } : {}),
    ...(d.groupLabel ? { groupLabel: d.groupLabel } : {}),
    ...(d.groupRest ? { groupRest: d.groupRest } : {}),
    ...(d.groupRounds ? { groupRounds: d.groupRounds } : {}),
    ...(d.rest ? { restSec: parseRestSeconds(d.rest) } : {}),
    // A timed prescription travels as `duration` (the web's `prescriptionOf`
    // reads `ex.duration`); without it a resumed plank comes back untimed.
    ...(d.duration ? { durationLabel: d.duration } : {}),
    ...(d.addedAdHoc ? { addedAdHoc: true } : {}),
  };
}

function progressToLiveGrid(
  exercises: LiveWorkoutExercise[],
  progress: QuickProgressGrid | null,
): LiveGrid | null {
  if (!progress) return null;
  const grid: LiveGrid = {};
  for (const ex of exercises) {
    const saved = progress[ex.slug];
    if (!saved) continue;
    grid[ex.slug] = saved.map((s) => ({
      reps: s.reps,
      weight: s.weight,
      completed: s.completed,
      ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
      ...(s.distance !== undefined ? { distance: s.distance } : {}),
    }));
  }
  return grid;
}

function liveGridToProgress(grid: LiveGrid): QuickProgressGrid {
  const out: QuickProgressGrid = {};
  for (const [slug, sets] of Object.entries(grid)) {
    out[slug] = sets.map((s: LiveSetState) => ({
      reps: s.reps,
      weight: s.weight,
      completed: s.completed,
      ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
      ...(s.distance !== undefined ? { distance: s.distance } : {}),
    }));
  }
  return out;
}

export function useQuickLiveWorkout(
  sessionId: string,
  options: UseQuickLiveWorkoutOptions = {},
): UseQuickLiveWorkoutResult {
  const {
    store = asyncStorageKeyValueStore,
    fetchImpl,
    autoSaveDelayMs = 1500,
    getNow = () => new Date(),
    initialOriginKey,
  } = options;
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [workout, setWorkout] = useState<LiveWorkoutViewModel | null>(null);
  const [stored, setStored] = useState<StoredQuickSession | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [restoredGrid, setRestoredGrid] = useState<LiveGrid | null>(null);  const [exerciseHistory, setExerciseHistory] = useState<
    Record<string, ExerciseHistoryEntry>
  >({});
  const [finishing, setFinishing] = useState(false);
  const [finishedGrid, setFinishedGrid] = useState<LiveGrid | null>(null);
  const [finishedTitle, setFinishedTitle] = useState<string | null>(null);
  const [finishedElapsedSeconds, setFinishedElapsedSeconds] = useState(0);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [originKey] = useState(
    () => initialOriginKey ?? localDateKey(getNow()),
  );
  const [reloadToken, setReloadToken] = useState(0);

  // The wall-clock start of this run — a ref seeded lazily (never during
  // render: `Date.now` is impure) and reset when the load effect runs.
  const sessionStartRef = useRef<number | null>(null);
  const activeBaselineRef = useRef<number>(0);
  const storedRef = useRef<StoredQuickSession | null>(null);
  const exercisesRef = useRef<LiveWorkoutExercise[]>([]);
  const gridRef = useRef<LiveGrid>({});
  const openedSaveSentRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const activeSecondsNow = useCallback(() => {
    const start = sessionStartRef.current ?? Date.now();
    return (
      activeBaselineRef.current +
      Math.max(0, Math.floor((Date.now() - start) / 1000))
    );
  }, []);

  const postSave = useCallback(
    async (
      grid: LiveGrid,
      completed: boolean,
      titleOverride?: string,
    ): Promise<WorkoutSaveResponse | null> => {
      const current = storedRef.current;
      const exercises = exercisesRef.current;
      if (!current || !sessionId) return null;
      const title = titleOverride ?? current.title;
      const active = activeSecondsNow();
      const body = buildQuickSaveRequest({
        sessionId,
        title,
        needsName: current.needsName ?? false,
        ...(current.focus ? { focus: current.focus } : {}),
        ...(current.favorite ? { favorite: true } : {}),
        exercises,
        grid,
        completed,
        activeSeconds: active,
        tz: new Date().getTimezoneOffset(),
        tzZone: (() => {
          try {
            return (
              Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
            );
          } catch {
            return undefined;
          }
        })(),
      });
      const impl = fetchImpl ?? fetch;
      const res = await impl(`${WEBAPP_BASE_URL}/api/workouts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Could not save the workout (${res.status})`);
      }
      const parsed = WorkoutSaveResponseSchema.safeParse(await res.json());
      if (!parsed.success) return null;
      return parsed.data;
    },
    [activeSecondsNow, fetchImpl, sessionId, token],
  );

  // Load the stash (missing or empty -> rebuild from the server log), merge
  // demo video fields by index, restore the grid from progress, then save
  // once so the session is in progress server-side within seconds.
  useEffect(() => {
    if (!sessionId) {
      // The session id arrives from the route param — outside React — so the
      // missing-param state lands in an effect with the one-line reason.
      /* eslint-disable react-hooks/set-state-in-effect */
      setLoading(false);
      setError(new Error("Missing session"));
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let alive = true;
    openedSaveSentRef.current = false;
    sessionStartRef.current = Date.now();
    activeBaselineRef.current = 0;
    setFinishedGrid(null);
    setFinishedTitle(null);
    setSaveError(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        let current = await readQuickSession(sessionId, store);
        if (!current?.exercises?.length) {
          const rebuilt = await rebuildQuickSession(sessionId, {
            store,
            baseUrl: WEBAPP_BASE_URL,
            ...(token ? { getToken: () => token } : {}),
            ...(fetchImpl ? { fetchImpl } : {}),
          });
          if (rebuilt) current = rebuilt;
        }
        if (!alive) return;
        if (!current?.exercises?.length) {
          setStored(null);
          setWorkout(null);
          setRestoredGrid(null);
          setExerciseHistory({});
          setNeedsName(false);
          setLoading(false);
          return;
        }
        storedRef.current = current;
        setStored(current);
        setNeedsName(shouldPromptForQuickSessionName(current));

        let live = (current.exercises ?? []).map(draftToLiveExercise);
        exercisesRef.current = live;

        // Programs get video fields denormalized server-side; a quick
        // session has no program to hydrate through, so resolve by slug here
        // (best-effort — a failure keeps the exercises as they are).
        try {
          const impl = fetchImpl ?? fetch;
          const res = await impl(`${WEBAPP_BASE_URL}/api/exercises/hydrate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              exercises: live.map((ex) => ({
                ...(ex.slug ? { exerciseSlug: ex.slug } : {}),
                name: ex.name,
              })),
            }),
          });
          if (res.ok) {
            const parsed = ExerciseHydrateResponseSchema.safeParse(
              await res.json(),
            );
            if (parsed.success && alive) {
              live = mergeHydratedVideos(live, parsed.data.exercises);
              exercisesRef.current = live;
            }
          }
        } catch {
          /* best-effort — the by-name fallback covers the videos */
        }
        if (!alive) return;

        const progress = await readQuickProgress(sessionId, store);
        if (!alive) return;
        const restored = progressToLiveGrid(live, progress?.grid ?? null);
        gridRef.current = restored ?? {};
        setRestoredGrid(restored);

        const title = current.title || "Quick Session";
        setWorkout({
          programId: "quick",
          workoutTitle: title,
          exercises: live,
        });
        setLoading(false);

        // Last-time numbers (slug-based — works without a program), keyed by
        // NAME for `LiveWorkoutClient` and `WorkoutSummary` (quickHistory.ts).
        // Best-effort: a failure leaves the map empty and the references
        // simply don't show. Inputs stay blank — this is never prefill.
        try {
          const slugs = quickHistorySlugs(live);
          if (slugs.length > 0) {
            const impl = fetchImpl ?? fetch;
            const res = await impl(
              `${WEBAPP_BASE_URL}/api/workouts/last-performance?slugs=${encodeURIComponent(slugs.join(","))}`,
              {
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              },
            );
            if (res.ok && alive) {
              const parsed = LastPerformanceResponseSchema.safeParse(
                await res.json(),
              );
              if (parsed.success) {
                setExerciseHistory(
                  buildQuickHistory(live, parsed.data.performances),
                );
              }
            }
          }
        } catch {
          /* best-effort — the Last/PR references just won't show */
        }

        // The opening save: the session is in progress server-side within
        // seconds of this screen opening, even before any set is logged.
        try {
          await postSave(gridRef.current, false);
          if (alive) {
            openedSaveSentRef.current = true;
            setActiveSeconds(activeSecondsNow());
          }
        } catch (cause) {
          if (alive) {
            setSaveError(
              cause instanceof Error
                ? cause
                : new Error("Could not save the workout"),
            );
          }
        }
      } catch (cause) {
        if (!alive) return;
        setError(
          cause instanceof Error ? cause : new Error("Could not load workout"),
        );
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
    // The load runs once per session (and per explicit reload); the save it
    // fires uses refs so a token resolving after mount still sends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reloadToken]);

  const onGridChange = useCallback(
    (grid: LiveGrid) => {
      gridRef.current = grid;
      void writeQuickProgress(sessionId, liveGridToProgress(grid), store);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            await postSave(gridRef.current, false);
            if (mountedRef.current) {
              openedSaveSentRef.current = true;
              setActiveSeconds(activeSecondsNow());
              setSaveError(null);
            }
          } catch (cause) {
            if (mountedRef.current) {
              setSaveError(
                cause instanceof Error
                  ? cause
                  : new Error("Could not save the workout"),
              );
            }
          }
        })();
      }, autoSaveDelayMs);
    },
    [activeSecondsNow, autoSaveDelayMs, postSave, sessionId, store],
  );

  const finishWithTitle = useCallback(
    async (title: string): Promise<boolean> => {
      const grid = gridRef.current;
      if (!storedRef.current || !sessionId) return false;
      setFinishing(true);
      setSaveError(null);
      try {
        const active = activeSecondsNow();
        await postSave(grid, true, title);
        await updateQuickSession(sessionId, { title }, store);
        await clearQuickProgress(sessionId, store);
        await clearQuickSession(sessionId, store);
        storedRef.current = null;
        setStored(null);
        setNeedsName(false);
        setFinishedGrid(grid);
        setFinishedTitle(title);
        setFinishedElapsedSeconds(active);
        setActiveSeconds(active);
        setFinishing(false);
        return true;
      } catch (cause) {
        setSaveError(
          cause instanceof Error
            ? cause
            : new Error("Could not finish the workout"),
        );
        setFinishing(false);
        return false;
      }
    },
    [activeSecondsNow, postSave, sessionId, store],
  );

  const onFinish = useCallback(
    (grid: LiveGrid) => {
      gridRef.current = grid;
      void writeQuickProgress(sessionId, liveGridToProgress(grid), store);
      // The route decides: when the session still needs a name it opens
      // `QuickSessionNamePrompt`; otherwise it finishes directly.
      if (shouldPromptForQuickSessionName(storedRef.current)) return;
      void finishWithTitle(storedRef.current?.title || "Quick Session");
    },
    [finishWithTitle, sessionId, store],
  );

  const reload = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  /**
   * Persist a reshaped session everywhere it lives: the stash (the shape the
   * overview and the live view both read), the progress snapshot (keyed by
   * slug, so it is rebuilt from the permuted grid rather than kept), and the
   * server (an incomplete `kind: 'quick'` save, so today's calendar and the
   * sessions list show what is actually being trained). The web's
   * `applyWorkoutChange` does the same three writes.
   */
  const persistReshape = useCallback(
    (nextExercises: LiveWorkoutExercise[], nextGrid: LiveGrid) => {
      exercisesRef.current = nextExercises;
      gridRef.current = nextGrid;
      setWorkout((w) => (w ? { ...w, exercises: nextExercises } : w));
      setRestoredGrid(nextGrid);
      const draft = nextExercises.map((ex) => ({
        exerciseSlug: ex.slug,
        name: ex.name,
        trackingType: ex.trackingType ?? "reps_weight",
        sets: ex.sets,
        reps: ex.repsLabel ?? "",
        ...(ex.restSec != null ? { rest: `${ex.restSec}s` } : {}),
        ...(ex.durationLabel ? { duration: ex.durationLabel } : {}),
        ...(ex.equipment ? { equipment: ex.equipment } : {}),
        ...(ex.laterality ? { laterality: ex.laterality } : {}),
        ...(ex.movementPatterns ? { movementPatterns: ex.movementPatterns } : {}),
        ...(ex.groupId ? { groupId: ex.groupId } : {}),
        ...(ex.groupType ? { groupType: ex.groupType } : {}),
        ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
        ...(ex.groupRest ? { groupRest: ex.groupRest } : {}),
        ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
        ...(ex.addedAdHoc ? { addedAdHoc: true as const } : {}),
      }));
      void updateQuickSession(sessionId, { exercises: draft }, store).then(
        (next) => {
          if (next) {
            storedRef.current = next;
            setStored(next);
          }
        },
      );
      void writeQuickProgress(sessionId, liveGridToProgress(nextGrid), store);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            await postSave(gridRef.current, false);
            if (mountedRef.current) setSaveError(null);
          } catch (cause) {
            if (mountedRef.current) {
              setSaveError(
                cause instanceof Error
                  ? cause
                  : new Error("Could not save the workout"),
              );
            }
          }
        })();
      }, autoSaveDelayMs);
    },
    [autoSaveDelayMs, postSave, sessionId, store],
  );

  const applyExerciseChange = useCallback(
    (input: { exercises: LiveWorkoutExercise[]; order: number[] }) => {
      const prev = exercisesRef.current;
      const rows = prev.map((ex) => gridRef.current[ex.slug] ?? []);
      const nextRows = applyOrder<LiveSetState[]>(
        rows,
        input.order,
        (newIdx) => {
          const next = input.exercises[newIdx];
          return Array.from(
            { length: Math.max(1, next?.sets || 1) },
            (): LiveSetState => ({ reps: null, weight: null, completed: false }),
          );
        },
      );
      const nextGrid: LiveGrid = {};
      input.exercises.forEach((ex, i) => {
        nextGrid[ex.slug] = nextRows[i] ?? [];
      });
      persistReshape(input.exercises, nextGrid);
    },
    [persistReshape],
  );

  const addExercise = useCallback(
    (input: {
      exercise: LiveWorkoutExercise;
      placement: "end" | "group";
      groupKind?: GroupKind;
      anchorIndex?: number;
    }) => {
      const list = exercisesRef.current;
      const fresh: LiveWorkoutExercise = {
        ...input.exercise,
        addedAdHoc: true,
      };
      const anchor = input.anchorIndex ?? list.length - 1;
      const res =
        input.placement === "group" && list[anchor]
          ? addIntoGroup(list, anchor, fresh, input.groupKind ?? "superset")
          : appendExercise(list, fresh);
      const rows = list.map((ex) => gridRef.current[ex.slug] ?? []);
      const nextRows = applyOrder<LiveSetState[]>(
        rows,
        res.order,
        (newIdx) => {
          const next = res.exercises[newIdx];
          return Array.from(
            { length: Math.max(1, next?.sets || 1) },
            (): LiveSetState => ({ reps: null, weight: null, completed: false }),
          );
        },
      );
      const nextGrid: LiveGrid = {};
      res.exercises.forEach((ex, i) => {
        nextGrid[ex.slug] = nextRows[i] ?? [];
      });
      persistReshape(res.exercises, nextGrid);
    },
    [persistReshape],
  );

  return {
    loading,
    error,
    saveError,
    workout,
    stored,
    needsName,
    restoredGrid,
    exerciseHistory,
    finishing,
    finishedGrid,
    finishedTitle,
    finishedElapsedSeconds,
    activeSeconds,
    originKey,
    onGridChange,
    onFinish,
    finishWithTitle,
    reload,
    applyExerciseChange,
    addExercise,
  };
}
