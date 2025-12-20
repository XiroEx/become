"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Program, Workout } from "@/lib/data/programs";
import PageTransition from "@/components/PageTransition";
import ExerciseAccordion from "@/components/ExerciseAccordion";

interface Props {
  program: Program;
}

interface ActiveProgram {
  programId: string;
  completedWorkouts: number;
  totalWorkouts: number;
  currentPhase: number;
  currentDay: string;
}

// Helper to normalize workouts from object format to array format
function normalizeWorkouts(workouts: Workout[] | Record<string, Omit<Workout, 'day'>> | undefined | null): Workout[] {
  if (!workouts) {
    return [];
  }
  if (Array.isArray(workouts)) {
    return workouts;
  }
  // Convert object format { "Day 1": {...}, "Day 2": {...} } to array format
  return Object.entries(workouts).map(([day, workout]) => ({
    day,
    ...workout,
  }));
}

export default function ProgramDetailClient({ program }: Props) {
  const router = useRouter();
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState("Day 1");
  const [enrolling, setEnrolling] = useState(false);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [hasInProgressWorkout, setHasInProgressWorkout] = useState(false);

  const currentPhase = program.phases[selectedPhaseIndex];
  const normalizedWorkouts = currentPhase ? normalizeWorkouts(currentPhase.workouts) : [];
  const currentWorkout = normalizedWorkouts.find(w => w.day === selectedDayKey);
  const dayKeys = normalizedWorkouts.map(w => w.day);

  // Check if user is already enrolled in this program
  useEffect(() => {
    const checkEnrollment = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const res = await fetch("/api/programs/active", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          const found = data.activePrograms?.find(
            (p: ActiveProgram) => p.programId === program.program_id
          );
          if (found) {
            setActiveProgram(found);
          }
        }
      } catch (error) {
        console.error("Error checking enrollment:", error);
      }
    };

    // Check for in-progress workout
    const checkWorkoutProgress = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const res = await fetch(`/api/workouts?programId=${program.program_id}&day=Day 1`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.isResume) {
            setHasInProgressWorkout(true);
          }
        }
      } catch (error) {
        console.error("Error checking workout progress:", error);
      }
    };

    checkEnrollment();
    checkWorkoutProgress();
  }, [program.program_id]);

  const handleStartProgram = async () => {
    // If already enrolled, just navigate to workout
    if (activeProgram) {
      router.push(`/dashboard/programming/${program.program_id}/workout`);
      return;
    }

    // Enroll in the program
    setEnrolling(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/programs/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ programId: program.program_id })
      });

      if (res.ok) {
        const data = await res.json();
        // Update local state with the new active program
        if (data.activeProgram) {
          setActiveProgram(data.activeProgram);
        }
        router.push(`/dashboard/programming/${program.program_id}/workout`);
      } else {
        const error = await res.json();
        console.error("Enrollment failed:", error);
        // If already enrolled, the API returns the activeProgram
        if (error.alreadyEnrolled && error.activeProgram) {
          setActiveProgram(error.activeProgram);
        }
        // Still navigate even if enrollment fails
        router.push(`/dashboard/programming/${program.program_id}/workout`);
      }
    } catch (error) {
      console.error("Error enrolling:", error);
      // Still navigate even if enrollment fails
      router.push(`/dashboard/programming/${program.program_id}/workout`);
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <PageTransition className="min-h-screen pb-24">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900 dark:from-black dark:via-zinc-900 dark:to-black">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:mb-6 sm:px-4 sm:py-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Programs
          </button>

          {/* Program info */}
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-400">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {program.duration_weeks} Weeks
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-400">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {program.training_days_per_week}x/week
              </span>
            </div>

            <h1 className="text-2xl font-extrabold text-white sm:text-3xl lg:text-4xl">
              {program.name}
            </h1>

            <p className="mt-3 text-base text-zinc-300 sm:text-lg">
              {program.target_user}
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              {program.goal}
            </p>
          </div>

          {/* Start button */}
          <div className="mt-4 flex gap-3 sm:mt-6">
            <button 
              onClick={handleStartProgram}
              disabled={enrolling}
              className="rounded-full bg-linear-to-r from-green-500 to-emerald-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl hover:shadow-green-500/30 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed sm:px-8 sm:py-3"
            >
              {enrolling ? "Starting..." : activeProgram ? "Continue Program" : "Start Program"}
            </button>
            <button 
              onClick={() => router.push(`/dashboard/programming/${program.program_id}/workout/live`)}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold text-white backdrop-blur-sm transition-all sm:px-6 sm:py-3 ${
                hasInProgressWorkout 
                  ? "bg-yellow-500/20 hover:bg-yellow-500/30 ring-1 ring-yellow-500/50" 
                  : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {hasInProgressWorkout ? (
                <>
                  <svg className="h-4 w-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-yellow-400">Resume</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Workout
                </>
              )}
            </button>
          </div>
          
          {/* Progress indicator if enrolled */}
          {activeProgram && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span>Progress: {activeProgram.completedWorkouts}/{activeProgram.totalWorkouts} workouts</span>
                <span className="text-green-400 font-semibold">
                  {Math.round((activeProgram.completedWorkouts / activeProgram.totalWorkouts) * 100)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-linear-to-r from-green-400 to-emerald-400 transition-all duration-300"
                  style={{ width: `${(activeProgram.completedWorkouts / activeProgram.totalWorkouts) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-3 sm:px-6">
        {/* Phase Selector */}
        <div className="-mt-4 relative z-10">
          <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-2xl sm:p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Select Phase
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {program.phases.map((phase, index) => {
                const phaseWorkouts = normalizeWorkouts(phase.workouts);
                return (
                <button
                  key={index}
                  onClick={() => {
                    setSelectedPhaseIndex(index);
                    const firstDay = phaseWorkouts[0]?.day;
                    if (!phaseWorkouts.find(w => w.day === selectedDayKey)) {
                      setSelectedDayKey(firstDay);
                    }
                  }}
                  className={`shrink-0 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                    selectedPhaseIndex === index
                      ? "bg-zinc-900 text-white shadow-lg dark:bg-white dark:text-black"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  {phase.phase} ({phase.weeks})
                </button>
              );
              })}
            </div>

            {currentPhase && (
              <div className="mt-3 rounded-lg bg-linear-to-r from-zinc-50 to-zinc-100 p-3 dark:from-zinc-800 dark:to-zinc-800/50 sm:mt-4 sm:rounded-xl sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 dark:bg-white">
                    <svg className="h-4 w-4 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Focus</div>
                    <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{currentPhase.focus}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Day Selector */}
        <div className="mt-4 sm:mt-6">
          <div className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white sm:mb-3">
            Training Days
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-3">
            {dayKeys.map((dayKey) => (
              <button
                key={dayKey}
                onClick={() => setSelectedDayKey(dayKey)}
                className={`relative rounded-lg px-2 py-2.5 text-center text-sm font-semibold transition-all sm:rounded-xl sm:px-4 sm:py-3 ${
                  selectedDayKey === dayKey
                    ? "bg-zinc-900 text-white shadow-lg dark:bg-white dark:text-black"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700"
                }`}
              >
                {dayKey}
                {selectedDayKey === dayKey && (
                  <motion.div
                    layoutId="activeDay"
                    className="absolute inset-0 -z-10 rounded-xl bg-zinc-900 dark:bg-white"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Workout Display */}
        <AnimatePresence mode="wait">
          {currentWorkout && (
            <motion.div
              key={`${selectedPhaseIndex}-${selectedDayKey}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="mt-5 sm:mt-8"
            >
              {/* Workout Title */}
              <div className="mb-4 flex items-center gap-3 sm:mb-6 sm:gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-zinc-900 to-zinc-700 shadow-lg dark:from-zinc-700 dark:to-zinc-800 sm:h-12 sm:w-12 sm:rounded-2xl">
                  <svg className="h-5 w-5 text-white sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">
                    {currentWorkout.title}
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {currentWorkout.exercises.length} exercises
                  </p>
                </div>
              </div>

              {/* Exercise List */}
              <div className="space-y-2 sm:space-y-3">
                {currentWorkout.exercises.map((exercise, index) => (
                  <ExerciseAccordion
                    key={index}
                    exercise={exercise}
                    index={index}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
