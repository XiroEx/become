"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell, X } from "lucide-react";
import { getExerciseVideoUrlAsync } from "@/lib/data/exerciseVideos";
import { buildWorkoutFlow, type WorkoutStep } from "@/lib/workoutUtils";
import ExerciseSwapModal, { type SwapScope } from "@/components/ExerciseSwapModal";
import IncompleteWorkoutModal, { type StaleIncompleteData } from "@/components/IncompleteWorkoutModal";
import WorkoutSummary, { ConfettiBurst, WORKOUT_QUOTES, GOAL_CLOSINGS, getDayOfYear, type SummaryProps } from "@/components/WorkoutSummary";
import FramedVideo from "@/components/FramedVideo";
import type { VideoFramingOverride } from "@/lib/videoFraming";
import { readQuickSession, QUICK_PROGRAM_ID } from "@/lib/quickSession/store";
import { invalidateMindSession } from "@/lib/mind/sessionCache";

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
  completed: boolean;
}

interface SavedExercise {
  name: string;
  exerciseSlug?: string;
  sets: SavedSetData[];
  originalExerciseSlug?: string;
  swappedFromName?: string;
}

interface SavedWorkout {
  exercises: SavedExercise[];
  completed: boolean;
  activeSeconds?: number;
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
  primaryMuscles?: string[];
  difficulty?: string;
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
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
  const params = useParams();
  const searchParams = useSearchParams();
  const programId = params.programId as string;
  const requestedDay = searchParams.get("day");
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

  // Determine which inputs to show based on trackingType
  const tracking = currentExercise?.trackingType || "reps_weight";
  const showWeightInput = tracking === "reps_weight";
  const showRepsInput = ["reps_weight", "reps_bodyweight", "reps_only"].includes(tracking);
  const showTimeInput = ["time", "time_distance", "intervals"].includes(tracking);
  const isIntervalExercise = tracking === "intervals";
  const showSpeedInput = tracking === "time_distance" || tracking === "intervals";

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

  // Initialize exercises and build flow helper. Optional `prefill` map seeds
  // reps/weight/speed from the user's last completed set per exercise slug —
  // so opening a fresh workout starts with last-time's numbers ready to
  // confirm, NOT marked complete.
  type PerformanceEntry = {
    reps?: number;
    weight?: number;
    speed?: number;
    duration?: number;
    distance?: number;
  };
  const initializeExercises = (
    exList: Exercise[],
    prefill?: Record<string, PerformanceEntry | null>,
  ) => {
    const data = exList.map((ex) => {
      // Match either by direct slug or by name-normalized slug — same logic
      // the endpoint uses on its side.
      const directSlug = ex.exerciseSlug?.toLowerCase();
      const nameSlug = ex.name
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const prior =
        (directSlug && prefill?.[directSlug]) ||
        (nameSlug && prefill?.[nameSlug]) ||
        null;
      return Array.from({ length: ex.sets || 3 }, () => ({
        reps: prior?.reps != null ? String(prior.reps) : '',
        weight: prior?.weight != null ? String(prior.weight) : '',
        speed: prior?.speed != null ? String(prior.speed) : '',
        completed: false,
      }));
    });
    const flow = buildWorkoutFlow(exList);
    return { data, flow };
  };

  // Fetch the user's last-completed-set per exercise so the live workout can
  // prefill inputs. Best-effort — failure returns an empty map and we fall
  // back to empty inputs.
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
      const data = (await res.json()) as { performances?: Record<string, PerformanceEntry | null> };
      return data.performances ?? {};
    } catch {
      return {};
    }
  };

  // Load the current workout from API
  useEffect(() => {
    const loadWorkout = async () => {
      try {
        // ── Quick-session mode: load the stashed draft, no program fetches ──
        if (isQuick) {
          const stored = quickSessionId ? readQuickSession(quickSessionId) : null;
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
          }));
          const title = stored?.title || "Quick Session";
          setQuickMeta({ title, focus: stored?.focus });

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
          const { data, flow } = initializeExercises(exs, lastPerformance);
          setExerciseData(data);
          setWorkoutFlow(flow);
          setLoading(false);
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

          // Prefill from last completed set per exercise — kicked off in
          // parallel with the resume-progress lookup below so we don't add
          // latency in the resume path. Results are used only on fresh
          // start (resume / draft override entirely).
          const prefillPromise = fetchLastPerformance(token, workoutData.exercises);
          const lastPerformance = await prefillPromise;

          let { data: initialData, flow } = initializeExercises(workoutData.exercises, lastPerformance);
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

              // Restore swapped exercises from saved workout
              const updatedExercises = [...workoutData.exercises];
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

              if (Object.keys(restoredSwaps).length > 0) {
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
                  return savedEx.sets.map(s => ({
                    reps: s.reps > 0 ? s.reps.toString() : "",
                    weight: s.weight > 0 ? s.weight.toString() : "",
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

              // Find first incomplete step (fixed: uses flow with early return)
              const resumeIdx = findFirstIncompleteStep(flow, restoredData);
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

  // Find the first incomplete step in the flow
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
  const saveWorkout = useCallback(async (exerciseDataToSave: SetData[][], isComplete: boolean) => {
    if (!workout) return;
    // Re-entrant guard: prevent double-tap / concurrent auto-save from firing two POSTs
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const exercisesToSave = exercises.map((exercise, index) => {
        const swap = swappedExercises[index];
        return {
          name: exercise.name,
          ...(exercise.exerciseSlug && { exerciseSlug: exercise.exerciseSlug }),
          sets: exerciseDataToSave[index]?.map((set, setIndex) => ({
            setNumber: setIndex + 1,
            reps: parseInt(set.reps) || 0,
            weight: parseFloat(set.weight) || 0,
            ...(set.speed && parseFloat(set.speed) > 0 && { speed: parseFloat(set.speed) }),
            completed: set.completed
          })) || [],
          ...(exercise.groupId && { groupId: exercise.groupId }),
          ...(exercise.groupType && { groupType: exercise.groupType }),
          ...(swap && { originalExerciseSlug: swap.originalSlug, swappedFromName: swap.originalName }),
        };
      });
      // Snapshot active seconds now so the server stores the time at the
      // moment of save, not the time the request lands.
      const activeSecondsAtSave = activeSecondsBaseline + Math.floor((Date.now() - sessionStartTime) / 1000);
      // Quick sessions post a kind:'quick' body (matched server-side by
      // sessionId); program sessions post the program/phase/day body.
      const saveBody = isQuick && quickSessionId
        ? {
            kind: "quick" as const,
            sessionId: quickSessionId,
            title: workout.title,
            ...(quickMeta?.focus && { focus: quickMeta.focus }),
            exercises: exercisesToSave,
            completed: isComplete,
            activeSeconds: activeSecondsAtSave,
            ...(isComplete && { duration: Math.max(1, Math.round(activeSecondsAtSave / 60)) }),
            tz: new Date().getTimezoneOffset(),
          }
        : {
            programId,
            phase: currentPhase,
            day: workout.day,
            exercises: exercisesToSave,
            completed: isComplete,
            activeSeconds: activeSecondsAtSave,
            ...(isComplete && { duration: Math.max(1, Math.round(activeSecondsAtSave / 60)) }),
            tz: new Date().getTimezoneOffset(),
          };
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(saveBody),
      });
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
        // Activity changed → next Mind load composes a fresh session.
        invalidateMindSession();
      }
    } catch (error) {
      console.error("Error saving workout:", error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [programId, workout, exercises, currentPhase, swappedExercises, activeSecondsBaseline, sessionStartTime, isQuick, quickSessionId, quickMeta]);

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

  // Advance to next step with appropriate rest
  const advanceStep = useCallback((updatedData: SetData[][], isComplete: boolean) => {
    if (isComplete) {
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
  }, [currentStepIndex, workoutFlow, exercises, router]);

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

    setExerciseData(updatedData);

    // Clear auto-save timeout since we're doing an immediate save
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    saveWorkout(updatedData, isLastStep);
    advanceStep(updatedData, isLastStep);
  }, [currentStep, currentReps, currentWeight, isLastStep, exerciseData, saveWorkout, advanceStep]);

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

    setExerciseData(updatedData);
    setShowSkipModal(false);

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    saveWorkout(updatedData, isLastStep);
    advanceStep(updatedData, isLastStep);
  }, [currentStep, isLastStep, exerciseData, saveWorkout, advanceStep]);

  const skipExercise = useCallback(async () => {
    if (!currentStep) return;

    // Mark all sets for the current exercise as skipped
    const updatedData = exerciseData.map((sets, exIdx) =>
      exIdx === currentStep.exerciseIndex
        ? sets.map(() => ({ reps: "0", weight: "0", speed: "", completed: true }))
        : sets
    );

    setExerciseData(updatedData);
    setShowSkipModal(false);

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    // Find the next step that isn't for the skipped exercise
    let nextIdx = currentStepIndex + 1;
    while (nextIdx < workoutFlow.length && workoutFlow[nextIdx].exerciseIndex === currentStep.exerciseIndex) {
      nextIdx++;
    }

    const allDone = nextIdx >= workoutFlow.length;
    saveWorkout(updatedData, allDone);

    if (allDone) {
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
  }, [currentStep, currentStepIndex, workoutFlow, exerciseData, saveWorkout, router, exercises]);

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
  }, [currentExerciseIndex, exercises, exerciseData, swappedExercises, saveWorkout, programId, isQuick]);

  const handleCompleteOrSkipSet = () => {
    // On the final step, empty inputs just finish the workout — don't prompt to skip
    if (isSkipping && !isLastStep) {
      setShowSkipModal(true);
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
  const [currentVideo, setCurrentVideo] = useState<string>("/placeholder.mp4");

  useEffect(() => {
    if (exercises.length > 0 && currentExerciseIndex < exercises.length) {
      const exercise = exercises[currentExerciseIndex];
      if (exercise.videoUrl) {
        setCurrentVideo(exercise.videoUrl);
      } else {
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
        {currentVideo === '/placeholder.mp4' || currentVideo === '/placeholder2.mp4' ? (
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
              onClick={(e) => { e.stopPropagation(); router.back(); }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

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

              <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
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
            onMouseEnter={() => setShowExerciseList(true)}
            onMouseLeave={() => setShowExerciseList(false)}
          >
            {/* Expanded exercise list */}
            <AnimatePresence>
              {showExerciseList && (
                <motion.div
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="mr-3 rounded-xl bg-black/80 p-3 backdrop-blur-md"
                >
                  <p className="mb-2 text-xs font-medium text-white/50">EXERCISES</p>
                  <div className="space-y-2">
                    {exercises.map((exercise, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                          idx === currentExerciseIndex
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
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            idx === currentExerciseIndex ? "text-white" : "text-white/70"
                          }`}>
                            {exercise.name}
                          </p>
                          <p className="text-xs text-white/40">
                            {exercise.sets} sets × {exercise.reps}
                          </p>
                        </div>
                        {idx === currentExerciseIndex && (
                          <div className="ml-auto shrink-0">
                            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                              Current
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dots */}
            <div
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
                  (Set {currentSetIndex + 1} of {totalSets})
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
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>Exercise {currentExerciseIndex + 1}/{totalExercises}</span>
                <span>•</span>
                <span>Set {currentSetIndex + 1}/{totalSets}</span>
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
              <button
                onClick={() => setShowSwapModal(true)}
                className="mt-1.5 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/20 hover:text-white active:bg-white/30"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Swap Exercise
              </button>
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
                  <div className="relative flex gap-3 mb-6">
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
                          inputMode="numeric"
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
                className={`flex-1 rounded-full py-4 text-lg font-bold shadow-lg transition-all disabled:opacity-50 ${
                  isSkipping
                    ? "bg-zinc-600 shadow-zinc-600/30 hover:bg-zinc-500"
                    : "bg-green-500 shadow-green-500/30 hover:bg-green-400"
                }`}
              >
                {isLastStep
                  ? "Finish Workout"
                  : isSkipping
                  ? "Skip Set →"
                  : isIntervalExercise
                  ? "Done →"
                  : "Complete Set →"}
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
                  ? `Last set: ${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps}s`
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
                Skip Set?
              </h3>

              <p className="mb-1 text-center text-sm text-zinc-400">
                Are you sure you want to skip this set of <span className="font-semibold text-white">{currentExercise?.name}</span>?
              </p>

              <p className="mb-6 text-center text-xs text-zinc-500">
                Set {currentSetIndex + 1} of {totalSets}
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
                  Skip This Set Only
                </button>

                <button
                  onClick={() => skipExercise()}
                  className="rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  Skip All Sets ({totalSets} sets total)
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

      {/* Exercise Swap Modal — always mounted to prevent unmount/remount flashing */}
      <ExerciseSwapModal
        isOpen={showSwapModal}
        onClose={() => setShowSwapModal(false)}
        onSwap={(alt, scope) => handleSwapExercise(alt, scope)}
        exerciseSlug={currentExercise?.exerciseSlug || ""}
        exerciseName={currentExercise?.name || ""}
        workoutExerciseSlugs={exercises.map(e => e.exerciseSlug || "").filter(Boolean)}
        programRole={undefined}
      />
    </div>
  );
}

// ─── Workout Summary ──────────────────────────────────────────────────────────

// WorkoutSummary, ConfettiBurst, WORKOUT_QUOTES, GOAL_CLOSINGS, getDayOfYear, SummaryProps
// are all imported from @/components/WorkoutSummary above.
