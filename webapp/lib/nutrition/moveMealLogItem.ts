/**
 * Normalize the display tag stored on a MealLog. Meal-tag creation uses the
 * same lowercase / hyphen convention, so an edit cannot create a second
 * spelling of an existing section (for example "Late Night" vs "late-night").
 */
export function normalizeMealLogTag(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, '-')
    : ''
}

/**
 * Replace the tag occurrence the member edited while preserving any other
 * tags on the log. Returns null when a non-empty log no longer carries the
 * source tag; that means the client edited stale data and the route must not
 * guess which different tag to replace.
 *
 * An untagged log renders under the app's "snack" fallback. It is safe to move
 * that fallback to a real stored tag even though "snack" is not yet in tags[].
 */
export function replaceMealLogTag(
  tags: unknown,
  fromTag: unknown,
  targetTag: unknown,
): string[] | null {
  const target = normalizeMealLogTag(targetTag)
  if (!target) return null

  const normalized = Array.isArray(tags)
    ? Array.from(new Set(tags.map(normalizeMealLogTag).filter(Boolean)))
    : []
  if (normalized.length === 0) return [target]

  const from = normalizeMealLogTag(fromTag)
  const index = from ? normalized.indexOf(from) : 0
  if (index < 0) return null

  normalized[index] = target
  return Array.from(new Set(normalized))
}
