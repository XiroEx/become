// ---------------------------------------------------------------------------
// Default time-of-day for tag-based promotion. Used when back-promoting a
// past-day plan: the user said "breakfast", we pick 8am local for the
// resulting log's loggedAt.
//
// The MEAL_SCHEDULING_PLAN spells these out in Section 6.5. Treat as a
// constant table; tweak the table if a tag's default is wrong, but never
// add per-user overrides here (out of v1 scope).
// ---------------------------------------------------------------------------

export type HourMinute = readonly [number, number]

export const DEFAULT_TAG_TIMES: Record<string, HourMinute> = {
  breakfast: [8, 0],
  brunch: [10, 30],
  lunch: [12, 30],
  snack: [15, 0],
  'pre-workout': [16, 30],
  dinner: [18, 30],
  'post-workout': [19, 30],
  dessert: [20, 30],
  'late-night': [22, 0],
}

export function defaultTimeForTag(tag: string): HourMinute {
  const lower = tag.toLowerCase()
  return DEFAULT_TAG_TIMES[lower] ?? [12, 0]
}
