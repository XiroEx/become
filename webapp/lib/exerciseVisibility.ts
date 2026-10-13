// Shared "which exercises can this user see" filter for catalog-style reads
// (search, alternatives/swap, the general browse list). A custom exercise is
// owner-private until an admin approves its "Submit to Universal" request
// (Exercise.isUniversal) — before that, only its own creator can find it.
// Admin-catalog exercises (isCustom falsy) are always visible.
//
// Ownership-scoped mutation routes (PATCH/DELETE on /api/exercises/custom/*)
// do NOT use this — they filter on `{ isCustom: true, createdBy }` directly,
// which is intentionally narrower than "visible".

export function visibleExerciseFilter(userId?: string | null): Record<string, unknown> {
  const or: Record<string, unknown>[] = [{ isCustom: { $ne: true } }];
  if (userId) or.push({ isCustom: true, createdBy: userId });
  or.push({ isCustom: true, isUniversal: true });
  return { $or: or };
}

// ---------------------------------------------------------------------------
// What an ADMIN may write to through /api/exercises/[slug]
// ---------------------------------------------------------------------------
//
// The admin write routes used to match `{ slug, isCustom: { $ne: true } }` and
// answer "Exercise not found" for everything else. That guard exists because
// the admin endpoint takes a whole exercise body, and a member's PRIVATE custom
// exercise is owner-managed through /api/exercises/custom — it must not be
// writable from anywhere else.
//
// But approval does NOT clear `isCustom`: an approved submission is still
// `{ isCustom: true, createdBy: <member> }`, now with `isUniversal: true`. So a
// member's exercise that an admin published into the shared library fell
// through every write path — the admin route 404'd on the isCustom guard, and
// /api/exercises/custom/[slug] only admits the creator. An admin could open it
// and never save it ("Exercise not found" on every save).
//
// The scope here is therefore widened by exactly one case and no more: a custom
// exercise that the member SUBMITTED and an admin APPROVED is part of the
// shared library, so the people who curate the shared library can curate it.
// A private (never-submitted, pending or rejected) custom exercise is still
// nobody's but its owner's, admin or not.
//
// Ownership is not part of this: the matching row is updated in place with an
// allow-listed `$set`, which never contains `createdBy`, `isCustom` or
// `isUniversal`, so an admin save leaves the exercise belonging to the member
// who made it.

export interface ExerciseOwnershipState {
  isCustom?: boolean | null;
  isUniversal?: boolean | null;
  reviewStatus?: string | null;
}

/**
 * A member's custom exercise that lives in the SHARED library: approved, and
 * therefore visible to (and usable by) everyone.
 */
export function isSharedSubmission(exercise: ExerciseOwnershipState | null | undefined): boolean {
  if (!exercise || exercise.isCustom !== true) return false;
  return exercise.isUniversal === true || exercise.reviewStatus === 'approved';
}

/** Catalog row, or a shared submission — never someone's private custom one. */
export function isAdminWritableExercise(
  exercise: ExerciseOwnershipState | null | undefined
): boolean {
  if (!exercise) return false;
  return exercise.isCustom !== true || isSharedSubmission(exercise);
}

/** The Mongo form of {@link isAdminWritableExercise}, scoped to one slug. */
export function adminWritableExerciseFilter(slug: string): Record<string, unknown> {
  return {
    slug,
    $or: [
      { isCustom: { $ne: true } },
      { isCustom: true, isUniversal: true },
      { isCustom: true, reviewStatus: 'approved' },
    ],
  };
}
