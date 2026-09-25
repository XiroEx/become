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
import { buildExerciseNameIndex, resolveExerciseSlug, type ExerciseNameIndex } from '@/lib/exerciseNameMatch';
import { autoCatalogSlug, ensureCatalogExercise, exerciseNameFromSlug } from '@/lib/exerciseAutoCatalog';
import { repairFor } from '@/lib/programExerciseRepairs';

interface HydratedExerciseFields {
  name: string;
  category: string;
  trackingType?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  primaryMuscles?: string[];
  difficulty?: string;
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
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

// Module-level caches (reset per cold start). The two are built together and
// cleared together: a name index that outlives its slug map is how a freshly
// created exercise stays invisible to the request that created it.
let slugCache: Map<string, HydratedExerciseFields> | null = null;
let nameIndexCache: ExerciseNameIndex | null = null;

interface Catalog {
  slugs: Map<string, HydratedExerciseFields>;
  names: ExerciseNameIndex;
}

/**
 * Build (or return cached) the slug → { name, category, videoUrl, … } map and
 * the name/alias → slug index (lib/exerciseNameMatch.ts) that resolves the
 * shorthand a coach actually writes.
 */
async function loadCatalog(): Promise<Catalog> {
  if (slugCache && nameIndexCache) return { slugs: slugCache, names: nameIndexCache };

  // Sorted so the index is built in a fixed order — two exercises sharing a
  // name must resolve to the same one on every cold start, not whichever the
  // cursor happened to hand over first.
  const exercises = await ExerciseModel.find(
    {},
    { slug: 1, name: 1, aliases: 1, category: 1, trackingType: 1, videoUrl: 1, thumbnailUrl: 1, primaryMuscles: 1, difficulty: 1, equipment: 1, laterality: 1, movementPatterns: 1, videoWidth: 1, videoHeight: 1, videoFraming: 1, videoTrim: 1, isCustom: 1, isUniversal: 1, _id: 0 }
  ).sort({ slug: 1 }).lean();

  slugCache = new Map();
  for (const ex of exercises) {
    slugCache.set(ex.slug, {
      name: ex.name,
      category: ex.category,
      trackingType: ex.trackingType || undefined,
      videoUrl: ex.videoUrl || undefined,
      thumbnailUrl: ex.thumbnailUrl || undefined,
      primaryMuscles: ex.primaryMuscles?.length ? ex.primaryMuscles : undefined,
      difficulty: ex.difficulty || undefined,
      equipment: ex.equipment?.length ? ex.equipment : undefined,
      laterality: ex.laterality || undefined,
      movementPatterns: ex.movementPatterns?.length ? ex.movementPatterns : undefined,
      videoWidth: ex.videoWidth ?? undefined,
      videoHeight: ex.videoHeight ?? undefined,
      videoFraming: ex.videoFraming ?? undefined,
      videoTrim: ex.videoTrim ?? undefined,
    });
  }

  nameIndexCache = buildExerciseNameIndex(exercises);

  return { slugs: slugCache, names: nameIndexCache };
}

async function getSlugMap(): Promise<Map<string, HydratedExerciseFields>> {
  return (await loadCatalog()).slugs;
}

/**
 * Invalidate the catalog caches (call after seeding / modifying exercises).
 */
export function invalidateExerciseCache() {
  slugCache = null;
  nameIndexCache = null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExercise = Record<string, any>;

/**
 * Hydrate a single exercise object: adds `name`, `type`, `videoUrl`, `thumbnailUrl`
 * resolved from the exercises collection via `exerciseSlug`.
 */
function hydrateExercise(
  exercise: AnyExercise,
  map: Map<string, HydratedExerciseFields>,
  names: ExerciseNameIndex
): AnyExercise {
  let slug = exercise.exerciseSlug;

  // Legacy exercises: no slug, only name — resolve slug via reverse lookup
  if (!slug && exercise.name) {
    const resolved = resolveExerciseSlug(exercise.name, names);
    if (resolved) {
      slug = resolved;
      exercise = { ...exercise, exerciseSlug: slug };
    }
  }

  if (!slug) return exercise; // truly unknown — keep as-is

  // Per-program admin overrides win over canonical Exercise data so renames
  // and type switches in the program editor persist across reloads.
  const overrideName: string | undefined = exercise.name;
  const overrideCategory: string | undefined = exercise.category;

  let info = map.get(slug);

  // A slug no exercise owns — a program saved before lib/exerciseAutoCatalog
  // existed minted one per unrecognised name. Rather than an empty card, find
  // the exercise it names and show that row's video and classification.
  // scripts/repair-program-exercises.ts rewrites the stored slug for good;
  // these three fallbacks are what keep the app honest in the meantime, and
  // for any row an admin later deletes out from under a program.
  //
  // First the reviewed decision, where one was written down for this slug
  // (lib/programExerciseRepairs.ts): a human's read of the program the
  // reference came from — "an unqualified Squat on a gym day is the back
  // squat" — which should not be overruled by a resolver guessing from the
  // same string.
  if (!info) {
    const relinkTo = repairFor(slug)?.relinkTo;
    if (relinkTo) info = map.get(relinkTo);
  }

  // Then the entry's own name, which is the coach's wording for it.
  if (!info && exercise.name) {
    const resolved = resolveExerciseSlug(exercise.name, names);
    if (resolved) info = map.get(resolved);
  }

  // And last, for the entries that have no name to try: the slug IS the
  // name, with the spaces taken out. Card: "Leg curl machine is not in
  // our data base please fix so I can upload the video" — the program entry
  // behind that card is `{ exerciseSlug: 'leg-curl-machine' }` with no name,
  // so the resolution above had nothing to work with and the card rendered
  // straight off the slug text: no video, no muscles, and nothing in the
  // admin portal called that. Read the slug back into "Leg Curl Machine" and
  // it resolves to Seated Leg Curl, which carries that exact alias — so the
  // video the coach uploads there is the video the member sees here.
  //
  // Protocol slugs are excluded: `__protocol__amrap-10` is a routing marker,
  // not an exercise name, and has no catalog row by design.
  if (!info && !slug.startsWith('__protocol__')) {
    const resolved = resolveExerciseSlug(exerciseNameFromSlug(slug), names);
    if (resolved) info = map.get(resolved);
  }

  if (!info) {
    // Protocol entries (__protocol__*) or unknown slugs — derive name from slug
    const derivedName = exerciseNameFromSlug(slug);

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
    ...(info.equipment && { equipment: info.equipment }),
    ...(info.laterality && { laterality: info.laterality }),
    ...(info.movementPatterns && { movementPatterns: info.movementPatterns }),
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
  const { slugs: map, names } = await loadCatalog();

  if (!program.phases) return program;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const phase of program.phases as any[]) {
    if (!phase.workouts) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const workout of phase.workouts as any[]) {
      if (!workout.exercises) continue;
      workout.exercises = workout.exercises.map((ex: AnyExercise) =>
        hydrateExercise(ex, map, names)
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
  const { slugs: map, names } = await loadCatalog();

  for (const program of programs) {
    if (!program.phases) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const phase of program.phases as any[]) {
      if (!phase.workouts) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const workout of phase.workouts as any[]) {
        if (!workout.exercises) continue;
        workout.exercises = workout.exercises.map((ex: AnyExercise) =>
          hydrateExercise(ex, map, names)
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
  const { slugs: map, names } = await loadCatalog();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = workout as any;
  if (w.exercises) {
    w.exercises = (w.exercises as AnyExercise[]).map((ex) =>
      hydrateExercise(ex, map, names)
    );
  }

  return w as T;
}

/**
 * Given a list of free-text exercise names, returns the lowercased/trimmed
 * subset that matches a real Exercise document. Used to flag "new" exercises
 * in an imported program before the user saves it — so it has to agree with
 * dehydrateProgram below about what counts as known, or the review step
 * promises a new exercise and the save resolves it to an existing one.
 */
export async function matchExerciseNames(rawNames: string[]): Promise<Set<string>> {
  const { names } = await loadCatalog()
  const known = new Set<string>()
  for (const raw of rawNames) {
    const name = raw.trim().toLowerCase()
    if (name && resolveExerciseSlug(raw, names)) known.add(name)
  }
  return known
}

/**
 * Convert a program's exercises from `{ name, type }` to `{ exerciseSlug }` for DB storage.
 * Called before saving a program via POST/PUT.
 *
 * An exercise name that resolves to nothing used to be slugified and stored
 * anyway, which left the program pointing at a document that was never
 * created — no video, no admin row, no report. It is now MINTED instead
 * (lib/exerciseAutoCatalog.ts), so "every exercise a program names exists in
 * the catalog" holds from the save onwards rather than being something a
 * script has to keep re-establishing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dehydrateProgram(program: Record<string, any>): Promise<Record<string, any>> {
  const { names } = await loadCatalog();
  let minted = false;

  if (!program.phases) return program;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const phase of program.phases as any[]) {
    if (!phase.workouts) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const workout of phase.workouts as any[]) {
      if (!workout.exercises) continue;
      const dehydrated: AnyExercise[] = [];
      for (const ex of workout.exercises as AnyExercise[]) {
        // Determine the slug: prefer the existing one, then a catalog match on
        // the name ("DB Hammer Curl" is the catalog's "Hammer Curl"), and only
        // then a new slug — which comes with a new catalog row to match.
        const name: string = ex.name || '';
        let slug: string = ex.exerciseSlug || resolveExerciseSlug(name, names) || '';
        if (!slug && name) {
          slug = autoCatalogSlug(name);
          if (slug) {
            await ensureCatalogExercise(name, slug);
            minted = true;
          }
        }

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

        dehydrated.push(result);
      }
      workout.exercises = dehydrated;
    }
  }

  // The rows just minted have to be visible to the hydrate that follows this
  // save in the same request, or the response comes back with the empty cards
  // this whole path exists to stop.
  if (minted) invalidateExerciseCache();

  return program;
}
