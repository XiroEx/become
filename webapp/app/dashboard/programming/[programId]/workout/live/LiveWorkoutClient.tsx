"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Dumbbell } from "lucide-react";
import { getExerciseVideoUrlAsync } from "@/lib/data/exerciseVideos";
import { buildWorkoutFlow, type WorkoutStep } from "@/lib/workoutUtils";
import ExerciseSwapModal, { type SwapScope } from "@/components/ExerciseSwapModal";
import IncompleteWorkoutModal, { type StaleIncompleteData } from "@/components/IncompleteWorkoutModal";

interface SetData {
  reps: string;
  weight: string;
  completed: boolean;
}

interface SavedSetData {
  setNumber: number;
  reps: number;
  weight: number;
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
}

interface Exercise {
  exerciseSlug?: string;
  name: string;
  type?: string;
  trackingType?: string; // reps_weight | reps_bodyweight | reps_only | time | time_distance | intervals | none
  sets?: number;
  reps?: string;
  rest?: string;
  tip?: string;
  details?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
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
  const [workoutStartTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [exerciseData, setExerciseData] = useState<SetData[][]>([]);
  const [currentReps, setCurrentReps] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [programCompleted, setProgramCompleted] = useState(false);
  const [completedProgramName, setCompletedProgramName] = useState("");
  const [showSwapModal, setShowSwapModal] = useState(false);
  // Track which exercises have been swapped: exerciseIndex -> { originalSlug, originalName }
  const [swappedExercises, setSwappedExercises] = useState<Record<number, { originalSlug: string; originalName: string }>>({});

  // Exercise history from past workouts (e.g. "Last time: 185 lbs × 8 reps")
  const [exerciseHistory, setExerciseHistory] = useState<Record<string, { weight: number; reps: number; date: string }>>({});

  // Stale incomplete workout detection
  const [staleIncomplete, setStaleIncomplete] = useState<StaleIncompleteData | null>(null);
  // Increment to re-trigger loadWorkout (used when user picks "continue" after stale detection)
  const [loadKey, setLoadKey] = useState(0);

  // Auto-save ref
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derive current position from the flow
  const currentStep = workoutFlow[currentStepIndex];
  const currentExerciseIndex = currentStep?.exerciseIndex ?? 0;
  const currentSetIndex = currentStep?.setIndex ?? 0;
  const currentExercise = exercises[currentExerciseIndex];
  const totalExercises = exercises.length;
  const totalSets = currentExercise?.sets || 3;

  const isLastStep = currentStepIndex === workoutFlow.length - 1;

  // Determine which inputs to show based on trackingType
  const tracking = currentExercise?.trackingType || "reps_weight";
  const showWeightInput = tracking === "reps_weight";
  const showRepsInput = ["reps_weight", "reps_bodyweight", "reps_only"].includes(tracking);
  const showTimeInput = ["time", "time_distance"].includes(tracking);

  // Check if inputs are empty (for skip button text)
  const isSkipping = showWeightInput ? !currentReps && !currentWeight : !currentReps;

  // Toggle fullscreen mode when tapping video
  const handleVideoTap = () => {
    if (!isResting) {
      setIsFullscreen(!isFullscreen);
    }
  };

  // Initialize exercises and build flow helper
  const initializeExercises = (exList: Exercise[]) => {
    const data = exList.map((ex) =>
      Array.from({ length: ex.sets || 3 }, () => ({
        reps: "",
        weight: "",
        completed: false,
      }))
    );
    const flow = buildWorkoutFlow(exList);
    return { data, flow };
  };

  // Load the current workout from API
  useEffect(() => {
    const loadWorkout = async () => {
      try {
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

          let { data: initialData, flow } = initializeExercises(workoutData.exercises);
          setExerciseData(initialData);
          setWorkoutFlow(flow);

          // Check for in-progress workout to resume (also fetch exercise history)
          const progressRes = await fetch(`/api/workouts?programId=${programId}&day=${encodeURIComponent(workoutData.day)}&includeHistory=true`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.exerciseHistory) {
              setExerciseHistory(progressData.exerciseHistory);
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
                    completed: s.completed
                  }));
                }
                return Array.from({ length: ex.sets || 3 }, () => ({
                  reps: "",
                  weight: "",
                  completed: false,
                }));
              });

              setExerciseData(restoredData);
              setIsResuming(true);
              setShowResumeIndicator(true);

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
                }
              }

              setTimeout(() => setShowResumeIndicator(false), 3000);
            }
          }
        } else {
          setWorkout({ day: "Day 1", title: "Training", exercises: fallbackExercises });
          setExercises(fallbackExercises);
          const { data: d, flow: f } = initializeExercises(fallbackExercises);
          setExerciseData(d);
          setWorkoutFlow(f);
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
  }, [programId, requestedDay, loadKey]);

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
      // Re-trigger loadWorkout — the resolve API re-dated the log so isResume will fire
      setStaleIncomplete(null);
      setLoadKey((k) => k + 1);
    } else if (action === "restart") {
      // Stale log was deleted; workout is already in fresh state, just close modal
      setStaleIncomplete(null);
    } else {
      // count or skip — clear modal then navigate to the next day
      setStaleIncomplete(null);
      const target = nextDay
        ? `/dashboard/programming/${programId}/workout/live?day=${encodeURIComponent(nextDay)}`
        : `/dashboard/programming/${programId}/workout/live`;
      router.replace(target);
    }
  };

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
      setIsResting(false);
    }
    return () => clearInterval(interval);
  }, [isResting, restTimeRemaining]);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - workoutStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [workoutStartTime]);

  // Cleanup auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Save workout progress
  const saveWorkout = useCallback(async (exerciseDataToSave: SetData[][], isComplete: boolean) => {
    if (!workout) return;

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
            completed: set.completed
          })) || [],
          ...(exercise.groupId && { groupId: exercise.groupId }),
          ...(exercise.groupType && { groupType: exercise.groupType }),
          ...(swap && { originalExerciseSlug: swap.originalSlug, swappedFromName: swap.originalName }),
        };
      });
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ programId, phase: currentPhase, day: workout.day, exercises: exercisesToSave, completed: isComplete })
      });
      if (isComplete && res.ok) {
        const data = await res.json();
        if (data.programCompleted) {
          setProgramCompleted(true);
          setCompletedProgramName(data.programName || "");
        }
      }
    } catch (error) {
      console.error("Error saving workout:", error);
    } finally {
      setSaving(false);
    }
  }, [programId, workout, exercises, currentPhase, swappedExercises]);

  // Auto-save: update exerciseData on input change + debounced save
  const updateCurrentInput = useCallback((field: "reps" | "weight", value: string) => {
    if (field === "reps") setCurrentReps(value);
    if (field === "weight") setCurrentWeight(value);

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
  const getRestDuration = (step: WorkoutStep): number => {
    const exercise = exercises[step.exerciseIndex];
    if (step.groupId && !step.isLastInRound) {
      // Within a superset round — no rest between exercises
      return 0;
    } else if (step.groupId && step.isLastInRound) {
      // End of a superset round — use groupRest or exercise rest
      return parseRestTime(exercise?.groupRest || exercise?.rest || "60s");
    }
    // Normal exercise
    return parseRestTime(exercise?.rest || "60s");
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
              ? { reps: currentReps, weight: currentWeight, completed: true }
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
              ? { reps: "0", weight: "0", completed: true }
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
        ? sets.map(() => ({ reps: "0", weight: "0", completed: true }))
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

    // Replace the exercise, preserving programming prescription
    const updatedExercises = [...exercises];
    updatedExercises[exIdx] = {
      ...oldExercise,
      exerciseSlug: alternative.slug,
      name: alternative.name,
      type: alternative.category,
      trackingType: alternative.trackingType,
    };
    setExercises(updatedExercises);

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

    // Reset set data for this exercise
    const updatedData = exerciseData.map((sets, idx) =>
      idx === exIdx
        ? Array.from({ length: oldExercise.sets || 3 }, () => ({
            reps: "",
            weight: "",
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

    // Auto-save the swap
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    saveWorkout(updatedData, false);

    setShowSwapModal(false);
    setShowSkipModal(false);
  }, [currentExerciseIndex, exercises, exerciseData, swappedExercises, saveWorkout, programId]);

  const handleCompleteOrSkipSet = () => {
    if (isSkipping) {
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

  // Superset context label
  const supersetLabel = currentStep?.groupId
    ? `Round ${currentStep.roundNumber + 1}`
    : null;

  return (
    <div className="fixed inset-0 z-100 bg-black text-white">
      {/* Stale incomplete workout prompt */}
      {staleIncomplete && (
        <IncompleteWorkoutModal
          stale={staleIncomplete}
          programId={programId}
          onResolve={handleResolveIncomplete}
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
          <video
            key={currentVideo}
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          >
            <source src={currentVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
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

            <button
              onClick={skipRest}
              className="mt-6 rounded-full border border-white/30 px-6 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/10"
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
              <p className="mt-1 text-sm text-green-400">{currentExercise?.tip}</p>
              {/* Exercise history from past workouts */}
              {currentExercise && exerciseHistory[currentExercise.name] && (
                <p className="mt-1.5 text-sm text-white/50">
                  Last time:{" "}
                  <span className="font-medium text-white/70">
                    {exerciseHistory[currentExercise.name].weight > 0
                      ? `${exerciseHistory[currentExercise.name].weight} lbs × ${exerciseHistory[currentExercise.name].reps} reps`
                      : `${exerciseHistory[currentExercise.name].reps} reps`}
                  </span>
                </p>
              )}
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
                  <div className="flex gap-3 mb-4">
                    {/* Weight input — only for reps_weight */}
                    {showWeightInput && (
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-white/60">Weight (lbs)</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={currentWeight}
                          onChange={(e) => updateCurrentInput("weight", e.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                        />
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
                    {/* Duration input — for time, time_distance */}
                    {showTimeInput && (
                      <div className="flex-1">
                        <label className="mb-1 block text-xs text-white/60">Duration (sec)</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={currentReps}
                          onChange={(e) => updateCurrentInput("reps", e.target.value)}
                          placeholder={currentExercise?.reps || "30"}
                          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                        />
                      </div>
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
                disabled={isResting}
                className={`flex-1 rounded-full py-4 text-lg font-bold shadow-lg transition-all disabled:opacity-50 ${
                  isSkipping
                    ? "bg-zinc-600 shadow-zinc-600/30 hover:bg-zinc-500"
                    : "bg-green-500 shadow-green-500/30 hover:bg-green-400"
                }`}
              >
                {isLastStep
                  ? "Finish Workout 🎉"
                  : isSkipping
                  ? "Skip Set →"
                  : "Complete Set →"}
              </button>
            </div>

            {/* Previous set reference */}
            {currentSetIndex > 0 && exerciseData[currentExerciseIndex]?.[currentSetIndex - 1]?.completed && (
              <p className="mt-3 text-center text-sm text-white/50">
                Last set: {showWeightInput
                  ? `${exerciseData[currentExerciseIndex][currentSetIndex - 1].weight} lbs × ${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps} reps`
                  : showTimeInput
                  ? `${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps}s`
                  : `${exerciseData[currentExerciseIndex][currentSetIndex - 1].reps} reps`}
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
              className="relative w-full max-w-md rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-zinc-800"
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
              className="relative w-full max-w-md rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-zinc-800"
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-black text-white overflow-y-auto overscroll-contain"
            style={{
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
            }}
          >
            <div className="flex-1 px-6 py-4">
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-8"
              >
                {programCompleted ? (
                  <>
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500/20">
                      <svg className="h-10 w-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-yellow-400">Program Complete!</h1>
                    <p className="mt-1 text-zinc-300 font-medium">{completedProgramName || workout?.title}</p>
                    <p className="mt-1 text-zinc-500 text-sm">You finished every workout. That&apos;s a huge win.</p>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
                      <svg className="h-10 w-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h1 className="text-3xl font-bold">Workout Complete!</h1>
                    <p className="mt-1 text-zinc-400">{workout?.day} — {workout?.title}</p>
                  </>
                )}
              </motion.div>

              {/* Stats Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="grid grid-cols-3 gap-3 mb-8"
              >
                <div className="rounded-xl bg-zinc-900 p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{formatTime(elapsedTime)}</p>
                  <p className="text-xs text-zinc-500 mt-1">Duration</p>
                </div>
                <div className="rounded-xl bg-zinc-900 p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">
                    {exerciseData.reduce((sum, sets) => sum + sets.filter(s => s.completed).length, 0)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Sets</p>
                </div>
                <div className="rounded-xl bg-zinc-900 p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">
                    {Math.round(exerciseData.reduce((sum, sets) =>
                      sum + sets.reduce((setSum, s) =>
                        s.completed ? setSum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0) : setSum, 0
                      ), 0
                    )).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Volume (lbs)</p>
                </div>
              </motion.div>

              {/* Per-exercise breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Exercise Breakdown</h2>
                <div className="space-y-3">
                  {exercises.map((exercise, exIdx) => {
                    const sets = exerciseData[exIdx] || [];
                    const completedSets = sets.filter(s => s.completed);
                    const skippedSets = completedSets.filter(s => s.reps === "0" && s.weight === "0");
                    const activeSets = completedSets.filter(s => !(s.reps === "0" && s.weight === "0"));
                    const bestSet = activeSets.reduce(
                      (best, s) => {
                        const w = parseFloat(s.weight) || 0;
                        const r = parseInt(s.reps) || 0;
                        const bw = parseFloat(best.weight) || 0;
                        const br = parseInt(best.reps) || 0;
                        return w > bw || (w === bw && r > br) ? s : best;
                      },
                      activeSets[0] || { weight: "0", reps: "0" }
                    );
                    const history = exerciseHistory[exercise.name];

                    return (
                      <div key={exIdx} className="rounded-xl bg-zinc-900 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-white">{exercise.name}</h3>
                          <span className="text-xs text-zinc-500">
                            {activeSets.length}/{sets.length} sets
                            {skippedSets.length > 0 && ` (${skippedSets.length} skipped)`}
                          </span>
                        </div>
                        {activeSets.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {activeSets.map((s, i) => (
                              <span key={i} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                                {parseFloat(s.weight) > 0 ? `${s.weight}×${s.reps}` : `${s.reps} reps`}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Show PR indicator if beat history */}
                        {history && activeSets.length > 0 && (
                          (() => {
                            const bestW = parseFloat(bestSet.weight) || 0;
                            const bestR = parseInt(bestSet.reps) || 0;
                            const isPR = bestW > history.weight || (bestW === history.weight && bestR > history.reps);
                            return isPR ? (
                              <p className="mt-2 text-xs text-yellow-400 font-medium">
                                New PR! Previous best: {history.weight > 0 ? `${history.weight}×${history.reps}` : `${history.reps} reps`}
                              </p>
                            ) : null;
                          })()
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>

            {/* Done button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
              className="px-6 pb-4"
            >
              <button
                onClick={() => router.push("/dashboard/programming")}
                className={`w-full rounded-full py-4 text-lg font-bold shadow-lg transition-colors ${
                  programCompleted
                    ? "bg-yellow-500 shadow-yellow-500/30 hover:bg-yellow-400 text-black"
                    : "bg-green-500 shadow-green-500/30 hover:bg-green-400 text-white"
                }`}
              >
                {programCompleted ? "Find Your Next Program" : "Done"}
              </button>
            </motion.div>
          </motion.div>
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
