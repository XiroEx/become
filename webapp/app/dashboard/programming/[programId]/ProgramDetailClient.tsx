"use client";

import { useState, useEffect, useRef, RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { Program, Workout } from "@/lib/data/programs";
import PageTransition from "@/components/PageTransition";
import ExerciseAccordion from "@/components/ExerciseAccordion";
import { Card } from "@/components/ui";

// The dashboard layout uses a `<main>` element with overflow-y-auto as the
// scroll container — window.scrollY is always 0 inside the dashboard. Walk
// up from `el` to find the nearest scrolling ancestor.
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

// Cover image that drifts at a different speed than the hero's own scroll.
// Scoped to the hero element so progress is 0 when the hero's top hits the
// container top, and 1 when the hero's bottom hits the container top —
// across exactly the range the hero is on-screen.
//
// Image is overscaled (h-[130%], -top-[15%]) so the ±10% translation never
// reveals empty edges, no matter the hero's actual height.
function ParallaxCover({ src, heroRef }: { src: string; heroRef: RefObject<HTMLDivElement | null> }) {
  // Hold the actual scroll container in state so useScroll can pick it up
  // on the second render (refs resolve after first mount).
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(findScrollContainer(heroRef.current));
  }, [heroRef]);

  const containerRef = useRef<HTMLElement | null>(null);
  containerRef.current = container;

  const { scrollYProgress } = useScroll({
    target: heroRef,
    container: containerRef as RefObject<HTMLElement>,
    offset: ['start start', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], ['-10%', '10%']);
  return (
    <motion.img
      src={src}
      alt=""
      style={{ y }}
      className="absolute left-0 right-0 -top-[15%] h-[130%] w-full object-cover object-center will-change-transform"
    />
  );
}

// One-way snap toward the bottom of the hero (when scrolling DOWN past a
// threshold) and back to the top of the hero (when scrolling UP past the
// same threshold from below). Listens on the actual scroll container, not
// window — the dashboard layout scrolls a child `<main>`, not the document.
function useHeroSnap(heroRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const container = findScrollContainer(heroRef.current);
    if (!container) return;

    let locked = false;
    let lastY = container.scrollTop;
    let raf = 0;

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (locked || !heroRef.current) return;
        const heroH = heroRef.current.offsetHeight;
        const y = container.scrollTop;
        const dir = y > lastY ? 'down' : 'up';
        const threshold = heroH * 0.25; // 25% of hero height

        // Scrolling DOWN past the threshold but still inside the hero region
        // → snap so the hero is fully out of view.
        if (dir === 'down' && y > threshold && y < heroH) {
          locked = true;
          container.scrollTo({ top: heroH, behavior: 'smooth' });
          window.setTimeout(() => { locked = false; lastY = container.scrollTop; }, 700);
          return;
        }
        // Scrolling UP past the (mirrored) threshold while still inside the
        // hero region → snap back to the very top.
        if (dir === 'up' && y < heroH - threshold && y > 0) {
          locked = true;
          container.scrollTo({ top: 0, behavior: 'smooth' });
          window.setTimeout(() => { locked = false; lastY = container.scrollTop; }, 700);
          return;
        }
        lastY = y;
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [heroRef]);
}

interface Props {
  program: Program;
}

interface ActiveProgram {
  programId: string;
  completedWorkouts: number;
  totalWorkouts: number;
  currentPhase: number;
  currentDay: string;
  startDate?: string;
}

// Confirmation Dialog Component
function ConfirmationDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  hasProgress,
  isAbandoning
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void;
  hasProgress: boolean;
  isAbandoning: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  
  if (!isOpen) return null;

  const canConfirm = !hasProgress || confirmText.toLowerCase() === "abandon";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-zinc-900"
          >
            {/* Warning Icon */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <svg className="h-7 w-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="mb-2 text-center text-xl font-bold text-zinc-900 dark:text-white">
              Abandon Program?
            </h3>
            
            <p className="mb-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
              Are you sure you want to abandon this program? 
              {hasProgress && " You've already made progress on this program."}
            </p>

            {hasProgress && (
              <div className="mb-4 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">
                  <strong>Warning:</strong> You have completed workouts in this program. 
                  Type <span className="font-mono font-bold">&quot;abandon&quot;</span> to confirm.
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='Type "abandon" to confirm'
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isAbandoning}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!canConfirm || isAbandoning}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAbandoning ? "Abandoning..." : "Abandon"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface Props {
  program: Program;
}

interface ActiveProgram {
  programId: string;
  completedWorkouts: number;
  totalWorkouts: number;
  currentPhase: number;
  currentDay: string;
  startDate?: string;
  status?: string;
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
  const heroRef = useRef<HTMLDivElement>(null);
  useHeroSnap(heroRef);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState("Day 1");
  const [enrolling, setEnrolling] = useState(false);
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null);
  const [hasInProgressWorkout, setHasInProgressWorkout] = useState(false);
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [completedDays, setCompletedDays] = useState<Set<string>>(new Set());
  const [hasInitialized, setHasInitialized] = useState(false);
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [pendingStartDate, setPendingStartDate] = useState('');
  const [savingStartDate, setSavingStartDate] = useState(false);
  const [pausingProgram, setPausingProgram] = useState(false);
  const [showDelayInput, setShowDelayInput] = useState(false);
  const [delayDays, setDelayDays] = useState(7);
  const [shiftingSchedule, setShiftingSchedule] = useState(false);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrollStartDate, setEnrollStartDate] = useState(() => {
    const d = new Date();
    // Default to next Monday
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const currentPhase = program.phases[selectedPhaseIndex];
  const normalizedWorkouts = currentPhase ? normalizeWorkouts(currentPhase.workouts) : [];
  const currentWorkout = normalizedWorkouts.find(w => w.day === selectedDayKey);
  const dayKeys = normalizedWorkouts.map(w => w.day);

  const hasProgress = activeProgram ? activeProgram.completedWorkouts > 0 : false;

  const handleAbandonProgram = async () => {
    setIsAbandoning(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/programs/abandon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ programId: program.program_id })
      });

      if (res.ok) {
        setActiveProgram(null);
        setShowAbandonDialog(false);
        // Navigate back to programs list
        router.push("/dashboard/programming");
      } else {
        const error = await res.json();
        console.error("Failed to abandon program:", error);
      }
    } catch (error) {
      console.error("Error abandoning program:", error);
    } finally {
      setIsAbandoning(false);
    }
  };

  const handlePauseResume = async () => {
    setPausingProgram(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const isPaused = activeProgram?.status === 'paused';
      const tz = new Date().getTimezoneOffset();
      const res = await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          programId: program.program_id,
          action: isPaused ? 'resume' : 'pause',
          tz,
        }),
      });
      if (res.ok) {
        setActiveProgram(prev => prev ? { ...prev, status: isPaused ? 'in-progress' : 'paused' } : prev);
      }
    } catch (error) {
      console.error("Error toggling pause:", error);
    } finally {
      setPausingProgram(false);
    }
  };

  const handleShiftSchedule = async () => {
    if (!delayDays || delayDays < 1) return;
    setShiftingSchedule(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const tz = new Date().getTimezoneOffset();
      const res = await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          programId: program.program_id,
          action: 'shift',
          days: delayDays,
          tz,
        }),
      });
      if (res.ok) {
        setShowDelayInput(false);
      }
    } catch (error) {
      console.error("Error shifting schedule:", error);
    } finally {
      setShiftingSchedule(false);
    }
  };

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
            
            // Fetch all completed workout logs for this program
            const logsRes = await fetch(`/api/workouts/logs?programId=${program.program_id}`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (logsRes.ok) {
              const logsData = await logsRes.json();
              // Build a set of completed days
              const completed = new Set<string>();
              logsData.logs?.forEach((log: { day: string; completed: boolean }) => {
                if (log.completed) {
                  completed.add(log.day);
                }
              });
              setCompletedDays(completed);

              // Find the first incomplete day in the current phase and set as default
              if (!hasInitialized) {
                const currentPhaseWorkouts = normalizeWorkouts(program.phases[found.currentPhase - 1]?.workouts || program.phases[0]?.workouts);
                const firstIncompleteDay = currentPhaseWorkouts.find(w => !completed.has(w.day));
                if (firstIncompleteDay) {
                  setSelectedDayKey(firstIncompleteDay.day);
                  setSelectedPhaseIndex(found.currentPhase - 1 || 0);
                } else {
                  // All days in current phase complete, use the active program's current day
                  setSelectedDayKey(found.currentDay || "Day 1");
                  setSelectedPhaseIndex(found.currentPhase - 1 || 0);
                }
                setHasInitialized(true);
              }
            }
            
            // Check for in-progress workout using the actual current day
            const currentDay = found.currentDay || 'Day 1';
            const progressRes = await fetch(`/api/workouts?programId=${program.program_id}&day=${currentDay}&tz=${new Date().getTimezoneOffset()}`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (progressRes.ok) {
              const progressData = await progressRes.json();
              if (progressData.isResume) {
                setHasInProgressWorkout(true);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error checking enrollment:", error);
      }
    };

    checkEnrollment();
  }, [program.program_id, program.phases, hasInitialized]);

  const handleStartProgram = async () => {
    // If already enrolled, just navigate to workout
    if (activeProgram) {
      router.push(`/dashboard/programming/${program.program_id}/workout`);
      return;
    }

    // Compute smart default start date: after existing programs finish
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const tz = new Date().getTimezoneOffset();
        const res = await fetch(`/api/schedule?view=all&tz=${tz}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const schedules = data.schedules || [];
          // Find the latest scheduled workout date across all programs
          let latestDate = '';
          for (const s of schedules) {
            for (const w of (s.scheduledWorkouts || [])) {
              const d = typeof w.date === 'string' ? w.date.split('T')[0] : new Date(w.date).toISOString().split('T')[0];
              if (d > latestDate) latestDate = d;
            }
          }
          if (latestDate) {
            // Suggest the next Monday after the last workout ends
            const endDate = new Date(latestDate + 'T12:00:00');
            endDate.setDate(endDate.getDate() + 1); // day after last workout
            const dow = endDate.getDay();
            const daysUntilMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
            endDate.setDate(endDate.getDate() + daysUntilMon);
            const suggested = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
            // Only use if it's after the current default
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            if (suggested > todayStr) {
              setEnrollStartDate(suggested);
            }
          }
        }
      }
    } catch {
      // Ignore — will use the default next Monday
    }

    // Show enrollment dialog with start date picker
    setShowEnrollDialog(true);
  };

  const handleConfirmEnroll = async () => {
    // Enroll in the program
    setEnrolling(true);
    setShowEnrollDialog(false);
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
        body: JSON.stringify({ programId: program.program_id, startDate: enrollStartDate })
      });

      if (res.ok) {
        const data = await res.json();
        // Update local state with the new active program
        if (data.activeProgram) {
          setActiveProgram(data.activeProgram);
        }
        // Redirect to schedule setup for new enrollments
        router.push(`/dashboard/programming/${program.program_id}/schedule`);
      } else {
        const error = await res.json();
        console.error("Enrollment failed:", error);
        // If already enrolled, the API returns the activeProgram
        if (error.alreadyEnrolled && error.activeProgram) {
          setActiveProgram(error.activeProgram);
        }
        // Still navigate even if enrollment fails
        router.push(`/dashboard/programming/${program.program_id}/workout?day=${encodeURIComponent(selectedDayKey)}`);
      }
    } catch (error) {
      console.error("Error enrolling:", error);
      // Still navigate even if enrollment fails
      router.push(`/dashboard/programming/${program.program_id}/workout?day=${encodeURIComponent(selectedDayKey)}`);
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <PageTransition className="pb-6">
      {/* Hero Header — min 75vh so the image gets room to breathe. Nav pins
          top, program info pins bottom via flex-1 spacer. */}
      <div
        ref={heroRef}
        className="relative flex min-h-[75vh] flex-col overflow-hidden bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900 dark:from-black dark:via-zinc-900 dark:to-black -mx-3 sm:mx-0 sm:rounded-t-2xl"
      >
        {/* Cover image or fallback pattern */}
        {program.coverImage ? (
          <>
            {program.coverParallax ? (
              <ParallaxCover src={program.coverImage} heroRef={heroRef} />
            ) : (
              <img
                src={program.coverImage}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            )}
            {/* Gradient overlay: lighter at top so the image breathes,
                darker at the bottom so program text stays legible. */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/80" />
          </>
        ) : (
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>
        )}

        <div className="relative flex flex-1 flex-col px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6">
          {/* Top nav row */}
          <div className="mb-4 flex items-center justify-between sm:mb-6">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:px-4 sm:py-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              All Programs
            </button>
            <Link
              href="/dashboard/calendar"
              className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:px-4 sm:py-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendar
            </Link>
          </div>

          {/* Spacer pushes the program info down so the image dominates the
              upper portion of the hero. */}
          <div className="flex-1" />

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
              className="rounded-full bg-linear-to-r from-green-500 to-emerald-600 px-6 py-2.5 font-semibold text-white shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed sm:px-8 sm:py-3"
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
              {/* Start Date Display/Edit */}
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {editingStartDate ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={pendingStartDate}
                      onChange={(e) => setPendingStartDate(e.target.value)}
                      className="box-border rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-white"
                    />
                    <button
                      disabled={savingStartDate}
                      onClick={async () => {
                        setSavingStartDate(true)
                        try {
                          const token = localStorage.getItem('token')
                          const res = await fetch('/api/programs/start-date', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ programId: program.program_id, startDate: pendingStartDate }),
                          })
                          if (res.ok) {
                            setActiveProgram(prev => prev ? { ...prev, startDate: pendingStartDate } : prev)
                            setEditingStartDate(false)
                          }
                        } catch { /* ignore */ }
                        setSavingStartDate(false)
                      }}
                      className="rounded-lg bg-blue-500 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-600"
                    >
                      {savingStartDate ? '...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingStartDate(false)} className="text-xs text-zinc-400 hover:text-white">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const sd = activeProgram.startDate
                        ? (typeof activeProgram.startDate === 'string' ? activeProgram.startDate.split('T')[0] : new Date(activeProgram.startDate).toISOString().split('T')[0])
                        : new Date().toISOString().split('T')[0]
                      setPendingStartDate(sd)
                      setEditingStartDate(true)
                    }}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {(() => {
                      if (!activeProgram.startDate) return 'Set start date'
                      const sd = typeof activeProgram.startDate === 'string' ? activeProgram.startDate.split('T')[0] : new Date(activeProgram.startDate).toISOString().split('T')[0]
                      const d = new Date(sd + 'T12:00:00')
                      const now = new Date()
                      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
                      if (sd > todayStr) {
                        return `Starts ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`
                      }
                      return `Started ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    })()}
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-sm text-zinc-300">
                <span>Progress: {activeProgram.completedWorkouts}/{activeProgram.totalWorkouts} sessions</span>
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
              
              {/* Links row */}
              <div className="mt-3 flex items-center gap-4">
                <button
                  onClick={() => router.push(`/dashboard/programming/${program.program_id}/schedule`)}
                  className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Schedule
                </button>
                <Link
                  href="/dashboard/progress#workouts"
                  className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Training Log
                </Link>
              </div>

              {/* Schedule Management */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {/* Pause / Resume */}
                <button
                  onClick={handlePauseResume}
                  disabled={pausingProgram}
                  className={`flex items-center gap-1.5 text-sm transition-colors ${
                    activeProgram.status === 'paused'
                      ? 'text-green-400 hover:text-green-300'
                      : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  {activeProgram.status === 'paused' ? (
                    <>
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      {pausingProgram ? 'Resuming...' : 'Resume Program'}
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                      {pausingProgram ? 'Pausing...' : 'Pause Program'}
                    </>
                  )}
                </button>

                <span className="text-zinc-600">|</span>

                {/* Delay Schedule */}
                {showDelayInput ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={delayDays}
                      onChange={(e) => setDelayDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-white text-center"
                    />
                    <span className="text-xs text-zinc-400">days</span>
                    <button
                      onClick={handleShiftSchedule}
                      disabled={shiftingSchedule}
                      className="rounded-lg bg-blue-500 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-600"
                    >
                      {shiftingSchedule ? '...' : 'Delay'}
                    </button>
                    <button onClick={() => setShowDelayInput(false)} className="text-xs text-zinc-400 hover:text-white">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDelayInput(true)}
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Delay Schedule
                  </button>
                )}
              </div>

              {/* Paused indicator */}
              {activeProgram.status === 'paused' && (
                <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                  <p className="text-xs text-amber-400 font-medium">Program is paused. Workouts are frozen until you resume.</p>
                </div>
              )}

              {/* Abandon Program Button */}
              <button
                onClick={() => setShowAbandonDialog(true)}
                className="mt-3 text-sm text-zinc-400 hover:text-red-400 transition-colors underline underline-offset-2"
              >
                Abandon program
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl py-2 px-0 sm:px-6">
        {/* Phase Selector */}
        <div className="-mt-4 relative z-10">
          <Card>
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
                  className={`shrink-0 rounded-lg px-5 py-3 text-sm font-semibold transition-colors ${
                    selectedPhaseIndex === index
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  {phase.phase} ({phase.weeks})
                </button>
              );
              })}
            </div>

            {currentPhase && (
              <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
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
          </Card>
        </div>

        {/* Day Selector */}
        <div className="mt-4 sm:mt-6">
          <div className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white sm:mb-3">
            Training Days
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-3">
            {dayKeys.map((dayKey) => {
              return (
              <button
                key={dayKey}
                onClick={() => setSelectedDayKey(dayKey)}
                className={`relative rounded-lg px-2 py-2.5 text-center text-sm font-semibold transition-all sm:rounded-xl sm:px-4 sm:py-3 ${
                  selectedDayKey === dayKey
                    ? "bg-zinc-900 text-white shadow-lg dark:bg-white dark:text-black"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span>{dayKey}</span>
                </div>
                {selectedDayKey === dayKey && (
                  <motion.div
                    layoutId="activeDay"
                    className="absolute inset-0 -z-10 rounded-xl bg-zinc-900 dark:bg-white"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
            })}
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
                {(() => {
                  // Group consecutive exercises sharing the same groupId
                  const elements: React.ReactNode[] = [];
                  let i = 0;
                  const exercises = currentWorkout.exercises;
                  const GROUP_COLORS: Record<string, { border: string; bg: string; badge: string }> = {
                    superset: { border: "border-purple-200 dark:border-purple-900/40", bg: "bg-purple-50/50 dark:bg-purple-950/20", badge: "bg-purple-500" },
                    circuit: { border: "border-orange-200 dark:border-orange-900/40", bg: "bg-orange-50/50 dark:bg-orange-950/20", badge: "bg-orange-500" },
                    triset: { border: "border-indigo-200 dark:border-indigo-900/40", bg: "bg-indigo-50/50 dark:bg-indigo-950/20", badge: "bg-indigo-500" },
                    giant_set: { border: "border-rose-200 dark:border-rose-900/40", bg: "bg-rose-50/50 dark:bg-rose-950/20", badge: "bg-rose-500" },
                    emom: { border: "border-teal-200 dark:border-teal-900/40", bg: "bg-teal-50/50 dark:bg-teal-950/20", badge: "bg-teal-500" },
                    amrap: { border: "border-amber-200 dark:border-amber-900/40", bg: "bg-amber-50/50 dark:bg-amber-950/20", badge: "bg-amber-500" },
                  };
                  const GROUP_LABELS: Record<string, string> = {
                    superset: "Superset",
                    circuit: "Circuit",
                    triset: "Triset",
                    giant_set: "Giant Set",
                    emom: "EMOM",
                    amrap: "AMRAP",
                  };

                  while (i < exercises.length) {
                    const ex = exercises[i];
                    if (ex.groupId) {
                      const groupId = ex.groupId;
                      const groupExercises: { exercise: typeof ex; index: number }[] = [];
                      while (i < exercises.length && exercises[i].groupId === groupId) {
                        groupExercises.push({ exercise: exercises[i], index: i });
                        i++;
                      }
                      const groupKey = ex.groupType || "superset";
                      const colors = GROUP_COLORS[groupKey] || GROUP_COLORS.superset;
                      const fallbackLabel = GROUP_LABELS[groupKey] || "Group";
                      elements.push(
                        <div key={`group-${groupId}`} className={`rounded-xl border ${colors.border} ${colors.bg} p-3`}>
                          <div className="mb-2 flex items-center gap-2">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${colors.badge}`}>
                              {ex.groupLabel || fallbackLabel}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {groupExercises.length} exercises{ex.groupRest ? ` · ${ex.groupRest} rest between rounds` : " · minimal rest between exercises"}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {groupExercises.map(({ exercise: gEx, index: idx }) => (
                              <ExerciseAccordion key={idx} exercise={gEx} index={idx} isInGroup />
                            ))}
                          </div>
                        </div>
                      );
                    } else {
                      elements.push(
                        <ExerciseAccordion key={i} exercise={ex} index={i} />
                      );
                      i++;
                    }
                  }
                  return elements;
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Abandon Program Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showAbandonDialog}
        onClose={() => setShowAbandonDialog(false)}
        onConfirm={handleAbandonProgram}
        hasProgress={hasProgress}
        isAbandoning={isAbandoning}
      />

      {/* Enroll with Start Date Dialog */}
      <AnimatePresence>
        {showEnrollDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEnrollDialog(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-zinc-900"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <svg className="h-7 w-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>

              <h3 className="mb-1 text-center text-xl font-bold text-zinc-900 dark:text-white">
                When do you want to start?
              </h3>
              <p className="mb-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Pick a start date for this {program.duration_weeks}-week program. You can schedule it weeks or months ahead.
              </p>

              <div className="mb-4">
                <input
                  type="date"
                  value={enrollStartDate}
                  min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()}
                  onChange={(e) => setEnrollStartDate(e.target.value)}
                  className="box-border w-full max-w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <p className="mb-5 text-center text-xs text-zinc-400 dark:text-zinc-500">
                {(() => {
                  const d = new Date(enrollStartDate + 'T12:00:00')
                  const endDate = new Date(d)
                  endDate.setDate(endDate.getDate() + (program.duration_weeks || 4) * 7)
                  return `Est. completion: ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                })()}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowEnrollDialog(false)}
                  className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmEnroll}
                  disabled={enrolling}
                  className="flex-1 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {enrolling ? 'Enrolling...' : 'Enroll & Set Up'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
