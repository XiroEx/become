"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getExerciseVideoUrlAsync } from "@/lib/data/exerciseVideos";

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
  sets: SavedSetData[];
}

interface SavedWorkout {
  exercises: SavedExercise[];
  completed: boolean;
}

interface Exercise {
  name: string;
  type?: string;
  sets?: number;
  reps?: string;
  rest?: string;
  tip?: string;
  details?: string;
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
  const programId = params.programId as string;
  const [workout, setWorkout] = useState<WorkoutData | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>(fallbackExercises);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [loading, setLoading] = useState(true);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [restTimeRemaining, setRestTimeRemaining] = useState(0);
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

  const currentExercise = exercises[currentExerciseIndex];
  const totalExercises = exercises.length;
  const totalSets = currentExercise?.sets || 3;

  // Load the current workout from API
  useEffect(() => {
    const loadWorkout = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          // Use fallback for unauthenticated users
          setWorkout({ day: "Day 1", title: "Training", exercises: fallbackExercises });
          setExercises(fallbackExercises);
          setExerciseData(
            fallbackExercises.map((ex) =>
              Array.from({ length: ex.sets || 3 }, () => ({
                reps: "",
                weight: "",
                completed: false,
              }))
            )
          );
          setLoading(false);
          return;
        }

        // Fetch the current workout for this program
        const res = await fetch(`/api/programs/current-workout?programId=${programId}`, {
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
          
          // Initialize exercise data
          const initialData = workoutData.exercises.map((ex) =>
            Array.from({ length: ex.sets || 3 }, () => ({
              reps: "",
              weight: "",
              completed: false,
            }))
          );
          setExerciseData(initialData);

          // Now check for in-progress workout for today
          const progressRes = await fetch(`/api/workouts?programId=${programId}&day=${workoutData.day}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (progressRes.ok) {
            const progressData = await progressRes.json();
            if (progressData.workout && progressData.isResume) {
              // Restore exercise data from saved workout
              const savedWorkout = progressData.workout as SavedWorkout;
              const restoredData = workoutData.exercises.map((ex, exIdx) => {
                const savedEx = savedWorkout.exercises?.find(e => e.name === ex.name);
                if (savedEx) {
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
              
              // Find the first incomplete set to resume from
              for (let exIdx = 0; exIdx < restoredData.length; exIdx++) {
                for (let setIdx = 0; setIdx < restoredData[exIdx].length; setIdx++) {
                  if (!restoredData[exIdx][setIdx].completed) {
                    setCurrentExerciseIndex(exIdx);
                    setCurrentSetIndex(setIdx);
                    // Hide resume indicator after 3 seconds
                    setTimeout(() => setShowResumeIndicator(false), 3000);
                    break;
                  }
                }
              }
            }
          }
        } else {
          // Fallback
          setWorkout({ day: "Day 1", title: "Training", exercises: fallbackExercises });
          setExercises(fallbackExercises);
          setExerciseData(
            fallbackExercises.map((ex) =>
              Array.from({ length: ex.sets || 3 }, () => ({
                reps: "",
                weight: "",
                completed: false,
              }))
            )
          );
        }
      } catch (error) {
        console.error("Error loading workout:", error);
        // Fallback
        setWorkout({ day: "Day 1", title: "Training", exercises: fallbackExercises });
        setExercises(fallbackExercises);
        setExerciseData(
          fallbackExercises.map((ex) =>
            Array.from({ length: ex.sets || 3 }, () => ({
              reps: "",
              weight: "",
              completed: false,
            }))
          )
        );
      } finally {
        setLoading(false);
      }
    };

    loadWorkout();
  }, [programId]);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Save workout progress (can be called for partial saves or final save)
  const saveWorkout = useCallback(async (exerciseDataToSave: SetData[][], isComplete: boolean) => {
    if (!workout) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const exercisesToSave = exercises.map((exercise, index) => ({
        name: exercise.name,
        sets: exerciseDataToSave[index]?.map((set, setIndex) => ({
          setNumber: setIndex + 1,
          reps: parseInt(set.reps) || 0,
          weight: parseFloat(set.weight) || 0,
          completed: set.completed
        })) || []
      }));
      await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ programId, phase: currentPhase, day: workout.day, exercises: exercisesToSave, completed: isComplete })
      });
    } catch (error) {
      console.error("Error saving workout:", error);
    } finally {
      setSaving(false);
    }
  }, [programId, workout, exercises, currentPhase]);

  const completeSet = useCallback(async () => {
    // Create updated exercise data
    const updatedData = [...exerciseData];
    updatedData[currentExerciseIndex] = [...updatedData[currentExerciseIndex]];
    updatedData[currentExerciseIndex][currentSetIndex] = {
      reps: currentReps,
      weight: currentWeight,
      completed: true,
    };
    
    // Update state
    setExerciseData(updatedData);

    const isLastSet = currentSetIndex === totalSets - 1;
    const isLastExercise = currentExerciseIndex === totalExercises - 1;
    const isComplete = isLastSet && isLastExercise;

    // Save progress after each set (async, don't wait)
    saveWorkout(updatedData, isComplete);

    if (isComplete) {
      router.push("/dashboard/programming");
      return;
    }

    setIsResting(true);
    setRestTimeRemaining(parseRestTime(currentExercise.rest || "60s"));
    setCurrentReps("");
    setCurrentWeight("");

    if (isLastSet) {
      setCurrentExerciseIndex((prev) => prev + 1);
      setCurrentSetIndex(0);
    } else {
      setCurrentSetIndex((prev) => prev + 1);
    }
  }, [currentExerciseIndex, currentSetIndex, currentReps, currentWeight, totalSets, totalExercises, currentExercise, router, exerciseData, saveWorkout]);

  const skipRest = () => {
    setIsResting(false);
    setRestTimeRemaining(0);
  };

  const goToPrevious = () => {
    if (currentSetIndex > 0) {
      setCurrentSetIndex((prev) => prev - 1);
    } else if (currentExerciseIndex > 0) {
      const prevExercise = exercises[currentExerciseIndex - 1];
      setCurrentExerciseIndex((prev) => prev - 1);
      setCurrentSetIndex((prevExercise?.sets || 3) - 1);
    }
    setIsResting(false);
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

  // Get video URL for current exercise
  const [currentVideo, setCurrentVideo] = useState<string>("/placeholder.mp4");
  
  useEffect(() => {
    if (exercises.length > 0 && currentExerciseIndex < exercises.length) {
      const exerciseName = exercises[currentExerciseIndex].name;
      getExerciseVideoUrlAsync(exerciseName).then(setCurrentVideo);
    }
  }, [exercises, currentExerciseIndex]);

  // Show loading state
  if (loading || !workout || exercises.length === 0) {
    return (
      <div className="fixed inset-0 z-100 bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-zinc-400">Loading workout...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-100 bg-black text-white">
      {/* Fullscreen video background */}
      <div className="absolute inset-0">
        <video
          key={currentVideo} // Force re-render when video changes
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        >
          <source src={currentVideo} type={currentVideo.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'} />
        </video>
      </div>

      {/* Top overlay - Exit & Timer */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-linear-to-b from-black/60 to-transparent">
        <button
          onClick={() => router.back()}
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
      </div>

      {/* Right side - Progress dots (like story indicators) */}
      <div 
        className="absolute right-4 top-1/2 z-50 -translate-y-1/2 flex items-center"
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
                        idx < currentExerciseIndex
                          ? "bg-green-500 text-white"
                          : idx === currentExerciseIndex
                          ? "bg-white text-black"
                          : "bg-white/20 text-white/60"
                      }`}
                    >
                      {idx < currentExerciseIndex ? (
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
                idx < currentExerciseIndex
                  ? "bg-green-500"
                  : idx === currentExerciseIndex
                  ? "bg-white h-4"
                  : "bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>

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
                  strokeDasharray={`${(restTimeRemaining / parseRestTime(currentExercise?.rest || "60s")) * 283} 283`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold tabular-nums">{formatTime(restTimeRemaining)}</span>
                <span className="mt-1 text-sm text-white/60">REST</span>
              </div>
            </div>

            <p className="mt-6 text-lg text-white/80">
              Up next: <span className="font-semibold text-white">{currentExercise?.name}</span>
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
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-linear-to-t from-black/80 via-black/40 to-transparent p-4 pb-8">
        {/* Exercise info */}
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <span>Exercise {currentExerciseIndex + 1}/{totalExercises}</span>
            <span>•</span>
            <span>Set {currentSetIndex + 1}/{totalSets}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{currentExercise?.name}</h1>
          <p className="mt-1 text-sm text-green-400">{currentExercise?.tip}</p>
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
                {/* Weight input */}
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-white/60">Weight (lbs)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={currentWeight}
                    onChange={(e) => setCurrentWeight(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                  />
                </div>
                {/* Reps input */}
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-white/60">Reps</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={currentReps}
                    onChange={(e) => setCurrentReps(e.target.value)}
                    placeholder={currentExercise?.reps?.split("-")[0] || "0"}
                    className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-lg font-bold backdrop-blur-sm placeholder:text-white/30 focus:bg-white/20 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quick weight buttons */}
              <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {[45, 95, 135, 185, 225].map((weight) => (
                  <button
                    key={weight}
                    onClick={() => setCurrentWeight(weight.toString())}
                    className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/20"
                  >
                    {weight}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={goToPrevious}
            disabled={currentExerciseIndex === 0 && currentSetIndex === 0}
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
            onClick={completeSet}
            disabled={isResting}
            className="flex-1 rounded-full bg-green-500 py-4 text-lg font-bold shadow-lg shadow-green-500/30 transition-all hover:bg-green-400 disabled:opacity-50"
          >
            {currentExerciseIndex === totalExercises - 1 && currentSetIndex === totalSets - 1
              ? "Finish Workout 🎉"
              : "Complete Set →"}
          </button>
        </div>

        {/* Previous set reference */}
        {currentSetIndex > 0 && exerciseData[currentExerciseIndex]?.[currentSetIndex - 1]?.completed && (
          <p className="mt-3 text-center text-sm text-white/50">
            Last set: {exerciseData[currentExerciseIndex][currentSetIndex - 1].weight} lbs × {exerciseData[currentExerciseIndex][currentSetIndex - 1].reps} reps
          </p>
        )}
      </div>

      {/* Set indicators (like Snapchat story progress) */}
      <div className="absolute top-16 left-4 right-4 z-10 flex gap-1">
        {Array.from({ length: totalSets }).map((_, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              className={`h-full transition-all ${
                i < currentSetIndex ? "w-full bg-green-500" : i === currentSetIndex ? "w-1/2 bg-white" : "w-0"
              }`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
