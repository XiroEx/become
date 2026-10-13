/**
 * Find the MealLog that a food added via the generic "+ add food" affordance
 * for a tag should be smart-appended to — an existing "loose" log already
 * carrying that tag, so a second banana added to breakfast lands in the same
 * card as the first instead of opening a new one.
 *
 * The reported bug: adding popcorn under the "Bed" tag landed inside a Meal
 * ("Chicken Sandwich", say) that had ALREADY been logged for Bed, instead of
 * becoming its own item. A log with `mealName` set is a deliberately named,
 * closed group — a saved Meal template the user logged as a unit — and only
 * the explicit "add to this meal" affordance should add items to it. The
 * generic per-tag "+" must skip those logs and open a new entry instead.
 */

/** Minimal shape this module needs from a meal log. */
export interface TagMatchableLog {
  tags?: string[]
  mealName?: string
}

/**
 * Find an existing log today whose primary tag === tag.
 * "Primary tag" = first matching default tag in the log's tags array, else
 * the first tag, else "snack".
 */
export function findLogForTag<T extends TagMatchableLog>(
  logs: T[],
  tag: string,
  defaultTags: readonly string[],
): T | undefined {
  const norm = tag.toLowerCase()
  return logs.find(log => {
    // A named Meal is a closed group — never an implicit merge target.
    if (log.mealName) return false
    const tags = (log.tags || []).map(t => String(t).toLowerCase())
    if (tags.length === 0) return norm === 'snack'
    // If the chosen tag is in the log's tags, count it as a candidate.
    if (!tags.includes(norm)) return false
    // Determine the log's primary tag.
    const primary = tags.find(t => defaultTags.includes(t)) ?? tags[0]
    return primary === norm
  })
}
