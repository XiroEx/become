"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import { ArrowLeft, Plus, Trash2, Pencil, ChevronDown, Dumbbell, Globe2, Clock, ArrowDownAZ, Lock } from "lucide-react";
import { Card } from "@/components/ui";
import { setUnitLabel } from "@/lib/workout/tracking";
import AdminVideoPreview from "@/app/dashboard/admin/exercises/_form/AdminVideoPreview";
import VideoUploadButton from "@/components/admin/VideoUploadButton";
import VideoTrimEditor from "@/components/admin/VideoTrimEditor";
import CustomExerciseBadge from "@/components/workout/CustomExerciseBadge";
import CustomExerciseFields, { DEFAULT_CUSTOM_EXERCISE_VALUES, type CustomExerciseValues } from "@/components/workout/CustomExerciseFields";
import { inferCustomExerciseMuscleGroup, inferCustomExerciseCategory } from "@/lib/customExerciseFields";
import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";
import { CUSTOM_TAG } from "@/lib/customExerciseTags";
import { useEntitlements } from "@/hooks/useEntitlements";
import UpgradeSheet from "@/components/UpgradeSheet";
import { gateFrom, syntheticGate, type GatePayload } from "@/lib/entitlementsClient";

// ─── Types ───────────────────────────────────────────────────────────────────

type ReviewStatus = "none" | "pending" | "approved" | "rejected";

interface CustomExercise {
  slug: string;
  name: string;
  trackingType: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  stabilizers?: string[];
  bodyRegion: string;
  category: string;
  role?: string;
  equipment: string[];
  mechanics?: string;
  movementPatterns?: string[];
  laterality?: string;
  difficulty?: string;
  defaultSets?: number;
  defaultReps?: string;
  tags?: string[];
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  videoTrim?: VideoTrimOverride | null;
  createdAt?: string;
  isUniversal?: boolean;
  reviewStatus?: ReviewStatus;
  submittedAt?: string | null;
  reviewNote?: string | null;
}

interface CreateForm extends CustomExerciseValues {
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
  ...DEFAULT_CUSTOM_EXERCISE_VALUES,
  submitting: false, error: null,
};

// ─── Sort + filter ───────────────────────────────────────────────────────────

type SortMode = "recent" | "alphabetical";

const SORT_OPTIONS: { value: SortMode; label: string; icon: typeof Clock }[] = [
  { value: "recent", label: "Recent", icon: Clock },
  { value: "alphabetical", label: "A–Z", icon: ArrowDownAZ },
];

// Same vocabulary the create/edit form uses for "Primary Muscles" — bucket
// each exercise's stored primaryMuscles back into that vocabulary so the
// filter chips match what the owner actually picked.
const BODY_PART_FILTER_OPTIONS = [
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "arms", label: "Arms" },
  { value: "core", label: "Core" },
  { value: "legs", label: "Legs" },
  { value: "full_body", label: "Full Body" },
];

const ROLE_FILTER_OPTIONS = [
  { value: "compound", label: "Compound" },
  { value: "secondary", label: "Secondary" },
  { value: "accessory", label: "Accessory" },
];

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
  const [gate, setGate] = useState<GatePayload | null>(null);
  const { data: entitlements, feature: entitlementFor, refresh: refreshEntitlements } =
    useEntitlements();
  // canCreate, not allowed: DELETE and edit stay enabled at the cap on purpose
  // — deleting one is the only way back under an inventory limit.
  const canCreate =
    !entitlements ||
    entitlements.enforced === false ||
    entitlementFor("custom-exercises")?.canCreate !== false;
  // The entitlement rides along so the sheet can say "3 of 3" and "delete one
  // to free a slot" — this is the PROACTIVE path, where no 403 supplied them.
  const openCreate = () =>
    canCreate
      ? setShowForm(true)
      : setGate(syntheticGate("custom-exercises", "plus", entitlementFor("custom-exercises")));
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(EXERCISES_PAGE);
  // Which row's dropdown is open — collapsed rows just show name + subtitle;
  // opening one reveals Edit, Delete, and the video controls.
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  // Which row is mid-edit, and the form driving it (separate from `form`,
  // which is only ever the create form — editing shares the same fields but
  // must not clobber an in-progress create).
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CreateForm>(EMPTY_FORM);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [bodyPartFilter, setBodyPartFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  // Submit-to-universal is a separate async action per row, tracked by slug
  // so one row's spinner never bleeds into another's.
  const [submittingSlug, setSubmittingSlug] = useState<string | null>(null);

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
          role: form.role,
          defaultSets: form.defaultSets,
          defaultReps: form.defaultReps,
          primaryMuscles: form.primaryMuscles,
          secondaryMuscles: form.secondaryMuscles,
          stabilizers: form.stabilizers,
          equipment: form.equipment,
          mechanics: form.mechanics,
          movementPatterns: form.movementPatterns,
          laterality: form.laterality,
          difficulty: form.difficulty,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const g = gateFrom(res.status, data);
        if (g) {
          setForm(p => ({ ...p, submitting: false }));
          setGate(g);
          void refreshEntitlements();
          return;
        }
        setForm(p => ({ ...p, submitting: false, error: data.error || "Failed to create" }));
        return;
      }
      setExercises(prev => [...prev, data.exercise]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      void refreshEntitlements();
    } catch {
      setForm(p => ({ ...p, submitting: false, error: "Network error" }));
    }
  };

  // Patch a single exercise in place. Uploading a video should not cost a full
  // reload of the list (and the scroll position that goes with it).
  const patchExercise = useCallback((slug: string, patch: Partial<CustomExercise>) => {
    setExercises(prev => prev.map(e => (e.slug === slug ? { ...e, ...patch } : e)));
  }, []);

  const handleDelete = async (slug: string) => {
    setDeletingSlug(slug);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/exercises/custom?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setExercises(prev => prev.filter(e => e.slug !== slug));
      if (expandedSlug === slug) setExpandedSlug(null);
      if (editingSlug === slug) setEditingSlug(null);
      // A delete frees an inventory slot server-side straight away. Re-read the
      // snapshot now, or the 60s TTL keeps the create button locked at a cap
      // the member just cleared — and deleting is the only way back under one.
      void refreshEntitlements();
    } finally {
      setDeletingSlug(null);
    }
  };

  const startEdit = (ex: CustomExercise) => {
    setEditingSlug(ex.slug);
    setEditForm({
      name: ex.name,
      trackingType: ex.trackingType,
      // The stored document only has the resolved primaryMuscles/category —
      // infer back to the form's own vocabulary so the right chips light up.
      muscleGroup: inferCustomExerciseMuscleGroup(ex.primaryMuscles),
      category: inferCustomExerciseCategory(ex.category),
      role: ex.role ?? "accessory",
      defaultSets: ex.defaultSets ? String(ex.defaultSets) : "3",
      defaultReps: ex.defaultReps ?? "8-12",
      primaryMuscles: ex.primaryMuscles ?? [],
      secondaryMuscles: ex.secondaryMuscles ?? [],
      stabilizers: ex.stabilizers ?? [],
      equipment: (ex.equipment ?? []).filter(item => item !== "none"),
      mechanics: ex.mechanics ?? "n/a",
      movementPatterns: (ex.movementPatterns ?? []).filter(item => item !== "n/a"),
      laterality: ex.laterality ?? "bilateral",
      difficulty: ex.difficulty ?? "intermediate",
      submitting: false,
      error: null,
    });
  };

  const handleUpdate = async () => {
    if (!editingSlug) return;
    if (!editForm.name.trim()) {
      setEditForm(p => ({ ...p, error: "Name is required" }));
      return;
    }
    setEditForm(p => ({ ...p, submitting: true, error: null }));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/exercises/custom/${encodeURIComponent(editingSlug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editForm.name,
          trackingType: editForm.trackingType,
          muscleGroup: editForm.muscleGroup,
          category: editForm.category,
          role: editForm.role,
          defaultSets: editForm.defaultSets,
          defaultReps: editForm.defaultReps,
          primaryMuscles: editForm.primaryMuscles,
          secondaryMuscles: editForm.secondaryMuscles,
          stabilizers: editForm.stabilizers,
          equipment: editForm.equipment,
          mechanics: editForm.mechanics,
          movementPatterns: editForm.movementPatterns,
          laterality: editForm.laterality,
          difficulty: editForm.difficulty,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditForm(p => ({ ...p, submitting: false, error: data.error || "Failed to save" }));
        return;
      }
      patchExercise(editingSlug, data.exercise);
      setEditingSlug(null);
    } catch {
      setEditForm(p => ({ ...p, submitting: false, error: "Network error" }));
    }
  };

  const handleSubmitUniversal = async (slug: string) => {
    setSubmittingSlug(slug);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/exercises/custom/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        patchExercise(slug, { reviewStatus: data.reviewStatus, submittedAt: data.submittedAt, reviewNote: null });
      }
    } finally {
      setSubmittingSlug(null);
    }
  };

  const handleWithdrawUniversal = async (slug: string) => {
    setSubmittingSlug(slug);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/exercises/custom/${encodeURIComponent(slug)}/submit`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        patchExercise(slug, { reviewStatus: data.reviewStatus, submittedAt: null });
      }
    } finally {
      setSubmittingSlug(null);
    }
  };

  const filteredExercises = exercises
    .filter(e => !search.trim() || (
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.primaryMuscles.some(m => m.toLowerCase().includes(search.toLowerCase())) ||
      e.category.toLowerCase().includes(search.toLowerCase())
    ))
    .filter(e => !bodyPartFilter || inferCustomExerciseMuscleGroup(e.primaryMuscles) === bodyPartFilter)
    .filter(e => !roleFilter || (e.role ?? "accessory") === roleFilter)
    .sort((a, b) => {
      if (sortMode === "alphabetical") return a.name.localeCompare(b.name);
      // "Recent" — newest first. Fall back to 0 (equal order) if createdAt
      // wasn't returned for some reason.
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });

  const addButton = !showForm && (
    <button
      onClick={openCreate}
      className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
    >
      {canCreate ? <Plus className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      Add
    </button>
  );

  const createForm = (
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
            <CustomExerciseFields
              values={form}
              onChange={(next) => setForm(p => ({ ...p, ...next }))}
              nameAutoFocus
              namePlaceholder="e.g. Seated Leg Curl"
            />

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
  );

  const content = (
    <>
      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
      {/* Header — embedded (Hub tab) skips the Add button here; it renders
          below the search bar instead so this row doesn't sit empty. */}
      {embedded ? null : (
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
          {addButton}
        </div>
      )}

      {/* Create Form (non-embedded: right under the header, next to the button that opens it) */}
      {!embedded && createForm}

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

      {/* Add button (embedded: below the search bar, reclaiming the empty header row above it) */}
      {embedded && (
        <div className="mb-4 flex justify-end">{addButton}</div>
      )}
      {embedded && createForm}

      {/* Sort + filter tabs */}
      {!loading && exercises.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-1.5">
            {SORT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => { setSortMode(opt.value); setShown(EXERCISES_PAGE); }}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    sortMode === opt.value
                      ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-300"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setBodyPartFilter(null); setShown(EXERCISES_PAGE); }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !bodyPartFilter
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              All body parts
            </button>
            {BODY_PART_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setBodyPartFilter(p => (p === opt.value ? null : opt.value)); setShown(EXERCISES_PAGE); }}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  bodyPartFilter === opt.value
                    ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-300"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setRoleFilter(null); setShown(EXERCISES_PAGE); }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                !roleFilter
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              All roles
            </button>
            {ROLE_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setRoleFilter(p => (p === opt.value ? null : opt.value)); setShown(EXERCISES_PAGE); }}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  roleFilter === opt.value
                    ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-300"
                    : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            onClick={openCreate}
            className="mt-4 flex items-center gap-1.5 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
          >
            {canCreate ? <Plus className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            Create Exercise
          </button>
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {search ? <>No exercises match &ldquo;{search}&rdquo;</> : "No exercises match these filters"}
          </p>
          <button
            onClick={() => { setSearch(""); setBodyPartFilter(null); setRoleFilter(null); setShown(EXERCISES_PAGE); }}
            className="mt-2 text-sm text-green-600 hover:text-green-700 dark:text-green-400"
          >
            Clear search &amp; filters
          </button>
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
              className="flex flex-col gap-3"
            >
              <button
                type="button"
                onClick={() => setExpandedSlug(prev => (prev === ex.slug ? null : ex.slug))}
                aria-expanded={expandedSlug === ex.slug}
                aria-label={`${expandedSlug === ex.slug ? "Collapse" : "Expand"} ${ex.name}`}
                className="flex w-full items-center gap-3 text-left"
              >
              {/* Thumbnail — the exercise's own demo when it has one, the
                  generic icon when it doesn't. */}
              {ex.videoUrl ? (
                <AdminVideoPreview
                  url={ex.videoUrl}
                  size="sm"
                  videoWidth={ex.videoWidth}
                  videoHeight={ex.videoHeight}
                  videoFraming={ex.videoFraming}
                  videoTrim={ex.videoTrim}
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30">
                  <Dumbbell className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              )}

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-semibold text-zinc-900 dark:text-white">{ex.name}</p>
                  <CustomExerciseBadge variant="inline" />
                  {ex.isUniversal ? (
                    <Globe2 className="h-3.5 w-3.5 shrink-0 text-green-500" aria-label="Universal — visible to everyone" />
                  ) : ex.reviewStatus === "pending" ? (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Pending admin review" />
                  ) : null}
                </div>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {TRACKING_LABELS[ex.trackingType] || ex.trackingType}
                  {ex.primaryMuscles.length > 0 && (
                    <> · {ex.primaryMuscles.slice(0, 2).map(formatMuscle).join(", ")}</>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {ex.defaultSets && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {ex.defaultSets} {setUnitLabel(ex.trackingType, ex.defaultSets).toLowerCase()}
                    </span>
                  )}
                  {ex.defaultReps && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {ex.defaultReps}
                    </span>
                  )}
                  {/* Same derived tag vocabulary the catalog uses — `custom`
                      itself is dropped because the badge above already says it. */}
                  {(ex.tags ?? [])
                    .filter(t => t !== CUSTOM_TAG)
                    .slice(0, 3)
                    .map(tag => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {tag.replace(/_/g, " ")}
                      </span>
                    ))}
                </div>
              </div>

              <ChevronDown
                className={`h-4 w-4 shrink-0 self-start text-zinc-400 transition-transform ${expandedSlug === ex.slug ? "rotate-180" : ""}`}
              />
              </button>

              {/* Dropdown — edit / delete the exercise, and manage its demo
                  video. Collapsed by default so a library of a dozen
                  exercises doesn't read as a wall of upload buttons. */}
              {expandedSlug === ex.slug && (
                <div className="space-y-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  {editingSlug === ex.slug ? (
                    <div className="space-y-4">
                      <CustomExerciseFields
                        values={editForm}
                        onChange={(next) => setEditForm(p => ({ ...p, ...next }))}
                      />
                      {editForm.error && <p className="text-xs text-red-500 dark:text-red-400">{editForm.error}</p>}
                      <div className="flex gap-3">
                        <button
                          onClick={() => setEditingSlug(null)}
                          className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleUpdate}
                          disabled={editForm.submitting || !editForm.name.trim()}
                          className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
                        >
                          {editForm.submitting ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-3">
                        <button
                          onClick={() => startEdit(ex)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(ex.slug)}
                          disabled={deletingSlug === ex.slug}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
                        >
                          {deletingSlug === ex.slug ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>

                      {/* Your own demo video. Same upload + trim controls the
                          admin form uses, pointed at the owner-scoped endpoints. */}
                      <div>
                        <VideoUploadButton
                          uploadUrl={`/api/exercises/custom/${encodeURIComponent(ex.slug)}/video`}
                          deleteUrl={`/api/exercises/custom/${encodeURIComponent(ex.slug)}/video`}
                          hasVideo={Boolean(ex.videoUrl)}
                          label={ex.videoUrl ? "Replace video" : "Add a video"}
                          onUploaded={({ videoUrl, isUniversal, reviewStatus }) =>
                            patchExercise(ex.slug, {
                              videoUrl,
                              // The upload resets these server-side; mirror it so the
                              // preview doesn't frame the new clip with the old numbers.
                              videoWidth: null,
                              videoHeight: null,
                              videoFraming: null,
                              videoTrim: null,
                              // A replaced video invalidates any prior admin
                              // approval — mirror that reset here too.
                              isUniversal: isUniversal as boolean | undefined,
                              reviewStatus: reviewStatus as ReviewStatus | undefined,
                            })
                          }
                          onRemoved={(result) =>
                            patchExercise(ex.slug, {
                              videoUrl: null,
                              videoWidth: null,
                              videoHeight: null,
                              videoFraming: null,
                              videoTrim: null,
                              isUniversal: result?.isUniversal as boolean | undefined,
                              reviewStatus: result?.reviewStatus as ReviewStatus | undefined,
                            })
                          }
                        />
                        {ex.videoUrl && (
                          <div className="mt-2">
                            <VideoTrimEditor
                              slug={ex.slug}
                              scope="custom"
                              videoUrl={ex.videoUrl}
                              videoWidth={ex.videoWidth}
                              videoHeight={ex.videoHeight}
                              videoFraming={ex.videoFraming}
                              videoTrim={ex.videoTrim}
                              onSaved={next => patchExercise(ex.slug, { videoTrim: next })}
                            />
                          </div>
                        )}
                      </div>

                      {/* Submit to Universal — send this exercise (and its
                          video, if any) to admins so they can publish it into
                          the shared catalog everyone can find and use. */}
                      <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                        {ex.isUniversal ? (
                          <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">
                            <Globe2 className="h-3.5 w-3.5 shrink-0" />
                            Universal — verified and visible to everyone
                          </div>
                        ) : ex.reviewStatus === "pending" ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              Submitted — waiting on admin review
                            </div>
                            <button
                              onClick={() => handleWithdrawUniversal(ex.slug)}
                              disabled={submittingSlug === ex.slug}
                              className="text-xs font-medium text-zinc-500 underline decoration-dotted hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                            >
                              Withdraw submission
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {ex.reviewStatus === "rejected" && (
                              <p className="text-xs text-red-500 dark:text-red-400">
                                Not approved{ex.reviewNote ? `: ${ex.reviewNote}` : "."} Make changes and resubmit whenever you're ready.
                              </p>
                            )}
                            <button
                              onClick={() => handleSubmitUniversal(ex.slug)}
                              disabled={submittingSlug === ex.slug}
                              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-300 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              <Globe2 className="h-3.5 w-3.5" />
                              {submittingSlug === ex.slug
                                ? "Submitting..."
                                : ex.reviewStatus === "rejected" ? "Resubmit to Universal" : "Submit to Universal"}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
          {filteredExercises.length > EXERCISES_PAGE && (
            <button
              onClick={() => setShown(n => (n >= filteredExercises.length ? EXERCISES_PAGE : Math.min(n + EXERCISES_PAGE, filteredExercises.length)))}
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
