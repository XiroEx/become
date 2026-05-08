// ---------------------------------------------------------------------------
// foodMergeRefs — redirect dangling Food references when a source Food gets
// merged into / replaced by a target Food. Used by both the admin merge route
// and the merge-existing-variants backfill so user-owned saved foods + log
// entries follow the merge instead of being orphaned.
//
// We touch THREE collections:
//   - User.savedFoods[].foodId           (saved-foods bookmark list — DEDUPED)
//   - MealLog.items[].foodId             (historical eating events — NOT deduped)
//   - Meal.items[].foodId                (recipe-template items — NOT deduped)
//
// Why no dedup for MealLog/Meal: each log/template item is a distinct event
// or recipe slot. Two entries pointing at the same Food are valid (someone
// genuinely ate two helpings; a recipe legitimately calls for two units of
// the same ingredient). Saved-foods, by contrast, is a set — duplicate IDs
// would render as duplicate rows in "My Foods".
// ---------------------------------------------------------------------------

import mongoose from 'mongoose'
import User from '@/models/User'
import MealLog from '@/models/MealLog'
import Meal from '@/models/Meal'

export interface RedirectFoodRefsResult {
  usersUpdated: number
  mealLogsUpdated: number
  mealsUpdated: number
}

/**
 * Redirect every reference to `sourceId` to `targetId` across user-owned
 * collections. Idempotent — re-running with the same ids becomes a no-op the
 * second time around because nothing references `sourceId` anymore.
 */
export async function redirectFoodRefs(
  sourceId: mongoose.Types.ObjectId,
  targetId: mongoose.Types.ObjectId,
): Promise<RedirectFoodRefsResult> {
  if (sourceId.equals(targetId)) {
    return { usersUpdated: 0, mealLogsUpdated: 0, mealsUpdated: 0 }
  }

  // ---- User.savedFoods — redirect AND dedupe ----
  // Saved foods is set-shaped (one row per unique foodId). After redirect a
  // user that had BOTH the source and target saved would end up with two
  // identical rows, so we walk each affected user and rebuild the array.
  let usersUpdated = 0
  const affectedUsers = await User.find({ 'savedFoods.foodId': sourceId })
    .select('_id savedFoods')
  for (const u of affectedUsers) {
    const seen = new Set<string>()
    type SavedEntry = { foodId: mongoose.Types.ObjectId; savedAt: Date }
    const next: SavedEntry[] = []
    for (const sf of u.savedFoods ?? []) {
      const isSource = sf.foodId.equals(sourceId)
      const newId = isSource ? targetId : sf.foodId
      const key = newId.toString()
      if (seen.has(key)) continue
      seen.add(key)
      next.push({
        foodId: newId,
        savedAt: sf.savedAt instanceof Date ? sf.savedAt : new Date(sf.savedAt),
      })
    }
    u.savedFoods = next
    await u.save()
    usersUpdated++
  }

  // ---- MealLog.items — redirect, no dedupe ----
  const mealLogResult = await MealLog.updateMany(
    { 'items.foodId': sourceId },
    { $set: { 'items.$[elem].foodId': targetId } },
    { arrayFilters: [{ 'elem.foodId': sourceId }] },
  )

  // ---- Meal.items — redirect, no dedupe ----
  const mealResult = await Meal.updateMany(
    { 'items.foodId': sourceId },
    { $set: { 'items.$[elem].foodId': targetId } },
    { arrayFilters: [{ 'elem.foodId': sourceId }] },
  )

  return {
    usersUpdated,
    mealLogsUpdated: mealLogResult.modifiedCount ?? 0,
    mealsUpdated: mealResult.modifiedCount ?? 0,
  }
}
