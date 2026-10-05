import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
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
  type ExerciseAlternativesResponse,
  ProgramSwapResponseSchema,
  type ProgramSwapResponse,
  type ExerciseHistoryEntry,
  type ExercisePRSummary,
  type StaleIncompleteWorkout,
  type ResolveIncompleteAction,
  type ResolveIncompleteRequest,
  type ResolveIncompleteResponse,
  ResolveIncompleteResponseSchema,
} from "@become/api-client";
import {
  findPhantomPrefilledSets,
  normalizeTracking,
  tracksTime,
  addIntoGroup,
  appendExercise,
  applyOrder,
  applyOrderToRecord,
  mergeAdHocFromLog,
  type GroupKind,
  type WorkoutExercise,
} from "@become/core";
import { parseRestSeconds } from "@/components/live/LiveWorkoutClient";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  buildWorkoutSaveRequest,
  newWorkoutAttemptId,
} from "@/lib/live/workoutSave";
import {
  getWorkoutSaveQueue,
  type WorkoutSaveQueue,
  type WorkoutSaveStatus,
} from "@/lib/offline/workoutSaves";
import { mirrorWorkoutToHealth, workoutClientId } from "@/lib/health/sync";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import {
  createLiveWorkoutCache,
  liveCacheKey,
  type KeyValueStore,
  type LiveWorkoutSnapshot,
} from "@/lib/live/liveWorkoutCache";
import { localDateKey } from "@/lib/time/localDay";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import type {
  LiveGrid,
  LiveWorkoutExercise,
  LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Thrown internally when a save is kept in the offline queue instead of
 * reaching the server. Never surfaces to the member: it is the "saved on this
 * phone, will sync" state, not an error.
 */
class PendingWorkoutSyncError extends Error {
  constructor() {
    super("Workout save queued for replay when the connection returns");
    this.name = "PendingWorkoutSyncError";
  }
}

const defaultGetNow = () => new Date();

export interface UseLiveWorkoutOptions {
  /** DI for tests — defaults to AsyncStorage-backed cache. */
  cacheStore?: KeyValueStore;
  /** Fallback phase index if not specified (0-based). */
  initialPhase?: number;
  /** Fallback workout index if day label not specified (0-based). */
  fallbackWorkoutIndex?: number;
  /** Subscribe to AppState changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** Delay in milliseconds for autosave debounce (defaults to 1500). */
  autoSaveDelayMs?: number;
  /** Testing override for workout origin key (default: device's local calendar day). */
  initialOriginKey?: string;
  /** Clock injection point for tests (defaults to () => new Date()). */
  getNow?: () => Date;
  /**
   * Offline save queue (DI for tests). Defaults to the app's one queue
   * (`getWorkoutSaveQueue()`), which persists to disk and replays on
   * reconnect. Pass `null` to post saves directly (legacy behaviour, used by
   * tests that assert on the raw POST).
   */
  saveQueue?: WorkoutSaveQueue | null;
}

export interface UseLiveWorkoutResult {
  loading: boolean;
  error: Error | null;
  saveError: Error | null;
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
  setStaleIncomplete: (stale: StaleIncompleteWorkout | null) => void;
  resolveIncomplete: (
    action: ResolveIncompleteAction,
  ) => Promise<ResolveIncompleteResponse | null>;
  resolvingIncomplete: ResolveIncompleteAction | null;
  swappedExercises: Record<number, { originalSlug: string; originalName: string }>;
  swaps: Record<string, string>;
  finishing: boolean;
  newPRs: NewPR[];
  /**
   * The last workout of a program, as the completing save reported it. The
   * web's summary reads the same two fields (`programCompleted` +
   * `programName`) off its save response — the summary's program-complete
   * state is a fact about the save, not a second fetch.
   */
  programCompleted: boolean;
  completedProgramName: string;
  /**
   * The finished session, frozen at completion: the grid the completing save
   * carried and the wall-clock seconds it snapshotted. Null until a
   * completing save lands — that is what flips the route to the summary.
   * The live grid keeps ticking behind it; the summary never reads it.
   */
  finishedGrid: LiveGrid | null;
  finishedElapsedSeconds: number;
  attemptId: string;
  /**
   * True while a save is waiting on the phone (offline or server down) and
   * will be replayed when the connection returns. Drives the "saved on this
   * phone, will sync" state — distinct from `saveError`, which is a refusal
   * retrying cannot fix.
   */
  pendingSync: boolean;
  /**
   * Session notes, the web's Track-view textarea. Sent as `notes` on every
   * save of this attempt once it holds anything (`WorkoutFormClient` does the
   * same: `...(workoutNotes.trim() && { notes: workoutNotes.trim() })`).
   */
  notes: string;
  setNotes: (notes: string) => void;
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
  onSelectAlternative: (
    candidate: AlternativeCandidate,
    scope?: "session" | "program",
  ) => Promise<void> | void;
  setSwapSlug: (slug: string | null) => void;
  save: (
    isComplete?: boolean,
    gridOverride?: LiveGrid,
    exercisesOverride?: LiveWorkoutExercise[],
    swappedExercisesOverride?: Record<
      number,
      { originalSlug: string; originalName: string }
    >,
  ) => Promise<WorkoutSaveResponse | null>;
  onFinish: (grid?: LiveGrid) => Promise<WorkoutSaveResponse | null>;
  pendingDayChoice: {
    originalKey: string;
    todayKey: string;
    grid?: LiveGrid;
  } | null;
  resolveDayChoice: (chosenKey: string) => Promise<WorkoutSaveResponse | null>;
  dismissDayChoice: () => void;
  workoutOriginKey: string;
  logDateOverrideRef: React.MutableRefObject<string | null>;
  reload: () => Promise<void>;
  streakMilestone: number | null;
  workoutStreakDays: number;
  clearStreakMilestone: () => void;
  /**
   * Reshape the workout mid-session (NP-138, build as you go): add an
   * exercise at the end or into the group at `anchorIndex`, permuting the
   * grid and the swap trail with the mutation's `order` so set data follows
   * its exercise, then saving immediately with `addedAdHoc` and the group
   * fields — the same body the web sends, so the exercise is still there
   * after a resume on the web. Removing changes today's session only, never
   * the program.
   */
  applyExerciseChange: (input: {
    exercises: LiveWorkoutExercise[];
    order: number[];
    swappedExercises?: Record<number, { originalSlug: string; originalName: string }>;
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
  const autoSaveDelayMs = options?.autoSaveDelayMs ?? 1500;
  const subscribeToAppStateImpl =
    options?.subscribeToAppState ?? defaultSubscribeToAppState;
  const cache = useMemo(() => createLiveWorkoutCache(cacheStore), [cacheStore]);
  // `saveQueue` identity: the app passes `undefined` (the app's one queue,
  // resolved lazily inside the save) and a test passes its own queue object.
  // A test that passes its queue as an inline object literal hands us a NEW
  // identity every render, and if `save` closed over it directly the save
  // callback would change every render and re-fire the load effect into an
  // infinite loop. So the save reads the queue through this ref, which is
  // assigned in an effect (never during render) and therefore keeps a stable
  // identity: the first queue seen wins for the life of the hook.
  const saveQueueRef = useRef<WorkoutSaveQueue | null | undefined>(undefined);
  const saveQueueOpt = options?.saveQueue;
  useEffect(() => {
    if (saveQueueOpt !== undefined) saveQueueRef.current = saveQueueOpt;
  }, [saveQueueOpt]);
  const resolveSaveQueue = useCallback((): WorkoutSaveQueue | null => {
    if (saveQueueRef.current !== undefined) return saveQueueRef.current;
    // Under Jest there is no NetInfo and no reason to hydrate the real
    // singleton's AsyncStorage snapshot: the direct POST is what the
    // pre-existing tests assert on. The app always passes `undefined` too,
    // but there `NODE_ENV` is not "test".
    if (process.env.NODE_ENV === "test") {
      return null;
    }
    const q = getWorkoutSaveQueue();
    saveQueueRef.current = q;
    return q;
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
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
  const inFlightIsCompleteRef = useRef(false);
  const activeAutosavePromiseRef = useRef<Promise<WorkoutSaveResponse | null> | null>(null);
  const pendingAutosaveGridRef = useRef<LiveGrid | null>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newPRs, setNewPRs] = useState<NewPR[]>([]);
  const [programCompleted, setProgramCompleted] = useState(false);
  const [completedProgramName, setCompletedProgramName] = useState("");
  const [finishedGrid, setFinishedGrid] = useState<LiveGrid | null>(null);
  const [finishedElapsedSeconds, setFinishedElapsedSeconds] = useState(0);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  const [workoutStreakDays, setWorkoutStreakDays] = useState<number>(0);
  const [attemptId, setAttemptId] = useState(newWorkoutAttemptId);
  const [startedAtISO] = useState(() => new Date().toISOString());
  const [pendingSync, setPendingSync] = useState(false);
  const logDateOverrideRef = useRef<string | null>(null);
  // Notes are read through a ref inside `save` on purpose: a keystroke must
  // not give `save` a new identity (every callback built on it would churn and
  // the load effect's neighbours with it). The state is only what the textarea
  // renders.
  const [notes, setNotesState] = useState("");
  const notesRef = useRef("");
  const setNotes = useCallback((value: string) => {
    notesRef.current = value;
    setNotesState(value);
  }, []);

  const getNow = options?.getNow ?? defaultGetNow;
  const [workoutOriginKey, setWorkoutOriginKey] = useState<string>(
    () => options?.initialOriginKey ?? localDateKey(getNow()),
  );
  const [pendingDayChoice, setPendingDayChoice] = useState<{
    originalKey: string;
    todayKey: string;
    grid?: LiveGrid;
  } | null>(null);
  const [resolvingIncomplete, setResolvingIncomplete] =
    useState<ResolveIncompleteAction | null>(null);

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

  const saveRef = useRef<
    (
      isComplete: boolean,
      gridOverride?: LiveGrid,
    ) => Promise<WorkoutSaveResponse | null>
  >(async () => null);

  // Save implementation with re-entrant lock and queueing
  const save = useCallback(
    async (
      isComplete = false,
      gridOverride?: LiveGrid,
      exercisesOverride?: LiveWorkoutExercise[],
      swappedExercisesOverride?: Record<
        number,
        { originalSlug: string; originalName: string }
      >,
    ): Promise<WorkoutSaveResponse | null> => {
      if (!workout) return null;

      if (isComplete) {
        // Prevent concurrent completing saves (double-tap Finish)
        if (inFlightIsCompleteRef.current) return null;
        inFlightIsCompleteRef.current = true;
        setFinishing(true);

        // Await any in-flight autosave before sending completing POST
        if (activeAutosavePromiseRef.current) {
          try {
            await activeAutosavePromiseRef.current;
          } catch {
            // Non-blocking for completing save
          }
        }
      } else {
        // Autosave / set-complete save
        if (inFlightIsCompleteRef.current) return null;
        if (savingRef.current) {
          // Coalesce latest grid into pending ref
          pendingAutosaveGridRef.current = gridOverride ?? gridRef.current;
          return null;
        }
      }

      savingRef.current = true;

      const performSave = async (): Promise<WorkoutSaveResponse | null> => {
        try {
          const currentGrid = gridOverride ?? gridRef.current;
          const activeSecondsAtSave =
            activeSecondsBaseline +
            Math.floor((Date.now() - sessionStartTime) / 1000);
          const logDateOverride = isComplete
            ? logDateOverrideRef.current
            : null;

          const request = buildWorkoutSaveRequest({
            programId: workout.programId,
            phase,
            day: resolvedDay,
            exercises: exercisesOverride ?? workout.exercises,
            grid: currentGrid,
            completed: isComplete,
            activeSeconds: activeSecondsAtSave,
            notes: notesRef.current.trim() || undefined,
            attemptId,
            scheduledDate: sd || undefined,
            performedAt: logDateOverride || undefined,
            tz: new Date().getTimezoneOffset(),
            tzZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            swappedExercises: swappedExercisesOverride ?? swappedExercises,
          });

          // Every save — autosave and completing save alike — goes through
          // the offline queue, online or not. The payload is built AT THE
          // MOMENT OF THE TAP (attemptId, performedAt, scheduledDate, tz) and
          // never rebuilt at delivery, so a replay after a crash or after
          // local midnight carries the same day and the same attempt id: one
          // log per attempt, on the chosen day, with completion side effects
          // exactly once (the server matches by attemptId first).
          const postSave = async (): Promise<WorkoutSaveResponse> => {
            const resolvedQueue = resolveSaveQueue();
            if (!resolvedQueue) {
              return apiFetch<WorkoutSaveResponse>(
                "/api/workouts",
                WorkoutSaveResponseSchema,
                {
                  method: "POST",
                  body: request,
                  baseUrl: WEBAPP_BASE_URL,
                  getToken: () => token ?? undefined,
                },
              );
            }
            const status: WorkoutSaveStatus =
              await resolvedQueue.saveWorkout({
                payload: request,
                attemptId,
              });
            if (status === "queued") {
              // The save is on disk and will be replayed in order when the
              // connection returns. Throw a marker the catch below
              // recognises as "kept, not failed" — the member sees the
              // pending-sync state, not a red error.
              throw new PendingWorkoutSyncError();
            }
            const confirmed = resolvedQueue.getLastResponse();
            if (!confirmed) {
              throw new Error("Workout save was sent but left no response");
            }
            return confirmed;
          };

          const res = await postSave();

          setSaveError(null);
          setPendingSync(false);

          if (isComplete) {
            if (logDateOverrideRef.current) logDateOverrideRef.current = null;
            void invalidateMindSession();
            void cache.clear(cacheKey);
            setNewPRs(res.newPRsAchieved ?? []);
            setProgramCompleted(res.programCompleted ?? false);
            setCompletedProgramName(res.programName ?? "");
            // Freeze the finished session for the summary: the grid this save
            // carried and the wall-clock seconds it snapshotted. The web
            // stops its elapsed timer when the summary appears; the summary
            // reads these, never the live grid.
            setFinishedGrid({ ...(gridOverride ?? gridRef.current) });
            setFinishedElapsedSeconds(activeSecondsAtSave);
            if (res.streak?.newMilestone) {
              setStreakMilestone(res.streak.newMilestone);
            }
            if (res.streak?.streakDays != null) {
              setWorkoutStreakDays(res.streak.streakDays);
            }

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
          if (err instanceof PendingWorkoutSyncError) {
            // Kept on the phone, not failed: the draft stays (it is the
            // resume point after a kill), the values stay, and the UI shows
            // "saved on this phone, will sync" with a Retry that replays the
            // same payload — never a red error. Completion side effects
            // (mind invalidation, draft clearing, health mirror, PR/streak
            // banners) wait for the save that actually reaches the server.
            setPendingSync(true);
            return null;
          }
          if (isComplete) {
            setSaveError(
              err instanceof Error ? err : new Error("Failed to save workout"),
            );
          }
          return null;
        } finally {
          savingRef.current = false;
          if (isComplete) {
            inFlightIsCompleteRef.current = false;
            setFinishing(false);
          } else {
            activeAutosavePromiseRef.current = null;
            if (pendingAutosaveGridRef.current && !inFlightIsCompleteRef.current) {
              const nextGrid = pendingAutosaveGridRef.current;
              pendingAutosaveGridRef.current = null;
              void saveRef.current(false, nextGrid);
            }
          }
        }
      };

      const savePromise = performSave();
      if (!isComplete) {
        activeAutosavePromiseRef.current = savePromise;
      }
      return savePromise;
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
      resolveSaveQueue,
    ],
  );
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const onGridChange = useCallback(
    (nextGrid: LiveGrid) => {
      gridRef.current = nextGrid;
      setGrid(nextGrid);
      const elapsed =
        activeSecondsBaseline +
        Math.floor((Date.now() - sessionStartTime) / 1000);
      void cache.save(
        cacheKey,
        nextGrid as LiveWorkoutSnapshot,
        elapsed,
        attemptId,
      );

      // Debounced server save
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSaveTimeoutRef.current = null;
        void save(false, nextGrid);
      }, autoSaveDelayMs);
    },
    [
      cache,
      cacheKey,
      activeSecondsBaseline,
      sessionStartTime,
      attemptId,
      autoSaveDelayMs,
      save,
    ],
  );

  const onSetComplete = useCallback(
    (_input: { exerciseSlug: string; setIndex: number; state: LiveSetState }) => {
      // Immediate server save on set completion
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      const currentGrid = gridRef.current;
      const elapsed =
        activeSecondsBaseline +
        Math.floor((Date.now() - sessionStartTime) / 1000);
      void cache.save(
        cacheKey,
        currentGrid as LiveWorkoutSnapshot,
        elapsed,
        attemptId,
      );
      void save(false, currentGrid);
    },
    [cache, cacheKey, activeSecondsBaseline, sessionStartTime, attemptId, save],
  );

  // AppState flush on background
  useEffect(() => {
    let prevStatus: AppStateStatus = AppState.currentState ?? "active";
    const unsubscribe = subscribeToAppStateImpl((nextStatus) => {
      if (
        (nextStatus === "background" || nextStatus === "inactive") &&
        prevStatus !== "background" &&
        prevStatus !== "inactive"
      ) {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
          autoSaveTimeoutRef.current = null;
        }
        const currentGrid = gridRef.current;
        const elapsed =
          activeSecondsBaseline +
          Math.floor((Date.now() - sessionStartTime) / 1000);
        void cache.save(
          cacheKey,
          currentGrid as LiveWorkoutSnapshot,
          elapsed,
          attemptId,
        );
        void save(false, currentGrid);
      }
      prevStatus = nextStatus;
    });
    return () => {
      unsubscribe();
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    subscribeToAppStateImpl,
    cache,
    cacheKey,
    activeSecondsBaseline,
    sessionStartTime,
    attemptId,
    save,
  ]);

  // Exercise Swap logic
  const [swapSlug, setSwapSlug] = useState<string | null>(null);

  const workoutSlugs = useMemo(() => {
    return (workout?.exercises ?? []).map((e) => e.slug).filter(Boolean);
  }, [workout?.exercises]);

  const alternativesUrl = useMemo(() => {
    if (!swapSlug) return null;
    const params = new URLSearchParams({ slug: swapSlug, limit: "30" });
    if (workoutSlugs.length > 0) {
      params.set("workoutSlugs", workoutSlugs.join(","));
    }
    const role = workout?.exercises.find((e) => e.slug === swapSlug)?.role;
    if (role) {
      params.set("programRole", role);
    }
    return `/api/exercises/alternatives?${params.toString()}`;
  }, [swapSlug, workoutSlugs, workout?.exercises]);

  const alternatives = useFetch<ExerciseAlternativesResponse>(
    alternativesUrl,
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
    async (
      candidate: AlternativeCandidate,
      scope: "session" | "program" = "session",
    ) => {
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

      // Program-wide scope: POST /api/programs/swap
      if (scope === "program" && programId) {
        try {
          await apiFetch<ProgramSwapResponse>(
            "/api/programs/swap",
            ProgramSwapResponseSchema,
            {
              method: "POST",
              baseUrl: WEBAPP_BASE_URL,
              getToken: () => token ?? undefined,
              body: {
                programId,
                originalSlug: origSlug,
                replacementSlug: candidate.slug,
                replacementName: candidate.name,
              },
            },
          );
        } catch (err) {
          console.error("Error saving permanent swap:", err);
        }
      }

      const newExercises = [...workout.exercises];
      newExercises[exIdx] = {
        ...oldEx,
        name: candidate.name,
        slug: candidate.slug,
        sets: oldEx.sets,
        trackingType: candidate.trackingType,
        equipment: candidate.equipment,
        laterality: candidate.laterality,
        movementPatterns: candidate.movementPatterns,
        category: candidate.category,
        type: candidate.category,
        originalExerciseSlug: origSlug,
        swappedFromName: origName,
        videoUrl: candidate.videoUrl ?? undefined,
        thumbnailUrl: undefined,
        videoWidth: null,
        videoHeight: null,
        videoFraming: null,
        videoTrim: null,
      };

      const nextSwappedExercises = {
        ...swappedExercises,
        [exIdx]: { originalSlug: origSlug, originalName: origName },
      };
      setSwappedExercises(nextSwappedExercises);
      setSwaps((prev) => ({
        ...prev,
        [oldEx.slug]: candidate.name,
        [candidate.slug]: candidate.name,
      }));
      setWorkout({
        ...workout,
        exercises: newExercises,
      });

      // Reset that exercise's sets in the grid
      const blankSets: LiveSetState[] = Array.from(
        { length: oldEx.sets || 1 },
        () => ({
          reps: null,
          weight: null,
          durationSec: null,
          distance: null,
          speed: null,
          completed: false,
        }),
      );
      const nextGrid: LiveGrid = {
        ...gridRef.current,
        [candidate.slug]: blankSets,
      };
      if (oldEx.slug !== candidate.slug) {
        delete nextGrid[oldEx.slug];
      }
      gridRef.current = nextGrid;
      setGrid(nextGrid);

      const elapsed =
        activeSecondsBaseline +
        Math.floor((Date.now() - sessionStartTime) / 1000);
      void cache.save(
        cacheKey,
        nextGrid as LiveWorkoutSnapshot,
        elapsed,
        attemptId,
      );

      // Clear any pending autosave timer and save immediately
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      void save(false, nextGrid, newExercises, nextSwappedExercises);

      setSwapSlug(null);
    },
    [
      swapSlug,
      workout,
      swappedExercises,
      programId,
      token,
      activeSecondsBaseline,
      sessionStartTime,
      cache,
      cacheKey,
      attemptId,
      save,
    ],
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
            groupRest: ex.groupRest,
            restSec: ex.rest ? parseRestSeconds(ex.rest) || 90 : 90,
            videoUrl: ex.videoUrl ?? null,
            thumbnailUrl: ex.thumbnailUrl ?? null,
            videoWidth: ex.videoWidth ?? null,
            videoHeight: ex.videoHeight ?? null,
            videoFraming: ex.videoFraming ?? null,
            videoTrim: ex.videoTrim ?? null,
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

          if (savedWorkout.date) {
            setWorkoutOriginKey(localDateKey(new Date(savedWorkout.date)));
          }

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
              groupRest: (m as any).groupRest ?? existing?.groupRest,
              restSec: existing?.restSec ?? 90,
              addedAdHoc: Boolean((m as any).addedAdHoc),
              videoUrl: existing?.videoUrl ?? null,
              thumbnailUrl: existing?.thumbnailUrl ?? null,
              videoWidth: existing?.videoWidth ?? null,
              videoHeight: existing?.videoHeight ?? null,
              videoFraming: existing?.videoFraming ?? null,
              videoTrim: existing?.videoTrim ?? null,
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
                  videoUrl: undefined,
                  thumbnailUrl: undefined,
                  videoWidth: null,
                  videoHeight: null,
                  videoFraming: null,
                  videoTrim: null,
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
                // The web restores `s.speed` the same way (LiveWorkoutClient
                // resume: `speed: s.speed && s.speed > 0 ? … : ""`).
                speed: s.speed && s.speed > 0 ? s.speed : null,
                completed: Boolean(s.completed),
              }));
            } else {
              restored[ex.slug] = Array.from({ length: ex.sets || 1 }, () => ({
                reps: null,
                weight: null,
                durationSec: null,
                distance: null,
                speed: null,
                completed: false,
              }));
            }

            // THE OLD PREFILL BUG'S FINGERPRINT (web parity, NP-087).
            //
            // A log written before the app stopped seeding every set from the
            // last completed one restores as two or more INCOMPLETE sets
            // carrying the identical numbers — numbers the member never
            // lifted, sitting in a Track view that ticks a set the moment it
            // looks filled. `findPhantomPrefilledSets` is the shared rule the
            // web's restore runs (`WorkoutFormClient`, `phantomIndices`): it
            // names those sets and they are blanked before anything is shown.
            // ONE filled-but-incomplete set is left alone on purpose — that is
            // a set the member unticked to redo.
            const rows = restored[ex.slug] ?? [];
            const phantom = new Set(
              findPhantomPrefilledSets(
                ex.trackingType,
                rows.map((s) => ({
                  reps: s.reps != null ? String(s.reps) : "",
                  weight: s.weight != null ? String(s.weight) : "",
                  duration: s.durationSec != null ? String(s.durationSec) : "",
                  distance: s.distance != null ? String(s.distance) : "",
                  speed: s.speed != null ? String(s.speed) : "",
                  completed: s.completed,
                })),
              ),
            );
            if (phantom.size > 0) {
              restored[ex.slug] = rows.map((s, i) =>
                phantom.has(i)
                  ? {
                      reps: null,
                      weight: null,
                      durationSec: null,
                      distance: null,
                      speed: null,
                      completed: false,
                    }
                  : s,
              );
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
        // Prefer server's open log (checked above); fall back to fresh local draft.
        // Draft is used only when younger than 24h and has progress.
        const cachedDraft = await cache.loadDraft(currentCacheKey, {
          maxAgeMs: 86_400_000,
          requireProgress: true,
        });
        if (cachedDraft) {
          setIsResuming(true);
          setRestoredGrid(cachedDraft.grid as LiveGrid);
          gridRef.current = cachedDraft.grid as LiveGrid;
          setGrid(cachedDraft.grid as LiveGrid);
          if (
            typeof cachedDraft.activeSeconds === "number" &&
            cachedDraft.activeSeconds > 0
          ) {
            setActiveSecondsBaseline(cachedDraft.activeSeconds);
            setSessionStartTime(Date.now());
            setActiveSeconds(cachedDraft.activeSeconds);
          }
          if (cachedDraft.attemptId) {
            setAttemptId(cachedDraft.attemptId);
          }
        } else {
          // Fresh workout: start blank sets (last performance is reference only)
          const blankGrid: LiveGrid = {};
          currentExercises.forEach((ex) => {
            blankGrid[ex.slug] = Array.from({ length: ex.sets || 1 }, () => ({
              reps: null,
              weight: null,
              durationSec: null,
              distance: null,
              speed: null,
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

  const onFinish = useCallback(
    async (finalGrid?: LiveGrid) => {
      const todayKeyNow = localDateKey(getNow());
      if (workoutOriginKey !== todayKeyNow && !logDateOverrideRef.current) {
        setPendingDayChoice({
          originalKey: workoutOriginKey,
          todayKey: todayKeyNow,
          grid: finalGrid,
        });
        return null;
      }
      return save(true, finalGrid);
    },
    [workoutOriginKey, getNow, save],
  );

  const resolveDayChoice = useCallback(
    async (chosenKey: string) => {
      const pending = pendingDayChoice;
      logDateOverrideRef.current = chosenKey;
      setPendingDayChoice(null);
      return save(true, pending?.grid);
    },
    [pendingDayChoice, save],
  );

  const dismissDayChoice = useCallback(() => {
    setPendingDayChoice(null);
  }, []);

  const resolveIncomplete = useCallback(
    async (
      action: ResolveIncompleteAction,
    ): Promise<ResolveIncompleteResponse | null> => {
      if (!staleIncomplete) return null;
      setResolvingIncomplete(action);
      try {
        const body: ResolveIncompleteRequest = {
          programId,
          day: staleIncomplete.day,
          phase: staleIncomplete.phase ?? phase,
          action,
          tz: new Date().getTimezoneOffset(),
          tzZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        const res = await apiFetch<ResolveIncompleteResponse>(
          "/api/workouts/resolve-incomplete",
          ResolveIncompleteResponseSchema,
          {
            method: "POST",
            body,
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );

        if (action === "continue") {
          setStaleIncomplete(null);
        } else if (action === "restart") {
          setStaleIncomplete(null);
          await cache.clear(cacheKey);
          await load();
        } else {
          setStaleIncomplete(null);
        }

        return res;
      } catch (err) {
        console.error("Error resolving incomplete workout:", err);
        return null;
      } finally {
        setResolvingIncomplete(null);
      }
    },
    [staleIncomplete, programId, phase, token, cache, cacheKey, load],
  );

  /**
   * Reshape the workout mid-session (NP-138). The caller computed the new
   * exercise list plus the `order` permutation through the shared
   * build-as-you-go rules; the grid and the swap trail follow their exercise
   * through `applyOrder` / `applyOrderToRecord`, and the change saves
   * immediately — an exercise that only exists on this phone is one the
   * calendar and the history never hear about. Removing changes today's
   * session only, never the program.
   */
  const applyExerciseChange = useCallback(
    (input: {
      exercises: LiveWorkoutExercise[];
      order: number[];
      swappedExercises?: Record<number, { originalSlug: string; originalName: string }>;
    }) => {
      if (!workout) return;
      const nextExercises = input.exercises;
      const nextGrid: LiveGrid = {};
      for (let newIdx = 0; newIdx < input.order.length; newIdx++) {
        const oldIdx = input.order[newIdx];
        if (oldIdx === undefined) continue;
        const next = nextExercises[newIdx];
        if (!next) continue;
        if (oldIdx === -1) {
          nextGrid[next.slug] = Array.from(
            { length: Math.max(1, next.sets || 1) },
            (): LiveSetState => ({
              reps: null,
              weight: null,
              durationSec: null,
              distance: null,
              speed: null,
              completed: false,
            }),
          );
          continue;
        }
        const prev = workout.exercises[oldIdx];
        const rows = prev ? (gridRef.current[prev.slug] ?? []) : [];
        const want = Math.max(1, next.sets || 1);
        const kept: LiveSetState[] = rows.slice(0, want);
        while (kept.length < want) {
          kept.push({
            reps: null,
            weight: null,
            durationSec: null,
            distance: null,
            speed: null,
            completed: false,
          });
        }
        nextGrid[next.slug] = kept;
      }
      const nextSwapped = applyOrderToRecord(
        input.swappedExercises ?? swappedExercises,
        input.order,
      );
      gridRef.current = nextGrid;
      setGrid(nextGrid);
      setSwappedExercises(nextSwapped);
      setWorkout({ ...workout, exercises: nextExercises });
      const elapsed =
        activeSecondsBaseline +
        Math.floor((Date.now() - sessionStartTime) / 1000);
      void cache.save(
        cacheKey,
        nextGrid as LiveWorkoutSnapshot,
        elapsed,
        attemptId,
      );
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      void save(false, nextGrid, nextExercises, nextSwapped);
    },
    [
      workout,
      swappedExercises,
      activeSecondsBaseline,
      sessionStartTime,
      cache,
      cacheKey,
      attemptId,
      save,
    ],
  );

  /**
   * Add an exercise mid-session — the web's `handleAddExercise`: append at
   * the end, or slide into the group at `anchorIndex` (starting a superset
   * of the two when the anchor has none). The new exercise is flagged
   * `addedAdHoc` so the resume merge brings it back on any client.
   */
  const addExercise = useCallback(
    (input: {
      exercise: LiveWorkoutExercise;
      placement: "end" | "group";
      groupKind?: GroupKind;
      anchorIndex?: number;
    }) => {
      if (!workout) return;
      const list = workout.exercises;
      const fresh: LiveWorkoutExercise = {
        ...input.exercise,
        addedAdHoc: true,
      };
      const anchor = input.anchorIndex ?? list.length - 1;
      const res =
        input.placement === "group" && list[anchor]
          ? addIntoGroup(list, anchor, fresh, input.groupKind ?? "superset")
          : appendExercise(list, fresh);
      // `applyOrder` permutes the grid through the same `order`; the swap
      // trail follows through `applyOrderToRecord` inside the change.
      const nextGrid = applyOrder<LiveSetState[]>(
        list.map((ex) => gridRef.current[ex.slug] ?? []),
        res.order,
        (newIdx) => {
          const next = res.exercises[newIdx];
          return Array.from(
            { length: Math.max(1, next?.sets || 1) },
            (): LiveSetState => ({
              reps: null,
              weight: null,
              durationSec: null,
              distance: null,
              speed: null,
              completed: false,
            }),
          );
        },
      );
      const bySlug: LiveGrid = {};
      res.exercises.forEach((ex, i) => {
        bySlug[ex.slug] = nextGrid[i] ?? [];
      });
      const nextSwapped = applyOrderToRecord(swappedExercises, res.order);
      gridRef.current = bySlug;
      setGrid(bySlug);
      setSwappedExercises(nextSwapped);
      setWorkout({ ...workout, exercises: res.exercises });
      const elapsed =
        activeSecondsBaseline +
        Math.floor((Date.now() - sessionStartTime) / 1000);
      void cache.save(
        cacheKey,
        bySlug as LiveWorkoutSnapshot,
        elapsed,
        attemptId,
      );
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      void save(false, bySlug, res.exercises, nextSwapped);
    },
    [
      workout,
      swappedExercises,
      activeSecondsBaseline,
      sessionStartTime,
      cache,
      cacheKey,
      attemptId,
      save,
    ],
  );

  return {
    loading,
    error,
    saveError,
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
    setStaleIncomplete,
    resolveIncomplete,
    resolvingIncomplete,
    swappedExercises,
    swaps,
    finishing,
    newPRs,
    programCompleted,
    completedProgramName,
    finishedGrid,
    finishedElapsedSeconds,
    attemptId,
    pendingSync,
    notes,
    setNotes,
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
    streakMilestone,
    workoutStreakDays,
    clearStreakMilestone: () => setStreakMilestone(null),
    pendingDayChoice,
    resolveDayChoice,
    dismissDayChoice,
    workoutOriginKey,
    logDateOverrideRef,
    reload: load,
    applyExerciseChange,
    addExercise,
  };
}
