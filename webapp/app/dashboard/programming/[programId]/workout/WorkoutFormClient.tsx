"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import ExerciseSwapModal, { type SwapScope } from "@/components/ExerciseSwapModal";
import IncompleteWorkoutModal, { type StaleIncompleteData } from "@/components/IncompleteWorkoutModal";
import WorkoutSummary from "@/components/WorkoutSummary";
import { getExerciseVideoUrl, getExerciseThumbnail } from "@/lib/data/exerciseVideos";
import { groupExercises, type ExerciseGroup } from "@/lib/workoutUtils";

// Video player component with local video or YouTube embed support
function VideoPlayer({ exerciseName }: { exerciseName: string }) {
  const videoUrl = getExerciseVideoUrl(exerciseName);
  const thumbnailUrl = getExerciseThumbnail(exerciseName);
  const isLocalVideo = videoUrl.startsWith('/') && (videoUrl.endsWith('.mp4') || videoUrl.endsWith('.mov'));

  // For local videos, show inline video player
  if (isLocalVideo) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-900">
        <video
          className="h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src={videoUrl} type={videoUrl.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'} />
        </video>
        <div className="absolute top-2 right-2">
          <span className="inline-block rounded bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Demo
          </span>
        </div>
      </div>
    );
  }

  // For YouTube videos (future use when real videos are added)
  const [isPlaying, setIsPlaying] = useState(false);

  if (isPlaying) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`${videoUrl}?autoplay=1&rel=0&modestbranding=1`}
          title={`${exerciseName} demo video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsPlaying(true)}
      className="relative aspect-video w-full overflow-hidden rounded-lg group cursor-pointer"
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={`${exerciseName} thumbnail`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="h-full w-full bg-linear-to-br from-zinc-600 to-zinc-700" />
      )}
      <div className="absolute inset-0 bg-black/30 transition-opacity group-hover:bg-black/40" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
          <svg className="h-7 w-7 text-green-600 ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <div className="absolute bottom-2 left-2 right-2">
        <span className="inline-block rounded bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          Watch Demo
        </span>
      </div>
    </button>
  );
}

interface SetData {
  reps: string;
  weight: string;
  completed: boolean;
  duration: string;
  distance: string;
}

interface ExerciseProgress {
  exerciseIndex: number;
  sets: SetData[];
}

interface SavedSetData {
  setNumber: number;
  reps: number;
  weight: number;
  completed: boolean;
  duration?: number;
  distance?: number;
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
}

interface Exercise {
  exerciseSlug?: string;
  name: string;
  type?: string;
  trackingType?: string;      // reps_weight | reps_bodyweight | reps_only | time | time_distance | intervals | none
  sets?: number;
  reps?: string;
  rest?: string;
  tempo?: string;
  rpe?: number;
  duration?: string;
  details?: string;
  tip?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
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

// Color/style config per group type
const GROUP_STYLES: Record<string, { border: string; bg: string; badge: string; icon: string }> = {
  superset: { border: "border-purple-200 dark:border-purple-900/40", bg: "bg-purple-50/50 dark:bg-purple-950/20", badge: "bg-purple-500", icon: "⇄" },
  circuit: { border: "border-orange-200 dark:border-orange-900/40", bg: "bg-orange-50/50 dark:bg-orange-950/20", badge: "bg-orange-500", icon: "🔄" },
  triset: { border: "border-indigo-200 dark:border-indigo-900/40", bg: "bg-indigo-50/50 dark:bg-indigo-950/20", badge: "bg-indigo-500", icon: "⇄" },
  giant_set: { border: "border-rose-200 dark:border-rose-900/40", bg: "bg-rose-50/50 dark:bg-rose-950/20", badge: "bg-rose-500", icon: "⇄" },
  emom: { border: "border-teal-200 dark:border-teal-900/40", bg: "bg-teal-50/50 dark:bg-teal-950/20", badge: "bg-teal-500", icon: "⏱" },
  amrap: { border: "border-amber-200 dark:border-amber-900/40", bg: "bg-amber-50/50 dark:bg-amber-950/20", badge: "bg-amber-500", icon: "🔥" },
};

// Fallback demo data in case API fails
const fallbackWorkout: WorkoutData = {
  day: "Day 1",
  title: "Upper Body Strength + Conditioning",
  exercises: [
    { name: "Bench Press", type: "strength", sets: 3, reps: "8-10", rest: "90s" },
    { name: "Seated Cable Row", type: "strength", sets: 3, reps: "10-12", rest: "90s" },
    { name: "Dumbbell Shoulder Press", type: "strength", sets: 3, reps: "10-12", rest: "60s" },
    { name: "Lat Pulldown", type: "strength", sets: 3, reps: "10-12", rest: "60s" },
    { name: "Tricep Pushdown", type: "strength", sets: 3, reps: "12-15", rest: "45s" },
    { name: "Bicep Curls", type: "strength", sets: 3, reps: "12-15", rest: "45s" },
  ],
};

export default function WorkoutFormPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const programId = params.programId as string;
  const requestedDay = searchParams.get("day");
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isResuming, setIsResuming] = useState(false);
  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgress[]>([]);
  const [expandedExercise, setExpandedExercise] = useState<number | null>(0);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipModalExerciseIndex, setSkipModalExerciseIndex] = useState<number | null>(null);
  const [skipModalSetIndex, setSkipModalSetIndex] = useState<number | null>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapExerciseIndex, setSwapExerciseIndex] = useState<number | null>(null);
  // Track which exercises have been swapped: exerciseIndex -> { originalSlug, originalName }
  const [swappedExercises, setSwappedExercises] = useState<Record<number, { originalSlug: string; originalName: string }>>({});
  const [staleIncomplete, setStaleIncomplete] = useState<StaleIncompleteData | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Summary state
  const [showSummary, setShowSummary] = useState(false);
  const [programCompleted, setProgramCompleted] = useState(false);
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [completedProgramName, setCompletedProgramName] = useState("");
  const [workoutStartTime] = useState(() => Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [summaryStreak, setSummaryStreak] = useState<{ streakDays: number; nextMilestone: number | null } | null>(null);
  const [summaryGoal, setSummaryGoal] = useState<string | null>(null);
  const [exerciseHistory, setExerciseHistory] = useState<Record<string, { weight: number; reps: number; duration?: number; date: string }>>({});

  // Load the current workout from API
  useEffect(() => {
    const loadWorkout = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          // Use fallback for unauthenticated users
          setWorkout(fallbackWorkout);
          setExerciseProgress(
            fallbackWorkout.exercises.map((ex, i) => ({
              exerciseIndex: i,
              sets: Array.from({ length: ex.sets || 3 }, () => ({
                reps: "",
                weight: "",
                completed: false,
                duration: "",
                distance: "",
              })),
            }))
          );
          setLoading(false);
          return;
        }

        // Fetch the current workout for this program
        const res = await fetch(`/api/programs/current-workout?programId=${programId}${requestedDay ? `&day=${encodeURIComponent(requestedDay)}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          let workoutData: WorkoutData = {
            day: data.day || "Day 1",
            title: data.workout?.title || "Training",
            exercises: data.workout?.exercises || fallbackWorkout.exercises
          };
          setWorkout(workoutData);
          setCurrentPhase(data.phase || 1);
          
          // Initialize exercise progress
          const initialProgress = workoutData.exercises.map((ex, i) => ({
            exerciseIndex: i,
            sets: Array.from({ length: ex.sets || 3 }, () => ({
              reps: "",
              weight: "",
              completed: false,
              duration: "",
              distance: "",
            })),
          }));
          setExerciseProgress(initialProgress);

          // Now check for in-progress workout for today (also fetch exercise history)
          const progressRes = await fetch(`/api/workouts?programId=${programId}&day=${encodeURIComponent(workoutData.day)}&includeHistory=true`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.exerciseHistory) {
              setExerciseHistory(progressData.exerciseHistory);
            }
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
                  // This exercise was swapped — restore the swapped identity
                  updatedExercises[idx] = {
                    ...updatedExercises[idx],
                    name: savedEx.name,
                    exerciseSlug: savedEx.exerciseSlug || updatedExercises[idx].exerciseSlug,
                  };
                  restoredSwaps[idx] = {
                    originalSlug: savedEx.originalExerciseSlug,
                    originalName: savedEx.swappedFromName || updatedExercises[idx].name,
                  };
                }
              });

              if (Object.keys(restoredSwaps).length > 0) {
                workoutData = { ...workoutData, exercises: updatedExercises };
                setWorkout(workoutData);
                setSwappedExercises(restoredSwaps);
              }

              // Match progress by index (not name) so swapped exercises restore correctly
              const restoredProgress = updatedExercises.map((ex, exIdx) => {
                const savedEx = savedWorkout.exercises?.[exIdx];
                // Verify match: same index, and either same name or has swap metadata
                const isMatch = savedEx && (
                  savedEx.name === ex.name ||
                  savedEx.originalExerciseSlug ||
                  savedEx.swappedFromName
                );
                return {
                  exerciseIndex: exIdx,
                  sets: isMatch && savedEx
                    ? savedEx.sets.map(s => ({
                        reps: s.reps > 0 ? s.reps.toString() : "",
                        weight: s.weight > 0 ? s.weight.toString() : "",
                        completed: s.completed,
                        duration: s.duration != null && s.duration > 0 ? s.duration.toString() : "",
                        distance: s.distance != null && s.distance > 0 ? s.distance.toString() : "",
                      }))
                    : Array.from({ length: ex.sets || 3 }, () => ({
                        reps: "",
                        weight: "",
                        completed: false,
                        duration: "",
                        distance: "",
                      }))
                };
              });

              setExerciseProgress(restoredProgress);
              setIsResuming(true);

              // Expand first incomplete exercise
              for (let i = 0; i < restoredProgress.length; i++) {
                if (restoredProgress[i].sets.some(s => !s.completed)) {
                  setExpandedExercise(i);
                  break;
                }
              }
            }
          }
        } else {
          // Fallback to demo workout
          setWorkout(fallbackWorkout);
          setExerciseProgress(
            fallbackWorkout.exercises.map((ex, i) => ({
              exerciseIndex: i,
              sets: Array.from({ length: ex.sets || 3 }, () => ({
                reps: "",
                weight: "",
                completed: false,
                duration: "",
                distance: "",
              })),
            }))
          );
        }
      } catch (error) {
        console.error("Error loading workout:", error);
        // Fallback to demo workout
        setWorkout(fallbackWorkout);
        setExerciseProgress(
          fallbackWorkout.exercises.map((ex, i) => ({
            exerciseIndex: i,
            sets: Array.from({ length: ex.sets || 3 }, () => ({
              reps: "",
              weight: "",
              completed: false,
              duration: "",
              distance: "",
            })),
          }))
        );
      } finally {
        setLoading(false);
      }
    };

    loadWorkout();
  }, [programId, requestedDay]);

  // Auto-save function
  const autoSave = useCallback(async (progress: ExerciseProgress[]) => {
    if (!workout) return;
    
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const totalSets = progress.reduce((acc, ep) => acc + ep.sets.length, 0);
      const completedSets = progress.reduce(
        (acc, ep) => acc + ep.sets.filter((s) => s.completed).length,
        0
      );
      const isComplete = completedSets === totalSets && totalSets > 0;

      const exercises = workout.exercises.map((exercise, index) => {
        const ep = progress.find((p) => p.exerciseIndex === index);
        const swap = swappedExercises[index];
        return {
          name: exercise.name,
          ...(exercise.exerciseSlug && { exerciseSlug: exercise.exerciseSlug }),
          sets: ep?.sets.map((set, setIndex) => {
            const isTimeBased = ["time", "time_distance", "intervals"].includes(exercise.trackingType || "");
            return {
              setNumber: setIndex + 1,
              reps: isTimeBased ? 0 : (parseInt(set.reps) || 0),
              weight: parseFloat(set.weight) || 0,
              completed: set.completed,
              ...(set.duration && { duration: parseFloat(set.duration) }),
              ...(set.distance && { distance: parseFloat(set.distance) }),
            };
          }) || [],
          // Pass through grouping metadata for analytics
          ...(exercise.groupId && { groupId: exercise.groupId }),
          ...(exercise.groupType && { groupType: exercise.groupType }),
          // Swap tracking
          ...(swap && { originalExerciseSlug: swap.originalSlug, swappedFromName: swap.originalName }),
        };
      });

      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          programId,
          phase: currentPhase,
          day: workout.day,
          exercises,
          completed: isComplete,
          ...(workoutNotes.trim() && { notes: workoutNotes.trim() })
        })
      });
      if (isComplete && res.ok) {
        const data = await res.json();
        if (data.programCompleted) {
          setProgramCompleted(true);
          setCompletedProgramName(data.programName || "");
        }
      }
    } catch (error) {
      console.error("Error auto-saving:", error);
    }
  }, [programId, workout, currentPhase, swappedExercises]);

  // Debounced auto-save for text input changes
  const debouncedAutoSave = useCallback((progress: ExerciseProgress[]) => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave(progress);
    }, 500);
  }, [autoSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Elapsed workout timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - workoutStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [workoutStartTime]);

  // Fetch streak + goal when summary appears
  useEffect(() => {
    if (!showSummary) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch('/api/streak', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSummaryStreak({ streakDays: d.streakDays, nextMilestone: d.nextMilestone ?? null }) })
      .catch(() => {});
    fetch('/api/profile', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.profile?.fitnessGoal) setSummaryGoal(d.profile.fitnessGoal) })
      .catch(() => {});
  }, [showSummary]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleResolveIncomplete = (
    action: "continue" | "restart" | "count" | "skip",
    nextDay?: string | null,
  ) => {
    if (action === "continue") {
      // Navigate to live workout — the resolve API re-dated the log so it will resume
      router.push(
        `/dashboard/programming/${programId}/workout/live?day=${encodeURIComponent(staleIncomplete!.day)}`
      );
    } else if (action === "restart") {
      // Stale log deleted, close modal and proceed to the current workout fresh
      setStaleIncomplete(null);
    } else {
      // count or skip — clear modal then go to next day
      setStaleIncomplete(null);
      const target = nextDay
        ? `/dashboard/programming/${programId}/workout?day=${encodeURIComponent(nextDay)}`
        : `/dashboard/programming/${programId}/workout`;
      router.replace(target);
    }
  };

  const updateSet = (exerciseIndex: number, setIndex: number, field: keyof SetData, value: string | boolean) => {
    setExerciseProgress((prev) => {
      const updated = prev.map((ep) =>
        ep.exerciseIndex === exerciseIndex
          ? {
              ...ep,
              sets: ep.sets.map((set, si) =>
                si === setIndex ? { ...set, [field]: value } : set
              ),
            }
          : ep
      );
      
      // Auto-save on any change (debounced for text inputs, immediate for checkbox)
      if (field === "completed") {
        autoSave(updated);
      } else {
        debouncedAutoSave(updated);
      }
      
      return updated;
    });
  };

  const toggleSetComplete = (exerciseIndex: number, setIndex: number) => {
    const progress = exerciseProgress.find((ep) => ep.exerciseIndex === exerciseIndex);
    if (progress) {
      updateSet(exerciseIndex, setIndex, "completed", !progress.sets[setIndex].completed);
    }
  };

  const skipSet = useCallback((exerciseIndex: number, setIndex: number) => {
    setExerciseProgress((prev) => {
      const updated = prev.map((ep) =>
        ep.exerciseIndex === exerciseIndex
          ? {
              ...ep,
              sets: ep.sets.map((set, si) =>
                si === setIndex
                  ? { reps: "0", weight: "0", completed: true, duration: "", distance: "" }
                  : set
              ),
            }
          : ep
      );
      autoSave(updated);
      return updated;
    });
    setShowSkipModal(false);
  }, [autoSave]);

  const skipExercise = useCallback((exerciseIndex: number) => {
    setExerciseProgress((prev) => {
      const updated = prev.map((ep) =>
        ep.exerciseIndex === exerciseIndex
          ? {
              ...ep,
              sets: ep.sets.map(() => ({
                reps: "0",
                weight: "0",
                completed: true,
                duration: "",
                distance: "",
              })),
            }
          : ep
      );
      autoSave(updated);
      return updated;
    });
    setShowSkipModal(false);
  }, [autoSave]);

  const openSkipModal = (exerciseIndex: number, setIndex: number) => {
    setSkipModalExerciseIndex(exerciseIndex);
    setSkipModalSetIndex(setIndex);
    setShowSkipModal(true);
  };

  const openSwapModal = (exerciseIndex: number) => {
    setSwapExerciseIndex(exerciseIndex);
    setShowSwapModal(true);
  };

  const handleSwapExercise = useCallback((exerciseIndex: number, alternative: { slug: string; name: string; trackingType: string; equipment: string[]; category: string }, scope: SwapScope) => {
    if (!workout) return;

    const oldExercise = workout.exercises[exerciseIndex];
    const originalSlug = swappedExercises[exerciseIndex]?.originalSlug || oldExercise.exerciseSlug || "";
    const originalName = swappedExercises[exerciseIndex]?.originalName || oldExercise.name;

    // Track the swap
    setSwappedExercises(prev => ({
      ...prev,
      [exerciseIndex]: { originalSlug, originalName }
    }));

    // Replace the exercise in the workout, preserving sets/reps/rest prescription
    const updatedExercises = [...workout.exercises];
    updatedExercises[exerciseIndex] = {
      ...oldExercise,
      exerciseSlug: alternative.slug,
      name: alternative.name,
      type: alternative.category,
    };

    setWorkout({ ...workout, exercises: updatedExercises });

    // Save permanent swap if scope is 'program'
    if (scope === 'program') {
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

    // Reset progress for this exercise (fresh start with new exercise)
    setExerciseProgress(prev => {
      const updated = prev.map(ep =>
        ep.exerciseIndex === exerciseIndex
          ? {
              ...ep,
              sets: Array.from({ length: oldExercise.sets || 3 }, () => ({
                reps: "",
                weight: "",
                completed: false,
                duration: "",
                distance: "",
              })),
            }
          : ep
      );
      // Auto-save after swap
      autoSave(updated);
      return updated;
    });

    setShowSwapModal(false);
  }, [workout, swappedExercises, autoSave, programId]);

  const getExerciseCompletion = (exerciseIndex: number) => {
    const progress = exerciseProgress.find((ep) => ep.exerciseIndex === exerciseIndex);
    if (!progress) return 0;
    const completed = progress.sets.filter((s) => s.completed).length;
    return Math.round((completed / progress.sets.length) * 100);
  };

  const getTotalCompletion = () => {
    const totalSets = exerciseProgress.reduce((acc, ep) => acc + ep.sets.length, 0);
    if (totalSets === 0) return 0;
    const completedSets = exerciseProgress.reduce(
      (acc, ep) => acc + ep.sets.filter((s) => s.completed).length,
      0
    );
    return Math.round((completedSets / totalSets) * 100);
  };

  // Show loading state
  if (loading || !workout) {
    return (
      <PageTransition className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-zinc-500 dark:text-zinc-400">Loading workout...</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="pb-6">
      {/* Stale incomplete workout prompt */}
      {staleIncomplete && (
        <IncompleteWorkoutModal
          stale={staleIncomplete}
          programId={programId}
          onResolve={handleResolveIncomplete}
          onDismiss={() => setStaleIncomplete(null)}
        />
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-lg dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-all hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="text-center">
              <h1 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">
                {workout.title}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{workout.day}</p>
            </div>

            <button
              onClick={() => router.push(`/dashboard/programming/${programId}/workout/live?day=${encodeURIComponent(workout.day)}`)}
              className="flex items-center gap-1.5 rounded-full bg-green-500 px-3 py-1.5 text-sm font-medium text-white shadow-lg shadow-green-500/25 transition-all hover:bg-green-600"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Live
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-2">
                Workout Progress
                {isResuming && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Resumed
                  </span>
                )}
              </span>
              <span>{getTotalCompletion()}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <motion.div
                className="h-full bg-linear-to-r from-green-500 to-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${getTotalCompletion()}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Link
                href="/dashboard/progress#records"
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                View PRs →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Exercise List */}
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="space-y-3 sm:space-y-4">
          {groupExercises(workout.exercises).map((group, groupIndex) => {
            const isGrouped = group.groupId !== null && group.exercises.length > 1;
            const groupStyle = isGrouped ? GROUP_STYLES[group.groupType || "superset"] || GROUP_STYLES.superset : null;

            // Render a single exercise card (reused for grouped and ungrouped)
            const renderExerciseCard = (exercise: Exercise, exerciseIndex: number, isInsideGroup: boolean) => {
              const progress = exerciseProgress.find((ep) => ep.exerciseIndex === exerciseIndex);
              const completion = getExerciseCompletion(exerciseIndex);
              const isExpanded = expandedExercise === exerciseIndex;

              return (
                <motion.div
                  key={exerciseIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: exerciseIndex * 0.05 }}
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all dark:bg-zinc-900 ${isInsideGroup ? "sm:rounded-xl" : "sm:rounded-2xl"} ${
                    completion === 100
                      ? "border-green-300 dark:border-green-800"
                      : isInsideGroup
                        ? "border-zinc-100 dark:border-zinc-800"
                        : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  {/* Exercise header */}
                  <button
                    onClick={() => setExpandedExercise(isExpanded ? null : exerciseIndex)}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-sm ${
                        completion === 100
                          ? "bg-linear-to-br from-green-500 to-emerald-600 text-white"
                          : "bg-linear-to-br from-zinc-900 to-zinc-700 text-white dark:from-zinc-700 dark:to-zinc-600"
                      }`}
                    >
                      {completion === 100 ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        exerciseIndex + 1
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-zinc-900 dark:text-white truncate">{exercise.name}</h3>
                        {swappedExercises[exerciseIndex] && (
                          <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            Swapped
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {exercise.sets} sets
                          {exercise.duration
                            ? ` × ${exercise.duration}`
                            : exercise.reps
                            ? ` × ${exercise.reps}${["time","time_distance","intervals"].includes(exercise.trackingType||"") ? "s" : ""}`
                            : ""}
                        </span>
                        {exercise.rest && <span className="text-xs text-green-600 dark:text-green-400">{exercise.rest} rest</span>}
                        {exercise.tempo && <span className="text-xs text-amber-600 dark:text-amber-400">Tempo {exercise.tempo}</span>}
                        {exercise.difficulty && <span className="text-xs capitalize text-zinc-400 dark:text-zinc-500">{exercise.difficulty}</span>}
                      </div>
                    </div>

                    {/* Swap button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSwapModal(exerciseIndex);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-all hover:bg-blue-100 hover:text-blue-600 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                      title="Swap exercise"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </button>

                    {/* Mini progress */}
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                        <div
                          className="h-full bg-linear-to-r from-green-500 to-emerald-500 transition-all"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                      <motion.svg
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="h-5 w-5 text-zinc-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </motion.svg>
                    </div>
                  </button>

                  {/* Expanded sets form */}
                  <AnimatePresence>
                    {isExpanded && progress && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                          {/* Video Demo Section */}
                          <div className="mb-4">
                            <VideoPlayer exerciseName={exercise.name} />
                          </div>

                          {/* Prescription meta — details / tempo / muscles */}
                          {(() => {
                            const tracking = exercise.trackingType || "reps_weight"
                            const showWeight = tracking === "reps_weight"
                            const isTimeBased = ["time", "time_distance", "intervals"].includes(tracking)
                            const isNone = tracking === "none"
                            const prescription = [
                              exercise.duration && `${exercise.duration}`,
                              exercise.tempo && `Tempo ${exercise.tempo}`,
                              exercise.rpe && `RPE ${exercise.rpe}`,
                            ].filter(Boolean).join(" · ")
                            return (
                              <div className="mb-3 space-y-1.5">
                                {(exercise.details || exercise.tip) && (
                                  <p className="text-xs text-blue-600 dark:text-blue-400 leading-snug">
                                    {exercise.details || exercise.tip}
                                  </p>
                                )}
                                {prescription && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400">{prescription}</p>
                                )}
                                {exercise.primaryMuscles && exercise.primaryMuscles.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {exercise.primaryMuscles.slice(0, 4).map((m) => (
                                      <span key={m} className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                                        {m.replace(/_/g, " ")}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* Interval prescription hint */}
                                {tracking === "intervals" && (
                                  <p className="text-xs text-teal-600 dark:text-teal-400">
                                    Log duration per interval — or just mark each Done ✓
                                  </p>
                                )}
                                {isNone && (
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">No tracking needed — just mark complete.</p>
                                )}
                                {/* Exercise history hint */}
                                {exerciseHistory[exercise.name] && (() => {
                                  const h = exerciseHistory[exercise.name]
                                  const label = isTimeBased
                                    ? (h.duration ? `${h.duration}s` : h.reps ? `${h.reps}s` : 'completed')
                                    : h.weight > 0 ? `${h.weight} lbs × ${h.reps} reps`
                                    : h.reps > 0 ? `${h.reps} reps` : null
                                  return label ? (
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                      Last session: <span className="font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
                                    </p>
                                  ) : null
                                })()}
                                {/* Column headers */}
                                <div className="mt-2 grid grid-cols-12 gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                  <div className="col-span-2">Set</div>
                                  {showWeight && <div className="col-span-3">Weight</div>}
                                  {!isNone && (
                                    <div className={showWeight ? "col-span-3" : "col-span-6"}>
                                      {isTimeBased ? (tracking === "time_distance" ? "Sec" : "Sec") : "Reps"}
                                    </div>
                                  )}
                                  {tracking === "time_distance" && <div className="col-span-2">Dist (m)</div>}
                                  <div className={`${showWeight ? "col-span-4" : isNone ? "col-span-10" : tracking === "time_distance" ? "col-span-2" : "col-span-4"} text-center`}>Done</div>
                                </div>
                              </div>
                            )
                          })()}

                          {/* Set rows */}
                          {(() => {
                            const tracking = exercise.trackingType || "reps_weight"
                            const showWeight = tracking === "reps_weight"
                            const isTimeBased = ["time", "time_distance", "intervals"].includes(tracking)
                            const isNone = tracking === "none"
                            const repPlaceholder = isTimeBased
                              ? (exercise.duration?.replace(/[^0-9]/g, "") || "30")
                              : (exercise.reps?.split("-")[0] || "0")
                            return (
                              <div className="space-y-2">
                                {progress.sets.map((set, setIndex) => (
                                  <motion.div
                                    key={setIndex}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: setIndex * 0.05 }}
                                    className={`grid grid-cols-12 items-center gap-2 rounded-lg p-2 transition-colors ${
                                      set.completed
                                        ? "bg-green-100 dark:bg-green-900/20"
                                        : "bg-white dark:bg-zinc-800"
                                    }`}
                                  >
                                    <div className="col-span-2">
                                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                                        {setIndex + 1}
                                      </span>
                                    </div>
                                    {/* Weight input — only for reps_weight */}
                                    {showWeight && (
                                      <div className="col-span-3">
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          placeholder="0"
                                          value={set.weight}
                                          onChange={(e) => updateSet(exerciseIndex, setIndex, "weight", e.target.value)}
                                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-medium focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                        />
                                      </div>
                                    )}
                                    {/* Reps / Duration input */}
                                    {!isNone && (
                                      <div className={showWeight ? "col-span-3" : "col-span-6"}>
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          placeholder={repPlaceholder}
                                          value={isTimeBased ? set.duration : set.reps}
                                          onChange={(e) => updateSet(exerciseIndex, setIndex, isTimeBased ? "duration" : "reps", e.target.value)}
                                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-medium focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                        />
                                      </div>
                                    )}
                                    {/* Distance input — time_distance only */}
                                    {tracking === "time_distance" && (
                                      <div className="col-span-2">
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          placeholder="0"
                                          value={set.distance}
                                          onChange={(e) => updateSet(exerciseIndex, setIndex, "distance", e.target.value)}
                                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-medium focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                        />
                                      </div>
                                    )}
                                    {/* Actions */}
                                    <div className={`${showWeight ? "col-span-4" : isNone ? "col-span-10" : tracking === "time_distance" ? "col-span-2" : "col-span-4"} flex justify-center gap-1`}>
                                      {!set.completed && !set.weight && !set.reps && !isNone && showWeight && (
                                        <button
                                          onClick={() => openSkipModal(exerciseIndex, setIndex)}
                                          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-zinc-300 bg-white hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-600 dark:bg-zinc-700 dark:hover:border-amber-500 dark:hover:bg-amber-900/20 transition-all"
                                          title="Skip set"
                                        >
                                          <svg className="h-4 w-4 text-zinc-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                          </svg>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => toggleSetComplete(exerciseIndex, setIndex)}
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-all ${
                                          set.completed
                                            ? "border-green-500 bg-green-500 text-white"
                                            : "border-zinc-300 bg-white hover:border-green-400 dark:border-zinc-600 dark:bg-zinc-700"
                                        }`}
                                      >
                                        {set.completed && (
                                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            };

            // GROUPED exercises: rounds-based layout (supersets alternate)
            if (isGrouped && groupStyle) {
              const maxRounds = Math.max(
                group.groupRounds || 0,
                ...group.exercises.map(({ exercise }) => exercise.sets || 3)
              );
              const groupCompletion = (() => {
                let completed = 0;
                let total = 0;
                for (const { originalIndex, exercise } of group.exercises) {
                  const progress = exerciseProgress.find((ep) => ep.exerciseIndex === originalIndex);
                  const numSets = exercise.sets || 3;
                  total += numSets;
                  if (progress) completed += progress.sets.filter((s) => s.completed).length;
                }
                return total === 0 ? 0 : Math.round((completed / total) * 100);
              })();

              return (
                <div
                  key={`group-${groupIndex}`}
                  className={`overflow-hidden rounded-xl border ${groupStyle.border} ${groupStyle.bg} p-3 sm:p-4`}
                >
                  {/* Group header */}
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${groupStyle.badge} text-white`}>
                      {groupStyle.icon}
                    </span>
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      {group.groupLabel || group.groupType}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      — {group.exercises.length} exercises{group.groupRest ? `, ${group.groupRest} rest between rounds` : ", minimal rest between exercises"}
                    </span>
                    {/* Group progress */}
                    <div className="ml-auto flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/40 dark:bg-zinc-700">
                        <div
                          className="h-full bg-linear-to-r from-green-500 to-emerald-500 transition-all"
                          style={{ width: `${groupCompletion}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{groupCompletion}%</span>
                    </div>
                  </div>

                  {/* Rounds-based layout: alternating between exercises */}
                  <div className="space-y-3">
                    {Array.from({ length: maxRounds }, (_, roundIndex) => (
                      <div key={roundIndex} className="rounded-xl border border-zinc-200/60 bg-white/60 p-3 dark:border-zinc-700/60 dark:bg-zinc-900/60">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            Round {roundIndex + 1}
                          </span>
                          {group.groupRest && roundIndex > 0 && (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              ({group.groupRest} rest)
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {group.exercises.map(({ exercise, originalIndex }) => {
                            const numSets = exercise.sets || 3;
                            if (roundIndex >= numSets) return null;
                            const progress = exerciseProgress.find((ep) => ep.exerciseIndex === originalIndex);
                            const set = progress?.sets[roundIndex];
                            if (!set) return null;
                            return (
                              <div key={originalIndex} className="rounded-lg border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                                      {exercise.name}
                                    </span>
                                    {swappedExercises[originalIndex] && (
                                      <span className="shrink-0 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                        Swapped
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSwapModal(originalIndex);
                                      }}
                                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-all hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                                      title="Swap exercise"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                      </svg>
                                    </button>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{exercise.reps}</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-12 items-center gap-2">
                                  <div className="col-span-4">
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      placeholder="0"
                                      value={set.weight}
                                      onChange={(e) => updateSet(originalIndex, roundIndex, "weight", e.target.value)}
                                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-medium focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                    />
                                    <div className="mt-0.5 text-center text-[10px] text-zinc-400">lbs</div>
                                  </div>
                                  <div className="col-span-4">
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      placeholder={exercise.reps?.split("-")[0] || "0"}
                                      value={set.reps}
                                      onChange={(e) => updateSet(originalIndex, roundIndex, "reps", e.target.value)}
                                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-medium focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                    />
                                    <div className="mt-0.5 text-center text-[10px] text-zinc-400">reps</div>
                                  </div>
                                  <div className="col-span-4 flex justify-center gap-1">
                                    {!set.completed && !set.weight && !set.reps && (
                                      <button
                                        onClick={() => openSkipModal(originalIndex, roundIndex)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-zinc-300 bg-white hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-600 dark:bg-zinc-700 dark:hover:border-amber-500 dark:hover:bg-amber-900/20 transition-all"
                                        title="Skip set"
                                      >
                                        <svg className="h-4 w-4 text-zinc-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    )}
                                    <button
                                      onClick={() => toggleSetComplete(originalIndex, roundIndex)}
                                      className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-all ${
                                        set.completed
                                          ? "border-green-500 bg-green-500 text-white"
                                          : "border-zinc-300 bg-white hover:border-green-400 dark:border-zinc-600 dark:bg-zinc-700"
                                      }`}
                                    >
                                      {set.completed && (
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            // UNGROUPED exercise: render normally
            return group.exercises.map(({ exercise, originalIndex }) =>
              renderExerciseCard(exercise, originalIndex, false)
            );
          })}
        </div>

        {/* Workout notes — appears once any set is completed */}
        {getTotalCompletion() > 0 && (
          <div className="mt-6">
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Session Notes <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              value={workoutNotes}
              onChange={e => setWorkoutNotes(e.target.value)}
              rows={2}
              placeholder="How did it feel? Any PRs, adjustments, or reminders..."
              className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
            />
          </div>
        )}

        {/* Complete Workout button - only shows when 100% complete */}
        <AnimatePresence>
          {getTotalCompletion() === 100 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-4 sm:mt-6"
            >
              <button
                onClick={async () => {
                  await autoSave(exerciseProgress);
                  setShowSummary(true);
                }}
                className="w-full rounded-xl bg-linear-to-r from-green-500 to-emerald-600 py-4 font-semibold text-white shadow-sm transition-all hover:brightness-105"
              >
                Complete Workout! 🎉
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Workout Summary Overlay */}
      <AnimatePresence>
        {showSummary && workout && (
          <WorkoutSummary
            programCompleted={programCompleted}
            completedProgramName={completedProgramName}
            workout={workout}
            elapsedTime={elapsedTime}
            exerciseData={workout.exercises.map((_, i) => {
              const ep = exerciseProgress.find(p => p.exerciseIndex === i);
              return ep?.sets ?? [];
            })}
            exercises={workout.exercises}
            exerciseHistory={exerciseHistory}
            summaryStreak={summaryStreak}
            summaryGoal={summaryGoal}
            formatTime={formatTime}
            onDone={() => router.push("/dashboard/programming")}
          />
        )}
      </AnimatePresence>

      {/* Skip Confirmation Modal */}
      <AnimatePresence>
        {showSkipModal && skipModalExerciseIndex !== null && skipModalSetIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setShowSkipModal(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
            >
              {/* Warning Icon */}
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <svg className="h-7 w-7 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h3 className="mb-2 text-center text-xl font-bold text-zinc-900 dark:text-white">
                Skip Set?
              </h3>
              
              <p className="mb-1 text-center text-sm text-zinc-600 dark:text-zinc-400">
                Are you sure you want to skip this set of{" "}
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {workout?.exercises[skipModalExerciseIndex]?.name}
                </span>?
              </p>

              <p className="mb-6 text-center text-xs text-zinc-500 dark:text-zinc-500">
                Set {skipModalSetIndex + 1} of {workout?.exercises[skipModalExerciseIndex]?.sets}
              </p>

              <div className="flex flex-col gap-3">
                {/* Swap alternative option */}
                <button
                  onClick={() => {
                    setShowSkipModal(false);
                    openSwapModal(skipModalExerciseIndex);
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Swap for Alternative
                </button>

                <button
                  onClick={() => skipSet(skipModalExerciseIndex, skipModalSetIndex)}
                  className="rounded-lg bg-zinc-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                >
                  Skip This Set Only
                </button>

                <button
                  onClick={() => skipExercise(skipModalExerciseIndex)}
                  className="rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  Skip All Sets ({workout?.exercises[skipModalExerciseIndex]?.sets} sets total)
                </button>

                <button
                  onClick={() => setShowSkipModal(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-3 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exercise Swap Modal */}
      {swapExerciseIndex !== null && workout?.exercises[swapExerciseIndex] && (
        <ExerciseSwapModal
          isOpen={showSwapModal}
          onClose={() => {
            setShowSwapModal(false);
            setSwapExerciseIndex(null);
          }}
          onSwap={(alt, scope) => handleSwapExercise(swapExerciseIndex, alt, scope)}
          exerciseSlug={workout.exercises[swapExerciseIndex].exerciseSlug || ""}
          exerciseName={workout.exercises[swapExerciseIndex].name}
          workoutExerciseSlugs={workout.exercises.map(e => e.exerciseSlug || "").filter(Boolean)}
          programRole={workout.exercises[swapExerciseIndex].type === "conditioning" ? undefined : undefined}
        />
      )}
    </PageTransition>
  );
}
