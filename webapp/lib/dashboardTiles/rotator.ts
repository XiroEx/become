// Dashboard tile rotator. Pure scoring function.
//
// Given the pool of metric tiles + active suggestion cards a user could see,
// returns the top N to actually surface — ordered with pinned IDs first,
// then by score descending. Score = freshness * signalStrength *
// recencySinceLastShown * goalWeight. No I/O, deterministic for fixed inputs.

import type { SuggestionSeverity } from '../suggestions/types'

export type TileKind = 'metric' | 'suggestion'

export interface AvailableTile {
  tileId: string
  /** [0..1]; 1 = data updated today. */
  freshness: number
  /** [0..1]; 1 = currently meaningful (e.g. PR streak, trending change). */
  signalStrength: number
  /** Free-form tags used for goal weighting (e.g. 'volume', 'strength'). */
  tags?: string[]
}

export interface ActiveSuggestion {
  suggestionId: string
  severity: SuggestionSeverity
  /** [0..1]; 1 = the underlying signal just changed. */
  freshness: number
  tags?: string[]
}

export interface PickTopNInput {
  availableTiles: AvailableTile[]
  activeSuggestions: ActiveSuggestion[]
  userGoal?: string
  /** id → when this id last appeared on the dashboard. Missing = never shown. */
  lastShownMap: Record<string, Date | undefined>
  /** Pinned ids — these always come first in this exact order, regardless of score. */
  pinnedIds: string[]
  n?: number
  /** Fake clock for tests. Defaults to a deterministic epoch sentinel when
   *  the caller omits it — keeps the function pure. */
  now: Date
}

export type TileCandidate =
  | {
      kind: 'metric'
      tileId: string
      score: number
      pinned: boolean
      breakdown: ScoreBreakdown
    }
  | {
      kind: 'suggestion'
      suggestionId: string
      score: number
      pinned: boolean
      breakdown: ScoreBreakdown
    }

export interface ScoreBreakdown {
  freshness: number
  signalStrength: number
  recencySinceLastShown: number
  goalWeight: number
}

const DEFAULT_N = 5
const FULL_RECENCY_AFTER_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000
const GOAL_BOOST_MULTIPLIER = 1.2

/**
 * Severity → signal strength. Warnings dominate, then celebrations, nudges,
 * info. Tunable in one place.
 */
const SEVERITY_SIGNAL: Record<SuggestionSeverity, number> = {
  info: 0.4,
  nudge: 0.6,
  celebration: 0.7,
  warning: 0.9,
}

/**
 * Goal-tag boost table. Goals not in the table contribute no boost; tiles
 * without matching tags also get no boost.
 */
export const GOAL_TAG_BOOSTS: Record<string, string[]> = {
  hypertrophy: ['volume', 'reps', 'tonnage'],
  strength: ['1rm', 'strength', 'pr'],
  endurance: ['cardio', 'volume', 'duration'],
  'weight-loss': ['calories', 'cardio', 'mood'],
  mindfulness: ['mood', 'streak', 'consistency'],
}

export function severitySignal(severity: SuggestionSeverity): number {
  return SEVERITY_SIGNAL[severity]
}

export function recencySinceLastShown(
  lastShownAt: Date | undefined,
  now: Date,
): number {
  if (!lastShownAt) return 1
  const days = Math.max(0, (now.getTime() - lastShownAt.getTime()) / MS_PER_DAY)
  return Math.min(1, days / FULL_RECENCY_AFTER_DAYS)
}

export function goalWeightFor(
  tags: string[] | undefined,
  goal: string | undefined,
): number {
  if (!goal || !tags || tags.length === 0) return 1
  const boostedTags = GOAL_TAG_BOOSTS[goal]
  if (!boostedTags) return 1
  for (const tag of tags) {
    if (boostedTags.includes(tag)) return GOAL_BOOST_MULTIPLIER
  }
  return 1
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function scoreCandidate(
  freshness: number,
  signalStrength: number,
  recency: number,
  goalWeight: number,
): number {
  return (
    clamp01(freshness) *
    clamp01(signalStrength) *
    clamp01(recency) *
    goalWeight
  )
}

/**
 * Main entry. Pure: no Date.now(), no random, no I/O.
 *
 * Output ordering: pinned ids first (in `pinnedIds` order), then unpinned
 * sorted by score descending, then by id ascending (stable tiebreaker).
 */
export function pickTopNTiles(input: PickTopNInput): TileCandidate[] {
  const n = input.n ?? DEFAULT_N
  if (n <= 0) return []

  const pinnedSet = new Set(input.pinnedIds)
  const scored: TileCandidate[] = []

  for (const t of input.availableTiles) {
    const breakdown: ScoreBreakdown = {
      freshness: clamp01(t.freshness),
      signalStrength: clamp01(t.signalStrength),
      recencySinceLastShown: recencySinceLastShown(
        input.lastShownMap[t.tileId],
        input.now,
      ),
      goalWeight: goalWeightFor(t.tags, input.userGoal),
    }
    const score = scoreCandidate(
      breakdown.freshness,
      breakdown.signalStrength,
      breakdown.recencySinceLastShown,
      breakdown.goalWeight,
    )
    scored.push({
      kind: 'metric',
      tileId: t.tileId,
      score,
      pinned: pinnedSet.has(t.tileId),
      breakdown,
    })
  }

  for (const s of input.activeSuggestions) {
    const signalStrength = severitySignal(s.severity)
    const breakdown: ScoreBreakdown = {
      freshness: clamp01(s.freshness),
      signalStrength,
      recencySinceLastShown: recencySinceLastShown(
        input.lastShownMap[s.suggestionId],
        input.now,
      ),
      goalWeight: goalWeightFor(s.tags, input.userGoal),
    }
    const score = scoreCandidate(
      breakdown.freshness,
      breakdown.signalStrength,
      breakdown.recencySinceLastShown,
      breakdown.goalWeight,
    )
    scored.push({
      kind: 'suggestion',
      suggestionId: s.suggestionId,
      score,
      pinned: pinnedSet.has(s.suggestionId),
      breakdown,
    })
  }

  const byId = new Map<string, TileCandidate>()
  for (const c of scored) {
    byId.set(candidateId(c), c)
  }

  // Pinned first, in user-defined order.
  const pinnedOrdered: TileCandidate[] = []
  for (const id of input.pinnedIds) {
    const c = byId.get(id)
    if (c) pinnedOrdered.push(c)
  }

  // Unpinned, sorted by score desc then id asc (stable).
  const unpinned = scored
    .filter((c) => !pinnedSet.has(candidateId(c)))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return candidateId(a).localeCompare(candidateId(b))
    })

  return [...pinnedOrdered, ...unpinned].slice(0, n)
}

export function candidateId(c: TileCandidate): string {
  return c.kind === 'metric' ? c.tileId : c.suggestionId
}
