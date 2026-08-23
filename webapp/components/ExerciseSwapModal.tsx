"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getExerciseVideoUrl, getExerciseThumbnail } from "@/lib/data/exerciseVideos";
import CustomExerciseBadge from "@/components/workout/CustomExerciseBadge";
import CollapsibleSection from "@/components/CollapsibleSection";
import { useLockScroll } from "@/lib/useLockScroll";
import FramedVideo from "@/components/FramedVideo";
import CustomExerciseFields, { DEFAULT_CUSTOM_EXERCISE_VALUES, type CustomExerciseValues } from "@/components/workout/CustomExerciseFields";

const DIRECT_VIDEO_FILE = /\.(mp4|mov|webm|mkv|m4v)(\?.*)?$/i;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExerciseVariation {
  slug: string;
  name: string;
  equipment: string[];
  laterality: string;
  difficulty: string;
}

interface AlternativeExercise {
  slug: string;
  name: string;
  score: number;
  reasons: string[];
  equipment: string[];
  primaryMuscles: string[];
  movementPatterns: string[];
  difficulty: string;
  category: string;
  bodyRegion: string;
  role: string;
  trackingType: string;
  isExplicitAlternative: boolean;
  /** True for the caller's own exercises — drives the badge and the video. */
  isCustom?: boolean;
  /** A custom exercise keeps its demo on the Exercise doc, not in
   *  exercise_videos, so it has to travel with the row. */
  videoUrl?: string | null;
}

interface SourceExercise {
  slug: string;
  name: string;
  primaryMuscles: string[];
  movementPatterns: string[];
  equipment: string[];
  bodyRegion: string;
  role: string;
  category: string;
}

export type SwapScope = 'session' | 'program';

interface ExerciseSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwap: (alternative: AlternativeExercise, scope: SwapScope) => void;
  exerciseSlug: string;
  exerciseName: string;
  /** Other exercise slugs in the current workout (to avoid duplicates) */
  workoutExerciseSlugs: string[];
  /** Role override from the program context */
  programRole?: string;
  /** Quick sessions have no program — only offer a session-scope swap and hide the
   *  "Swap … for All Future Workouts" (program-wide) button. */
  sessionScopeOnly?: boolean;
}

// ─── Equipment display helpers ──────────────────────────────────────────────

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  ez_bar: "EZ Bar",
  trap_bar: "Trap Bar",
  safety_squat_bar: "SSB",
  cable: "Cable",
  leg_press: "Leg Press",
  leg_extension: "Leg Extension",
  leg_curl: "Leg Curl",
  hack_squat: "Hack Squat",
  chest_press_machine: "Chest Press",
  shoulder_press_machine: "Shoulder Press",
  lat_pulldown: "Lat Pulldown",
  seated_row_machine: "Seated Row",
  low_row_machine: "Low Row",
  pec_deck: "Pec Deck",
  smith_machine: "Smith Machine",
  glute_ham_raise: "GHR",
  back_extension: "Back Extension",
  sled: "Sled",
  flat_bench: "Flat Bench",
  incline_bench: "Incline Bench",
  decline_bench: "Decline Bench",
  squat_rack: "Squat Rack",
  pull_up_bar: "Pull-Up Bar",
  dip_station: "Dip Station",
  resistance_band: "Band",
  exercise_mat: "Mat",
  box: "Box",
  ab_wheel: "Ab Wheel",
  medicine_ball: "Med Ball",
  bodyweight: "Bodyweight",
  none: "None",
};

const BODY_REGION_LABELS: Record<string, string> = {
  upper_body: "Upper Body",
  lower_body: "Lower Body",
  core: "Core",
  full_body: "Full Body",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

function formatEquipment(eq: string): string {
  return EQUIPMENT_LABELS[eq] || eq.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMuscle(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Score badge colors ─────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 75) return "bg-green-500 text-white";
  if (score >= 50) return "bg-yellow-500 text-white";
  if (score >= 30) return "bg-orange-500 text-white";
  return "bg-zinc-500 text-white";
}

function getScoreLabel(score: number): string {
  if (score >= 75) return "Excellent match";
  if (score >= 50) return "Good match";
  if (score >= 30) return "Decent match";
  return "Partial match";
}

// ─── Filter types ───────────────────────────────────────────────────────────

type FilterKey = "equipment" | "bodyRegion" | "difficulty" | "category";

interface Filters {
  equipment: string | null;
  bodyRegion: string | null;
  difficulty: string | null;
  category: string | null;
}

// ─── Component ──────────────────────────────────────────────────────────────

// ─── Custom exercise create form state ──────────────────────────────────────

interface CustomFormState extends CustomExerciseValues {
  submitting: boolean;
  error: string | null;
}

export default function ExerciseSwapModal({
  isOpen,
  onClose,
  onSwap,
  exerciseSlug,
  exerciseName,
  workoutExerciseSlugs,
  programRole,
  sessionScopeOnly = false,
}: ExerciseSwapModalProps) {
  const [alternatives, setAlternatives] = useState<AlternativeExercise[]>([]);
  const [source, setSource] = useState<SourceExercise | null>(null);
  const [customExercises, setCustomExercises] = useState<AlternativeExercise[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [customForm, setCustomForm] = useState<CustomFormState>({
    ...DEFAULT_CUSTOM_EXERCISE_VALUES,
    submitting: false, error: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({
    equipment: null,
    bodyRegion: null,
    difficulty: null,
    category: null,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  // Snap every collapsible section back to its short preview whenever the modal is
  // re-opened or the result set changes (new search / filters) — a section must
  // never open already 30 items tall from a previous visit.
  const sectionResetKey = useMemo(
    () => [isOpen, searchQuery, filters.equipment, filters.bodyRegion, filters.difficulty, filters.category].join("|"),
    [isOpen, searchQuery, filters],
  );
  // Variations: cache per alternative slug, and which variant is selected
  const [variationsCache, setVariationsCache] = useState<Record<string, ExerciseVariation[]>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const searchRef = useRef<HTMLInputElement>(null);

  useLockScroll(isOpen);

  // Use refs to access latest prop values without re-creating the fetch callback
  const exerciseSlugRef = useRef(exerciseSlug);
  exerciseSlugRef.current = exerciseSlug;
  const workoutSlugsRef = useRef(workoutExerciseSlugs);
  workoutSlugsRef.current = workoutExerciseSlugs;
  const programRoleRef = useRef(programRole);
  programRoleRef.current = programRole;

  // Fetch alternatives — stable callback that reads from refs
  const fetchAlternatives = useCallback(async () => {
    const slug = exerciseSlugRef.current;
    if (!slug) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const params = new URLSearchParams({ slug, limit: "30" });
      const slugs = workoutSlugsRef.current;
      if (slugs.length > 0) {
        params.set("workoutSlugs", slugs.join(","));
      }
      const role = programRoleRef.current;
      if (role) {
        params.set("programRole", role);
      }

      const res = await fetch(`/api/exercises/alternatives?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load alternatives");
        return;
      }

      const data = await res.json();
      setAlternatives(data.alternatives || []);
      setSource(data.source || null);
    } catch {
      setError("Failed to load alternatives");
    } finally {
      setLoading(false);
    }
  }, []); // Stable — no dependencies, reads from refs

  // Track whether we've already fetched for this open session
  const hasFetchedRef = useRef(false);

  // Only fetch when modal opens — not on re-renders while open
  useEffect(() => {
    if (isOpen && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchAlternatives();
      setSelectedSlug(null);
      setSearchQuery("");
      setFilters({ equipment: null, bodyRegion: null, difficulty: null, category: null });
      setVariationsCache({});
      setSelectedVariants({});
      setShowCreateForm(false);
      setCustomForm({ ...DEFAULT_CUSTOM_EXERCISE_VALUES, submitting: false, error: null });

      // Load user's custom exercises
      const token = localStorage.getItem("token");
      if (token) {
        fetch("/api/exercises/custom", { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.exercises) {
              setCustomExercises(data.exercises.map((e: { slug: string; name: string; trackingType: string; primaryMuscles: string[]; bodyRegion: string; category: string; equipment: string[]; videoUrl?: string | null; }) => ({
                slug: e.slug, name: e.name, score: 100, reasons: ["Your custom exercise"],
                equipment: e.equipment || [], primaryMuscles: e.primaryMuscles || [],
                movementPatterns: [], difficulty: "intermediate",
                category: e.category, bodyRegion: e.bodyRegion,
                role: "accessory", trackingType: e.trackingType,
                isExplicitAlternative: true,
                isCustom: true,
                videoUrl: e.videoUrl ?? null,
              })));
            }
          })
          .catch(() => {});
      }
    }
    if (!isOpen) {
      hasFetchedRef.current = false;
    }
  }, [isOpen, fetchAlternatives, exerciseSlug]);

  // Fetch variations when a card is expanded (cached per slug)
  useEffect(() => {
    if (!selectedSlug || variationsCache[selectedSlug] !== undefined) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    // Mark as loading (empty array = loading, will replace)
    setVariationsCache((prev) => ({ ...prev, [selectedSlug]: [] }));

    fetch(`/api/exercises/variations?slug=${encodeURIComponent(selectedSlug)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.variations) {
          setVariationsCache((prev) => ({ ...prev, [selectedSlug]: data.variations }));
        }
      })
      .catch(() => {/* silently ignore — variations are optional */});
  }, [selectedSlug, variationsCache]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => searchRef.current?.focus(), 200);
    }
  }, [isOpen, loading]);

  // Reset visible count when user actively searches or filters
  useEffect(() => {
    if (searchQuery || Object.values(filters).some(Boolean)) {
    }
  }, [searchQuery, filters]);

  // Filter & search
  const filteredAlternatives = alternatives.filter((alt) => {
    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !alt.name.toLowerCase().includes(q) &&
        !alt.equipment.some((e) => formatEquipment(e).toLowerCase().includes(q)) &&
        !alt.primaryMuscles.some((m) => formatMuscle(m).toLowerCase().includes(q))
      ) {
        return false;
      }
    }

    // Equipment filter
    if (filters.equipment && !alt.equipment.includes(filters.equipment)) {
      return false;
    }

    // Body region filter
    if (filters.bodyRegion && alt.bodyRegion !== filters.bodyRegion) {
      return false;
    }

    // Difficulty filter
    if (filters.difficulty && alt.difficulty !== filters.difficulty) {
      return false;
    }

    // Category filter
    if (filters.category && alt.category !== filters.category) {
      return false;
    }

    return true;
  });

  // Collect unique values for filter options
  const equipmentOptions = [...new Set(alternatives.flatMap((a) => a.equipment))].sort();
  const bodyRegionOptions = [...new Set(alternatives.map((a) => a.bodyRegion))].sort();
  const difficultyOptions = [...new Set(alternatives.map((a) => a.difficulty))].sort();
  const categoryOptions = [...new Set(alternatives.map((a) => a.category))].sort();


  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const handleSwap = (alt: AlternativeExercise, scope: SwapScope) => {
    // If the user picked a specific variation, swap to that instead
    const chosenSlug = selectedVariants[alt.slug];
    if (chosenSlug && chosenSlug !== alt.slug) {
      const variations = variationsCache[alt.slug] || [];
      const chosenVariation = variations.find((v) => v.slug === chosenSlug);
      if (chosenVariation) {
        onSwap({ ...alt, slug: chosenVariation.slug, name: chosenVariation.name, equipment: chosenVariation.equipment }, scope);
        onClose();
        return;
      }
    }
    onSwap(alt, scope);
    onClose();
  };

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  };


  const handleCreateCustom = async () => {
    const { name, trackingType, muscleGroup, category, defaultSets, defaultReps } = customForm;
    if (!name.trim()) {
      setCustomForm(p => ({ ...p, error: "Name is required" }));
      return;
    }
    setCustomForm(p => ({ ...p, submitting: true, error: null }));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/exercises/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, trackingType, muscleGroup, category, defaultSets, defaultReps }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCustomForm(p => ({ ...p, submitting: false, error: data.error || "Failed to create" }));
        return;
      }
      const ex = data.exercise;
      onSwap({
        slug: ex.slug, name: ex.name, score: 100, reasons: ["Custom exercise"],
        equipment: ex.equipment || [], primaryMuscles: ex.primaryMuscles || [],
        movementPatterns: [], difficulty: ex.difficulty,
        category: ex.category, bodyRegion: ex.bodyRegion,
        role: ex.role, trackingType: ex.trackingType,
        isExplicitAlternative: true,
      }, "session");
      onClose();
    } catch {
      setCustomForm(p => ({ ...p, submitting: false, error: "Network error" }));
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center touch-none"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex-shrink-0 px-5 pt-5 pb-3">
              {/* Drag handle (mobile) */}
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden" />

              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white truncate">
                    Swap Exercise
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                    Replace {exerciseName}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search */}
              <div className="mt-3 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search exercises, muscles, equipment..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                />
              </div>

              {/* Filter toggle */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    showFilters || activeFilterCount > 0
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[10px] text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilters({ equipment: null, bodyRegion: null, difficulty: null, category: null })}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                  >
                    Clear all
                  </button>
                )}

                <div className="flex-1" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {filteredAlternatives.length} result{filteredAlternatives.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Filter chips */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-2">
                      {/* Equipment filter */}
                      {equipmentOptions.length > 0 && (
                        <FilterRow
                          label="Equipment"
                          options={equipmentOptions}
                          selected={filters.equipment}
                          onSelect={(v) => toggleFilter("equipment", v)}
                          formatLabel={formatEquipment}
                        />
                      )}
                      {/* Body region filter */}
                      {bodyRegionOptions.length > 0 && (
                        <FilterRow
                          label="Region"
                          options={bodyRegionOptions}
                          selected={filters.bodyRegion}
                          onSelect={(v) => toggleFilter("bodyRegion", v)}
                          formatLabel={(v) => BODY_REGION_LABELS[v] || v}
                        />
                      )}
                      {/* Difficulty filter */}
                      {difficultyOptions.length > 0 && (
                        <FilterRow
                          label="Difficulty"
                          options={difficultyOptions}
                          selected={filters.difficulty}
                          onSelect={(v) => toggleFilter("difficulty", v)}
                          formatLabel={(v) => DIFFICULTY_LABELS[v] || v}
                        />
                      )}
                      {/* Category filter */}
                      {categoryOptions.length > 0 && (
                        <FilterRow
                          label="Type"
                          options={categoryOptions}
                          selected={filters.category}
                          onSelect={(v) => toggleFilter("category", v)}
                          formatLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-200 dark:border-zinc-800" />

            {/* Results list */}
            <div className="flex-1 overflow-y-auto overscroll-contain touch-auto" style={{ WebkitOverflowScrolling: 'touch' }}>

              {/* ── Create Custom Form ── */}
              {showCreateForm && (
                <div className="px-5 pt-4 pb-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowCreateForm(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-white">Create Custom Exercise</p>
                  </div>

                  <CustomExerciseFields
                    values={customForm}
                    onChange={(next) => setCustomForm(p => ({ ...p, ...next }))}
                    nameAutoFocus
                  />

                  {customForm.error && (
                    <p className="text-xs text-red-500 dark:text-red-400">{customForm.error}</p>
                  )}

                  <button
                    onClick={handleCreateCustom}
                    disabled={customForm.submitting || !customForm.name.trim()}
                    className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
                  >
                    {customForm.submitting ? "Creating..." : "Create & Swap In"}
                  </button>
                </div>
              )}

              {/* ── Main alternatives list (hidden while create form is open) ── */}
              {!showCreateForm && (<>

              {/* ── My Custom Exercises ── */}
              {customExercises.length > 0 && (
                <div className="px-5 pt-3 pb-2">
                  <CollapsibleSection
                    title="My Exercises"
                    items={customExercises}
                    key={sectionResetKey}
                    listClassName="space-y-1.5"
                    keyFor={(ex) => ex.slug}
                    renderItem={(ex) => (
                      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{ex.name}</p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">{ex.trackingType.replace(/_/g, " ")} · {ex.primaryMuscles.slice(0, 2).map(m => m.replace(/_/g, " ")).join(", ")}</p>
                        </div>
                        <button
                          onClick={() => handleSwap(ex, "session")}
                          className="ml-3 shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 active:bg-green-800 transition-colors"
                        >
                          Use
                        </button>
                      </div>
                    )}
                  />
                </div>
              )}

              {/* Alternatives */}
              <div className="px-5 pb-4">
                {loading && (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                  </div>
                )}

                {error && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
                    <button
                      onClick={fetchAlternatives}
                      className="mt-2 text-sm text-green-600 hover:text-green-500 dark:text-green-400"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {!loading && !error && filteredAlternatives.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {alternatives.length > 0
                        ? "No exercises match your filters"
                        : "No alternatives found"}
                    </p>
                  </div>
                )}

                {!loading && !error && (
                  <CollapsibleSection
                    title="Top Suggestions"
                    items={filteredAlternatives}
                    key={sectionResetKey}
                    keyFor={(alt) => alt.slug}
                    renderItem={(alt, i) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 5) * 0.03 }}
                      >
                        <AlternativeCard
                          alternative={alt}
                          isSelected={selectedSlug === alt.slug}
                          onSelect={() => setSelectedSlug(selectedSlug === alt.slug ? null : alt.slug)}
                          onSwap={(scope) => handleSwap(alt, scope)}
                          sessionScopeOnly={sessionScopeOnly}
                          source={source}
                          variations={variationsCache[alt.slug] || null}
                          selectedVariationSlug={selectedVariants[alt.slug] ?? alt.slug}
                          onSelectVariation={(varSlug) =>
                            setSelectedVariants((prev) => ({ ...prev, [alt.slug]: varSlug }))
                          }
                        />
                      </motion.div>
                    )}
                  />
                )}

                {/* Create Custom button */}
                {!loading && (
                  <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 transition-colors hover:border-green-400 hover:text-green-600 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-green-500 dark:hover:text-green-400"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Custom Exercise
                    </button>
                  </div>
                )}
              </div>
            </>)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Filter Row ─────────────────────────────────────────────────────────────

function FilterRow({
  label,
  options,
  selected,
  onSelect,
  formatLabel,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  formatLabel: (value: string) => string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 w-16 pt-1.5">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              selected === opt
                ? "bg-green-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {formatLabel(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Alternative Card ───────────────────────────────────────────────────────

function AlternativeCard({
  alternative: alt,
  isSelected,
  onSelect,
  onSwap,
  sessionScopeOnly = false,
  source,
  variations,
  selectedVariationSlug,
  onSelectVariation,
}: {
  alternative: AlternativeExercise;
  isSelected: boolean;
  onSelect: () => void;
  onSwap: (scope: SwapScope) => void;
  sessionScopeOnly?: boolean;
  source: SourceExercise | null;
  variations: ExerciseVariation[] | null;
  selectedVariationSlug: string;
  onSelectVariation: (slug: string) => void;
}) {
  const hasVariations = variations !== null && variations.length > 1;
  const chosenVariation = hasVariations
    ? variations.find((v) => v.slug === selectedVariationSlug) ?? variations[0]
    : null;
  const displayName = chosenVariation ? chosenVariation.name : alt.name;
  return (
    <div
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-green-500 bg-green-50/50 dark:border-green-600 dark:bg-green-950/20"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      {/* Main row */}
      <button
        onClick={onSelect}
        className="w-full px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {/* Score badge */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${getScoreColor(alt.score)}`}
          >
            {alt.score}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-zinc-900 dark:text-white truncate text-sm">
                {displayName}
              </h3>
              {alt.isCustom && <CustomExerciseBadge variant="inline" />}
              {/* "Recommended" is meaningless on your own exercise — every
                  custom row is flagged as an explicit alternative so it sorts
                  to the top, which would badge all of them. */}
              {alt.isExplicitAlternative && !alt.isCustom && (
                <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Recommended
                </span>
              )}
              {hasVariations && (
                <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {variations!.length} variations
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {(chosenVariation?.equipment ?? alt.equipment)
                .filter((e) => e !== "none" && e !== "bodyweight")
                .map(formatEquipment)
                .join(", ") || "Bodyweight"}
              {" · "}
              {DIFFICULTY_LABELS[chosenVariation?.difficulty ?? alt.difficulty] || alt.difficulty}
            </p>
          </div>

          {/* Expand arrow */}
          <motion.svg
            animate={{ rotate: isSelected ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="h-4 w-4 shrink-0 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
              {/* Exercise video */}
              <ExerciseVideoPreview exerciseName={displayName} exerciseVideoUrl={alt.videoUrl} />

              {/* Match reasons */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {alt.reasons.map((reason, i) => (
                  <span
                    key={i}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      reason === "Already in workout"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {reason}
                  </span>
                ))}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getScoreColor(alt.score)}`}>
                  {getScoreLabel(alt.score)}
                </span>
              </div>

              {/* Muscles comparison */}
              <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                <div>
                  <p className="font-medium text-zinc-500 dark:text-zinc-400 mb-1">Primary muscles</p>
                  <div className="flex flex-wrap gap-1">
                    {alt.primaryMuscles.map((m) => (
                      <span
                        key={m}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          source?.primaryMuscles.includes(m)
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {formatMuscle(m)}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-zinc-500 dark:text-zinc-400 mb-1">Movement</p>
                  <div className="flex flex-wrap gap-1">
                    {alt.movementPatterns.map((p) => (
                      <span
                        key={p}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          source?.movementPatterns.includes(p)
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {p.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Variation picker */}
              {hasVariations && (
                <div className="mb-3">
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Pick a variation
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {variations!.map((v) => (
                      <button
                        key={v.slug}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVariation(v.slug);
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          (selectedVariationSlug === v.slug || (!selectedVariationSlug && v.slug === alt.slug))
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-400"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600"
                        }`}
                      >
                        <span className="block max-w-[140px] truncate">{v.name}</span>
                        {v.equipment.filter(eq => eq !== "none" && eq !== "bodyweight").length > 0 && (
                          <span className="block text-[10px] opacity-70 max-w-[140px] truncate">
                            {v.equipment.filter(eq => eq !== "none" && eq !== "bodyweight").map(formatEquipment).join(", ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Swap buttons. Quick sessions have no program, so only a single
                  session-scope swap is offered (no "All Future Workouts"). */}
              <div className="flex flex-col gap-2">
                {sessionScopeOnly ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwap('session');
                    }}
                    className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500 active:bg-green-700"
                  >
                    Swap {chosenVariation ? `"${chosenVariation.name}"` : "Exercise"}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwap('program');
                      }}
                      className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500 active:bg-green-700"
                    >
                      Swap {chosenVariation ? `"${chosenVariation.name}"` : ""} for All Future Workouts
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwap('session');
                      }}
                      className="w-full rounded-lg border border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Just This Session
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Exercise Video Preview ──────────────────────────────────────────────────

function ExerciseVideoPreview({
  exerciseName,
  exerciseVideoUrl,
}: {
  exerciseName: string;
  /** The video denormalized onto the exercise — authoritative when present. */
  exerciseVideoUrl?: string | null;
}) {
  const videoUrl = exerciseVideoUrl?.trim() || getExerciseVideoUrl(exerciseName);
  const thumbnailUrl = getExerciseThumbnail(exerciseName);

  // Nothing to show. Previously a hash-picked placeholder clip played here, so
  // every swap candidate looked like it had a demo.
  if (!videoUrl) return null;

  // Direct = any local or remote URL ending in a known video extension (the
  // old `startsWith('/')` check excluded /api/blob proxy URLs).
  if (DIRECT_VIDEO_FILE.test(videoUrl)) {
    return (
      <div className="mb-3">
        <FramedVideo src={videoUrl} surface="preview" />
      </div>
    );
  }

  // YouTube or external URL — show click-to-play thumbnail
  return <YouTubePreview videoUrl={videoUrl} thumbnailUrl={thumbnailUrl} exerciseName={exerciseName} />;
}

function YouTubePreview({
  videoUrl,
  thumbnailUrl,
  exerciseName,
}: {
  videoUrl: string;
  thumbnailUrl: string | null;
  exerciseName: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`${videoUrl}?autoplay=1&rel=0&modestbranding=1`}
          title={`${exerciseName} demo`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg group cursor-pointer"
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={`${exerciseName} thumbnail`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-zinc-600 to-zinc-700" />
      )}
      <div className="absolute inset-0 bg-black/30 transition-opacity group-hover:bg-black/40" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
          <svg className="h-6 w-6 text-green-600 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </button>
  );
}
