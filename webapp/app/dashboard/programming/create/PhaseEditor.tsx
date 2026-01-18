"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phase, Workout, Exercise, ExerciseType } from "@/lib/data/programs";
import WorkoutEditor from "./WorkoutEditor";

interface PhaseEditorProps {
  phase: Phase;
  phaseIndex: number;
  totalPhases: number;
  onUpdate: (phase: Phase) => void;
  onRemove: () => void;
  daysPerWeek: number;
}

const createEmptyExercise = (): Exercise => ({
  name: "",
  type: "strength" as ExerciseType,
  sets: 3,
  reps: "10",
  rest: "60s",
  details: "",
});

const createEmptyWorkout = (dayNumber: number): Workout => ({
  day: `Day ${dayNumber}`,
  title: "",
  exercises: [createEmptyExercise()],
});

export default function PhaseEditor({
  phase,
  phaseIndex,
  totalPhases,
  onUpdate,
  onRemove,
  daysPerWeek,
}: PhaseEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeWorkoutIndex, setActiveWorkoutIndex] = useState(0);

  const updateField = <K extends keyof Phase>(key: K, value: Phase[K]) => {
    onUpdate({ ...phase, [key]: value });
  };

  const updateWorkout = (index: number, workout: Workout) => {
    const newWorkouts = [...phase.workouts];
    newWorkouts[index] = workout;
    onUpdate({ ...phase, workouts: newWorkouts });
  };

  // Copy workout to another day
  const copyWorkout = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newWorkouts = [...phase.workouts];
    newWorkouts[toIndex] = {
      ...phase.workouts[fromIndex],
      day: `Day ${toIndex + 1}`,
    };
    onUpdate({ ...phase, workouts: newWorkouts });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Phase Header */}
      <div
        className="flex cursor-pointer items-center justify-between bg-zinc-50 px-6 py-4 dark:bg-zinc-800/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-black">
            {phaseIndex + 1}
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-white">
              {phase.phase}
            </h3>
            <p className="text-sm text-zinc-500">
              {phase.weeks ? `Weeks ${phase.weeks}` : "Set weeks..."} • {phase.workouts.length} workouts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalPhases > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-zinc-200 p-6 dark:border-zinc-700">
              {/* Phase Info Fields */}
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Weeks Range *
                  </label>
                  <input
                    type="text"
                    value={phase.weeks}
                    onChange={(e) => updateField("weeks", e.target.value)}
                    placeholder="e.g., 1-4"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Phase Focus *
                  </label>
                  <input
                    type="text"
                    value={phase.focus}
                    onChange={(e) => updateField("focus", e.target.value)}
                    placeholder="e.g., Build strength foundation"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Workout Tabs */}
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Workouts
                  </h4>
                  
                  {/* Copy Workout Dropdown */}
                  <div className="relative">
                    <select
                      onChange={(e) => {
                        const targetIndex = parseInt(e.target.value);
                        if (!isNaN(targetIndex)) {
                          copyWorkout(activeWorkoutIndex, targetIndex);
                          e.target.value = "";
                        }
                      }}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      defaultValue=""
                    >
                      <option value="" disabled>Copy current to...</option>
                      {phase.workouts.map((_, index) => (
                        index !== activeWorkoutIndex && (
                          <option key={index} value={index}>
                            Day {index + 1}
                          </option>
                        )
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                  {phase.workouts.map((workout, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveWorkoutIndex(index)}
                      className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                        activeWorkoutIndex === index
                          ? "bg-zinc-900 text-white shadow-lg dark:bg-white dark:text-black"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <span className="block text-xs opacity-70">{workout.day}</span>
                      <span className="block">{workout.title || "Untitled"}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Workout Editor */}
              {phase.workouts[activeWorkoutIndex] && (
                <WorkoutEditor
                  workout={phase.workouts[activeWorkoutIndex]}
                  onUpdate={(workout: Workout) => updateWorkout(activeWorkoutIndex, workout)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
