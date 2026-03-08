"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface ExerciseSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwap: (alternative: AlternativeExercise) => void;
  exerciseSlug: string;
  exerciseName: string;
  /** Other exercise slugs in the current workout (to avoid duplicates) */
  workoutExerciseSlugs: string[];
  /** Role override from the program context */
  programRole?: string;
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

export default function ExerciseSwapModal({
  isOpen,
  onClose,
  onSwap,
  exerciseSlug,
  exerciseName,
  workoutExerciseSlugs,
  programRole,
}: ExerciseSwapModalProps) {
  const [alternatives, setAlternatives] = useState<AlternativeExercise[]>([]);
  const [source, setSource] = useState<SourceExercise | null>(null);
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch alternatives when modal opens
  const fetchAlternatives = useCallback(async () => {
    if (!exerciseSlug) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const params = new URLSearchParams({ slug: exerciseSlug, limit: "30" });
      if (workoutExerciseSlugs.length > 0) {
        params.set("workoutSlugs", workoutExerciseSlugs.join(","));
      }
      if (programRole) {
        params.set("programRole", programRole);
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
  }, [exerciseSlug, workoutExerciseSlugs, programRole]);

  useEffect(() => {
    if (isOpen) {
      fetchAlternatives();
      setSelectedSlug(null);
      setSearchQuery("");
      setFilters({ equipment: null, bodyRegion: null, difficulty: null, category: null });
    }
  }, [isOpen, fetchAlternatives]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && !loading) {
      setTimeout(() => searchRef.current?.focus(), 200);
    }
  }, [isOpen, loading]);

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

  const handleSwap = (alt: AlternativeExercise) => {
    onSwap(alt);
    onClose();
  };

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
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
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loading && (
                <div className="flex items-center justify-center py-12">
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
                <div className="space-y-2">
                  {filteredAlternatives.map((alt, i) => (
                    <motion.div
                      key={alt.slug}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <AlternativeCard
                        alternative={alt}
                        isSelected={selectedSlug === alt.slug}
                        onSelect={() => setSelectedSlug(selectedSlug === alt.slug ? null : alt.slug)}
                        onSwap={() => handleSwap(alt)}
                        source={source}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
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
  source,
}: {
  alternative: AlternativeExercise;
  isSelected: boolean;
  onSelect: () => void;
  onSwap: () => void;
  source: SourceExercise | null;
}) {
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
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-zinc-900 dark:text-white truncate text-sm">
                {alt.name}
              </h3>
              {alt.isExplicitAlternative && (
                <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Recommended
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {alt.equipment
                .filter((e) => e !== "none" && e !== "bodyweight")
                .map(formatEquipment)
                .join(", ") || "Bodyweight"}
              {" · "}
              {DIFFICULTY_LABELS[alt.difficulty] || alt.difficulty}
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

              {/* Swap button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSwap();
                }}
                className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500 active:bg-green-700"
              >
                Swap to {alt.name}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
