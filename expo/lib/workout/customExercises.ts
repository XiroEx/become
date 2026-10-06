/**
 * ─── MY EXERCISES, ON THE PHONE (NP-169) ────────────────────────────────────
 *
 * Native counterpart of `webapp/app/dashboard/workout/library/ExerciseLibraryClient.tsx`.
 * Members build their own exercises on the web (3 on the free tier); natively
 * they list, create, edit, delete and submit them for review. Demo upload and
 * trim stay web-only (the gap-analysis records the decision), so a row with a
 * demo links out to the library instead of re-recording it here.
 *
 * FOUR RULES TRAVEL WITH EVERY READER OF THIS MODULE:
 *
 *   • read `canCreate`, never `allowed` and never `limit - used`. `allowed` is
 *     true for a capped free member on purpose so they can still edit and
 *     DELETE what they own; the kill-switch and the admin bypass live inside
 *     the server's `canCreate` calculation.
 *   • `enforced === false` (or an unknown snapshot) means NO lock, NO counter
 *     and NO sheet — `useEntitlements().canCreate()` already answers true
 *     there, so the create control stays a create control.
 *   • deleting frees the allowance AT ONCE. The caller refreshes the shared
 *     entitlements snapshot after a delete (NP-049's `refresh()`), or the 60s
 *     TTL keeps the create control locked at a cap the member just cleared —
 *     and deleting is the only way back under an inventory limit.
 *   • choosing the Bodyweight category switches tracking to reps-only (Jon's
 *     bug 6ab18beb, fixed on the web first). The native form starts from the
 *     corrected rule, so the two clients cannot disagree about what a
 *     bodyweight exercise tracks.
 */

import type { CustomExercise } from "@become/api-client";

/** The web paths create/edit/demo open, signed in, through `openWebSignedIn`. */
export const CUSTOM_EXERCISE_LIBRARY_PATH = "/dashboard/workout/hub?tab=exercises";

/** Delete path for one owned custom exercise (`?slug=` — the route's shape). */
export function customExerciseDeletePath(slug: string): string {
  return `/api/exercises/custom?slug=${encodeURIComponent(slug)}`;
}

/** Edit path for one owned custom exercise. */
export function customExerciseEditPath(slug: string): string {
  return `/api/exercises/custom/${encodeURIComponent(slug)}`;
}

/** Submit-for-review path for one owned custom exercise. */
export function customExerciseSubmitPath(slug: string): string {
  return `/api/exercises/custom/${encodeURIComponent(slug)}/submit`;
}

// ─── The form ────────────────────────────────────────────────────────────────

export const CUSTOM_EXERCISE_TRACKING_TYPES = [
  "reps_weight",
  "reps_bodyweight",
  "reps_only",
  "time",
  "time_distance",
  "intervals",
  "none",
] as const;

export type CustomExerciseTrackingType =
  (typeof CUSTOM_EXERCISE_TRACKING_TYPES)[number];

export const CUSTOM_EXERCISE_MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "legs",
  "full_body",
] as const;

export const CUSTOM_EXERCISE_CATEGORIES = [
  "strength",
  "cardio",
  "bodyweight",
  "conditioning",
] as const;

export const CUSTOM_EXERCISE_ROLES = [
  "compound",
  "secondary",
  "accessory",
] as const;

export interface CustomExerciseFormValues {
  name: string;
  trackingType: string;
  muscleGroup: string;
  category: string;
  role: string;
  defaultSets: string;
  defaultReps: string;
}

export const DEFAULT_CUSTOM_EXERCISE_FORM: CustomExerciseFormValues = {
  name: "",
  trackingType: "reps_weight",
  muscleGroup: "chest",
  category: "strength",
  role: "accessory",
  defaultSets: "3",
  defaultReps: "8-12",
};

export const CUSTOM_EXERCISE_TRACKING_LABELS: Record<string, string> = {
  reps_weight: "Sets × Reps + Weight",
  reps_bodyweight: "Sets × Reps (bodyweight)",
  reps_only: "Reps Only",
  time: "Time / Duration",
  time_distance: "Time + Distance",
  intervals: "Intervals",
  none: "No Tracking",
};

/** Web's `CUSTOM_EXERCISE_TRACKING_TYPE_OPTIONS` hints (NP-276) — a worked
 *  example per tracking type, so "Time / Duration" doesn't read the same as
 *  "Sets × Reps (bodyweight)" with nothing to tell them apart. */
export const CUSTOM_EXERCISE_TRACKING_HINTS: Record<string, string> = {
  reps_weight: "e.g. Bench Press",
  reps_bodyweight: "e.g. Push-Ups",
  reps_only: "e.g. Jumps",
  time: "e.g. Plank",
  time_distance: "e.g. Run, Row",
  intervals: "e.g. HIIT, EMOM",
  none: "e.g. Rest, Cool-down",
};

/** Web's `CUSTOM_EXERCISE_ROLE_OPTIONS` hints (NP-276) — mirrors
 *  `Exercise.role`: compound drives the session, secondary reinforces the
 *  same pattern, accessory is isolation/detail work. */
export const CUSTOM_EXERCISE_ROLE_HINTS: Record<string, string> = {
  compound: "Main lift",
  secondary: "Supporting compound",
  accessory: "Isolation / detail",
};

export const CUSTOM_EXERCISE_MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
  legs: "Legs",
  full_body: "Full Body",
};

export const CUSTOM_EXERCISE_CATEGORY_LABELS: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
  bodyweight: "Bodyweight",
  conditioning: "Conditioning",
};

export const CUSTOM_EXERCISE_ROLE_LABELS: Record<string, string> = {
  compound: "Compound",
  secondary: "Secondary",
  accessory: "Accessory",
};

/**
 * The corrected rule (web bug 6ab18beb): choosing the Bodyweight category
 * switches tracking to reps-only. Applied at the moment the category is
 * picked — not at submit — so the picker the member sees always agrees with
 * what the server will store.
 */
export function applyCategoryChange(
  values: CustomExerciseFormValues,
  category: string,
): CustomExerciseFormValues {
  if (category === "bodyweight") {
    return { ...values, category, trackingType: "reps_only" };
  }
  return { ...values, category };
}

/** The POST/PATCH body — the same field set the web form sends. */
export function toCustomExerciseWriteBody(values: CustomExerciseFormValues): {
  name: string;
  trackingType: string;
  muscleGroup: string;
  category: string;
  role: string;
  defaultSets: string;
  defaultReps: string;
} {
  return {
    name: values.name.trim(),
    trackingType: values.trackingType,
    muscleGroup: values.muscleGroup,
    category: values.category,
    role: values.role,
    defaultSets: values.defaultSets,
    defaultReps: values.defaultReps,
  };
}

// ─── The list ────────────────────────────────────────────────────────────────

/**
 * One row of `GET /api/exercises/custom`, as the My exercises screen renders
 * it. The stored document only carries the resolved classification — the
 * form's own vocabulary (muscle group, category) is inferred back when a row
 * opens for edit, the way the web's `startEdit` does.
 */
export interface CustomExerciseSummary {
  slug: string;
  name: string;
  trackingType: string;
  primaryMuscles: string[];
  bodyRegion: string;
  category: string;
  role: string;
  defaultSets?: number;
  defaultReps?: string;
  videoUrl?: string | null;
  isUniversal?: boolean;
  reviewStatus?: string;
  submittedAt?: string | null;
  reviewNote?: string | null;
  /** Derived catalogue tags (NP-276) — the chip row under the row's subtitle
   *  (`strength`, `push`, `upper body`, …). Always carries `custom` first;
   *  that one is filtered out at render time since the `Yours` badge already
   *  says it. */
  tags?: string[];
  /** When this row was made — the list's "Recent" sort reads this. */
  createdAt?: string | null;
}

export function toCustomExerciseSummary(raw: CustomExercise): CustomExerciseSummary {
  return {
    slug: raw.slug,
    name: raw.name || "Untitled Exercise",
    trackingType: raw.trackingType ?? "reps_weight",
    primaryMuscles: raw.primaryMuscles ?? [],
    bodyRegion: raw.bodyRegion ?? "full_body",
    category: raw.category ?? "strength",
    role: raw.role ?? "accessory",
    ...(typeof raw.defaultSets === "number" ? { defaultSets: raw.defaultSets } : {}),
    ...(typeof raw.defaultReps === "string" ? { defaultReps: raw.defaultReps } : {}),
    ...(raw.videoUrl !== undefined ? { videoUrl: raw.videoUrl } : {}),
    ...(raw.isUniversal !== undefined ? { isUniversal: raw.isUniversal } : {}),
    ...(raw.reviewStatus !== undefined ? { reviewStatus: raw.reviewStatus } : {}),
    ...(raw.submittedAt !== undefined ? { submittedAt: raw.submittedAt } : {}),
    ...(raw.reviewNote !== undefined ? { reviewNote: raw.reviewNote } : {}),
    ...(raw.tags !== undefined ? { tags: raw.tags } : {}),
    ...(raw.createdAt !== undefined ? { createdAt: raw.createdAt } : {}),
  };
}

/** The tag the server always puts first on a custom exercise's own tags — the
 *  `Yours` badge already says it, so the chip row drops it (web's `CUSTOM_TAG`,
 *  `webapp/lib/customExerciseTags.ts`). */
export const CUSTOM_EXERCISE_OWN_TAG = "custom";

/** The chip row's own tags — derived tags with the `custom` marker dropped,
 *  capped at three the way the web caps `filteredExercises` tags. */
export function customExerciseChipTags(ex: CustomExerciseSummary): string[] {
  return (ex.tags ?? []).filter((t) => t !== CUSTOM_EXERCISE_OWN_TAG).slice(0, 3);
}

export function formatCustomTag(tag: string): string {
  return tag.replace(/_/g, " ");
}

/** Prefill the edit form from a saved row, the way the web's `startEdit` does. */
export function toCustomExerciseForm(ex: CustomExerciseSummary): CustomExerciseFormValues {
  return {
    name: ex.name,
    trackingType: ex.trackingType,
    muscleGroup: inferMuscleGroup(ex.primaryMuscles),
    category: inferCategory(ex.category),
    role: ex.role ?? "accessory",
    defaultSets: typeof ex.defaultSets === "number" ? String(ex.defaultSets) : "3",
    defaultReps: ex.defaultReps ?? "8-12",
  };
}

const MUSCLE_GROUP_MUSCLES: Record<string, string[]> = {
  chest: ["chest"],
  back: ["lats", "upper_back"],
  shoulders: ["front_delts", "side_delts"],
  arms: ["biceps", "triceps"],
  core: ["abs", "obliques"],
  legs: ["quads", "hamstrings", "glutes"],
  full_body: ["full_body"],
};

/** The create/edit form's broad muscle-group vocabulary, inferred back from
 *  the stored `primaryMuscles` — shared by the edit-form prefill AND the
 *  list's body-part filter chips (NP-276), so both read the same bucket. */
export function inferMuscleGroup(primaryMuscles: readonly string[]): string {
  const stored = new Set(primaryMuscles);
  for (const [group, muscles] of Object.entries(MUSCLE_GROUP_MUSCLES)) {
    if (muscles.length === stored.size && muscles.every((m) => stored.has(m))) {
      return group;
    }
  }
  return "chest";
}

const CATEGORY_RESOLVED: Record<string, string> = {
  strength: "strength",
  power: "power",
  cardio: "cardio",
  calisthenics: "bodyweight",
  plyometric: "plyometric",
  olympic: "olympic",
  strongman: "strongman",
  flexibility: "flexibility",
  mobility: "mobility",
  warmup: "warmup",
  cooldown: "cooldown",
  conditioning: "conditioning",
  protocol: "protocol",
};

function inferCategory(category: unknown): string {
  const match = Object.entries(CATEGORY_RESOLVED).find(([, resolved]) => resolved === category);
  if (!match) return "strength";
  // The form's own vocabulary only offers four; anything finer stays visible
  // through the stored value but opens on the closest offered chip.
  return (CUSTOM_EXERCISE_CATEGORIES as readonly string[]).includes(match[0])
    ? match[0]
    : "strength";
}

/** May this member edit/delete this row? Only what they own — and every row
 *  listed here is theirs (the route only lists `createdBy: me`). */
export function canEditCustomExercise(_ex: CustomExerciseSummary): boolean {
  return true;
}

export function formatCustomMuscle(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── List: search, sort, filters (NP-276) ───────────────────────────────────
//
// Native counterpart of the web's `SORT_OPTIONS` / `BODY_PART_FILTER_OPTIONS`
// / `ROLE_FILTER_OPTIONS` and the `filteredExercises` pipeline in
// `ExerciseLibraryClient.tsx`. Kept as plain data + one pure function so the
// list component stays about rendering, and the ordering rules (sort mode,
// then every active filter) are pinned once, here, rather than copied into
// JSX.

export type CustomExerciseSortMode = "recent" | "alphabetical";

export const CUSTOM_EXERCISE_SORT_OPTIONS: {
  value: CustomExerciseSortMode;
  label: string;
}[] = [
  { value: "recent", label: "Recent" },
  { value: "alphabetical", label: "A–Z" },
];

export const CUSTOM_EXERCISE_BODY_PART_FILTERS: { value: string; label: string }[] =
  CUSTOM_EXERCISE_MUSCLE_GROUPS.map((value) => ({
    value,
    label: CUSTOM_EXERCISE_MUSCLE_GROUP_LABELS[value] ?? value,
  }));

export const CUSTOM_EXERCISE_ROLE_FILTERS: { value: string; label: string }[] =
  CUSTOM_EXERCISE_ROLES.map((value) => ({
    value,
    label: CUSTOM_EXERCISE_ROLE_LABELS[value] ?? value,
  }));

export interface CustomExerciseListFilters {
  search?: string;
  sortMode?: CustomExerciseSortMode;
  bodyPartFilter?: string | null;
  roleFilter?: string | null;
}

/** Name, tag, muscle and category — the same loose match the web's search
 *  bar uses (`matchesExerciseQuery` plus a category fallback), simplified to
 *  what a custom exercise summary actually carries. */
function matchesCustomExerciseSearch(ex: CustomExerciseSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (ex.name.toLowerCase().includes(q)) return true;
  if (ex.category.toLowerCase().includes(q)) return true;
  if (ex.primaryMuscles.some((m) => m.toLowerCase().includes(q))) return true;
  if ((ex.tags ?? []).some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

/** Filter + sort the list the way the web's `filteredExercises` does: search,
 *  then body-part, then role, then the chosen sort. */
export function filterAndSortCustomExercises(
  exercises: readonly CustomExerciseSummary[],
  filters: CustomExerciseListFilters,
): CustomExerciseSummary[] {
  const { search = "", sortMode = "recent", bodyPartFilter = null, roleFilter = null } = filters;
  return exercises
    .filter((ex) => matchesCustomExerciseSearch(ex, search))
    .filter((ex) => !bodyPartFilter || inferMuscleGroup(ex.primaryMuscles) === bodyPartFilter)
    .filter((ex) => !roleFilter || (ex.role ?? "accessory") === roleFilter)
    .slice()
    .sort((a, b) => {
      if (sortMode === "alphabetical") return a.name.localeCompare(b.name);
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
}
