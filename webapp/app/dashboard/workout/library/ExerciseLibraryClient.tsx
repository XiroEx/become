"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import { ArrowLeft, Plus, Trash2, Dumbbell } from "lucide-react";
import { Card } from "@/components/ui";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CustomExercise {
  slug: string;
  name: string;
  trackingType: string;
  primaryMuscles: string[];
  bodyRegion: string;
  category: string;
  equipment: string[];
  defaultSets?: number;
  defaultReps?: string;
}

interface CreateForm {
  name: string;
  trackingType: string;
  muscleGroup: string;
  category: string;
  defaultSets: string;
  defaultReps: string;
  submitting: boolean;
  error: string | null;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const TRACKING_LABELS: Record<string, string> = {
  reps_weight:     "Sets × Reps + Weight",
  reps_bodyweight: "Sets × Reps (bodyweight)",
  reps_only:       "Reps Only",
  time:            "Time / Duration",
  time_distance:   "Time + Distance",
  intervals:       "Intervals",
  none:            "No Tracking",
};

const TRACKING_TYPE_OPTIONS = [
  { value: "reps_weight",     label: "Sets × Reps + Weight",     hint: "e.g. Bench Press"   },
  { value: "reps_bodyweight", label: "Sets × Reps (bodyweight)",  hint: "e.g. Push-Ups"      },
  { value: "reps_only",       label: "Reps Only",                 hint: "e.g. Jumps"         },
  { value: "time",            label: "Time / Duration",           hint: "e.g. Plank"         },
  { value: "time_distance",   label: "Time + Distance",           hint: "e.g. Run, Row"      },
  { value: "intervals",       label: "Intervals",                 hint: "e.g. HIIT, EMOM"    },
  { value: "none",            label: "No Tracking",               hint: "e.g. Rest"          },
];

const MUSCLE_GROUP_OPTIONS = [
  { value: "chest",     label: "Chest"     },
  { value: "back",      label: "Back"      },
  { value: "shoulders", label: "Shoulders" },
  { value: "arms",      label: "Arms"      },
  { value: "core",      label: "Core"      },
  { value: "legs",      label: "Legs"      },
  { value: "full_body", label: "Full Body" },
];

const CATEGORY_OPTIONS = [
  { value: "strength",     label: "Strength"     },
  { value: "cardio",       label: "Cardio"       },
  { value: "bodyweight",   label: "Bodyweight"   },
  { value: "conditioning", label: "Conditioning" },
];

const MUSCLE_LABEL_MAP: Record<string, string> = {
  chest: "Chest", lats: "Lats", upper_back: "Upper Back", quads: "Quads",
  hamstrings: "Hamstrings", glutes: "Glutes", abs: "Abs", obliques: "Obliques",
  biceps: "Biceps", triceps: "Triceps", front_delts: "Front Delts",
  side_delts: "Side Delts", full_body: "Full Body",
};

function formatMuscle(m: string) {
  return MUSCLE_LABEL_MAP[m] || m.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const EMPTY_FORM: CreateForm = {
  name: "", trackingType: "reps_weight", muscleGroup: "chest",
  category: "strength", defaultSets: "3", defaultReps: "8-12",
  submitting: false, error: null,
};

// ─── Component ───────────────────────────────────────────────────────────────

const EXERCISES_PAGE = 5

interface ExerciseLibraryClientProps {
  /** Embedded inside the Workout hub — drop the page chrome (wrapper + header). */
  embedded?: boolean;
}

export default function ExerciseLibraryClient({ embedded }: ExerciseLibraryClientProps = {}) {
  const router = useRouter();
  const [exercises, setExercises] = useState<CustomExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(EXERCISES_PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch("/api/exercises/custom", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExercises(data.exercises || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setForm(p => ({ ...p, error: "Name is required" }));
      return;
    }
    setForm(p => ({ ...p, submitting: true, error: null }));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/exercises/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          trackingType: form.trackingType,
          muscleGroup: form.muscleGroup,
          category: form.category,
          defaultSets: form.defaultSets,
          defaultReps: form.defaultReps,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForm(p => ({ ...p, submitting: false, error: data.error || "Failed to create" }));
        return;
      }
      setExercises(prev => [...prev, data.exercise]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch {
      setForm(p => ({ ...p, submitting: false, error: "Network error" }));
    }
  };

  const handleDelete = async (slug: string) => {
    setDeletingSlug(slug);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/exercises/custom?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setExercises(prev => prev.filter(e => e.slug !== slug));
    } finally {
      setDeletingSlug(null);
    }
  };

  const isTimeBased = ["time", "time_distance", "intervals"].includes(form.trackingType);

  const filteredExercises = search.trim()
    ? exercises.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.primaryMuscles.some(m => m.toLowerCase().includes(search.toLowerCase())) ||
        e.category.toLowerCase().includes(search.toLowerCase())
      )
    : exercises;

  const content = (
    <>
      {/* Header */}
      {embedded ? (
        !showForm && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowForm(true)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        )
      ) : (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">
              My Exercises
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your custom exercises — use them in any workout or program.
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          )}
        </div>
      )}

      {/* Create Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className="mb-6 sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-4 dark:sm:border-zinc-800 dark:sm:bg-zinc-900"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">New Custom Exercise</h2>
              <button
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Name *</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Seated Leg Curl"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleCreate()}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                />
              </div>

              {/* Tracking Type */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Tracking Type</label>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {TRACKING_TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setForm(p => ({ ...p, trackingType: opt.value }))}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        form.trackingType === opt.value
                          ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-300"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-zinc-400 dark:text-zinc-500">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Muscles + Category row */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Primary Muscles</label>
                  <div className="flex flex-wrap gap-1.5">
                    {MUSCLE_GROUP_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setForm(p => ({ ...p, muscleGroup: opt.value }))}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          form.muscleGroup === opt.value
                            ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-300"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setForm(p => ({ ...p, category: opt.value }))}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          form.category === opt.value
                            ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-300"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sets + Reps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Default Sets</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="10"
                    value={form.defaultSets}
                    onChange={e => setForm(p => ({ ...p, defaultSets: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {isTimeBased ? "Duration (e.g. 30s)" : "Reps (e.g. 8-12)"}
                  </label>
                  <input
                    type="text"
                    placeholder={isTimeBased ? "30s" : "8-12"}
                    value={form.defaultReps}
                    onChange={e => setForm(p => ({ ...p, defaultReps: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              </div>

              {form.error && <p className="text-xs text-red-500 dark:text-red-400">{form.error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                  className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={form.submitting || !form.name.trim()}
                  className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
                >
                  {form.submitting ? "Creating..." : "Create Exercise"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      {!loading && exercises.length > 0 && (
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={e => { setSearch(e.target.value); setShown(EXERCISES_PAGE); }}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      )}

      {/* Exercise List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : exercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Dumbbell className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
          </div>
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No custom exercises yet</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Tap &quot;Add&quot; to create your first exercise.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 flex items-center gap-1.5 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Exercise
          </button>
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No exercises match &ldquo;{search}&rdquo;</p>
          <button onClick={() => setSearch("")} className="mt-2 text-sm text-green-600 hover:text-green-700 dark:text-green-400">Clear search</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredExercises.slice(0, shown).map((ex, i) => (
            <Card
              as={motion.div}
              key={ex.slug}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3"
            >
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30">
                <Dumbbell className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-900 dark:text-white">{ex.name}</p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {TRACKING_LABELS[ex.trackingType] || ex.trackingType}
                  {ex.primaryMuscles.length > 0 && (
                    <> · {ex.primaryMuscles.slice(0, 2).map(formatMuscle).join(", ")}</>
                  )}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  {ex.defaultSets && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {ex.defaultSets} sets
                    </span>
                  )}
                  {ex.defaultReps && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {ex.defaultReps}
                    </span>
                  )}
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 capitalize">
                    {ex.category}
                  </span>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(ex.slug)}
                disabled={deletingSlug === ex.slug}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/20 dark:hover:text-red-400"
              >
                {deletingSlug === ex.slug ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </Card>
          ))}
          {filteredExercises.length > EXERCISES_PAGE && (
            <button
              onClick={() => setShown(n => n > EXERCISES_PAGE ? EXERCISES_PAGE : n + EXERCISES_PAGE)}
              className="mt-1 w-full rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {shown >= filteredExercises.length
                ? 'Show less'
                : `Show more (${filteredExercises.length - shown} remaining)`}
            </button>
          )}
        </div>
      )}
    </>
  );

  if (embedded) return <div className="pb-6">{content}</div>;
  return <PageTransition className="pb-6">{content}</PageTransition>;
}
