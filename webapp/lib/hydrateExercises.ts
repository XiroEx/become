/**
 * Server-side exercise hydration utility.
 *
 * Programs store exercise references as `exerciseSlug`.
 * This module resolves slugs → { name, category, videoUrl, thumbnailUrl }
 * from the exercises collection and injects them into program data
 * before returning to the client.
 *
 * This keeps the client layer unchanged — it still reads `exercise.name`.
 */
import ExerciseModel from '@/models/Exercise';

interface HydratedExerciseFields {
  name: string;
  category: string;
  trackingType?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  primaryMuscles?: string[];
  difficulty?: string;
  videoWidth?: number;
  videoHeight?: number;
  videoFraming?: {
    fit?: 'contain' | 'cover';
    positionX?: number;
    positionY?: number;
    zoom?: number;
  };
  videoTrim?: {
    start?: number;
    end?: number;
  };
}

// Module-level caches (reset per cold start)
let slugCache: Map<string, HydratedExerciseFields> | null = null;
let nameToSlugCache: Map<string, string> | null = null;

/**
 * Build (or return cached) slug → { name, category, videoUrl, thumbnailUrl } map.
 * Also builds a lowercase name/alias → slug reverse map for legacy exercises.
 */
async function getSlugMap(): Promise<Map<string, HydratedExerciseFields>> {
  if (slugCache) return slugCache;

  const exercises = await ExerciseModel.find(
    {},
    { slug: 1, name: 1, aliases: 1, category: 1, trackingType: 1, videoUrl: 1, thumbnailUrl: 1, primaryMuscles: 1, difficulty: 1, videoWidth: 1, videoHeight: 1, videoFraming: 1, videoTrim: 1, _id: 0 }
  ).lean();

  slugCache = new Map();
  nameToSlugCache = new Map();
  for (const ex of exercises) {
    slugCache.set(ex.slug, {
      name: ex.name,
      category: ex.category,
      trackingType: ex.trackingType || undefined,
      videoUrl: ex.videoUrl || undefined,
      thumbnailUrl: ex.thumbnailUrl || undefined,
      primaryMuscles: ex.primaryMuscles?.length ? ex.primaryMuscles : undefined,
      difficulty: ex.difficulty || undefined,
      videoWidth: ex.videoWidth ?? undefined,
      videoHeight: ex.videoHeight ?? undefined,
      videoFraming: ex.videoFraming ?? undefined,
      videoTrim: ex.videoTrim ?? undefined,
    });
    nameToSlugCache.set(ex.name.toLowerCase(), ex.slug);
    for (const alias of ex.aliases || []) {
      nameToSlugCache.set(alias.toLowerCase(), ex.slug);
    }
  }

  return slugCache;
}

/**
 * Invalidate the slug cache (call after seeding / modifying exercises).
 */
export function invalidateExerciseCache() {
  slugCache = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExercise = Record<string, any>;

/**
 * Hydrate a single exercise object: adds `name`, `type`, `videoUrl`, `thumbnailUrl`
 * resolved from the exercises collection via `exerciseSlug`.
 */
function hydrateExercise(
  exercise: AnyExercise,
  map: Map<string, HydratedExerciseFields>
): AnyExercise {
  let slug = exercise.exerciseSlug;

  // Legacy exercises: no slug, only name — resolve slug via reverse lookup
  if (!slug && exercise.name && nameToSlugCache) {
    slug = nameToSlugCache.get(exercise.name.toLowerCase());
    if (slug) {
      exercise = { ...exercise, exerciseSlug: slug };
    }
  }

  if (!slug) return exercise; // truly unknown — keep as-is

  // Per-program admin overrides win over canonical Exercise data so renames
  // and type switches in the program editor persist across reloads.
  const overrideName: string | undefined = exercise.name;
  const overrideCategory: string | undefined = exercise.category;

  const info = map.get(slug);
  if (!info) {
    // Protocol entries (__protocol__*) or unknown slugs — derive name from slug
    const derivedName = slug
      .replace(/^__protocol__/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    return {
      ...exercise,
      name: overrideName || derivedName,
      type: overrideCategory
        || (exercise.exerciseSlug?.startsWith('__protocol__') ? 'conditioning' : 'strength'),
    };
  }

  return {
    ...exercise,
    name: overrideName || info.name,
    type: overrideCategory || info.category, // maps Exercise.category → client-side "type"
    ...(info.trackingType && { trackingType: info.trackingType }),
    ...(info.videoUrl && { videoUrl: info.videoUrl }),
    ...(info.thumbnailUrl && { thumbnailUrl: info.thumbnailUrl }),
    ...(info.primaryMuscles && { primaryMuscles: info.primaryMuscles }),
    ...(info.difficulty && { difficulty: info.difficulty }),
    ...(info.videoWidth != null && { videoWidth: info.videoWidth }),
    ...(info.videoHeight != null && { videoHeight: info.videoHeight }),
    ...(info.videoFraming && { videoFraming: info.videoFraming }),
    ...(info.videoTrim && { videoTrim: info.videoTrim }),
  };
}

/**
 * Hydrate all exercises inside a single program document (mutates a plain object).
 * Works on `.lean()` results.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hydrateProgram<T extends Record<string, any>>(program: T): Promise<T> {
  const map = await getSlugMap();

  if (!program.phases) return program;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const phase of program.phases as any[]) {
    if (!phase.workouts) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const workout of phase.workouts as any[]) {
      if (!workout.exercises) continue;
      workout.exercises = workout.exercises.map((ex: AnyExercise) =>
        hydrateExercise(ex, map)
      );
    }
  }

  return program;
}

/**
 * Hydrate an array of programs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hydratePrograms<T extends Record<string, any>>(programs: T[]): Promise<T[]> {
  const map = await getSlugMap();

  for (const program of programs) {
    if (!program.phases) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const phase of program.phases as any[]) {
      if (!phase.workouts) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const workout of phase.workouts as any[]) {
        if (!workout.exercises) continue;
        workout.exercises = workout.exercises.map((ex: AnyExercise) =>
          hydrateExercise(ex, map)
        );
      }
    }
  }

  return programs;
}

/**
 * Hydrate a single workout object (used by current-workout route).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function hydrateWorkout<T extends Record<string, any>>(workout: T): Promise<T> {
  const map = await getSlugMap();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = workout as any;
  if (w.exercises) {
    w.exercises = (w.exercises as AnyExercise[]).map((ex) =>
      hydrateExercise(ex, map)
    );
  }

  return w as T;
}

/**
 * Convert exercise `name` to `exerciseSlug` for saving.
 * Used in the POST /api/programs handler.
 * Builds a reverse map: lowercase name / alias → slug.
 */
let reverseMap: Map<string, string> | null = null;

async function getReverseMap(): Promise<Map<string, string>> {
  if (reverseMap) return reverseMap;

  const exercises = await ExerciseModel.find({}, { slug: 1, name: 1, aliases: 1, _id: 0 }).lean();

  reverseMap = new Map();
  for (const ex of exercises) {
    reverseMap.set(ex.name.toLowerCase(), ex.slug);
    for (const alias of ex.aliases || []) {
      reverseMap.set(alias.toLowerCase(), ex.slug);
    }
  }

  return reverseMap;
}

/**
 * Given a list of free-text exercise names, returns the lowercased/trimmed
 * subset that matches a real Exercise document by name or alias. Used to flag
 * "new" exercises in an imported program before the user saves it.
 */
export async function matchExerciseNames(names: string[]): Promise<Set<string>> {
  const map = await getReverseMap()
  const known = new Set<string>()
  for (const raw of names) {
    const name = raw.trim().toLowerCase()
    if (name && map.has(name)) known.add(name)
  }
  return known
}

/**
 * Slugify a string (fallback for exercises not found in the DB).
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Convert a program's exercises from `{ name, type }` to `{ exerciseSlug }` for DB storage.
 * Called before saving a new program via POST.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dehydrateProgram(program: Record<string, any>): Promise<Record<string, any>> {
  const map = await getReverseMap();

  if (!program.phases) return program;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const phase of program.phases as any[]) {
    if (!phase.workouts) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const workout of phase.workouts as any[]) {
      if (!workout.exercises) continue;
      workout.exercises = workout.exercises.map((ex: AnyExercise) => {
        // Determine the slug: prefer the existing one, then a name match in the
        // canonical DB, then a slugified version of the name.
        const name: string = ex.name || '';
        const slug: string =
          ex.exerciseSlug
          || map.get(name.toLowerCase())
          || slugify(name);

        // Build clean exercise entry. Always persist `name` and `category` so
        // admin renames + type switches survive across hydrate cycles. The
        // form's editable field is `type`; the legacy/storage field is
        // `category`. Prefer `type` because that's what the editor actually
        // mutates — `category` is leftover from the previous hydrate spread.
        const result: AnyExercise = { exerciseSlug: slug };
        if (name) result.name = name;
        const category = ex.type ?? ex.category;
        if (category) result.category = category;
        if (ex.sets != null) result.sets = ex.sets;
        if (ex.reps != null) result.reps = ex.reps;
        if (ex.rest != null) result.rest = ex.rest;
        if (ex.details != null) result.details = ex.details;
        if (ex.tempo != null) result.tempo = ex.tempo;
        if (ex.rpe != null) result.rpe = ex.rpe;
        if (ex.percentOf1RM != null) result.percentOf1RM = ex.percentOf1RM;
        if (ex.duration != null) result.duration = ex.duration;
        if (ex.role != null) result.role = ex.role;
        if (ex.groupId != null) result.groupId = ex.groupId;
        if (ex.groupType != null) result.groupType = ex.groupType;
        if (ex.groupLabel != null) result.groupLabel = ex.groupLabel;
        if (ex.groupRest != null) result.groupRest = ex.groupRest;
        if (ex.groupRounds != null) result.groupRounds = ex.groupRounds;

        return result;
      });
    }
  }

  return program;
}
