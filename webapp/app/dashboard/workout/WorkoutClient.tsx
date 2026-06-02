"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Dumbbell, Sparkles, Search, Wand2, History, Zap } from "lucide-react";
import { Program } from "@/lib/data/programs";
import PageTransition from "@/components/PageTransition";
import UpcomingWorkouts from "@/components/UpcomingWorkouts";
import QuickSessionModal from "@/components/QuickSessionModal";
import GenerateModal from "@/components/GenerateModal";
import { Card, EmptyState, Toast } from "@/components/ui";
import { useToast } from "@/hooks/useToast";
import type { FitnessGoal, ExperienceLevel } from "@/models/User";

interface ActiveProgram {
  programId: string;
  programName: string;
  startDate: string;
  currentPhase: number;
  currentDay: string;
  completedWorkouts: number;
  totalWorkouts: number;
  progress: number;
  status: string;
  lastWorkoutDate?: string;
}

interface SavedProgram extends Program {
  savedAt: string;
  order: number;
}

interface SearchResult {
  programs: Program[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  availableTags: string[];
}

/** Format a program start date as a smart label */
function formatStartLabel(startDate: string | undefined): { label: string; isFuture: boolean } {
  if (!startDate) return { label: '', isFuture: false }
  const start = typeof startDate === 'string' ? startDate.split('T')[0] : new Date(startDate).toISOString().split('T')[0]
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  if (start > todayStr) {
    // Future start — show how many days until
    const startMs = new Date(start + 'T12:00:00').getTime()
    const todayMs = new Date(todayStr + 'T12:00:00').getTime()
    const diffDays = Math.round((startMs - todayMs) / (1000 * 60 * 60 * 24))
    if (diffDays === 1) return { label: 'Starts tomorrow', isFuture: true }
    if (diffDays <= 7) return { label: `Starts in ${diffDays} days`, isFuture: true }
    const d = new Date(start + 'T12:00:00')
    return { label: `Starts ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, isFuture: true }
  }
  return { label: '', isFuture: false }
}

export default function WorkoutClient() {
  const [activePrograms, setActivePrograms] = useState<ActiveProgram[]>([]);
  const [savedPrograms, setSavedPrograms] = useState<SavedProgram[]>([]);
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalPrograms, setTotalPrograms] = useState(0);
  
  // Drag state for reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Saved programs shown count
  const [savedShown, setSavedShown] = useState(5);

  // Per-program loading state for save/unsave
  const [savingProgramId, setSavingProgramId] = useState<string | null>(null);

  const { toast } = useToast();

  // Quick Session + Generate modals
  const [showQuickSession, setShowQuickSession] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  // Reused Quick Session launcher button (shown on the Continue Training line,
  // or standalone when the user isn't on a program).
  const quickSessionButton = (
    <button
      type="button"
      onClick={() => setShowQuickSession(true)}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-green-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700"
    >
      <Zap className="h-3.5 w-3.5" />
      Quick Session
    </button>
  );

  // User profile for recommendations
  const [userFitnessGoal, setUserFitnessGoal] = useState<FitnessGoal | undefined>(undefined);
  const [userExperienceLevel, setUserExperienceLevel] = useState<ExperienceLevel | undefined>(undefined);

  // Saved program IDs for quick lookup
  const savedProgramIds = new Set(savedPrograms.map(p => p.program_id));

  const fetchActivePrograms = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoadingActive(false);
        return;
      }

      const res = await fetch("/api/programs/active", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setActivePrograms(data.activePrograms || []);
      }
    } catch (error) {
      console.error("Error fetching active programs:", error);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  const fetchSavedPrograms = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoadingSaved(false);
        return;
      }

      const res = await fetch("/api/programs/saved", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setSavedPrograms(data.savedPrograms || []);
      }
    } catch (error) {
      console.error("Error fetching saved programs:", error);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  const fetchPrograms = useCallback(async (resetPage = false) => {
    try {
      setLoadingPrograms(true);
      const currentPage = resetPage ? 1 : page;
      if (resetPage) setPage(1);

      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      selectedTags.forEach(tag => params.append('tag', tag));
      if (selectedLevel) params.set('level', selectedLevel);
      params.set('page', currentPage.toString());
      params.set('limit', '20');

      const res = await fetch(`/api/programs/search?${params.toString()}`);
      
      if (res.ok) {
        const data: SearchResult = await res.json();
        if (resetPage || currentPage === 1) {
          setAllPrograms(data.programs);
        } else {
          setAllPrograms(prev => [...prev, ...data.programs]);
        }
        setAvailableTags(data.availableTags);
        setHasMore(data.pagination.hasMore);
        setTotalPrograms(data.pagination.total);
      }
    } catch (error) {
      console.error("Error fetching programs:", error);
    } finally {
      setLoadingPrograms(false);
    }
  }, [searchQuery, selectedTags, selectedLevel, page]);

  useEffect(() => {
    fetchActivePrograms();
    fetchSavedPrograms();

    // Fetch user profile for goal-based recommendations (best-effort)
    const token = localStorage.getItem("token");
    if (token) {
      fetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.profile?.fitnessGoal) setUserFitnessGoal(data.profile.fitnessGoal);
          if (data?.profile?.experienceLevel) setUserExperienceLevel(data.profile.experienceLevel);
        })
        .catch(() => {});
    }
  }, [fetchActivePrograms, fetchSavedPrograms]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPrograms(true);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, selectedTags, selectedLevel]);

  const toggleSaveProgram = async (programId: string) => {
    const token = localStorage.getItem("token");
    if (!token || savingProgramId === programId) return;

    const isSaved = savedProgramIds.has(programId);
    setSavingProgramId(programId);
    try {
      const res = await fetch("/api/programs/saved", {
        method: isSaved ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ programId })
      });

      if (res.ok) {
        fetchSavedPrograms();
      }
    } catch (error) {
      console.error("Error toggling save:", error);
    } finally {
      setSavingProgramId(null);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newOrder = [...savedPrograms];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dragOverIndex, 0, removed);

    setSavedPrograms(newOrder);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Persist to server
    const token = localStorage.getItem("token");
    if (token) {
      try {
        await fetch("/api/programs/saved", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ programIds: newOrder.map(p => p.program_id) })
        });
      } catch (error) {
        console.error("Error reordering:", error);
        fetchSavedPrograms(); // Revert on error
      }
    }
  };

  const loadMore = () => {
    setPage(prev => prev + 1);
    fetchPrograms();
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedTags([]);
    setSelectedLevel("");
  };

  const hasFilters = searchQuery || selectedTags.length > 0 || selectedLevel;

  // Filter out enrolled and saved programs from "All Programs"
  const filteredPrograms = allPrograms.filter(
    (program) =>
      !activePrograms.some((ap) => ap.programId === program.program_id) &&
      !savedProgramIds.has(program.program_id)
  );

  // ─── Goal-based recommendation matching ──────────────────────────────────
  const GOAL_KEYWORDS: Record<FitnessGoal, string[]> = {
    lose_weight: ["weight loss", "fat loss", "cut", "cutting", "lean", "shred"],
    gain_muscle: ["muscle", "bulk", "bulking", "strength", "hypertrophy", "mass", "size"],
    maintain: ["maintain", "maintenance", "general", "fitness"],
    improve_performance: ["performance", "athletic", "conditioning", "sport", "speed", "power"],
    general_health: ["health", "wellness", "general", "fitness", "lifestyle"],
  };

  const LEVEL_MAP: Record<ExperienceLevel, string[]> = {
    beginner: ["beginner", "beginner to intermediate"],
    intermediate: ["intermediate", "beginner to intermediate", "intermediate to advanced"],
    advanced: ["advanced", "intermediate to advanced"],
  };

  const recommendedPrograms = (() => {
    // Only show recommendations when there's no active search/filter query
    if (searchQuery || selectedTags.length > 0 || selectedLevel) return [];
    if (!userFitnessGoal && !userExperienceLevel) return [];

    return filteredPrograms.filter(program => {
      const goalField = (program.goal ?? "").toLowerCase();
      const targetUser = (program.target_user ?? "").toLowerCase();
      const tags = (program.tags ?? []).map(t => t.toLowerCase());
      const allText = [goalField, targetUser, ...tags].join(" ");

      // Goal match
      let goalMatch = false;
      if (userFitnessGoal) {
        const keywords = GOAL_KEYWORDS[userFitnessGoal];
        goalMatch = keywords.some(kw => allText.includes(kw));
      }

      // Level match
      let levelMatch = false;
      if (userExperienceLevel) {
        const levels = LEVEL_MAP[userExperienceLevel];
        levelMatch = levels.some(l => targetUser.includes(l));
      }

      // Show if either dimension matches (or if only one dimension is set)
      if (userFitnessGoal && userExperienceLevel) return goalMatch || levelMatch;
      if (userFitnessGoal) return goalMatch;
      return levelMatch;
    });
  })();

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="mb-4 sm:mb-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">
            Workout
          </h1>
          <Link
            href="/dashboard/history"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <History className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
            History
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Choose your training path and start building.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/workout/hub?tab=exercises"
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Dumbbell className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            Workouts
          </Link>
          <Link
            href="/dashboard/workout/hub?tab=programs"
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
            Programs
          </Link>
          <button
            type="button"
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 rounded-full bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-purple-700 active:bg-purple-800 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Generate
          </button>
        </div>
      </div>

      {/* Schedule / Calendar Widget */}
      <div className="mb-6">
        <UpcomingWorkouts />
      </div>

      {/* Active Programs Section */}
      {!loadingActive && activePrograms.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Continue Training
            </h2>
            {quickSessionButton}
          </div>
          <div className="space-y-3">
            {activePrograms.map((program) => {
              const { label: startLabel, isFuture } = formatStartLabel(program.startDate)
              const isPaused = program.status === 'paused'
              return (
              <Card
                key={program.programId}
                accent={isPaused ? 'warning' : isFuture ? 'info' : 'success'}
                className="group transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <Link href={`/dashboard/workout/${program.programId}`} className="block">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                        {program.programName}
                      </h3>
                      {isPaused ? (
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                          Paused
                        </p>
                      ) : isFuture ? (
                        <p className="mt-0.5 text-sm font-medium text-blue-600 dark:text-blue-400">
                          {startLabel}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                          Phase {program.currentPhase} • {program.currentDay}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <div className="text-right">
                        <span className={`text-sm font-semibold ${isPaused ? 'text-amber-600 dark:text-amber-400' : isFuture ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                          {program.progress}%
                        </span>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {program.completedWorkouts}/{program.totalWorkouts} sessions
                        </p>
                      </div>
                      <div className="w-10" />
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isPaused
                          ? 'bg-amber-500'
                          : isFuture
                            ? 'bg-blue-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${program.progress}%` }}
                    />
                  </div>
                </Link>
                {isPaused ? (
                  <Link
                    href={`/dashboard/workout/${program.programId}`}
                    className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition-transform duration-200 hover:scale-110 hover:bg-amber-600 active:scale-95"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                  </Link>
                ) : (
                  <Link
                    href={`/dashboard/workout/${program.programId}/workout`}
                    className={`absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110 active:scale-95 ${
                      isFuture ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </Link>
                )}
              </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Loading skeleton for active programs */}
      {loadingActive && (
        <div className="mb-6">
          <div className="mb-3 h-6 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      )}

      {/* Not on a program — Quick Session lives where Continue Training would.
          Coexists with browsing/starting a program below. */}
      {!loadingActive && activePrograms.length === 0 && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Not on a program?
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Just train — log a one-off session.
            </p>
          </div>
          {quickSessionButton}
        </div>
      )}

      {/* Saved Programs Section */}
      {!loadingSaved && savedPrograms.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <svg className="h-5 w-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Saved for Later
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Drag to reorder
            </span>
          </div>
          <div className="space-y-2">
            {savedPrograms.slice(0, savedShown).map((program, index) => (
              <Card
                key={program.program_id}
                variant="compact"
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`group flex cursor-grab items-center gap-3 transition-all duration-200 active:cursor-grabbing ${
                  dragOverIndex === index
                    ? "!border-amber-500 !bg-amber-50 dark:!bg-amber-950/20"
                    : draggedIndex === index
                    ? "opacity-50"
                    : "hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                {/* Drag Handle */}
                <div className="shrink-0 text-zinc-400 dark:text-zinc-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                </div>

                {/* Content - Clickable Link */}
                <Link 
                  href={`/dashboard/workout/${program.program_id}`}
                  className="min-w-0 flex-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                      {program.name}
                    </h3>
                    <div className="flex shrink-0 gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {program.duration_weeks}w
                      </span>
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {program.training_days_per_week}x
                      </span>
                    </div>
                  </div>
                  {program.tags && program.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {program.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>

                {/* Unsave Button */}
                <button
                  onClick={() => toggleSaveProgram(program.program_id)}
                  disabled={savingProgramId === program.program_id}
                  className="shrink-0 p-1.5 text-amber-500 hover:text-amber-600 transition-colors disabled:opacity-50"
                  title="Remove from saved"
                >
                  {savingProgramId === program.program_id ? (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  )}
                </button>
              </Card>
            ))}
            {savedPrograms.length > 5 && (
              <button
                onClick={() => setSavedShown(n => n > 5 ? 5 : n + 5)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                {savedShown >= savedPrograms.length
                  ? 'Show less'
                  : `Show more (${savedPrograms.length - savedShown} remaining)`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton for saved programs */}
      {loadingSaved && (
        <div className="mb-6">
          <div className="mb-3 h-6 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          </div>
        </div>
      )}

      {/* Recommended for You Section */}
      {recommendedPrograms.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Recommended for You
            </h2>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Based on your goal
            </span>
          </div>
          <div className="space-y-3">
            {recommendedPrograms.slice(0, 3).map((program) => (
              <Card
                key={program.program_id}
                accent="success"
                className="group flex items-center gap-3 transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-700 sm:gap-4"
              >
                {/* Save Button */}
                <button
                  onClick={() => toggleSaveProgram(program.program_id)}
                  disabled={savingProgramId === program.program_id}
                  className="shrink-0 p-1 text-zinc-400 hover:text-amber-500 transition-colors disabled:opacity-50"
                  title="Save for later"
                >
                  {savingProgramId === program.program_id ? (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <Link href={`/dashboard/workout/${program.program_id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                      {program.name}
                    </h3>
                    <div className="flex shrink-0 gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {program.duration_weeks}w
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {program.training_days_per_week}x/wk
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{program.target_user}</p>
                  {program.tags && program.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {program.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>

                {/* Arrow */}
                <div className="shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* All Programs Section */}
      <div id="browse-programs" className="mb-4 scroll-mt-20">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            Browse Programs
            {totalPrograms > 0 && (
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({totalPrograms})
              </span>
            )}
          </h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              showFilters || hasFilters
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasFilters && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs text-white">
                {(searchQuery ? 1 : 0) + selectedTags.length + (selectedLevel ? 1 : 0)}
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <svg
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search programs by name, tags, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-green-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            {/* Tags */}
            {availableTags.length > 0 && (
              <div className="mb-4">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                        selectedTags.includes(tag)
                          ? "bg-green-500 text-white"
                          : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Level Filter */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Experience Level
              </label>
              <div className="flex flex-wrap gap-2">
                {["Beginner", "Intermediate", "Advanced", "Beginner to Intermediate", "Intermediate to Advanced"].map((level) => (
                  <button
                    key={level}
                    onClick={() => setSelectedLevel(selectedLevel === level ? "" : level)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      selectedLevel === level
                        ? "bg-green-500 text-white"
                        : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Selected Tags Pills */}
        {selectedTags.length > 0 && !showFilters && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selectedTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                {tag}
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Program List */}
      {loadingPrograms && allPrograms.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : filteredPrograms.length > 0 ? (
        <>
          <div className="space-y-3">
            {filteredPrograms.map((program) => (
              <Card
                key={program.program_id}
                className="group flex items-center gap-3 transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-700 sm:gap-4"
              >
                {/* Save Button */}
                <button
                  onClick={() => toggleSaveProgram(program.program_id)}
                  disabled={savingProgramId === program.program_id}
                  className="shrink-0 p-1 text-zinc-400 hover:text-amber-500 transition-colors disabled:opacity-50"
                  title="Save for later"
                >
                  {savingProgramId === program.program_id ? (
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  )}
                </button>

                {/* Content - Link */}
                <Link
                  href={`/dashboard/workout/${program.program_id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                      {program.name}
                    </h3>
                    <div className="flex shrink-0 gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {program.duration_weeks}w
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {program.training_days_per_week}x/wk
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {program.target_user}
                  </p>
                  {program.tags && program.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {program.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400"
                        >
                          {tag}
                        </span>
                      ))}
                      {program.tags.length > 4 && (
                        <span className="text-xs text-zinc-400">
                          +{program.tags.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </Link>

                {/* Arrow */}
                <div className="shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Card>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loadingPrograms}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {loadingPrograms ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  "Load More Programs"
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Search className="h-7 w-7" />}
          title={hasFilters ? "No matching programs" : "No programs available"}
          description={
            hasFilters
              ? "Try adjusting your search or filters."
              : "Programs will appear here once they're available."
          }
          action={
            hasFilters ? (
              <button
                onClick={clearFilters}
                className="text-sm font-medium text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}

      {/* Quick Session + Generate modals */}
      <QuickSessionModal open={showQuickSession} onClose={() => setShowQuickSession(false)} />
      <GenerateModal open={showGenerate} onClose={() => setShowGenerate(false)} />

      <Toast toast={toast} />
    </PageTransition>
  );
}
