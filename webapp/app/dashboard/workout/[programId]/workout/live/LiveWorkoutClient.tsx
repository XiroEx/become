"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Dumbbell, X, Plus, Layers, Unlink, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { getExerciseVideoUrlAsync } from "@/lib/data/exerciseVideos";
import { buildWorkoutFlow, type WorkoutStep } from "@/lib/workoutUtils";
import ExerciseSwapModal, { type SwapScope } from "@/components/ExerciseSwapModal";
import IncompleteWorkoutModal, { type StaleIncompleteData } from "@/components/IncompleteWorkoutModal";
import WorkoutSummary, { ConfettiBurst, WORKOUT_QUOTES, GOAL_CLOSINGS, getDayOfYear, type SummaryProps } from "@/components/WorkoutSummary";
import FramedVideo from "@/components/FramedVideo";
import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";
import { readQuickSession, clearQuickSession, stashQuickSessionWithId, updateQuickSession, quickSessionOverviewHref, quickSessionTrackHref, quickSessionLiveHref, swapQuickSessionExercise, QUICK_PROGRAM_ID } from "@/lib/quickSession/store";
import AddExerciseSheet, { type AddExerciseResult } from "@/components/workout/AddExerciseSheet";
import ThinSessionModal from "@/components/workout/ThinSessionModal";
import ConfirmModal from "@/components/workout/ConfirmModal";
import QuickSessionNamePrompt from "@/components/workout/QuickSessionNamePrompt";
import { addIntoGroup, appendExercise, applyOrder, applyOrderToRecord, canRemoveExercise, mergeAdHocFromLog, moveExercise, needsMoreExercises, prescriptionOf, removeExercise, shouldWarnBeforeFinish, ungroupAt, groupIndexes, type AdHocExercise } from "@/lib/workout/buildAsYouGo";
import { programScope, quickScope, readPosition, resolveStartStep, writePosition, clearPosition } from "@/lib/workout/position";
import { normalizeTracking, tracksTime, setUnitLabel, blankSet } from "@/lib/workout/tracking";
import { clearQuickProgress, readQuickProgress, writeQuickProgress } from "@/lib/quickSession/progress";
import { shouldPromptForQuickSessionName } from "@/lib/quickSession/naming";
import WorkoutViewToggle from "@/components/workout/WorkoutViewToggle";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import DayChoiceModal from "@/components/workout/DayChoiceModal";
import { dateKey } from "@/lib/dayWindow";

interface SetData {
  reps: string;
  weight: string;
  speed: string;
  completed: boolean;
}

interface SavedSetData {
  setNumber: number;
  reps: number;
  weight: number;
  speed?: number;
  duration?: number;
  distance?: number;
  completed: boolean;
}

interface SavedExercise {
  name: string;
  exerciseSlug?: string;
  sets: SavedSetData[];
  originalExerciseSlug?: string;
  swappedFromName?: string;
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
  groupRounds?: number;
  addedAdHoc?: boolean;
  prescription?: { sets?: number; reps?: string; duration?: string; rest?: string; trackingType?: string };
}

interface SavedWorkout {
  exercises: SavedExercise[];
  completed: boolean;
  activeSeconds?: number;
  date?: string;
  startedAt?: string;
}

interface Exercise {
  exerciseSlug?: string;
  name: string;
  type?: string;
  trackingType?: string; // reps_weight | reps_bodyweight | reps_only | time | time_distance | intervals | none
  sets?: number;
  reps?: string;
  rest?: string;
  tempo?: string;
  rpe?: number;
  duration?: string;          // timed prescription: "30 sec", "60 sec"
  tip?: string;
  details?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  videoTrim?: VideoTrimOverride | null;
  primaryMuscles?: string[];
  difficulty?: string;
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
  /** Added mid-session rather than programmed / drafted up front. */
  addedAdHoc?: boolean;
}

interface WorkoutData {
  day: string;
  title: string;
  exercises: Exercise[];
}

// Fallback demo data
const fallbackExercises: Exercise[] = [
  { name: "Bench Press", sets: 3, reps: "8-10", rest: "90s", tip: "Keep shoulder blades pinched" },
  { name: "Seated Cable Row", sets: 3, reps: "10-12", rest: "90s", tip: "Squeeze at contraction" },
  { name: "Dumbbell Shoulder Press", sets: 3, reps: "10-12", rest: "60s", tip: "Core tight, back straight" },
  { name: "Lat Pulldown", sets: 3, reps: "10-12", rest: "60s", tip: "Lead with elbows" },
  { name: "Tricep Pushdown", sets: 3, reps: "12-15", rest: "45s", tip: "Elbows pinned to sides" },
  { name: "Bicep Curls", sets: 3, reps: "12-15", rest: "45s", tip: "Control the negative" },
];

export default function LiveWorkoutPage() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const params = useParams();
  const searchParams = useSearchParams();
  const programId = params.programId as string;
  const requestedDay = searchParams.get("day");
  const scheduledDate = searchParams.get("sd"); // exact Schedule slot date (program mode only; gap 3)
  // Quick (program-less) session mode — routed through this same component via
  // the sentinel programId `quick` + a sessionStorage-stashed draft keyed by
  // ?session=<id>. In quick mode we skip program/current-workout/schedule
  // plumbing entirely and save with kind:'quick'.
  const quickSessionId = searchParams.get("session");
  const isQuick = programId === QUICK_PROGRAM_ID || !!quickSessionId;
  const [quickMeta, setQuickMeta] = useState<{ title: string; focus?: string } | null>(null);
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>(fallbackExercises);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [loading, setLoading] = useState(true);

  // Step-based flow for superset interleaving
  const [workoutFlow, setWorkoutFlow] = useState<WorkoutStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const [isResting, setIsResting] = useState(false);
  const [restTimeRemaining, setRestTimeRemaining] = useState(0);
  const [restTotalTime, setRestTotalTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showInputs, setShowInputs] = useState(true);
  const [showExerciseList, setShowExerciseList] = useState(false);
  // Build as you go: the add-an-exercise sheet, reachable from the exercise list.
  const [showAddExercise, setShowAddExercise] = useState(false);
  // "Finish with two exercises?" — asked once, on the way out of a thin session.
  const [showThinFinish, setShowThinFinish] = useState(false);
  const [thinFinishAcked, setThinFinishAcked] = useState(false);
  // Removing an exercise that already has sets against it asks first.
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  // Long-press a row in the exercise list to pick it up and move it. Tap it to
  // go to that exercise. The arrows that used to sit on every row crowded out
  // the exercise name, and this is the gesture people already expect.
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const dragRef = useRef<{ from: number; startY: number; rowH: number } | null>(null);
  const pressRef = useRef<{ idx: number; y: number } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [showResumeIndicator, setShowResumeIndicator] = useState(false);
  // Active-seconds tracking: time persists across resume sessions.
  // - activeSecondsBaseline: total active seconds accumulated in prior sessions
  //   (loaded from the server when resuming an in-progress workout)
  // - sessionStartTime: when THIS view instance opened
  // - elapsedTime (display) = baseline + (now - sessionStart) seconds
  // The timer keeps ticking while the view is open and persists `activeSeconds`
  // on every save, so resuming yesterday's workout picks up where it left off.
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());
  const [activeSecondsBaseline, setActiveSecondsBaseline] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [exerciseData, setExerciseData] = useState<SetData[][]>([]);
  const [currentReps, setCurrentReps] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [currentSpeed, setCurrentSpeed] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  // Newly-created sessions keep their default product copy until the first
  // completed save. Sessions named during creation never enter this flow.
  const [quickNeedsName, setQuickNeedsName] = useState(false);
  const [pendingQuickCompletion, setPendingQuickCompletion] = useState<SetData[][] | null>(null);
  // Which local calendar day this workout's log is currently attributed to.
  // Defaults to today (a fresh session has nothing to cross); a resumed
  // session overwrites it with the server-confirmed date once loaded. Used
  // only to detect a midnight crossing at finish time — see
  // requestDayChoiceIfNeeded below.
  const [workoutOriginKey, setWorkoutOriginKey] = useState<string>(
    () => dateKey(new Date(), new Date().getTimezoneOffset()),
  );
  const [pendingDayChoice, setPendingDayChoice] = useState<{
    data: SetData[][];
    originalKey: string;
    todayKey: string;
  } | null>(null);
  // Set by resolveDayChoice, read once by saveWorkout on the completing save,
  // then cleared — a ref (not state) so saveWorkout's already-large dependency
  // list doesn't need to grow to pick it up.
  const logDateOverrideRef = useRef<string | null>(null);
  const [programCompleted, setProgramCompleted] = useState(false);
  const [completedProgramName, setCompletedProgramName] = useState("");
  const [showSwapModal, setShowSwapModal] = useState(false);
  // Track which exercises have been swapped: exerciseIndex -> { originalSlug, originalName }
  const [swappedExercises, setSwappedExercises] = useState<Record<number, { originalSlug: string; originalName: string }>>({});

  // Contextual nudges (progression / plateau) keyed by exercise slug — shown at
  // the exercise they belong to, only while it's the current one.
  const [exerciseNudges, setExerciseNudges] = useState<Record<string, { id: string; title: string; body: string }>>({});

  // Exercise history from past workouts (e.g. "Last time: 185 lbs × 8 reps")
  const [exerciseHistory, setExerciseHistory] = useState<Record<string, { weight: number; reps: number; duration?: number; date: string }>>({});
  // All-time best per exercise — used for "Beat your PR" display
  const [exercisePRs, setExercisePRs] = useState<Record<string, { weight: number; reps: number }>>({});

  // Stale incomplete workout detection
  const [staleIncomplete, setStaleIncomplete] = useState<StaleIncompleteData | null>(null);

  // Summary enrichment — fetched when summary shows
  const [summaryStreak, setSummaryStreak] = useState<{ streakDays: number; nextMilestone: number | null } | null>(null)
  const [summaryGoal, setSummaryGoal] = useState<string | null>(null)
  // Increment to re-trigger loadWorkout (used when user picks "continue" after stale detection)
  const [loadKey, setLoadKey] = useState(0);

  // Auto-save ref
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Stable ref for exerciseData — used in visibilitychange handler to avoid stale closure
  const exerciseDataRef = useRef<SetData[][]>([]);
  // Re-entrant lock: prevents double-tap / concurrent saves from firing two POSTs
  const savingRef = useRef(false);

  // Derive current position from the flow
  const currentStep = workoutFlow[currentStepIndex];
  const currentExerciseIndex = currentStep?.exerciseIndex ?? 0;
  const currentSetIndex = currentStep?.setIndex ?? 0;
  const currentExercise = exercises[currentExerciseIndex];
  const totalExercises = exercises.length;
  const totalSets = currentExercise?.sets || 3;
  const shouldNudgeAddExercise = needsMoreExercises(totalExercises);

  const isLastStep = currentStepIndex === workoutFlow.length - 1;

  // Fetch contextual nudges for this session's exercises (once per slug set).
  useEffect(() => {
    const slugs = Array.from(
      new Set(exercises.map((e) => (e.exerciseSlug || "").toLowerCase()).filter(Boolean)),
    );
    if (slugs.length === 0) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    let cancelled = false;
    fetch(`/api/workouts/exercise-suggestions?slugs=${encodeURIComponent(slugs.join(","))}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { suggestions?: Array<{ id: string; title: string; body: string; sourceData?: { exerciseSlug?: string } }> } | null) => {
        if (cancelled || !d?.suggestions) return;
        const map: Record<string, { id: string; title: string; body: string }> = {};
        for (const s of d.suggestions) {
          const slug = String(s.sourceData?.exerciseSlug ?? "").toLowerCase();
          if (slug && !map[slug]) map[slug] = { id: s.id, title: s.title, body: s.body };
        }
        setExerciseNudges(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.map((e) => e.exerciseSlug).join(",")]);

  const dismissNudge = useCallback((slug: string, id: string) => {
    setExerciseNudges((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    const token = localStorage.getItem("token");
    fetch("/api/suggestions/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  // Determine which inputs to show based on trackingType. Normalized, because a
  // session rebuilt from its log used to come back typed 'reps' — which matched
  // no branch here, so the screen offered nothing to log at all.
  const tracking = normalizeTracking(currentExercise?.trackingType);
  const showWeightInput = tracking === "reps_weight";
  const showRepsInput = ["reps_weight", "reps_bodyweight", "reps_only"].includes(tracking);
  const showTimeInput = ["time", "time_distance", "intervals"].includes(tracking);
  const isIntervalExercise = tracking === "intervals";
  const showSpeedInput = tracking === "time_distance" || tracking === "intervals";
  const setUnit = setUnitLabel(tracking, 1);
  const setUnitPlural = setUnitLabel(tracking, totalSets);

  // Per-bell weight convention: when the exercise name implies a dumbbell or
  // kettlebell, the user logs the per-bell weight (e.g. "90" for a pair of
  // 90s — saying "I dumbbell benched 180" is awkward). We surface this by
  // adjusting the label and showing a small "= total" helper below the input.
  const bellStyle: 'dumbbell' | 'kettlebell' | null = (() => {
    const n = (currentExercise?.name || '').toLowerCase()
    if (/\bkettlebell|\bkb\b/.test(n)) return 'kettlebell'
    if (/\bdumbbell|\bdb\b/.test(n)) return 'dumbbell'
    return null
  })()

  // Check if inputs are empty (for skip button text)
  // Interval exercises are always "complete" (no required input) — user marks done and moves on
  const isSkipping = isIntervalExercise ? false : (showWeightInput ? !currentReps && !currentWeight : !currentReps);

  // Toggle fullscreen mode when tapping video
  const handleVideoTap = () => {
    if (!isResting) {
      setIsFullscreen(!isFullscreen);
    }
  };

  // Initialize exercises and build flow helper. Sets always start blank —
  // last-time's numbers are shown separately as a "Last: X lbs × Y reps"
  // reference (see exerciseHistory below), never written into the editable
  // fields. Writing them in silently logged weight/reps the member never
  // actually entered if they tapped Done without looking closely.
  type PerformanceEntry = {
    reps?: number;
    weight?: number;
    speed?: number;
    duration?: number;
    distance?: number;
    date?: string;
  };
  const initializeExercises = (exList: Exercise[]) => {
    const data = exList.map((ex) => Array.from({ length: ex.sets || 3 }, () => blankSet()));
    const flow = buildWorkoutFlow(exList);
    return { data, flow };
  };

  // Fetch the user's last-completed-set per exercise, for the "Last: X lbs ×
  // Y reps" reference and PR display. Best-effort — failure returns an empty
  // map and the reference simply doesn't show.
  const fetchLastPerformance = async (
    token: string,
    exList: Exercise[],
  ): Promise<Record<string, PerformanceEntry | null>> => {
    const slugs = Array.from(
      new Set(
        exList
          .map((ex) => {
            if (ex.exerciseSlug) return ex.exerciseSlug.toLowerCase();
            return ex.name
              ?.toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
          })
          .filter((s): s is string => Boolean(s)),
      ),
    );
    if (slugs.length === 0) return {};
    try {
      const res = await fetch(
        `/api/workouts/last-performance?slugs=${encodeURIComponent(slugs.join(','))}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return {};
      const data = (await res.json()) as {
        performances?: Record<string, PerformanceEntry | null>
        prs?: Record<string, { weight: number; reps: number }>
      };
      // Quick sessions have no program to hang a history request off, so this
      // one call carries both: last time's numbers and the standing records.
      if (data.prs) setExercisePRs(data.prs);
      return data.performances ?? {};
    } catch {
      return {};
    }
  };

  /** Rebuild a quick session from its server log and re-stash it locally. */
  const rebuildQuickFromServer = async (sessionId: string) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return null;
      const res = await fetch(`/api/workouts/session?id=${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        session?: {
          title?: string
          needsName?: boolean
          focus?: string
          exercises?: Array<{
            name: string
            exerciseSlug?: string
            trackingType?: string
            groupId?: string
            groupType?: string
            groupLabel?: string
            groupRounds?: number
            addedAdHoc?: boolean
            prescription?: { sets?: number; reps?: string; duration?: string; rest?: string; trackingType?: string }
            sets?: Array<{ reps?: number | null; duration?: number | null }>
          }>
        } | null
      };
      const sess = body.session;
      if (!sess?.exercises?.length) return null;
      const exercises = sess.exercises.map((ex) => {
        const p = ex.prescription;
        const first = ex.sets?.[0];
        return {
          exerciseSlug: ex.exerciseSlug || "",
          name: ex.name,
          trackingType: p?.trackingType || ex.trackingType || "reps_weight",
          sets: p?.sets ?? (ex.sets?.length || 1),
          reps: p?.reps ?? (first?.reps != null && first.reps > 0 ? String(first.reps) : ""),
          ...(p?.duration ? { duration: p.duration } : first?.duration != null ? { duration: String(first.duration) } : {}),
          ...(p?.rest ? { rest: p.rest } : {}),
          ...(ex.groupId ? { groupId: ex.groupId } : {}),
          ...(ex.groupType ? { groupType: ex.groupType } : {}),
          ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
          ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
          ...(ex.addedAdHoc ? { addedAdHoc: true } : {}),
        };
      });
      const draft = { title: sess.title || "Quick Session", ...(sess.focus ? { focus: sess.focus as never } : {}), exercises };
      stashQuickSessionWithId(draft, sessionId, { needsName: sess.needsName });
      return readQuickSession(sessionId);
    } catch {
      return null;
    }
  };

  // Load the current workout from API
  useEffect(() => {
    const loadWorkout = async () => {
      try {
        // ── Quick-session mode: load the stashed draft, no program fetches ──
        if (isQuick) {
          let stored = quickSessionId ? readQuickSession(quickSessionId) : null;
          // The stash is per-browser. Resuming from the dashboard pill on
          // another device — or after clearing site data — has to rebuild the
          // session from its log, or the live view would offer demo exercises
          // in place of the workout the member is standing in.
          if (quickSessionId && !stored?.exercises?.length) {
            const rebuilt = await rebuildQuickFromServer(quickSessionId);
            if (rebuilt) stored = rebuilt;
          }
          const draftExercises = stored?.exercises ?? [];
          const exs: Exercise[] = draftExercises.map((d) => ({
            exerciseSlug: d.exerciseSlug,
            name: d.name,
            trackingType: d.trackingType,
            sets: d.sets,
            reps: d.reps,
            ...(d.rest && { rest: d.rest }),
            ...(d.duration && { duration: d.duration }),
            ...(d.primaryMuscles && { primaryMuscles: d.primaryMuscles }),
            // A superset made mid-session lives in the stash — carry it back in
            // or the flow stops interleaving the moment the view reloads.
            ...(d.groupId && { groupId: d.groupId }),
            ...(d.groupType && { groupType: d.groupType }),
            ...(d.groupLabel && { groupLabel: d.groupLabel }),
            ...(d.groupRest && { groupRest: d.groupRest }),
            ...(d.groupRounds && { groupRounds: d.groupRounds }),
            ...(d.addedAdHoc && { addedAdHoc: true }),
          }));
          const title = stored?.title || "Quick Session";
          setQuickMeta({ title, focus: stored?.focus });
          setQuickNeedsName(shouldPromptForQuickSessionName(stored));

          if (exs.length === 0) {
            // No stashed session (e.g. hard refresh cleared sessionStorage) —
            // fall back so the screen isn't stuck loading.
            const fb: WorkoutData = { day: title, title, exercises: fallbackExercises };
            setWorkout(fb);
            setExercises(fallbackExercises);
            const { data, flow } = initializeExercises(fallbackExercises);
            setExerciseData(data);
            setWorkoutFlow(flow);
            setLoading(false);
            return;
          }

          const wd: WorkoutData = { day: title, title, exercises: exs };
          setWorkout(wd);
          setExercises(exs);
          setCurrentPhase(1);

          // Prefill last-time numbers (slug-based — works without a program).
          const token = localStorage.getItem("token");
          const lastPerformance = token ? await fetchLastPerformance(token, exs) : {};
          // "Last session: 185 lbs × 8" and the summary's PR count both read
          // exerciseHistory, keyed by NAME. Programs get it from the workouts
          // endpoint; a quick session had nothing, so it never celebrated a PR
          // it had just watched you set.
          const quickHistory: Record<string, { weight: number; reps: number; duration?: number; date: string }> = {};
          for (const ex of exs) {
            const slug = (ex.exerciseSlug || ex.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '').toLowerCase();
            const prior = slug ? lastPerformance[slug] : null;
            if (prior) {
              quickHistory[ex.name] = {
                weight: prior.weight ?? 0,
                reps: prior.reps ?? 0,
                ...(prior.duration != null && { duration: prior.duration }),
                date: prior.date ?? '',
              };
            }
          }
          setExerciseHistory(quickHistory);
          const { data, flow } = initializeExercises(exs);
          // Restore shared progress from the Track view (reps/weight/completed) so
          // flipping the Track|Live tab never loses entered sets.
          const savedQP = quickSessionId ? readQuickProgress(quickSessionId) : null;
          const restored = savedQP?.exercises?.length
            ? data.map((sets, i) => {
                const savedEx = savedQP.exercises[i];
                const timed = tracksTime(exs[i]?.trackingType);
                return sets.map((s, si) => {
                  const ss = savedEx?.sets?.[si];
                  if (!ss) return s;
                  return {
                    ...s,
                    // Cardio comes back out of duration/distance into the two
                    // boxes this view types into.
                    reps: (timed ? ss.duration : ss.reps) ?? s.reps,
                    weight: (timed ? ss.distance : ss.weight) ?? s.weight,
                    speed: ss.speed ?? s.speed,
                    completed: ss.completed ?? s.completed,
                  };
                });
              })
            : data;
          setExerciseData(restored);
          setWorkoutFlow(flow);
          // Open on the set the member was last standing on — flipping to the
          // Track view and back used to drop them at set 1 with three sets
          // already done, which re-logged over finished work.
          const startIdx = resolveStartStep(flow, restored, quickSessionId ? readPosition(quickScope(quickSessionId)) : null);
          setCurrentStepIndex(startIdx);
          // The active-set inputs bind to currentWeight/currentReps (not exerciseData
          // directly), so seed them from that step — otherwise progress entered in
          // the Track view wouldn't appear in the Live inputs.
          const startStep = flow[startIdx];
          const startSet = startStep ? restored[startStep.exerciseIndex]?.[startStep.setIndex] : null;
          if (startSet) {
            setCurrentReps(startSet.reps || "");
            setCurrentWeight(startSet.weight || "");
            setCurrentSpeed(startSet.speed ?? "");
          }
          setLoading(false);

          // The stashed draft carries no timestamp, so a resumed quick
          // session's true start day can only come from its server log — ask
          // for it in the background (best-effort; a brand-new session with
          // no log yet just 404s and workoutOriginKey keeps its "today"
          // default, which is already correct). Not awaited: this only
          // matters at finish time, well after the workout is usable.
          if (quickSessionId && token) {
            fetch(`/api/workouts/session?id=${encodeURIComponent(quickSessionId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((b: { session?: { date?: string } } | null) => {
                if (b?.session?.date) {
                  setWorkoutOriginKey(dateKey(new Date(b.session.date), new Date().getTimezoneOffset()));
                }
              })
              .catch(() => { /* best-effort — day-choice just won't offer if this fails */ });
          }
          return;
        }

        const token = localStorage.getItem("token");
        if (!token) {
          setWorkout({ day: "Day 1", title: "Training", exercises: fallbackExercises });
          setExercises(fallbackExercises);
          const { data, flow } = initializeExercises(fallbackExercises);
          setExerciseData(data);
          setWorkoutFlow(flow);
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/programs/current-workout?programId=${programId}${requestedDay ? `&day=${encodeURIComponent(requestedDay)}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          const workoutData: WorkoutData = {
            day: data.day || "Day 1",
            title: data.workout?.title || "Training",
            exercises: data.workout?.exercises || fallbackExercises
          };
          setWorkout(workoutData);
          setExercises(workoutData.exercises);
          setCurrentPhase(data.phase || 1);

          // Kicked off in parallel with the resume-progress lookup below so we
          // don't add latency in the resume path. Sets in exerciseHistory
          // (from the resume lookup) still show a "Last: X lbs × Y reps"
          // hint; this call's only remaining job is populating exercisePRs
          // as a side effect (see fetchLastPerformance).
          const prefillPromise = fetchLastPerformance(token, workoutData.exercises);
          await prefillPromise;

          let { data: initialData, flow } = initializeExercises(workoutData.exercises);
          setExerciseData(initialData);
          setWorkoutFlow(flow);

          // Check for in-progress workout to resume (also fetch exercise history)
          const progressRes = await fetch(`/api/workouts?programId=${programId}&day=${encodeURIComponent(workoutData.day)}&includeHistory=true&tz=${new Date().getTimezoneOffset()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.exerciseHistory) {
              setExerciseHistory(progressData.exerciseHistory);
            }
            if (progressData.exercisePRs) {
              setExercisePRs(progressData.exercisePRs);
            }
            // Show incomplete workout prompt if there's a stale session from a previous day
            if (progressData.staleIncomplete && !progressData.isResume) {
              setStaleIncomplete(progressData.staleIncomplete);
            } else {
              setStaleIncomplete(null);
            }
            if (progressData.workout && progressData.isResume) {
              const savedWorkout = progressData.workout as SavedWorkout;

              // The server-confirmed day this log actually started on — a
              // resumed workout can be picking up after midnight, so "today"
              // (the default above) would be wrong for detecting that at
              // finish time.
              if (savedWorkout.date) {
                setWorkoutOriginKey(dateKey(new Date(savedWorkout.date), new Date().getTimezoneOffset()));
              }

              // Restore swapped exercises from saved workout, and bring back
              // anything added mid-session: a program workout rebuilds its
              // exercise list from the program on every load, so without this
              // an added exercise disappears and its logged sets are orphaned.
              const updatedExercises = mergeAdHocFromLog<Exercise>(
                [...workoutData.exercises],
                savedWorkout.exercises,
              ) as Exercise[];
              const addedBack = updatedExercises.length - workoutData.exercises.length;
              const restoredSwaps: Record<number, { originalSlug: string; originalName: string }> = {};

              savedWorkout.exercises?.forEach((savedEx, idx) => {
                if (idx < updatedExercises.length && savedEx.originalExerciseSlug) {
                  // Clear video fields too: the program data still has the
                  // ORIGINAL exercise's video URL/dimensions, which would
                  // play the wrong video for the swap. Falling them back to
                  // undefined makes the resolver look up by the new name.
                  updatedExercises[idx] = {
                    ...updatedExercises[idx],
                    name: savedEx.name,
                    exerciseSlug: savedEx.exerciseSlug || updatedExercises[idx].exerciseSlug,
                    videoUrl: undefined,
                    videoWidth: null,
                    videoHeight: null,
                    videoFraming: null,
                  };
                  restoredSwaps[idx] = {
                    originalSlug: savedEx.originalExerciseSlug,
                    originalName: savedEx.swappedFromName || updatedExercises[idx].name,
                  };
                }
              });

              if (Object.keys(restoredSwaps).length > 0 || addedBack > 0) {
                setExercises(updatedExercises);
                setSwappedExercises(restoredSwaps);
                // Rebuild flow with updated exercises
                const newFlow = buildWorkoutFlow(updatedExercises);
                setWorkoutFlow(newFlow);
                // Use newFlow for resume index below
                flow = newFlow;
              }

              // Match progress by index (not name) so swapped exercises restore correctly
              const restoredData = updatedExercises.map((ex, exIdx) => {
                const savedEx = savedWorkout.exercises?.[exIdx];
                const isMatch = savedEx && (
                  savedEx.name === ex.name ||
                  savedEx.originalExerciseSlug ||
                  savedEx.swappedFromName
                );
                if (isMatch && savedEx) {
                  // Timed work went out as duration/distance; it comes back into
                  // the two boxes the live view types into.
                  const timed = tracksTime(ex.trackingType);
                  return savedEx.sets.map(s => ({
                    reps: timed
                      ? (s.duration && s.duration > 0 ? String(s.duration) : "")
                      : (s.reps > 0 ? s.reps.toString() : ""),
                    weight: timed
                      ? (s.distance && s.distance > 0 ? String(s.distance) : "")
                      : (s.weight > 0 ? s.weight.toString() : ""),
                    speed: s.speed && s.speed > 0 ? s.speed.toString() : "",
                    completed: s.completed
                  }));
                }
                return Array.from({ length: ex.sets || 3 }, () => ({
                  reps: "",
                  weight: "",
                  speed: "",
                  completed: false,
                }));
              });

              setExerciseData(restoredData);
              setIsResuming(true);
              setShowResumeIndicator(true);

              // Restore active-seconds baseline so the timer continues from
              // where it left off rather than restarting at 0.
              if (typeof savedWorkout.activeSeconds === 'number' && savedWorkout.activeSeconds > 0) {
                setActiveSecondsBaseline(savedWorkout.activeSeconds);
                setSessionStartTime(Date.now());
              }

              // Where they actually were, falling back to the first set that
              // still needs doing (the old behaviour).
              const resumeIdx = resolveStartStep(
                flow,
                restoredData,
                readPosition(programScope(programId, workoutData.day)),
              );
              setCurrentStepIndex(resumeIdx);

              // Restore partial input for the resume step
              const step = flow[resumeIdx];
              if (step) {
                const setData = restoredData[step.exerciseIndex]?.[step.setIndex];
                if (setData) {
                  setCurrentReps(setData.reps);
                  setCurrentWeight(setData.weight);
                  setCurrentSpeed(setData.speed ?? "");
                }
              }

              setTimeout(() => setShowResumeIndicator(false), 3000);
            } else {
              // No API resume data — check localStorage draft (covers iOS fetch-cancel on app switch)
              const draftKey = `live_draft_${programId}_${workoutData.day}`;
              try {
                const raw = localStorage.getItem(draftKey);
                if (raw) {
                  const draft = JSON.parse(raw) as { savedAt: number; exerciseData: SetData[][]; stepIndex: number };
                  const age = Date.now() - draft.savedAt;
                  // Use draft only if it's < 24h old and has actual progress
                  const hasProgress = draft.exerciseData?.some(sets => sets.some(s => s.completed || s.reps || s.weight));
                  if (age < 86_400_000 && hasProgress && draft.exerciseData?.length === initialData.length) {
                    setExerciseData(draft.exerciseData);
                    setIsResuming(true);
                    setShowResumeIndicator(true);
                    const resumeIdx = Math.min(draft.stepIndex, flow.length - 1);
                    setCurrentStepIndex(resumeIdx);
                    const step = flow[resumeIdx];
                    if (step) {
                      const setData = draft.exerciseData[step.exerciseIndex]?.[step.setIndex];
                      if (setData) {
                        setCurrentReps(setData.reps);
                        setCurrentWeight(setData.weight);
                        setCurrentSpeed(setData.speed ?? "");
                      }
                    }
                    setTimeout(() => setShowResumeIndicator(false), 3000);
                  }
                }
              } catch { /* corrupt draft — ignore */ }
            }
          }
        } else {
          // current-workout returns 404 when the user isn't enrolled in this
          // specific program. Instead of dropping them into generic hardcoded
          // exercises (which read as "random workout from another program"),
          // load THIS program directly and use its first day so the user
          // actually previews the program they clicked on.
          let loadedFromProgram = false
          try {
            const programRes = await fetch(`/api/programs/${encodeURIComponent(programId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (programRes.ok) {
              const programData = await programRes.json()
              const phases = programData?.phases || []
              const firstPhase = phases[0]
              const workoutsArr = Array.isArray(firstPhase?.workouts)
                ? firstPhase.workouts
                : Object.values(firstPhase?.workouts ?? {})
              const firstWorkout = workoutsArr?.[0]
              if (firstWorkout?.exercises?.length) {
                const wd: WorkoutData = {
                  day: firstWorkout.day || 'Day 1',
                  title: firstWorkout.title || 'Training',
                  exercises: firstWorkout.exercises,
                }
                setWorkout(wd)
                setExercises(wd.exercises)
                setCurrentPhase(1)
                const { data: d, flow: f } = initializeExercises(wd.exercises)
                setExerciseData(d)
                setWorkoutFlow(f)
                loadedFromProgram = true
              }
            }
          } catch { /* fall through to generic fallback */ }
          if (!loadedFromProgram) {
            setWorkout({ day: "Day 1", title: "Training", exercises: fallbackExercises });
            setExercises(fallbackExercises);
            const { data: d, flow: f } = initializeExercises(fallbackExercises);
            setExerciseData(d);
            setWorkoutFlow(f);
          }
        }
      } catch (error) {
        console.error("Error loading workout:", error);
        setWorkout({ day: "Day 1", title: "Training", exercises: fallbackExercises });
        setExercises(fallbackExercises);
        const { data: d, flow: f } = initializeExercises(fallbackExercises);
        setExerciseData(d);
        setWorkoutFlow(f);
      } finally {
        setLoading(false);
      }
    };

    loadWorkout();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, requestedDay, loadKey, isQuick, quickSessionId]);

  // Mirror live progress into the shared quick-session draft so the Track (form)
  // view resumes with the same reps/weight/completed when the user flips the tab.
  useEffect(() => {
    // Guard on `loading`: on mount exerciseData is [] and this effect would otherwise
    // clobber the shared draft with empty data BEFORE the load restores it (race).
    if (!isQuick || !quickSessionId || !workout || loading) return;
    // Snapshot exerciseData with the in-progress active-set inputs merged in, so a
    // value typed in Live (before the set is marked done) still reaches the Track view.
    const snap = exerciseData.map((sets) => sets.map((s) => ({ ...s })));
    const step = workoutFlow[currentStepIndex];
    const active = step ? snap[step.exerciseIndex]?.[step.setIndex] : null;
    if (active) {
      if (currentWeight) active.weight = currentWeight;
      if (currentReps) active.reps = currentReps;
    }
    writeQuickProgress(
      quickSessionId,
      workout.exercises.map((ex, i) => {
        // Same translation as the save path: the Track view stores cardio in
        // duration/distance, so hand it over that way or flipping the tab turns
        // 12 minutes into 12 reps.
        const timed = tracksTime(ex.trackingType);
        const isTD = normalizeTracking(ex.trackingType) === 'time_distance';
        return {
          name: ex.name,
          ...(ex.exerciseSlug && { exerciseSlug: ex.exerciseSlug }),
          sets: (snap[i] ?? []).map((s) => ({
            reps: timed ? '' : s.reps,
            weight: timed ? '' : s.weight,
            ...(timed ? { duration: s.reps } : {}),
            ...(isTD ? { distance: s.weight } : {}),
            ...(s.speed ? { speed: s.speed } : {}),
            completed: s.completed,
          })),
        };
      }),
    );
  }, [isQuick, quickSessionId, workout, exerciseData, workoutFlow, currentStepIndex, currentWeight, currentReps, loading]);

  // Remember where the member is standing. The Track view reads this when they
  // flip the tab, and the Live view reads it back on the way in — the two views
  // are one workout, and it should not matter which one you look at it through.
  useEffect(() => {
    if (loading || !workout) return;
    const step = workoutFlow[currentStepIndex];
    if (!step) return;
    const scope = isQuick
      ? (quickSessionId ? quickScope(quickSessionId) : "")
      : programScope(programId, workout.day);
    if (scope) writePosition(scope, step.exerciseIndex, step.setIndex);
  }, [loading, workout, workoutFlow, currentStepIndex, isQuick, quickSessionId, programId]);

  // Find the first incomplete step in the flow. Normal resumes go through
  // resolveStartStep (which prefers the remembered position); this is the
  // fallback used when a stale workout is continued.
  function findFirstIncompleteStep(flow: WorkoutStep[], data: SetData[][]): number {
    for (let i = 0; i < flow.length; i++) {
      const step = flow[i];
      if (!data[step.exerciseIndex]?.[step.setIndex]?.completed) {
        return i;
      }
    }
    return flow.length - 1;
  }

  const handleResolveIncomplete = (
    action: "continue" | "restart" | "count" | "skip",
    nextDay?: string | null,
  ) => {
    if (action === "continue") {
      // The resolve API re-dated the stale log to now so isResume will fire.
      // Navigate to the stale day so the user actually resumes that workout —
      // if we just reload with the current URL (e.g. ?day=Day 2), the user
      // would see a fresh Day 2 instead of the Day 1 they asked to continue.
      const staleDay = staleIncomplete?.day;
      setStaleIncomplete(null);
      if (staleDay && staleDay !== requestedDay) {
        router.replace(`/dashboard/workout/${programId}/workout/live?day=${encodeURIComponent(staleDay)}`);
      } else {
        setLoadKey((k) => k + 1);
      }
    } else if (action === "restart") {
      // Stale log was deleted; workout is already in fresh state, just close modal
      setStaleIncomplete(null);
    } else {
      // count or skip — go to the workout overview for the next day so the user
      // must explicitly choose to start it (prevents accidentally completing Day 2
      // immediately after counting/skipping a stale Day 1).
      setStaleIncomplete(null);
      const target = nextDay
        ? `/dashboard/workout/${programId}/workout?day=${encodeURIComponent(nextDay)}`
        : `/dashboard`;
      router.replace(target);
    }
  };

  // Fetch streak + goal when summary appears
  useEffect(() => {
    if (!showSummary) return
    const token = localStorage.getItem('token')
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    fetch(`/api/streak?tz=${new Date().getTimezoneOffset()}`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSummaryStreak({ streakDays: d.streakDays, nextMilestone: d.nextMilestone ?? null }) })
      .catch(() => {})
    fetch('/api/profile', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.profile?.fitnessGoal) setSummaryGoal(d.profile.fitnessGoal) })
      .catch(() => {})
  }, [showSummary])

  const parseRestTime = (rest: string): number => {
    const match = rest.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (rest.includes("min")) return num * 60;
      return num;
    }
    return 60;
  };

  // Rest timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResting && restTimeRemaining > 0) {
      interval = setInterval(() => {
        setRestTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (isResting && restTimeRemaining === 0) {
      // Vibrate on completion if supported
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      setIsResting(false);
    }
    return () => clearInterval(interval);
  }, [isResting, restTimeRemaining]);

  // Elapsed timer — freezes once the summary screen is shown so the
  // congratulations card displays the duration at completion, not a
  // counter that keeps climbing after the workout is done.
  // Computes baseline (from prior sessions) + current session elapsed.
  useEffect(() => {
    if (showSummary) return;
    const tick = () => {
      const sessionElapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      setElapsedTime(activeSecondsBaseline + sessionElapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime, activeSecondsBaseline, showSummary]);

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, []);

  // Keep stable refs in sync so the visibility handler always sees current data
  const currentStepIndexRef = useRef(currentStepIndex);
  useEffect(() => {
    exerciseDataRef.current = exerciseData;
    currentStepIndexRef.current = currentStepIndex;
  }, [exerciseData, currentStepIndex]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Save workout progress
  const saveWorkout = useCallback(async (
    exerciseDataToSave: SetData[][],
    isComplete: boolean,
    exercisesOverride?: Exercise[],
    quickTitleOverride?: string,
  ): Promise<boolean> => {
    if (!workout) return false;
    // Re-entrant guard: prevent double-tap / concurrent auto-save from firing two POSTs
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return false;
      const exercisesToSave = (exercisesOverride ?? exercises).map((exercise, index) => {
        const swap = swappedExercises[index];
        return {
          name: exercise.name,
          ...(exercise.exerciseSlug && { exerciseSlug: exercise.exerciseSlug }),
          // Cardio is typed into the same two boxes as reps and weight — the
          // labels above them say Duration and Distance — so it has to land in
          // the right FIELDS on the way out. Otherwise a treadmill logged 1600
          // "lbs" and a plank logged 45 "reps", and history, PRs and the track
          // view all read the lie.
          sets: exerciseDataToSave[index]?.map((set, setIndex) => {
            const t = normalizeTracking(exercise.trackingType);
            const timed = tracksTime(t);
            const first = parseFloat(set.reps) || 0;      // duration for timed work
            const second = parseFloat(set.weight) || 0;   // distance for time_distance
            return {
              setNumber: setIndex + 1,
              reps: timed ? 0 : (parseInt(set.reps) || 0),
              weight: timed ? 0 : (parseFloat(set.weight) || 0),
              ...(timed && first > 0 && { duration: first }),
              ...(t === 'time_distance' && second > 0 && { distance: second }),
              ...(set.speed && parseFloat(set.speed) > 0 && { speed: parseFloat(set.speed) }),
              completed: set.completed,
            };
          }) || [],
          ...(exercise.groupId && { groupId: exercise.groupId }),
          ...(exercise.groupType && { groupType: exercise.groupType }),
          ...(exercise.groupLabel && { groupLabel: exercise.groupLabel }),
          ...(exercise.groupRounds && { groupRounds: exercise.groupRounds }),
          // What this exercise asks you to log, saved with it. Without this a
          // session rebuilt from its log had to guess, guessed 'reps', and came
          // back with no weight box on a loaded movement.
          prescription: prescriptionOf(exercise),
          ...(exercise.addedAdHoc && { addedAdHoc: true }),
          ...(swap && { originalExerciseSlug: swap.originalSlug, swappedFromName: swap.originalName }),
        };
      });
      // Snapshot active seconds now so the server stores the time at the
      // moment of save, not the time the request lands.
      const activeSecondsAtSave = activeSecondsBaseline + Math.floor((Date.now() - sessionStartTime) / 1000);
      // Which day the member picked for a workout that crossed midnight (set
      // by resolveDayChoice). Only ever sent on the completing save — read
      // once, then cleared, so it can never leak into a later, unrelated save.
      const logDateOverride = isComplete ? logDateOverrideRef.current : null;
      if (isComplete) logDateOverrideRef.current = null;
      // Quick sessions post a kind:'quick' body (matched server-side by
      // sessionId); program sessions post the program/phase/day body.
      const saveBody = isQuick && quickSessionId
        ? {
            kind: "quick" as const,
            sessionId: quickSessionId,
            title: quickTitleOverride ?? workout.title,
            needsName: isComplete ? false : quickNeedsName,
            ...(quickMeta?.focus && { focus: quickMeta.focus }),
            exercises: exercisesToSave,
            completed: isComplete,
            activeSeconds: activeSecondsAtSave,
            ...(isComplete && { duration: Math.max(1, Math.round(activeSecondsAtSave / 60)) }),
            ...(logDateOverride && { performedAt: logDateOverride }),
            tz: new Date().getTimezoneOffset(),
            // The zone name, not just the offset: an offset is wrong for half
            // the year the moment daylight saving moves.
            tzZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : {
            programId,
            phase: currentPhase,
            day: workout.day,
            exercises: exercisesToSave,
            completed: isComplete,
            activeSeconds: activeSecondsAtSave,
            ...(scheduledDate && { scheduledDate }),
            ...(isComplete && { duration: Math.max(1, Math.round(activeSecondsAtSave / 60)) }),
            ...(logDateOverride && { performedAt: logDateOverride }),
            tz: new Date().getTimezoneOffset(),
          };
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(saveBody),
      });
      if (!res.ok) return false;
      if (isComplete && res.ok) {
        const data = await res.json();
        if (data.programCompleted) {
          setProgramCompleted(true);
          setCompletedProgramName(data.programName || "");
        }
        // New training context → drop the cached Mind session so the next
        // compose (app open / Mind open) reflects the just-finished workout.
        invalidateMindSession();
        // Clear the draft — workout is done, no need to resume
        try { localStorage.removeItem(`live_draft_${programId}_${workout.day}`); } catch { /* ignore */ }
        clearPosition(isQuick && quickSessionId ? quickScope(quickSessionId) : programScope(programId, workout.day));
        // Activity changed → next Mind load composes a fresh session.
        invalidateMindSession();
      }
      return true;
    } catch (error) {
      console.error("Error saving workout:", error);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [programId, workout, exercises, currentPhase, swappedExercises, activeSecondsBaseline, sessionStartTime, isQuick, quickSessionId, quickMeta, quickNeedsName, scheduledDate]);

  // Save immediately when user leaves the app (switches apps, locks phone, closes tab).
  // Covers the 1.5s debounce race condition — iOS can cancel fetch during suspension
  // so localStorage is the primary backup; the API save is best-effort.
  useEffect(() => {
    if (!workout) return;
    const draftKey = `live_draft_${programId}_${workout.day}`;

    const flush = () => {
      if (exerciseDataRef.current.length === 0) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          savedAt: Date.now(),
          exerciseData: exerciseDataRef.current,
          stepIndex: currentStepIndexRef.current,
        }));
      } catch { /* storage full — ignore */ }
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      saveWorkout(exerciseDataRef.current, false);
    };

    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, programId, saveWorkout]);

  // Persist a quick session to the server the instant it begins, not only once
  // the user types something, completes a set, or backgrounds the app. Without
  // this, pressing "Start workout" and leaving immediately via in-app
  // navigation (the exit button, a route change) never hit any of those save
  // triggers — the session existed only as a local draft with no server
  // record, so it never showed up as resumable anywhere (calendar, history)
  // and the user had to rebuild it from scratch. One save per session id.
  const quickSessionStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isQuick || !quickSessionId || !workout || loading) return;
    if (quickSessionStartedRef.current === quickSessionId) return;
    if (!readQuickSession(quickSessionId)) return; // no real draft — nothing to persist
    quickSessionStartedRef.current = quickSessionId;
    saveWorkout(exerciseData, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuick, quickSessionId, workout, loading]);

  // Auto-save: update exerciseData on input change + debounced save
  const updateCurrentInput = useCallback((field: "reps" | "weight" | "speed", value: string) => {
    if (field === "reps") setCurrentReps(value);
    if (field === "weight") setCurrentWeight(value);
    if (field === "speed") setCurrentSpeed(value);

    if (!currentStep) return;

    setExerciseData(prev => {
      const updated = prev.map((sets, exIdx) =>
        exIdx === currentStep.exerciseIndex
          ? sets.map((set, sIdx) =>
              sIdx === currentStep.setIndex ? { ...set, [field]: value } : set
            )
          : sets
      );

      // Debounced save
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveWorkout(updated, false);
      }, 1500);

      return updated;
    });
  }, [currentStep, saveWorkout]);

  // Determine rest duration based on step context
  // Smart rest default based on tracking type: heavy compound → 3min, bodyweight/isolation → 90s, else 60s
  const getSmartRestDefault = (exercise?: Exercise): string => {
    const t = exercise?.trackingType || exercise?.type || ""
    if (t === "reps_weight") return "3min"
    if (t === "reps_bodyweight" || t === "reps_only") return "90s"
    return "60s"
  }

  const getRestDuration = (step: WorkoutStep): number => {
    const exercise = exercises[step.exerciseIndex];
    if (step.groupId && !step.isLastInRound) {
      // Within a superset round — no rest between exercises
      return 0;
    } else if (step.groupId && step.isLastInRound) {
      // End of a superset round — use groupRest or exercise rest
      return parseRestTime(exercise?.groupRest || exercise?.rest || getSmartRestDefault(exercise));
    }
    // Normal exercise — use explicit rest field or smart default
    return parseRestTime(exercise?.rest || getSmartRestDefault(exercise));
  };

  // A workout that started on one local calendar day and is finishing on
  // another (crossed midnight) needs an explicit choice of which day it
  // counts toward — silently picking one, either way, is what the member
  // reported as "lost" data actually being real but mis-dated. Purely
  // client-side: workoutOriginKey is already resolved (server-confirmed for
  // a resume, "today" for a fresh start), so no network round-trip needed
  // here.
  const requestDayChoiceIfNeeded = useCallback((updatedData: SetData[][]): boolean => {
    const todayKeyNow = dateKey(new Date(), new Date().getTimezoneOffset());
    if (workoutOriginKey === todayKeyNow) return false;
    setPendingDayChoice({ data: updatedData, originalKey: workoutOriginKey, todayKey: todayKeyNow });
    return true;
  }, [workoutOriginKey]);

  const requestQuickNameBeforeCompletion = useCallback((updatedData: SetData[][]): boolean => {
    if (!isQuick || !quickSessionId || !quickNeedsName) return false;
    setPendingQuickCompletion(updatedData);
    return true;
  }, [isQuick, quickSessionId, quickNeedsName]);

  // Advance to next step with appropriate rest
  const advanceStep = useCallback((updatedData: SetData[][], isComplete: boolean) => {
    if (isComplete) {
      if (isQuick && quickSessionId) {
        clearQuickProgress(quickSessionId);
        clearQuickSession(quickSessionId);
      }
      setShowSummary(true);
      return;
    }

    const step = workoutFlow[currentStepIndex];
    const restDuration = getRestDuration(step);

    setCurrentReps("");
    setCurrentWeight("");
    setCurrentSpeed("");

    if (restDuration > 0) {
      setIsResting(true);
      setRestTimeRemaining(restDuration);
      setRestTotalTime(restDuration);
    }

    setCurrentStepIndex(prev => prev + 1);
  }, [currentStepIndex, workoutFlow, exercises, isQuick, quickSessionId]);

  // Resolves the day-choice modal: stash which day the member picked (read
  // once by saveWorkout, then cleared), then fall through to the same
  // naming-gate + finalize sequence completeSet/skipSet/skipExercise use.
  const resolveDayChoice = useCallback((chosenKey: string) => {
    if (!pendingDayChoice) return;
    const { data, originalKey } = pendingDayChoice;
    logDateOverrideRef.current = chosenKey === originalKey ? null : chosenKey;
    setPendingDayChoice(null);
    if (requestQuickNameBeforeCompletion(data)) return;
    setExerciseData(data);
    saveWorkout(data, true);
    advanceStep(data, true);
  }, [pendingDayChoice, requestQuickNameBeforeCompletion, saveWorkout, advanceStep]);

  const completeSet = useCallback(async () => {
    if (!currentStep) return;

    const updatedData = exerciseData.map((sets, exIdx) =>
      exIdx === currentStep.exerciseIndex
        ? sets.map((set, sIdx) =>
            sIdx === currentStep.setIndex
              ? { reps: currentReps, weight: currentWeight, speed: currentSpeed, completed: true }
              : set
          )
        : sets
    );

    // Clear auto-save timeout since we're doing an immediate save
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    if (isLastStep) {
      if (requestDayChoiceIfNeeded(updatedData)) return;
      if (requestQuickNameBeforeCompletion(updatedData)) return;
    }

    setExerciseData(updatedData);

    saveWorkout(updatedData, isLastStep);
    advanceStep(updatedData, isLastStep);
  }, [currentStep, currentReps, currentWeight, currentSpeed, isLastStep, exerciseData, requestDayChoiceIfNeeded, requestQuickNameBeforeCompletion, saveWorkout, advanceStep]);

  const skipRest = () => {
    setIsResting(false);
    setRestTimeRemaining(0);
  };

  const skipSet = useCallback(async () => {
    if (!currentStep) return;

    const updatedData = exerciseData.map((sets, exIdx) =>
      exIdx === currentStep.exerciseIndex
        ? sets.map((set, sIdx) =>
            sIdx === currentStep.setIndex
              ? { reps: "0", weight: "0", speed: "", completed: true }
              : set
          )
        : sets
    );

    setShowSkipModal(false);

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    if (isLastStep) {
      if (requestDayChoiceIfNeeded(updatedData)) return;
      if (requestQuickNameBeforeCompletion(updatedData)) return;
    }

    setExerciseData(updatedData);

    saveWorkout(updatedData, isLastStep);
    advanceStep(updatedData, isLastStep);
  }, [currentStep, isLastStep, exerciseData, requestDayChoiceIfNeeded, requestQuickNameBeforeCompletion, saveWorkout, advanceStep]);

  const skipExercise = useCallback(async () => {
    if (!currentStep) return;

    // Skipping the last exercise ends the workout just as surely as finishing it.
    let nextAfterSkip = currentStepIndex + 1;
    while (nextAfterSkip < workoutFlow.length && workoutFlow[nextAfterSkip].exerciseIndex === currentStep.exerciseIndex) {
      nextAfterSkip++;
    }
    if (nextAfterSkip >= workoutFlow.length && shouldAskBeforeFinish()) {
      setShowSkipModal(false);
      setShowThinFinish(true);
      return;
    }

    // Mark all sets for the current exercise as skipped
    const updatedData = exerciseData.map((sets, exIdx) =>
      exIdx === currentStep.exerciseIndex
        ? sets.map(() => ({ reps: "0", weight: "0", speed: "", completed: true }))
        : sets
    );

    setShowSkipModal(false);

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    // Find the next step that isn't for the skipped exercise
    let nextIdx = currentStepIndex + 1;
    while (nextIdx < workoutFlow.length && workoutFlow[nextIdx].exerciseIndex === currentStep.exerciseIndex) {
      nextIdx++;
    }

    const allDone = nextIdx >= workoutFlow.length;

    if (allDone) {
      if (requestDayChoiceIfNeeded(updatedData)) return;
      if (requestQuickNameBeforeCompletion(updatedData)) return;
    }

    setExerciseData(updatedData);
    saveWorkout(updatedData, allDone);

    if (allDone) {
      if (isQuick && quickSessionId) {
        clearQuickProgress(quickSessionId);
        clearQuickSession(quickSessionId);
      }
      setShowSummary(true);
      return;
    }

    setCurrentReps("");
    setCurrentWeight("");
    setCurrentSpeed("");

    const restDuration = getRestDuration(currentStep);
    if (restDuration > 0) {
      setIsResting(true);
      setRestTimeRemaining(restDuration);
      setRestTotalTime(restDuration);
    }

    setCurrentStepIndex(nextIdx);
  }, [currentStep, currentStepIndex, workoutFlow, exerciseData, requestDayChoiceIfNeeded, requestQuickNameBeforeCompletion, saveWorkout, exercises, isQuick, quickSessionId]);

  const finishNamedQuickSession = useCallback(async (title: string) => {
    if (!quickSessionId || !pendingQuickCompletion) {
      throw new Error("This workout is no longer ready to finish");
    }

    const saved = await saveWorkout(pendingQuickCompletion, true, undefined, title);
    if (!saved) throw new Error("Could not finish the workout. Try again.");

    // Keep the local model and completion summary in sync with the name that
    // was persisted on the completed server record.
    updateQuickSession(quickSessionId, { title });
    setWorkout((current) => current ? { ...current, day: title, title } : current);
    setQuickMeta((current) => current ? { ...current, title } : { title });
    setExerciseData(pendingQuickCompletion);
    setQuickNeedsName(false);
    setPendingQuickCompletion(null);
    clearQuickProgress(quickSessionId);
    clearQuickSession(quickSessionId);
    setShowSummary(true);
  }, [pendingQuickCompletion, quickSessionId, saveWorkout]);

  const handleSwapExercise = useCallback((alternative: { slug: string; name: string; trackingType: string; equipment: string[]; category: string }, scope: SwapScope) => {
    const exIdx = currentExerciseIndex;
    const oldExercise = exercises[exIdx];
    if (!oldExercise) return;

    const originalSlug = swappedExercises[exIdx]?.originalSlug || oldExercise.exerciseSlug || "";
    const originalName = swappedExercises[exIdx]?.originalName || oldExercise.name;

    // Track the swap
    setSwappedExercises(prev => ({
      ...prev,
      [exIdx]: { originalSlug, originalName }
    }));

    // Replace the exercise, preserving programming prescription. CRITICAL:
    // clear any video-specific fields from the prior exercise so the video
    // resolver looks up by the NEW exercise name instead of replaying the
    // stale URL/dimensions/framing of the original.
    const updatedExercises = [...exercises];
    updatedExercises[exIdx] = {
      ...oldExercise,
      exerciseSlug: alternative.slug,
      name: alternative.name,
      type: alternative.category,
      trackingType: alternative.trackingType,
      videoUrl: undefined,
      videoWidth: null,
      videoHeight: null,
      videoFraming: null,
    };
    setExercises(updatedExercises);

    // Quick session: persist the swap into the stashed session so the Track view
    // (which builds its exercise list from the stash) shows the same swapped exercise.
    if (isQuick && quickSessionId) {
      swapQuickSessionExercise(quickSessionId, exIdx, {
        name: alternative.name,
        exerciseSlug: alternative.slug,
        trackingType: alternative.trackingType,
      });
    }

    // Save permanent swap if scope is 'program' (never for quick sessions —
    // they have no program to persist a swap against).
    if (scope === 'program' && !isQuick) {
      const token = localStorage.getItem("token");
      if (token) {
        fetch("/api/programs/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            programId,
            originalSlug,
            replacementSlug: alternative.slug,
            replacementName: alternative.name,
          })
        }).catch(err => console.error("Error saving permanent swap:", err));
      }
    }

    // Reset set data for this exercise
    const updatedData = exerciseData.map((sets, idx) =>
      idx === exIdx
        ? Array.from({ length: oldExercise.sets || 3 }, () => ({
            reps: "",
            weight: "",
            speed: "",
            completed: false,
          }))
        : sets
    );
    setExerciseData(updatedData);

    // Rebuild the workout flow (exercise count unchanged, so step indices stay valid)
    const newFlow = buildWorkoutFlow(updatedExercises);
    setWorkoutFlow(newFlow);

    // Clear current inputs
    setCurrentReps("");
    setCurrentWeight("");
    setCurrentSpeed("");

    // Auto-save the swap
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    saveWorkout(updatedData, false);

    setShowSwapModal(false);
    setShowSkipModal(false);
  }, [currentExerciseIndex, exercises, exerciseData, swappedExercises, saveWorkout, programId, isQuick, quickSessionId]);

  // ── Build as you go ────────────────────────────────────────────────────────
  //
  // The workout is not fixed at the moment you start it. Adding an exercise,
  // supersetting two of them or breaking a group apart all reshape the flow
  // while it runs, so every parallel array (set data, swaps) has to move with
  // its exercise and the member has to stay on the set they were mid-way
  // through. `order[newIndex] = oldIndex` from lib/workout/buildAsYouGo is what
  // makes that possible.
  const applyWorkoutChange = useCallback((next: Exercise[], order: number[], landOn?: number) => {
    const nextData = applyOrder(exerciseData, order, (i) =>
      Array.from({ length: next[i]?.sets || 3 }, () => ({ reps: "", weight: "", speed: "", completed: false })),
    );
    const nextFlow = buildWorkoutFlow(next);
    const stayOn = landOn ?? order.indexOf(currentExerciseIndex);
    const keep = nextFlow.findIndex((st) => st.exerciseIndex === (stayOn === -1 ? 0 : stayOn) && st.setIndex === currentSetIndex);

    setExercises(next);
    setExerciseData(nextData);
    setSwappedExercises(applyOrderToRecord(swappedExercises, order));
    setWorkoutFlow(nextFlow);
    setCurrentStepIndex(keep === -1 ? Math.min(currentStepIndex, Math.max(0, nextFlow.length - 1)) : keep);
    setWorkout((w) => (w ? { ...w, exercises: next } : w));

    // A quick session's shape lives in the stash — the Track view and the
    // overview read it, so it has to know about the change before the member
    // flips the tab.
    if (isQuick && quickSessionId) {
      updateQuickSession(quickSessionId, {
        exercises: next.map((e) => ({
          exerciseSlug: e.exerciseSlug ?? "",
          name: e.name,
          trackingType: e.trackingType ?? "reps_weight",
          sets: e.sets ?? 3,
          reps: e.reps ?? "",
          ...(e.rest && { rest: e.rest }),
          ...(e.duration && { duration: e.duration }),
          ...(e.primaryMuscles && { primaryMuscles: e.primaryMuscles }),
          ...(e.groupId && { groupId: e.groupId }),
          ...(e.groupType && { groupType: e.groupType }),
          ...(e.groupLabel && { groupLabel: e.groupLabel }),
          ...(e.groupRest && { groupRest: e.groupRest }),
          ...(e.groupRounds && { groupRounds: e.groupRounds }),
          ...(e.addedAdHoc && { addedAdHoc: true }),
        })),
      });
    }

    // Save straight away: an added exercise that only exists in this tab is a
    // workout the calendar and the history never hear about.
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    saveWorkout(nextData, false, next);
  }, [exerciseData, swappedExercises, currentExerciseIndex, currentSetIndex, currentStepIndex, isQuick, quickSessionId, saveWorkout]);

  /**
   * True when we should stop and ask before finishing: a session you built as
   * you went, with fewer exercises in it than a session usually has. Programs
   * are prescribed by a coach — a three-exercise day there is deliberate, so
   * this only asks about sessions the member assembled themselves.
   */
  const shouldAskBeforeFinish = useCallback(
    () => shouldWarnBeforeFinish({ selfBuilt: isQuick, exerciseCount: exercises.length, alreadyAsked: thinFinishAcked }),
    [isQuick, thinFinishAcked, exercises.length],
  );

  const handleAddExercise = useCallback((r: AddExerciseResult) => {
    const fresh: Exercise = { ...r.exercise, addedAdHoc: true } as Exercise;
    const res = r.placement === "group" && exercises[currentExerciseIndex]
      ? addIntoGroup<AdHocExercise>(exercises as AdHocExercise[], currentExerciseIndex, fresh as AdHocExercise, r.groupKind)
      : appendExercise<AdHocExercise>(exercises as AdHocExercise[], fresh as AdHocExercise);
    // Adding into the superset you are in keeps you where you are; adding one
    // on the end does too — you asked for it later, not now.
    applyWorkoutChange(res.exercises as Exercise[], res.order);
  }, [exercises, currentExerciseIndex, applyWorkoutChange]);

  /** Drop an exercise from this workout. The program is untouched — this is
   *  today's session, not the plan. */
  const dropExerciseAt = useCallback((idx: number) => {
    if (!canRemoveExercise(exercises)) return;
    const res = removeExercise<AdHocExercise>(exercises as AdHocExercise[], idx);
    applyWorkoutChange(res.exercises as Exercise[], res.order);
    setConfirmRemoveIdx(null);
  }, [exercises, applyWorkoutChange]);

  /** Ask first when there is logged work to lose; otherwise just drop it.
   *  Only COMPLETED sets count: the inputs come pre-filled with last session's
   *  numbers, and those are a suggestion, not work done today. */
  const requestRemoveAt = useCallback((idx: number) => {
    const hasWork = (exerciseData[idx] ?? []).some((set) => set.completed);
    if (hasWork) setConfirmRemoveIdx(idx);
    else dropExerciseAt(idx);
  }, [exerciseData, dropExerciseAt]);

  const moveExerciseBy = useCallback((idx: number, delta: number) => {
    const to = idx + delta;
    if (to < 0 || to >= exercises.length) return;
    const res = moveExercise<AdHocExercise>(exercises as AdHocExercise[], idx, to);
    applyWorkoutChange(res.exercises as Exercise[], res.order);
  }, [exercises, applyWorkoutChange]);

  /** Jump to an exercise: its first set that still needs doing. */
  const goToExercise = useCallback((idx: number) => {
    const target = workoutFlow.findIndex(
      (st) => st.exerciseIndex === idx && !exerciseData[st.exerciseIndex]?.[st.setIndex]?.completed,
    );
    const at = target === -1 ? workoutFlow.findIndex((st) => st.exerciseIndex === idx) : target;
    if (at === -1) return;
    setCurrentStepIndex(at);
    const step = workoutFlow[at];
    const set = step ? exerciseData[step.exerciseIndex]?.[step.setIndex] : null;
    setCurrentReps(set?.reps ?? "");
    setCurrentWeight(set?.weight ?? "");
    setCurrentSpeed(set?.speed ?? "");
    setIsResting(false);
    setShowExerciseList(false);
  }, [workoutFlow, exerciseData]);

  const startLongPress = useCallback((idx: number, clientY: number) => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    pressRef.current = { idx, y: clientY };
    longPressRef.current = setTimeout(() => {
      const rows = listRef.current?.children;
      const rowH = rows && rows.length > 1
        ? (rows[1] as HTMLElement).offsetTop - (rows[0] as HTMLElement).offsetTop
        : ((rows?.[0] as HTMLElement | undefined)?.offsetHeight ?? 48) + 8;
      dragRef.current = { from: idx, startY: clientY, rowH: Math.max(24, rowH) };
      setDrag({ from: idx, to: idx, dy: 0 });
      // A short buzz, where the platform offers one: the row is now in hand.
      try { navigator.vibrate?.(15) } catch { /* not everywhere */ }
    }, 400);
  }, []);

  const moveDrag = useCallback((clientY: number) => {
    const d = dragRef.current;
    if (!d) {
      // A real scroll cancels the hold; a few pixels of jitter does not, or the
      // gesture would be impossible to land with a thumb.
      const press = pressRef.current;
      if (press && Math.abs(clientY - press.y) > 8 && longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
      return;
    }
    const dy = clientY - d.startY;
    const to = Math.max(0, Math.min(exercises.length - 1, d.from + Math.round(dy / d.rowH)));
    setDrag({ from: d.from, to, dy });
  }, [exercises.length]);

  const endPress = useCallback((idx: number, wasDrag: boolean) => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    pressRef.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    const preview = drag;
    setDrag(null);
    if (d && preview && preview.to !== d.from) {
      const res = moveExercise<AdHocExercise>(exercises as AdHocExercise[], d.from, preview.to);
      applyWorkoutChange(res.exercises as Exercise[], res.order);
      return;
    }
    if (!wasDrag && !d) goToExercise(idx);
  }, [drag, exercises, applyWorkoutChange, goToExercise]);

  /** Superset the exercise at `idx` with the one after it (or break the group). */
  const toggleGroupAt = useCallback((idx: number) => {
    const ex = exercises[idx];
    if (!ex) return;
    if (ex.groupId) {
      const res = ungroupAt<AdHocExercise>(exercises as AdHocExercise[], idx);
      applyWorkoutChange(res.exercises as Exercise[], res.order);
      return;
    }
    if (idx + 1 >= exercises.length) return;
    const res = groupIndexes<AdHocExercise>(exercises as AdHocExercise[], [idx, idx + 1], "superset");
    applyWorkoutChange(res.exercises as Exercise[], res.order);
  }, [exercises, applyWorkoutChange]);

  const handleCompleteOrSkipSet = () => {
    // On the final step, empty inputs just finish the workout — don't prompt to skip
    if (isSkipping && !isLastStep) {
      setShowSkipModal(true);
      return;
    }

    // Last set of a session you built yourself, and it is thinner than a
    // session usually is: ask before it becomes a finished workout.
    if (isLastStep && shouldAskBeforeFinish()) {
      setShowThinFinish(true);
      return;
    }

    // Check if this set was already completed with different values
    if (currentStep) {
      const setData = exerciseData[currentStep.exerciseIndex]?.[currentStep.setIndex];
      if (setData?.completed) {
        const savedReps = setData.reps;
        const savedWeight = setData.weight;
        if (savedReps !== currentReps || savedWeight !== currentWeight) {
          setShowEditConfirmModal(true);
          return;
        }
      }
    }

    completeSet();
  };

  const goToPrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
      setIsResting(false);

      // Restore input values from exerciseData for the previous step
      const prevStep = workoutFlow[currentStepIndex - 1];
      if (prevStep) {
        const setData = exerciseData[prevStep.exerciseIndex]?.[prevStep.setIndex];
        if (setData) {
          setCurrentReps(setData.reps);
          setCurrentWeight(setData.weight);
          setCurrentSpeed(setData.speed ?? "");
        }
      }
    }
  };

  const getOverallProgress = () => {
    let completed = 0;
    let total = 0;
    exerciseData.forEach((sets) => {
      sets.forEach((set) => {
        total++;
        if (set.completed) completed++;
      });
    });
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  // Check if an exercise is fully complete (for dot indicators)
  const isExerciseComplete = (exIdx: number) => {
    return exerciseData[exIdx]?.every(s => s.completed) ?? false;
  };

  // Get video URL for current exercise
  // `null` = this exercise has no demo. It used to default to a placeholder
  // clip, which meant a video an admin had removed was replaced by an
  // unrelated one rather than by an honest empty state.
  const [currentVideo, setCurrentVideo] = useState<string | null>(null);

  useEffect(() => {
    if (exercises.length > 0 && currentExerciseIndex < exercises.length) {
      const exercise = exercises[currentExerciseIndex];
      if (exercise.videoUrl) {
        setCurrentVideo(exercise.videoUrl);
      } else {
        // Legacy fallback for exercises whose video was never denormalized.
        setCurrentVideo(null);
        getExerciseVideoUrlAsync(exercise.name).then(setCurrentVideo);
      }
    }
  }, [exercises, currentExerciseIndex]);

  // Show loading state
  if (loading || !workout || exercises.length === 0 || workoutFlow.length === 0) {
    return (
      <div className="fixed inset-0 z-100 bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-zinc-400">Loading workout...</p>
        </div>
      </div>
    );
  }

  // Superset context label — prefer groupLabel, fall back to group type + round number
  const supersetLabel = currentStep?.groupId
    ? (() => {
        const label = currentExercise?.groupLabel
        const gtype = currentExercise?.groupType?.toUpperCase() ?? 'ROUND'
        const round = currentStep.roundNumber + 1
        return label ? `${label} · ${round}` : `${gtype} ${round}`
      })()
    : null;

  return (
    <div className="fixed inset-0 z-100 bg-black text-white">
      {/* Stale incomplete workout prompt */}
      {staleIncomplete && (
        <IncompleteWorkoutModal
          stale={staleIncomplete}
          programId={programId}
          onResolve={handleResolveIncomplete}
          onDismiss={() => {
            setStaleIncomplete(null);
            router.back();
          }}
        />
      )}

      {/* Fullscreen video background - tappable */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={handleVideoTap}
      >
        {!currentVideo ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white/5 backdrop-blur-sm">
            <Dumbbell className="h-12 w-12 text-white/30" />
            <span className="text-sm font-medium text-white/40">No video available</span>
          </div>
        ) : (
          <FramedVideo
            src={currentVideo}
            surface="live"
            videoWidth={currentExercise?.videoWidth}
            videoHeight={currentExercise?.videoHeight}
            videoFraming={currentExercise?.videoFraming}
            videoTrim={currentExercise?.videoTrim}
            onDimensions={(w, h) => {
              // Back-write dims to the server the first time this video is
              // played by anyone. Fire-and-forget — workout flow keeps moving
              // regardless of the result.
              if (currentExercise?.videoWidth && currentExercise?.videoHeight) return;
              const slug = currentExercise?.exerciseSlug;
              if (!slug) return;
              const token = localStorage.getItem("token");
              void fetch(
                `/api/exercises/${encodeURIComponent(slug)}/video/dimensions`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ width: w, height: h }),
                }
              ).catch(() => {});
            }}
          />
        )}
      </div>

      {/* Top overlay - Exit & Timer */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-linear-to-b from-black/60 to-transparent"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Quick sessions return to their overview (persisted) so closing
                // live never strands the user with no way back into the session.
                // REPLACE, not push: otherwise the live entry lingers behind the
                // overview, and the overview's Back (router.back) returns INTO live
                // — the two ping-pong and the user can't leave the session (back loop).
                if (isQuick && quickSessionId) {
                  router.replace(quickSessionOverviewHref(quickSessionId, { saved: true, started: true }));
                }
                else router.back();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Track|Live tab (centered) — shown for BOTH program and quick workouts.
                Progress is shared, so switching to Track keeps every entered set. */}
            {workout && (isQuick ? !!quickSessionId : true) && (
              <div onClick={(e) => e.stopPropagation()}>
                <WorkoutViewToggle
                  active="live"
                  trackHref={isQuick
                    ? quickSessionTrackHref(quickSessionId || "")
                    : `/dashboard/workout/${programId}/workout?day=${encodeURIComponent(workout.day)}${scheduledDate ? `&sd=${encodeURIComponent(scheduledDate)}` : ""}`}
                  liveHref={isQuick
                    ? quickSessionLiveHref(quickSessionId || "")
                    : `/dashboard/workout/${programId}/workout/live?day=${encodeURIComponent(workout.day)}${scheduledDate ? `&sd=${encodeURIComponent(scheduledDate)}` : ""}`}
                  onDark
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              {/* Resume indicator */}
              <AnimatePresence>
                {showResumeIndicator && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-1.5 rounded-full bg-yellow-500/20 px-3 py-1.5 backdrop-blur-sm"
                  >
                    <svg className="h-4 w-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-yellow-400">Resuming</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div data-tour="live-timer" className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="font-mono text-sm tabular-nums">{formatTime(elapsedTime)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen mode indicator - small timer only */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute right-4 z-10"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
          >
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
              <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="font-mono text-sm tabular-nums">{formatTime(elapsedTime)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right side - Progress dots (like story indicators) */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute right-4 top-1/2 z-50 -translate-y-1/2 flex items-center"
            onClick={(e) => e.stopPropagation()}
            onPointerEnter={(e) => { if (e.pointerType === "mouse") setShowExerciseList(true); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setShowExerciseList(false); }}
          >
            {/* Expanded exercise list */}
            <AnimatePresence>
              {showExerciseList && (
                <motion.div
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="mr-3 w-[19rem] max-w-[calc(100vw-3.5rem)] rounded-xl bg-black/80 p-3 backdrop-blur-md"
                >
                  <p className="mb-2 text-xs font-medium text-white/50">EXERCISES</p>
                  <p className="mb-2 text-[10px] text-white/30">Tap to jump · hold to move</p>
                  <div className="space-y-2" ref={listRef}>
                    {exercises.map((exercise, idx) => {
                      // While a row is in hand, the list shows where it would land.
                      const lifted = drag?.from === idx;
                      const shift = drag && !lifted
                        ? (drag.from < idx && idx <= drag.to ? -1 : drag.to <= idx && idx < drag.from ? 1 : 0)
                        : 0;
                      return (
                      <div
                        key={idx}
                        data-testid={`live-row-${idx}`}
                        onPointerDown={(e) => { e.stopPropagation(); startLongPress(idx, e.clientY); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
                        onPointerMove={(e) => moveDrag(e.clientY)}
                        onPointerUp={(e) => { e.stopPropagation(); endPress(idx, false); }}
                        onPointerCancel={() => endPress(idx, true)}
                        style={{
                          transform: lifted ? `translateY(${drag!.dy}px) scale(1.02)` : shift ? `translateY(${shift * 100}%)` : undefined,
                          transition: lifted ? "none" : "transform 120ms ease",
                          touchAction: "none",
                        }}
                        className={`relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                          lifted
                            ? "z-10 bg-white/20 shadow-lg shadow-black/40 ring-1 ring-white/30"
                            : idx === currentExerciseIndex
                            ? "bg-white/10"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isExerciseComplete(idx)
                              ? "bg-green-500 text-white"
                              : idx === currentExerciseIndex
                              ? "bg-white text-black"
                              : "bg-white/20 text-white/60"
                          }`}
                        >
                          {isExerciseComplete(idx) ? (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-medium ${
                            idx === currentExerciseIndex ? "text-white" : "text-white/70"
                          }`}>
                            {exercise.name}
                          </p>
                          <p className="truncate text-xs text-white/40">
                            {exercise.sets} {setUnitLabel(exercise.trackingType, exercise.sets || 3).toLowerCase()}
                            {exercise.duration ? ` × ${exercise.duration}` : exercise.reps ? ` × ${exercise.reps}` : ""}
                            {exercise.groupId && <span className="ml-1 text-purple-300/80">· {exercise.groupLabel || "Superset"}</span>}
                          </p>
                        </div>
                        {idx === currentExerciseIndex && !drag && (
                          <span className="shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
                            Now
                          </span>
                        )}
                        {(exercise.groupId || idx + 1 < exercises.length) && (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); toggleGroupAt(idx); }}
                            aria-label={exercise.groupId ? `Ungroup ${exercise.name}` : `Superset ${exercise.name} with the next exercise`}
                            data-testid={`live-group-toggle-${idx}`}
                            className={`shrink-0 rounded-lg p-1.5 transition-colors ${exercise.groupId ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30" : "text-white/40 hover:bg-white/10 hover:text-white/80"}`}
                          >
                            {exercise.groupId ? <Unlink className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); requestRemoveAt(idx); }}
                          disabled={!canRemoveExercise(exercises)}
                          aria-label={`Remove ${exercise.name}`}
                          data-testid={`live-remove-${idx}`}
                          className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-300 disabled:opacity-20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      );
                    })}

                    {/* Build as you go — the workout is not fixed at the door. Fewer than
                        RECOMMENDED_MIN_EXERCISES exercises and the button nudges you to add more. */}
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); setShowAddExercise(true); }}
                      data-testid="live-add-exercise"
                      animate={shouldNudgeAddExercise && !reducedMotion ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                      transition={shouldNudgeAddExercise && !reducedMotion ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
                      className={`flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-left text-sm font-medium transition-colors ${
                        shouldNudgeAddExercise
                          ? "border-green-400/60 bg-green-500/10 text-green-300 hover:border-green-400 hover:bg-green-500/15"
                          : "border-white/20 text-white/70 hover:border-white/40 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${shouldNudgeAddExercise ? "bg-green-500/20" : "bg-white/10"}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                      Add exercise
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dots */}
            <div
              data-tour="live-exercise-dots"
              className="flex flex-col gap-2 cursor-pointer p-2"
              onClick={() => setShowExerciseList(!showExerciseList)}
            >
              {exercises.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 w-2 rounded-full transition-all ${
                    isExerciseComplete(idx)
                      ? "bg-green-500"
                      : idx === currentExerciseIndex
                      ? "bg-white h-4"
                      : "bg-white/30"
                  }`}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rest overlay */}
      <AnimatePresence>
        {isResting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            {/* Circular progress */}
            <div className="relative">
              <svg className="h-48 w-48 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="white" strokeWidth="2" opacity="0.2" />
                <circle
                  cx="50" cy="50" r="45" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(restTimeRemaining / (restTotalTime || 1)) * 283} 283`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold tabular-nums">{formatTime(restTimeRemaining)}</span>
                <span className="mt-1 text-sm text-white/60">REST</span>
              </div>
            </div>

            <p className="mt-6 text-lg text-white/80">
              Up next:{" "}
              <span className="font-semibold text-white">
                {currentExercise?.name}
              </span>
              {currentStep?.groupId ? (
                <span className="ml-2 text-sm text-white/60">
                  (Round {currentStep.roundNumber + 1})
                </span>
              ) : totalSets > 1 ? (
                <span className="ml-2 text-sm text-white/60">
                  ({setUnit} {currentSetIndex + 1} of {totalSets})
                </span>
              ) : null}
            </p>

            {/* Rest duration presets */}
            <div className="mt-6 flex items-center gap-2">
              {[
                { label: "60s", secs: 60 },
                { label: "90s", secs: 90 },
                { label: "2m", secs: 120 },
                { label: "3m", secs: 180 },
              ].map(({ label, secs }) => (
                <button
                  key={label}
                  onClick={() => { setRestTimeRemaining(secs); setRestTotalTime(secs); }}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                    restTotalTime === secs
                      ? "border-white bg-white text-black"
                      : "border-white/30 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={skipRest}
              className="mt-4 rounded-full border border-white/30 px-6 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/10"
            >
              Skip Rest
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom overlay - Exercise info & controls */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black/80 via-black/40 to-transparent p-4"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Exercise info */}
            <div data-tour="live-exercise-info" className="mb-4">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>Exercise {currentExerciseIndex + 1}/{totalExercises}</span>
                <span>•</span>
                <span>{setUnit} {currentSetIndex + 1}/{totalSets}</span>
                {supersetLabel && (
                  <>
                    <span>•</span>
                    <span className="text-purple-400">{supersetLabel}</span>
                  </>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <h1 className="text-2xl font-bold truncate">{currentExercise?.name}</h1>
                {swappedExercises[currentExerciseIndex] && (
                  <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                    Swapped
                  </span>
                )}
              </div>
              {/* Change what you are doing, or add to it, without leaving the set */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowSwapModal(true)}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white active:bg-white/30"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Swap Exercise
                </button>
                <motion.button
                  onClick={() => setShowAddExercise(true)}
                  data-testid="live-add-exercise-pill"
                  animate={shouldNudgeAddExercise && !reducedMotion ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                  transition={shouldNudgeAddExercise && !reducedMotion ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    shouldNudgeAddExercise
                      ? "bg-green-500/25 text-green-300 hover:bg-green-500/35 active:bg-green-500/45"
                      : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white active:bg-white/30"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Exercise
                </motion.button>
                {/* The way back out of a group you did not mean to make */}
                {currentExercise?.groupId && (
                  <button
                    onClick={() => toggleGroupAt(currentExerciseIndex)}
                    data-testid="live-ungroup-pill"
                    className="flex items-center gap-1.5 rounded-full bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-200 transition-colors hover:bg-purple-500/30 hover:text-white active:bg-purple-500/40"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Ungroup
                  </button>
                )}
              </div>
              {/* Tip / cue */}
              {currentExercise?.tip && (
                <p className="mt-1 text-sm text-green-400">{currentExercise.tip}</p>
              )}
              {/* Coach details / tempo / duration prescription */}
              {currentExercise?.details && (
                <p className="mt-1 text-sm text-blue-300/80">{currentExercise.details}</p>
              )}
              {(currentExercise?.tempo || currentExercise?.rpe || currentExercise?.duration) && (
                <p className="mt-0.5 text-xs text-amber-400/80">
                  {[
                    currentExercise.duration && currentExercise.duration,
                    currentExercise.tempo && `Tempo ${currentExercise.tempo}`,
                    currentExercise.rpe && `RPE ${currentExercise.rpe}`,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              {/* Primary muscles pills */}
              {currentExercise?.primaryMuscles && currentExercise.primaryMuscles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {currentExercise.primaryMuscles.slice(0, 3).map((m) => (
                    <span key={m} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50 capitalize">
                      {m.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              {/* Exercise history + PR row */}
              {currentExercise && (exerciseHistory[currentExercise.name] || exercisePRs[currentExercise.name]) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {exerciseHistory[currentExercise.name] && (
                    <p className="text-sm text-white/50">
                      Last:{" "}
                      <span className="font-medium text-white/70">
                        {(() => {
                          const h = exerciseHistory[currentExercise.name]
                          if (isIntervalExercise || showTimeInput) {
                            return h.duration ? `${h.duration}s` : h.reps ? `${h.reps}s` : "completed"
                          }
                          if (h.weight > 0) return `${h.weight} lbs × ${h.reps} reps`
                          return h.reps > 0 ? `${h.reps} reps` : "completed"
                        })()}
                      </span>
                    </p>
                  )}
                  {exercisePRs[currentExercise.name] && exercisePRs[currentExercise.name].weight > 0 && (
                    <p className="flex items-center gap-1 text-sm text-amber-400/80">
                      <span>🏆</span>
                      <span className="font-semibold">PR: {exercisePRs[currentExercise.name].weight} lbs</span>
                    </p>
                  )}
                </div>
              )}
              {/* Contextual nudge for THIS exercise (progression / plateau) */}
              {(() => {
                const slug = (currentExercise?.exerciseSlug || "").toLowerCase();
                const nudge = slug ? exerciseNudges[slug] : undefined;
                if (!nudge) return null;
                return (
                  <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2">
                    <span className="mt-0.5 text-sm" aria-hidden>⚡</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-300">{nudge.title}</p>
                      <p className="mt-0.5 text-xs leading-snug text-amber-100/80">{nudge.body}</p>
                    </div>
                    <button
                      onClick={() => dismissNudge(slug, nudge.id)}
                      aria-label="Dismiss nudge"
                      className="shrink-0 p-1 text-amber-200/60 transition-colors hover:text-amber-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Progress bar */}
            <div className="mb-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${getOverallProgress()}%` }}
                />
              </div>
              <span className="text-sm font-medium text-white/70 tabular-nums">{getOverallProgress()}%</span>
            </div>

            {/* Collapsible inputs */}
            <AnimatePresence>
              {showInputs && !isResting && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div data-tour="live-inputs" className="relative flex gap-3 mb-6">
                    {/* Weight input — only for reps_weight */}
                    {showWeightInput && (
                      <div className="flex-1">
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-xs text-white/60">
                            {bellStyle === 'dumbbell' ? 'Weight per DB (lbs)'
                              : bellStyle === 'kettlebell' ? 'Weight per KB (lbs)'
                              : 'Weight (lbs)'}
                          </label>
                          {currentExercise && exercisePRs[currentExercise.name] &&
                            exercisePRs[currentExercise.name].weight > 0 &&
                            Number(currentWeight) > exercisePRs[currentExercise.name].weight && (
                            <span className="text-[10px] font-bold text-amber-400 animate-pulse">🔥 NEW PR!</span>
                          )}
                        </div>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={currentWeight}
                          onChange={(e) => updateCurrentInput("weight", e.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                        />
                        {bellStyle === 'dumbbell' && Number(currentWeight) > 0 && (
                          <div className="mt-1 text-center text-[10px] text-white/40">
                            = {Number(currentWeight) * 2} lbs total
                          </div>
                        )}
                      </div>
                    )}
                    {/* Reps input — for reps_weight, reps_bodyweight, reps_only */}
                    {showRepsInput && (
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-white/60">Reps</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={currentReps}
                          onChange={(e) => updateCurrentInput("reps", e.target.value)}
                          placeholder={currentExercise?.reps?.split("-")[0] || "0"}
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                        />
                      </div>
                    )}
                    {/* Duration input — for time, time_distance, intervals */}
                    {showTimeInput && (
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-white/60">
                          {isIntervalExercise ? 'Duration (sec) — optional' : 'Duration (sec)'}
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={currentReps}
                          onChange={(e) => updateCurrentInput("reps", e.target.value)}
                          placeholder={currentExercise?.duration?.replace(/[^0-9]/g, "") || currentExercise?.reps || "30"}
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                        />
                      </div>
                    )}
                    {/* Distance input — time_distance only */}
                    {tracking === "time_distance" && (
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-white/60">Distance (m)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentWeight}
                          onChange={(e) => updateCurrentInput("weight", e.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                        />
                      </div>
                    )}
                    {/* Speed input — time_distance and intervals */}
                    {showSpeedInput && (
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-white/60">Speed (mph)</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={currentSpeed}
                          onChange={(e) => updateCurrentInput("speed", e.target.value)}
                          placeholder="0.0"
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                        />
                      </div>
                    )}
                    {isIntervalExercise && !currentReps && (
                      <p className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-white/40">
                        Log time or just tap Done to move on
                      </p>
                    )}
                  </div>

                  {/* Quick weight buttons — only for weighted exercises */}
                  {showWeightInput && (
                    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                      {[45, 95, 135, 185, 225].map((weight) => (
                        <button
                          key={weight}
                          onClick={() => updateCurrentInput("weight", weight.toString())}
                          className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/20"
                        >
                          {weight}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={goToPrevious}
                disabled={currentStepIndex === 0}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm disabled:opacity-30"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                onClick={() => setShowInputs(!showInputs)}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm"
              >
                <svg className={`h-6 w-6 transition-transform ${showInputs ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>

              <button
                onClick={handleCompleteOrSkipSet}
                disabled={isResting || saving}
                data-tour="live-complete-set"
                className={`flex-1 rounded-full py-4 text-lg font-bold shadow-lg transition-all disabled:opacity-50 ${
                  isSkipping
                    ? "bg-zinc-600 shadow-zinc-600/30 hover:bg-zinc-500"
                    : "bg-green-500 shadow-green-500/30 hover:bg-green-400"
                }`}
              >
                {isLastStep
                  ? "Finish Workout"
                  : isSkipping
                  ? `Skip ${setUnit} →`
                  : isIntervalExercise
                  ? "Done →"
                  : `Complete ${setUnit} →`}
              </button>
            </div>

            {/* Previous set reference */}
            {currentSetIndex > 0 && exerciseData[currentExerciseIndex]?.[currentSetIndex - 1]?.completed && (
              <p className="mt-3 text-center text-sm text-white/50">
                {isIntervalExercise
                  ? exerciseData[currentExerciseIndex][currentSetIndex - 1].reps
                    ? `Round ${currentSetIndex}: ${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps}s`
                    : `Round ${currentSetIndex}: done`
                  : showWeightInput
                  ? `Last set: ${exerciseData[currentExerciseIndex][currentSetIndex - 1].weight} lbs × ${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps} reps`
                  : showTimeInput
                  ? `Last ${setUnit.toLowerCase()}: ${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps}s`
                  : `Last set: ${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps} reps`}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Set indicators (like Snapchat story progress) */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            data-tour="live-set-progress"
            className="absolute left-4 right-4 z-10 flex gap-1"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4rem)' }}
          >
            {Array.from({ length: totalSets }).map((_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className={`h-full transition-all ${
                    i < currentSetIndex ? "w-full bg-green-500" : i === currentSetIndex ? "w-1/2 bg-white" : "w-0"
                  }`}
                />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip Confirmation Modal */}
      <AnimatePresence>
        {showSkipModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowSkipModal(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl bg-zinc-900 p-5 sm:p-6 shadow-2xl border border-zinc-800"
            >
              {/* Warning Icon */}
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
                <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h3 className="mb-2 text-center text-xl font-bold text-white">
                Skip {setUnit}?
              </h3>

              <p className="mb-1 text-center text-sm text-zinc-400">
                Are you sure you want to skip this {setUnit.toLowerCase()} of <span className="font-semibold text-white">{currentExercise?.name}</span>?
              </p>

              <p className="mb-6 text-center text-xs text-zinc-500">
                {setUnit} {currentSetIndex + 1} of {totalSets}
              </p>

              <div className="flex flex-col gap-3">
                {/* Swap alternative option */}
                <button
                  onClick={() => {
                    setShowSkipModal(false);
                    setShowSwapModal(true);
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Swap for Alternative
                </button>

                <button
                  onClick={() => skipSet()}
                  className="rounded-lg bg-zinc-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-zinc-600"
                >
                  Skip This {setUnit} Only
                </button>

                <button
                  onClick={() => skipExercise()}
                  className="rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  Skip All {setUnitPlural} ({totalSets} {setUnitPlural.toLowerCase()} total)
                </button>

                <button
                  onClick={() => setShowSkipModal(false)}
                  className="rounded-lg border border-zinc-700 px-4 py-3 font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Confirmation Modal */}
      <AnimatePresence>
        {showEditConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowEditConfirmModal(false)}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl bg-zinc-900 p-5 sm:p-6 shadow-2xl border border-zinc-800"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/20">
                <svg className="h-7 w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>

              <h3 className="mb-2 text-center text-xl font-bold text-white">
                Update Set?
              </h3>

              <p className="mb-2 text-center text-sm text-zinc-400">
                This set was already logged. Save new values?
              </p>

              {currentStep && (
                <div className="mb-6 flex justify-center gap-4 text-sm">
                  <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                    <p className="text-xs text-zinc-500">Before</p>
                    <p className="font-semibold text-white">
                      {exerciseData[currentStep.exerciseIndex]?.[currentStep.setIndex]?.weight || 0} lbs &times; {exerciseData[currentStep.exerciseIndex]?.[currentStep.setIndex]?.reps || 0}
                    </p>
                  </div>
                  <div className="flex items-center text-zinc-600">&rarr;</div>
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-center">
                    <p className="text-xs text-green-400">After</p>
                    <p className="font-semibold text-white">
                      {currentWeight || 0} lbs &times; {currentReps || 0}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowEditConfirmModal(false);
                    completeSet();
                  }}
                  className="rounded-lg bg-green-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-green-500"
                >
                  Save Changes
                </button>

                <button
                  onClick={() => setShowEditConfirmModal(false)}
                  className="rounded-lg border border-zinc-700 px-4 py-3 font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workout Summary Overlay */}
      <AnimatePresence>
        {showSummary && (
          <WorkoutSummary
            programCompleted={programCompleted}
            completedProgramName={completedProgramName}
            programId={programId}
            workout={workout}
            elapsedTime={elapsedTime}
            exerciseData={exerciseData}
            exercises={exercises}
            exerciseHistory={exerciseHistory}
            summaryStreak={summaryStreak}
            summaryGoal={summaryGoal}
            formatTime={formatTime}
            onDone={() => router.push("/dashboard/workout")}
          />
        )}
      </AnimatePresence>

      {pendingDayChoice && (
        <DayChoiceModal
          originalKey={pendingDayChoice.originalKey}
          todayKey={pendingDayChoice.todayKey}
          onChoose={resolveDayChoice}
        />
      )}

      {pendingQuickCompletion && workout && (
        <QuickSessionNamePrompt
          initialName={workout.title}
          confirmLabel="Save name & finish"
          tone="dark"
          onConfirm={finishNamedQuickSession}
          onCancel={() => setPendingQuickCompletion(null)}
        />
      )}

      {/* Exercise Swap Modal — always mounted to prevent unmount/remount flashing */}
      <ConfirmModal
        open={confirmRemoveIdx !== null}
        tone="dark"
        destructive
        title={`Remove ${confirmRemoveIdx !== null ? exercises[confirmRemoveIdx]?.name ?? "this exercise" : ""}?`}
        body="You have already logged sets against it. They go with it."
        confirmLabel="Remove it"
        cancelLabel="Keep it"
        onConfirm={() => { if (confirmRemoveIdx !== null) dropExerciseAt(confirmRemoveIdx); }}
        onCancel={() => setConfirmRemoveIdx(null)}
      />

      <ThinSessionModal
        open={showThinFinish}
        exerciseCount={exercises.length}
        tone="dark"
        onClose={() => setShowThinFinish(false)}
        onAddExercise={() => { setShowThinFinish(false); setShowAddExercise(true); }}
        onFinishAnyway={() => {
          // Asked and answered — this session will not ask again.
          setThinFinishAcked(true);
          setShowThinFinish(false);
          completeSet();
        }}
      />

      <AddExerciseSheet
        open={showAddExercise}
        onClose={() => setShowAddExercise(false)}
        onAdd={handleAddExercise}
        anchorName={currentExercise?.name}
        anchorInGroup={!!currentExercise?.groupId}
        tone="dark"
      />

      <ExerciseSwapModal
        isOpen={showSwapModal}
        onClose={() => setShowSwapModal(false)}
        onSwap={(alt, scope) => handleSwapExercise(alt, scope)}
        exerciseSlug={currentExercise?.exerciseSlug || ""}
        exerciseName={currentExercise?.name || ""}
        workoutExerciseSlugs={exercises.map(e => e.exerciseSlug || "").filter(Boolean)}
        programRole={undefined}
        sessionScopeOnly={isQuick}
      />
    </div>
  );
}

// ─── Workout Summary ──────────────────────────────────────────────────────────

// WorkoutSummary, ConfettiBurst, WORKOUT_QUOTES, GOAL_CLOSINGS, getDayOfYear, SummaryProps
// are all imported from @/components/WorkoutSummary above.
