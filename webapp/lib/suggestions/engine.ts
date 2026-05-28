// Suggestion engine. Runs every registered source for a user, drops
// suggestions whose ids are in the dismissed list (respecting cooldownDays),
// and returns the survivors.
//
// All side-effecting inputs (the clock, the dismissed-suggestion list) are
// injected so the engine is fully testable without a DB or real time.

import { listSources } from './registry'
import type {
  DismissedSuggestion,
  RecentActivity,
  Suggestion,
} from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface RunSuggestionsOptions {
  /** Override the wall clock — useful for cooldown testing. */
  now?: Date
  /**
   * Pre-fetched dismissed suggestions. Engine prefers this over fetchDismissed.
   * Default: empty list.
   */
  dismissed?: DismissedSuggestion[]
  /**
   * If `dismissed` is not provided, the engine calls this to load the user's
   * dismissed list (typically from UserProgress in prod). Optional — if
   * neither is provided, no dismissals are applied.
   */
  fetchDismissed?: (userId: string) => Promise<DismissedSuggestion[]>
}

/**
 * Returns true when a previously emitted suggestion is still in cooldown
 * (or permanently dismissed) and should be hidden.
 */
export function isDismissed(
  suggestion: Pick<Suggestion, 'id' | 'cooldownDays'>,
  dismissed: DismissedSuggestion[],
  now: Date,
): boolean {
  const entry = dismissed.find((d) => d.id === suggestion.id)
  if (!entry) return false
  // Undefined cooldown = permanent dismissal.
  if (suggestion.cooldownDays == null) return true
  const expiresAt =
    entry.dismissedAt.getTime() + suggestion.cooldownDays * MS_PER_DAY
  return now.getTime() < expiresAt
}

export async function runSuggestions(
  userId: string,
  activity: RecentActivity,
  options: RunSuggestionsOptions = {},
): Promise<Suggestion[]> {
  const now = options.now ?? new Date()
  let dismissed: DismissedSuggestion[]
  if (options.dismissed) {
    dismissed = options.dismissed
  } else if (options.fetchDismissed) {
    dismissed = await options.fetchDismissed(userId)
  } else {
    dismissed = []
  }

  const sources = listSources()
  const results = await Promise.all(
    sources.map(async (s) => {
      try {
        return await s.run(userId, activity)
      } catch (err) {
        // Source failures are isolated — surface in logs, never poison the batch.
        console.error(`Suggestion source "${s.id}" threw:`, err)
        return null
      }
    }),
  )

  const out: Suggestion[] = []
  const seenIds = new Set<string>()
  for (const s of results) {
    if (!s) continue
    if (isDismissed(s, dismissed, now)) continue
    if (seenIds.has(s.id)) continue // dedup by suggestion.id
    seenIds.add(s.id)
    out.push(s)
  }
  return out
}
