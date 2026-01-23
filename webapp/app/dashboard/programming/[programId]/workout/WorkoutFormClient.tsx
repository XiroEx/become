"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import { getExerciseVideoUrl, getExerciseThumbnail } from "@/lib/data/exerciseVideos";

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
}

interface SavedExercise {
  name: string;
  sets: SavedSetData[];
}

interface SavedWorkout {
  exercises: SavedExercise[];
  completed: boolean;
}

interface Exercise {
  name: string;
  type: string;
  sets?: number;
  reps?: string;
  rest?: string;
  details?: string;
}

interface WorkoutData {
  day: string;
  title: string;
  exercises: Exercise[];
}

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
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          const workoutData: WorkoutData = {
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
            })),
          }));
          setExerciseProgress(initialProgress);

          // Now check for in-progress workout for today
          const progressRes = await fetch(`/api/workouts?programId=${programId}&day=${encodeURIComponent(workoutData.day)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.workout && progressData.isResume) {
              const savedWorkout = progressData.workout as SavedWorkout;
              const restoredProgress = workoutData.exercises.map((ex, exIdx) => {
                const savedEx = savedWorkout.exercises?.find(e => e.name === ex.name);
                return {
                  exerciseIndex: exIdx,
                  sets: savedEx 
                    ? savedEx.sets.map(s => ({
                        reps: s.reps > 0 ? s.reps.toString() : "",
                        weight: s.weight > 0 ? s.weight.toString() : "",
                        completed: s.completed
                      }))
                    : Array.from({ length: ex.sets || 3 }, () => ({
                        reps: "",
                        weight: "",
                        completed: false,
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
        return {
          name: exercise.name,
          sets: ep?.sets.map((set, setIndex) => ({
            setNumber: setIndex + 1,
            reps: parseInt(set.reps) || 0,
            weight: parseFloat(set.weight) || 0,
            completed: set.completed
          })) || []
        };
      });

      await fetch("/api/workouts", {
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
          completed: isComplete
        })
      });
    } catch (error) {
      console.error("Error auto-saving:", error);
    }
  }, [programId, workout, currentPhase]);

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
                  ? { reps: "0", weight: "0", completed: true }
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
    <PageTransition className="min-h-screen pb-24">
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
              onClick={() => router.push(`/dashboard/programming/${programId}/workout/live`)}
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
          </div>
        </div>
      </div>

      {/* Exercise List */}
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="space-y-3 sm:space-y-4">
          {workout.exercises.map((exercise, exerciseIndex) => {
            const progress = exerciseProgress.find((ep) => ep.exerciseIndex === exerciseIndex);
            const completion = getExerciseCompletion(exerciseIndex);
            const isExpanded = expandedExercise === exerciseIndex;

            return (
              <motion.div
                key={exerciseIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: exerciseIndex * 0.05 }}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all dark:bg-zinc-900 sm:rounded-2xl ${
                  completion === 100
                    ? "border-green-300 dark:border-green-800"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {/* Exercise header */}
                <button
                  onClick={() => setExpandedExercise(isExpanded ? null : exerciseIndex)}
                  className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-md ${
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
                    <h3 className="font-semibold text-zinc-900 dark:text-white">{exercise.name}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {exercise.sets} sets × {exercise.reps}
                      </span>
                      <span className="text-xs text-green-600 dark:text-green-400">{exercise.rest} rest</span>
                    </div>
                  </div>

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

                        {/* Column headers */}
                        <div className="mb-3 grid grid-cols-12 gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          <div className="col-span-2">Set</div>
                          <div className="col-span-3">Weight</div>
                          <div className="col-span-3">Reps</div>
                          <div className="col-span-4 text-center">Actions</div>
                        </div>

                        {/* Set rows */}
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
                              <div className="col-span-3">
                                <input
                                  type="number"
                                  placeholder="0"
                                  value={set.weight}
                                  onChange={(e) => updateSet(exerciseIndex, setIndex, "weight", e.target.value)}
                                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-medium focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                />
                              </div>
                              <div className="col-span-3">
                                <input
                                  type="number"
                                  placeholder={exercise.reps?.split("-")[0] || "0"}
                                  value={set.reps}
                                  onChange={(e) => updateSet(exerciseIndex, setIndex, "reps", e.target.value)}
                                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-medium focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                                />
                              </div>
                              <div className="col-span-4 flex justify-center gap-1">
                                {!set.completed && !set.weight && !set.reps && (
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
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Complete Workout button - only shows when 100% complete */}
        <AnimatePresence>
          {getTotalCompletion() === 100 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-6 sm:mt-8"
            >
              <button
                onClick={() => router.push("/dashboard/programming")}
                className="w-full rounded-xl bg-linear-to-r from-green-500 to-emerald-600 py-4 font-semibold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl hover:shadow-green-500/30"
              >
                Complete Workout! 🎉
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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

              {/* Info Box */}
              <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 p-3 dark:bg-blue-900/10 dark:border-blue-800/30">
                <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
                  💡 <span className="font-semibold">Coming soon:</span> Alternative exercise suggestions when you need to skip
                </p>
              </div>

              <div className="flex flex-col gap-3">
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
    </PageTransition>
  );
}
