// Suggestion primitive — Layer 2 of the intelligence platform.
//
// A Suggestion is a small, opinionated nudge surfaced on the dashboard.
// Concrete suggestion sources (workout plateau warning, hydration reminder,
// streak celebration, etc.) implement SuggestionSource and register at
// module load via registerSource() in registry.ts. The engine fans out to
// every source, filters cooldown-dismissed ones, and returns the union.

export type SuggestionSeverity =
  | 'info'
  | 'nudge'
  | 'warning'
  | 'celebration'

export type SuggestionDomain = 'workout' | 'nutrition' | 'mindset'

export interface SuggestionPrimaryAction {
  label: string
  href: string
}

export interface Suggestion {
  id: string
  severity: SuggestionSeverity
  title: string
  body: string
  primaryAction?: SuggestionPrimaryAction
  dismissible: boolean
  /**
   * If set, a user-dismissal silences this suggestion for `cooldownDays`
   * days. After that window, the engine may re-emit it. Undefined =
   * permanent dismissal once acknowledged.
   */
  cooldownDays?: number
  source: SuggestionDomain
  sourceData?: Record<string, unknown>
}

export interface DismissedSuggestion {
  id: string
  dismissedAt: Date
}

/**
 * Recent-activity bundle handed to every source. Engine callers populate
 * what they have; sources should treat all fields as optional and skip
 * gracefully when their inputs are missing.
 */
export interface RecentActivity {
  weightHistory?: Array<{ date: Date; value: number }>
  moodHistory?: Array<{ date: Date; value: number }>
  workoutLogs?: Array<{
    date: Date
    programId?: string
    exerciseSlugs: string[]
  }>
  streak?: { count: number; lastLogDate: Date | null }
  [extension: string]: unknown
}

export type SuggestionSourceFn = (
  userId: string,
  activity: RecentActivity,
) => Promise<Suggestion | null>

export interface RegisteredSource {
  id: string
  domain: SuggestionDomain
  run: SuggestionSourceFn
}
