import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch,
  CurrentWorkoutResponseSchema,
  ProgramDetailResponseSchema,
  WorkoutResumeResponseSchema,
  LastPerformanceResponseSchema,
  WorkoutSaveResponseSchema,
  ExerciseAlternativesResponseSchema,
  type CurrentWorkoutResponse,
  type WorkoutResumeResponse,
  type WorkoutSaveResponse,
  type NewPR,
  type AlternativeCandidate,
  type ExerciseHistoryEntry,
  type ExercisePRSummary,
  type StaleIncompleteWorkout,
} from "@become/api-client";
import {
  normalizeTracking,
  tracksTime,
  mergeAdHocFromLog,
  type WorkoutExercise,
} from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  buildWorkoutSaveRequest,
  newWorkoutAttemptId,
} from "@/lib/live/workoutSave";
import {
  createLiveWorkoutCache,
  liveCacheKey,
  type KeyValueStore,
  type LiveWorkoutSnapshot,
} from "@/lib/live/liveWorkoutCache";
import { mirrorWorkoutToHealth, workoutClientId } from "@/lib/health/sync";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import type {
  LiveGrid,
  LiveWorkoutExercise,
  LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

export interface UseLiveWorkoutOptions {
  /** DI for tests — defaults to SecureStore-backed cache. */
  cacheStore?: KeyValueStore;
  /** Fallback phase index if not specified (0-based). */
  initialPhase?: number;
  /** Fallback workout index if day label not specified (0-based). */
  fallbackWorkoutIndex?: number;
}

export interface UseLiveWorkoutResult {
  loading: boolean;
  error: Error | null;
  workout: LiveWorkoutViewModel | null;
  phase: number;
  day: string;
  grid: LiveGrid;
  restoredGrid: LiveGrid | null;
  activeSeconds: number;
  isResuming: boolean;
  exerciseHistory: Record<string, ExerciseHistoryEntry>;
  exercisePRs: Record<string, ExercisePRSummary>;
  staleIncomplete: StaleIncompleteWorkout | null;
  swappedExercises: Record<number, { originalSlug: string; originalName: string }>;
  swaps: Record<string, string>;
  finishing: boolean;
  newPRs: NewPR[];
  attemptId: string;
  onGridChange: (grid: LiveGrid) => void;
  onSetComplete: (input: {
    exerciseSlug: string;
    setIndex: number;
    state: LiveSetState;
  }) => void;
  onRequestSwap: (slug: string) => void;
  swapSlug: string | null;
  swapSourceName: string | undefined;
  alternatives: {
    data: { alternatives?: AlternativeCandidate[] } | null;
    loading: boolean;
  };
  onSelectAlternative: (candidate: AlternativeCandidate) => void;
  setSwapSlug: (slug: string | null) => void;
  save: (
    isComplete: boolean,
    gridOverride?: LiveGrid,
  ) => Promise<WorkoutSaveResponse | null>;
  onFinish: (grid?: LiveGrid) => Promise<WorkoutSaveResponse | null>;
  logDateOverrideRef: React.MutableRefObject<string | null>;
  reload: () => Promise<void>;
}

export function useLiveWorkout(
  programId: string,
  day?: string | null,
  sd?: string | null,
  options?: UseLiveWorkoutOptions,
): UseLiveWorkoutResult {
  const { token } = useAuth();
  const cacheStore = options?.cacheStore;
  const initialPhase = options?.initialPhase;
  const fallbackWorkoutIndex = options?.fallbackWorkoutIndex;
  const cache = useMemo(() => createLiveWorkoutCache(cacheStore), [cacheStore]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [workout, setWorkout] = useState<LiveWorkoutViewModel | null>(null);
  const [phase, setPhase] = useState<number>(
    () => (options?.initialPhase ?? 0) + 1,
  );
  const [resolvedDay, setResolvedDay] = useState<string>(() => day || "Day 1");
  const [restoredGrid, setRestoredGrid] = useState<LiveGrid | null>(null);
  const [grid, setGrid] = useState<LiveGrid>({});
  const gridRef = useRef<LiveGrid>({});

  const [isResuming, setIsResuming] = useState(false);
  const [activeSecondsBaseline, setActiveSecondsBaseline] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(() => Date.now());
  const [activeSeconds, setActiveSeconds] = useState(0);

  const [exerciseHistory, setExerciseHistory] = useState<
    Record<string, ExerciseHistoryEntry>
  >({});
  const [exercisePRs, setExercisePRs] = useState<
    Record<string, ExercisePRSummary>
  >({});
  const [staleIncomplete, setStaleIncomplete] =
    useState<StaleIncompleteWorkout | null>(null);

  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [swappedExercises, setSwappedExercises] = useState<
    Record<number, { originalSlug: string; originalName: string }>
  >({});

  const [finishing, setFinishing] = useState(false);
  const savingRef = useRef(false);
  const [newPRs, setNewPRs] = useState<NewPR[]>([]);
  const [attemptId] = useState(newWorkoutAttemptId);
  const [startedAtISO] = useState(() => new Date().toISOString());
  const logDateOverrideRef = useRef<string | null>(null);

  // Timer tracking on the wall clock (baseline + elapsed)
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      setActiveSeconds(activeSecondsBaseline + Math.max(0, elapsed));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeSecondsBaseline, sessionStartTime]);

  const cacheWorkoutIndex =
    fallbackWorkoutIndex !== undefined && fallbackWorkoutIndex >= 0
      ? fallbackWorkoutIndex
      : resolvedDay;
  const cacheKey = liveCacheKey(programId, cacheWorkoutIndex, phase - 1);

  const onGridChange = useCallback(
    (nextGrid: LiveGrid) => {
      gridRef.current = nextGrid;
      setGrid(nextGrid);
      void cache.save(cacheKey, nextGrid as LiveWorkoutSnapshot);
    },
    [cache, cacheKey],
  );

  const onSetComplete = useCallback(
    (_input: { exerciseSlug: string; setIndex: number; state: LiveSetState }) => {
      // Set completed; rest timer triggers in LiveWorkoutClient
    },
    [],
  );

  // Exercise Swap logic
  const [swapSlug, setSwapSlug] = useState<string | null>(null);
  const alternatives = useFetch(
    swapSlug
      ? `/api/exercises/alternatives?slug=${encodeURIComponent(swapSlug)}`
      : null,
    ExerciseAlternativesResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const swapSourceName = useMemo(() => {
    return workout?.exercises.find((e) => e.slug === swapSlug)?.name;
  }, [workout, swapSlug]);

  const onRequestSwap = useCallback((slug: string) => {
    setSwapSlug(slug);
  }, []);

  const onSelectAlternative = useCallback(
    (candidate: AlternativeCandidate) => {
      if (!swapSlug || !workout) return;
      const exIdx = workout.exercises.findIndex((e) => e.slug === swapSlug);
      if (exIdx === -1) return;
      const oldEx = workout.exercises[exIdx];
      if (!oldEx) return;

      const origSlug =
        swappedExercises[exIdx]?.originalSlug ||
        oldEx.originalExerciseSlug ||
        oldEx.slug;
      const origName =
        swappedExercises[exIdx]?.originalName ||
        oldEx.swappedFromName ||
        oldEx.name;

      const newExercises = [...workout.exercises];
      newExercises[exIdx] = {
        ...oldEx,
        name: candidate.name,
        slug: candidate.slug,
        sets: oldEx.sets,
        originalExerciseSlug: origSlug,
        swappedFromName: origName,
      };

      setSwappedExercises((prev) => ({
        ...prev,
        [exIdx]: { originalSlug: origSlug, originalName: origName },
      }));
      setSwaps((prev) => ({
        ...prev,
        [oldEx.slug]: candidate.name,
        [candidate.slug]: candidate.name,
      }));
      setWorkout({
        ...workout,
        exercises: newExercises,
      });

      // Move sets in grid from old slug to new slug
      if (oldEx.slug !== candidate.slug) {
        const curSets = gridRef.current[oldEx.slug] ?? [];
        const nextGrid = { ...gridRef.current, [candidate.slug]: curSets };
        delete nextGrid[oldEx.slug];
        gridRef.current = nextGrid;
        setGrid(nextGrid);
        void cache.save(cacheKey, nextGrid as LiveWorkoutSnapshot);
      }

      setSwapSlug(null);
    },
    [swapSlug, workout, swappedExercises, cache, cacheKey],
  );

  // Main data loader
  const load = useCallback(async () => {
    if (!programId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      let loadedWorkout: {
        title: string;
        day: string;
        exercises: any[];
      } | null = null;
      let loadedPhase = (initialPhase ?? 0) + 1;

      // 1. Load workout: attempt current-workout (applies permanent swaps & schedule resolution)
      try {
        const cwPath = `/api/programs/current-workout?programId=${encodeURIComponent(programId)}${day ? `&day=${encodeURIComponent(day)}` : ""}`;
        const cwData = (await apiFetch(cwPath, CurrentWorkoutResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        })) as CurrentWorkoutResponse;

        if (cwData?.workout) {
          loadedWorkout = {
            title: cwData.workout.title ?? "Training",
            day: cwData.day || cwData.workout.day || day || "Day 1",
            exercises: cwData.workout.exercises ?? [],
          };
          if (cwData.phase) loadedPhase = cwData.phase;
        } else {
          throw new Error("No current workout for program");
        }
      } catch {
        // 404 / error when not enrolled: fallback to GET /api/programs/[programId] preview
        try {
          const progPath = `/api/programs/${encodeURIComponent(programId)}`;
          const progData = await apiFetch(
            progPath,
            ProgramDetailResponseSchema,
            {
              baseUrl: WEBAPP_BASE_URL,
              getToken: () => token ?? undefined,
            },
          );

          const phases = progData?.phases || [];
          let foundWorkout: any = null;
          let foundPhaseIdx = initialPhase ?? 0;

          if (day) {
            for (let pi = 0; pi < phases.length; pi++) {
              const ph = phases[pi];
              const workoutsArr = Array.isArray(ph?.workouts)
                ? ph.workouts
                : Object.values(ph?.workouts ?? {});
              const match = workoutsArr.find((w: any) => w?.day === day);
              if (match) {
                foundWorkout = match;
                foundPhaseIdx = pi;
                break;
              }
            }
          }

          if (!foundWorkout) {
            const ph = phases[foundPhaseIdx] || phases[0];
            const workoutsArr = Array.isArray(ph?.workouts)
              ? ph.workouts
              : Object.values(ph?.workouts ?? {});
            const wIdx = fallbackWorkoutIndex ?? 0;
            foundWorkout = workoutsArr[wIdx] || workoutsArr[0];
          }

          if (foundWorkout) {
            loadedWorkout = {
              title: foundWorkout.title ?? "Training",
              day: foundWorkout.day || day || "Day 1",
              exercises: foundWorkout.exercises ?? [],
            };
            loadedPhase = foundPhaseIdx + 1;
          }
        } catch (previewErr) {
          console.error("Error previewing program:", previewErr);
        }
      }

      if (!loadedWorkout) {
        setLoading(false);
        return;
      }

      const activeDay = loadedWorkout.day;
      setResolvedDay(activeDay);
      setPhase(loadedPhase);

      // Hydrate into LiveWorkoutExercise shape
      let currentExercises: LiveWorkoutExercise[] = loadedWorkout.exercises.map(
        (ex: any, i: number) => {
          const slug = ex.exerciseSlug ?? `exercise-${i}`;
          return {
            slug,
            name: ex.name ?? ex.exerciseSlug ?? "Exercise",
            sets: ex.sets ?? 1,
            repsLabel: ex.reps,
            notes: ex.details,
            trackingType: ex.trackingType ?? undefined,
            equipment: ex.equipment,
            laterality: ex.laterality,
            movementPatterns: ex.movementPatterns,
            groupId: ex.groupId,
            groupLabel: ex.groupLabel ?? ex.groupType,
            groupType: ex.groupType,
            groupRounds: ex.groupRounds,
            restSec: ex.rest ? parseInt(ex.rest, 10) || 90 : 90,
          };
        },
      );

      // 2. Fetch all-time PRs for exercises
      const slugs = Array.from(
        new Set(
          currentExercises
            .map((ex) =>
              (ex.slug || "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, ""),
            )
            .filter(Boolean),
        ),
      );
      if (slugs.length > 0) {
        try {
          const perfRes = await apiFetch(
            `/api/workouts/last-performance?slugs=${encodeURIComponent(slugs.join(","))}`,
            LastPerformanceResponseSchema,
            { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
          );
          if (perfRes?.prs) {
            setExercisePRs(perfRes.prs);
          }
        } catch {
          // non-blocking
        }
      }

      // 3. Fetch resume progress and history from GET /api/workouts
      let isResumed = false;
      let resumeHistory: Record<string, ExerciseHistoryEntry> = {};
      const currentCacheKey = liveCacheKey(
        programId,
        cacheWorkoutIndex,
        loadedPhase - 1,
      );
      try {
        const resumeRes = (await apiFetch(
          `/api/workouts?programId=${encodeURIComponent(programId)}&day=${encodeURIComponent(activeDay)}&includeHistory=true&tz=${new Date().getTimezoneOffset()}`,
          WorkoutResumeResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        )) as WorkoutResumeResponse;

        if (resumeRes?.exerciseHistory) {
          resumeHistory = resumeRes.exerciseHistory;
          setExerciseHistory(resumeRes.exerciseHistory);
        }
        if (resumeRes?.exercisePRs) {
          setExercisePRs((prev) => ({ ...prev, ...resumeRes.exercisePRs }));
        }
        if (resumeRes?.staleIncomplete && !resumeRes.isResume) {
          setStaleIncomplete(resumeRes.staleIncomplete);
        } else {
          setStaleIncomplete(null);
        }

        if (resumeRes?.workout && resumeRes.isResume) {
          isResumed = true;
          setIsResuming(true);
          const savedWorkout = resumeRes.workout;

          if (
            typeof savedWorkout.activeSeconds === "number" &&
            savedWorkout.activeSeconds > 0
          ) {
            setActiveSecondsBaseline(savedWorkout.activeSeconds);
            setSessionStartTime(Date.now());
            setActiveSeconds(savedWorkout.activeSeconds);
          }

          // Restore ad-hoc exercises
          const coreExercises: WorkoutExercise[] = currentExercises.map((e) => ({
            name: e.name,
            exerciseSlug: e.slug,
            sets: e.sets,
            reps: e.repsLabel,
            details: e.notes,
            trackingType: e.trackingType ?? undefined,
          }));

          const merged = mergeAdHocFromLog(
            coreExercises,
            savedWorkout.exercises,
          );

          currentExercises = merged.map((m) => {
            const exSlug =
              m.exerciseSlug || (m as any).slug || `exercise-${m.name}`;
            const existing = currentExercises.find((e) => e.slug === exSlug);
            return {
              slug: exSlug,
              name: m.name,
              sets: m.sets ?? 1,
              repsLabel: m.reps ?? existing?.repsLabel,
              notes: m.details ?? existing?.notes,
              trackingType: m.trackingType ?? existing?.trackingType,
              equipment: existing?.equipment,
              laterality: existing?.laterality,
              movementPatterns: existing?.movementPatterns,
              groupId: (m as any).groupId ?? existing?.groupId,
              groupLabel: (m as any).groupLabel ?? existing?.groupLabel,
              groupType: (m as any).groupType ?? existing?.groupType,
              groupRounds: (m as any).groupRounds ?? existing?.groupRounds,
              restSec: existing?.restSec ?? 90,
              addedAdHoc: Boolean((m as any).addedAdHoc),
            };
          });

          // Restore swaps
          const restoredSwaps: Record<
            number,
            { originalSlug: string; originalName: string }
          > = {};
          const localSwaps: Record<string, string> = {};
          savedWorkout.exercises?.forEach((savedEx, idx) => {
            if (
              idx < currentExercises.length &&
              (savedEx.originalExerciseSlug || savedEx.swappedFromName)
            ) {
              const targetEx = currentExercises[idx];
              if (targetEx) {
                const origSlug =
                  savedEx.originalExerciseSlug || targetEx.slug;
                const origName =
                  savedEx.swappedFromName || targetEx.name;
                currentExercises[idx] = {
                  ...targetEx,
                  name: savedEx.name,
                  slug: savedEx.exerciseSlug || targetEx.slug,
                  sets: targetEx.sets,
                  originalExerciseSlug: origSlug,
                  swappedFromName: origName,
                };
                restoredSwaps[idx] = {
                  originalSlug: origSlug,
                  originalName: origName,
                };
                localSwaps[origSlug] = savedEx.name;
              }
            }
          });

          setSwappedExercises(restoredSwaps);
          setSwaps(localSwaps);

          // Restore set data
          const restored: LiveGrid = {};
          currentExercises.forEach((ex, exIdx) => {
            const savedEx = savedWorkout.exercises?.[exIdx];
            const isMatch =
              savedEx &&
              (savedEx.name === ex.name ||
                savedEx.originalExerciseSlug ||
                savedEx.swappedFromName);
            const t = normalizeTracking(ex.trackingType);
            const timed = tracksTime(t);
            if (isMatch && savedEx?.sets) {
              restored[ex.slug] = savedEx.sets.map((s) => ({
                reps: timed ? null : (s.reps && s.reps > 0 ? s.reps : null),
                weight:
                  timed ? null : (s.weight && s.weight > 0 ? s.weight : null),
                durationSec:
                  timed && s.duration && s.duration > 0 ? s.duration : null,
                distance:
                  t === "time_distance" && s.distance && s.distance > 0
                    ? s.distance
                    : null,
                completed: Boolean(s.completed),
              }));
            } else {
              restored[ex.slug] = Array.from({ length: ex.sets || 1 }, () => ({
                reps: null,
                weight: null,
                durationSec: null,
                distance: null,
                completed: false,
              }));
            }
          });

          setRestoredGrid(restored);
          gridRef.current = restored;
          setGrid(restored);
        }
      } catch {
        // Resume check failed; continue to cache check
      }

      if (!isResumed) {
        // Check local SecureStore cache for in-flight progress
        const cachedSnap = await cache.load(currentCacheKey);
        if (cachedSnap) {
          setRestoredGrid(cachedSnap as LiveGrid);
          gridRef.current = cachedSnap as LiveGrid;
          setGrid(cachedSnap as LiveGrid);
        } else {
          // Fresh workout: start blank sets (last performance is reference only)
          const blankGrid: LiveGrid = {};
          currentExercises.forEach((ex) => {
            blankGrid[ex.slug] = Array.from({ length: ex.sets || 1 }, () => ({
              reps: null,
              weight: null,
              durationSec: null,
              distance: null,
              completed: false,
            }));
          });
          gridRef.current = blankGrid;
          setGrid(blankGrid);
        }
      }

      // Populate prefill reference on exercises from exerciseHistory
      const currentHistory = resumeHistory;
      const exercisesWithPrefill = currentExercises.map((ex) => {
        const hist = currentHistory[ex.name];
        if (hist) {
          return {
            ...ex,
            prefill: Array.from({ length: ex.sets }, () => ({
              weight: hist.weight ?? null,
              reps: hist.reps ?? null,
              durationSec: hist.duration ?? null,
              completed: false,
            })),
          };
        }
        return ex;
      });

      setWorkout({
        programId,
        workoutTitle: loadedWorkout.title,
        exercises: exercisesWithPrefill,
      });
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [
    programId,
    day,
    initialPhase,
    fallbackWorkoutIndex,
    cacheWorkoutIndex,
    token,
    cache,
  ]);

  useEffect(() => {
    // Syncs workout data from network and cache when programId or day change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Save implementation with re-entrant lock
  const save = useCallback(
    async (
      isComplete: boolean,
      gridOverride?: LiveGrid,
    ): Promise<WorkoutSaveResponse | null> => {
      if (!workout) return null;
      // Re-entrant guard: prevent double-tap / concurrent saves
      if (savingRef.current) return null;
      savingRef.current = true;
      setFinishing(true);

      try {
        const currentGrid = gridOverride ?? gridRef.current;
        const activeSecondsAtSave =
          activeSecondsBaseline +
          Math.floor((Date.now() - sessionStartTime) / 1000);
        const logDateOverride = isComplete ? logDateOverrideRef.current : null;

        const request = buildWorkoutSaveRequest({
          programId: workout.programId,
          phase,
          day: resolvedDay,
          exercises: workout.exercises,
          grid: currentGrid,
          completed: isComplete,
          activeSeconds: activeSecondsAtSave,
          attemptId,
          scheduledDate: sd || undefined,
          performedAt: logDateOverride || undefined,
          tz: new Date().getTimezoneOffset(),
          tzZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          swappedExercises,
        });

        const res = await apiFetch<WorkoutSaveResponse>(
          "/api/workouts",
          WorkoutSaveResponseSchema,
          {
            method: "POST",
            body: request,
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );

        if (isComplete) {
          if (logDateOverrideRef.current) logDateOverrideRef.current = null;
          invalidateMindSession();
          void cache.clear(cacheKey);
          setNewPRs(res.newPRsAchieved ?? []);

          void mirrorWorkoutToHealth({
            title: workout.workoutTitle,
            startISO: startedAtISO,
            endISO: new Date().toISOString(),
            clientId: workoutClientId(attemptId),
          });
        }

        return res;
      } catch (err) {
        console.error("Error saving workout:", err);
        return null;
      } finally {
        savingRef.current = false;
        setFinishing(false);
      }
    },
    [
      workout,
      phase,
      resolvedDay,
      sd,
      activeSecondsBaseline,
      sessionStartTime,
      attemptId,
      startedAtISO,
      swappedExercises,
      cache,
      cacheKey,
      token,
    ],
  );

  const onFinish = useCallback(
    async (finalGrid?: LiveGrid) => {
      return save(true, finalGrid);
    },
    [save],
  );

  return {
    loading,
    error,
    workout,
    phase,
    day: resolvedDay,
    grid,
    restoredGrid,
    activeSeconds,
    isResuming,
    exerciseHistory,
    exercisePRs,
    staleIncomplete,
    swappedExercises,
    swaps,
    finishing,
    newPRs,
    attemptId,
    onGridChange,
    onSetComplete,
    onRequestSwap,
    swapSlug,
    swapSourceName,
    alternatives,
    onSelectAlternative,
    setSwapSlug,
    save,
    onFinish,
    logDateOverrideRef,
    reload: load,
  };
}
