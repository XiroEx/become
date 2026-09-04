// Shared "does this exercise look wrong" heuristics used by:
//  - the admin Exercises page's Duplicates / No Video / Broken filter tab
//    (app/dashboard/admin/exercises/page.tsx, app/api/exercises/route.ts)
//  - auto-flagging a newly created custom exercise into the review queue when
//    it looks like a duplicate of something already in the shared catalog
//    (app/api/exercises/custom/route.ts)
//
// These are heuristics an admin still has to confirm, not ground truth — the
// point is surfacing candidates a human would otherwise have to stumble on
// by hand (see the "Leg Extension" / "Leg extensions" duplicate this was
// built for).

export interface AuditableExercise {
  slug: string;
  name: string;
  videoUrl?: string | null;
  instructions?: string[];
  primaryMuscles?: string[];
}

/**
 * Collapse a name to a comparable key: lowercase, punctuation collapsed to
 * spaces, trimmed, trailing "s" stripped. Enough to catch "Leg Extension" vs
 * "Leg extensions" without pulling in a full stemming library — this is a
 * heuristic, not a linguistic dedupe.
 */
export function normalizeExerciseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/s$/, '');
}

export function isMissingVideo(ex: Pick<AuditableExercise, 'videoUrl'>): boolean {
  return !ex.videoUrl;
}

/**
 * No instructions AND no primary muscles — an essentially empty shell rather
 * than a usable exercise definition.
 */
export function isBrokenExercise(ex: Pick<AuditableExercise, 'instructions' | 'primaryMuscles'>): boolean {
  return (!ex.instructions || ex.instructions.length === 0)
    && (!ex.primaryMuscles || ex.primaryMuscles.length === 0);
}

/**
 * Groups exercises whose normalized name collides with another's. Only
 * groups with 2+ members are kept — a name with no collision isn't a
 * duplicate.
 */
export function findDuplicateGroups<T extends Pick<AuditableExercise, 'slug' | 'name'>>(
  exercises: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const ex of exercises) {
    const key = normalizeExerciseName(ex.name);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(ex);
    else groups.set(key, [ex]);
  }
  for (const key of [...groups.keys()]) {
    if ((groups.get(key)?.length ?? 0) < 2) groups.delete(key);
  }
  return groups;
}

/** Slugs of every exercise that shares a normalized name with another. */
export function findDuplicateSlugs<T extends Pick<AuditableExercise, 'slug' | 'name'>>(
  exercises: T[]
): Set<string> {
  const slugs = new Set<string>();
  for (const group of findDuplicateGroups(exercises).values()) {
    for (const ex of group) slugs.add(ex.slug);
  }
  return slugs;
}

/**
 * Finds an existing exercise (other than `candidateSlug`, if given) whose
 * name collides with `name` once normalized. Used to auto-flag a newly
 * created custom exercise as a possible duplicate of the shared catalog.
 */
export function findDuplicateOf<T extends Pick<AuditableExercise, 'slug' | 'name'>>(
  name: string,
  existing: T[],
  candidateSlug?: string
): T | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  return existing.find((ex) => ex.slug !== candidateSlug && normalizeExerciseName(ex.name) === key) ?? null;
}

/** Escapes regex metacharacters so user-typed search text can safely be used
 *  inside a Mongo `$regex` without throwing on unbalanced brackets/parens. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
