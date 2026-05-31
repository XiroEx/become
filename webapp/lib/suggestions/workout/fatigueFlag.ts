// Fatigue-flag suggestion source.
//
// If the upcoming scheduled workout's primary-muscle set overlaps with a
// workout actually logged in the last 24h, warn the user — they're about to
// hammer a muscle group that hasn't recovered. Same-day-twice training of a
// muscle is the classic overreaching mistake this catches.
//
// "Overlap" is set intersection of the upcoming session's primary muscles with
// the recently-trained primary muscles. The 24h window is measured from `now`
// back to the most recent qualifying log.
//
// Pure + injectable: an evaluator over already-shaped inputs, a Source with
// id/title/eligible/render backed by an injectable loader, and an engine
// wrapper registered under its own key.

import { registerSource, listSources } from '../registry'
import type { Suggestion, SuggestionSourceFn } from '../types'
import type { MuscleGroup } from '../../../models/Exercise'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const RECOVERY_WINDOW_MS = MS_PER_DAY // 24h

// ── Public types ────────────────────────────────────────────────────────────

export interface FatigueFlagInput {
  /** Primary muscles the next scheduled workout will hit. */
  upcomingMuscles: MuscleGroup[]
  /** Recent completed sessions: each carries its date + primary muscles hit. */
  recentSessions: Array<{ date: Date; muscles: MuscleGroup[] }>
  now: Date
}

export interface FatigueFlagResult {
  /** Muscles trained in the last 24h that the upcoming session repeats. */
  overlap: MuscleGroup[]
  /** Hours since the most recent overlapping session. */
  hoursSince: number
}

export type LoadFatigueFlagInput = (
  userId: string,
  now: Date,
) => Promise<FatigueFlagInput | null>

// ── Helpers ─────────────────────────────────────────────────────────────────

function titleizeMuscle(m: string): string {
  return m
    .split(/[-_]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

// ── Pure evaluator ──────────────────────────────────────────────────────────

/**
 * Flag fatigue when the upcoming muscle set intersects a session logged within
 * the last 24h. Returns null if there's no upcoming work, no recent session in
 * the window, or no muscle overlap. When several recent sessions overlap, the
 * most recent one drives hoursSince.
 */
export function evaluateFatigueFlag(
  input: FatigueFlagInput,
): FatigueFlagResult | null {
  const upcoming = new Set(input.upcomingMuscles)
  if (upcoming.size === 0) return null

  const windowStart = input.now.getTime() - RECOVERY_WINDOW_MS

  const overlap = new Set<MuscleGroup>()
  let mostRecentMs = -Infinity
  for (const session of input.recentSessions) {
    const t = new Date(session.date).getTime()
    if (t < windowStart || t > input.now.getTime()) continue // outside 24h
    const sessionOverlap = session.muscles.filter(m => upcoming.has(m))
    if (sessionOverlap.length === 0) continue
    for (const m of sessionOverlap) overlap.add(m)
    if (t > mostRecentMs) mostRecentMs = t
  }

  if (overlap.size === 0) return null

  const hoursSince = Math.floor((input.now.getTime() - mostRecentMs) / (60 * 60 * 1000))
  return { overlap: [...overlap], hoursSince }
}

// ── Suggestion shaping ──────────────────────────────────────────────────────

export function fatigueToSuggestion(r: FatigueFlagResult): Suggestion {
  const names = r.overlap.map(titleizeMuscle)
  const list =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  return {
    id: 'workout.fatigue-flag',
    severity: 'warning',
    title: `${list} trained ${r.hoursSince}h ago`,
    body:
      `Your next session repeats ${list}, which you hit only ${r.hoursSince} hours ago. ` +
      `Those muscles may still be recovering — consider a different focus or an extra rest day.`,
    primaryAction: {
      label: 'Open calendar',
      href: '/dashboard/calendar',
    },
    dismissible: true,
    cooldownDays: 1,
    source: 'workout',
    sourceData: {
      muscles: r.overlap,
      hoursSince: r.hoursSince,
    },
  }
}

// ── WorkoutSuggestionSource (id / title / eligible / render) ─────────────────

export interface FatigueSourceArgs {
  userId: string
  now?: Date
}

export interface FatigueFlagSource {
  id: string
  title: string
  eligible(args: FatigueSourceArgs): Promise<boolean>
  render(args: FatigueSourceArgs): Promise<Suggestion | null>
}

export function makeFatigueFlagSource(
  loadInput: LoadFatigueFlagInput,
): FatigueFlagSource {
  return {
    id: 'workout.fatigue-flag',
    title: 'Fatigue flag',
    async eligible({ userId, now }) {
      const clock = now ?? new Date()
      const input = await loadInput(userId, clock)
      if (!input) return false
      return evaluateFatigueFlag(input) != null
    },
    async render({ userId, now }) {
      const clock = now ?? new Date()
      const input = await loadInput(userId, clock)
      if (!input) return null
      const result = evaluateFatigueFlag(input)
      return result ? fatigueToSuggestion(result) : null
    },
  }
}

// ── Default loader (placeholder) ─────────────────────────────────────────────

/**
 * Default loader. A correct implementation needs the upcoming scheduled
 * workout's primary-muscle set, which requires hydrating the Program's
 * phase → workout → exercises (the Schedule's scheduled-workout entries store
 * only programId / phase / dayLabel, not exercise slugs). That hydration is
 * out of scope for this source's first cut, so the default path returns null
 * and stays silent — the evaluator, Source, and engine wrapper are fully
 * driven by injected inputs (tests + a future dashboard wiring that passes
 * `fatigueFlagInput`). This mirrors the progression-nudge default loader,
 * which likewise leaves its hardest-to-derive field unresolved by default.
 */
export const defaultLoadFatigueFlagInput: LoadFatigueFlagInput = async () => {
  return null
}

// ── Engine registration ──────────────────────────────────────────────────────

/**
 * Engine wrapper. Reads an optional `fatigueFlagInput` extension off the
 * activity bundle; absent that it returns null (injected-data-only, symmetric
 * with the other precise wrappers). Registered under a distinct key so it
 * coexists with the coarse activity-level fatigue source.
 */
export const fatigueFlagEngineSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const input = (activity as { fatigueFlagInput?: FatigueFlagInput }).fatigueFlagInput
  if (!input) return null
  const result = evaluateFatigueFlag(input)
  return result ? fatigueToSuggestion(result) : null
}

const ENGINE_KEY = 'workout.fatigue-flag-dp'

let registered = false
export function ensureFatigueFlagRegistered(): void {
  const existing = new Set(listSources().map(s => s.id))
  if (registered && existing.has(ENGINE_KEY)) return
  if (!existing.has(ENGINE_KEY)) {
    registerSource(ENGINE_KEY, 'workout', fatigueFlagEngineSource)
  }
  registered = true
}

export function __resetFatigueFlagRegistrationForTest(): void {
  registered = false
}

/** Default-wired Source for app use. */
export const fatigueFlagSource = makeFatigueFlagSource(defaultLoadFatigueFlagInput)
