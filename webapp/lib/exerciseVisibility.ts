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
