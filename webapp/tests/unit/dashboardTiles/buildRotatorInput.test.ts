// Run with: npx tsx --test tests/unit/dashboardTiles/buildRotatorInput.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lastShownMapFromProgress,
  metricsToAvailableTiles,
  suggestionsToActive,
  updateLastShown,
  recentActivityFromProgress,
  buildRotatorInputFromProgress,
} from '../../../lib/dashboardTiles/buildRotatorInput'
import type { Metric } from '../../../lib/metrics/types'
import type { Suggestion } from '../../../lib/suggestions/types'

const NOW = new Date('2026-05-28T12:00:00Z')

// --- lastShownMapFromProgress ----------------------------------------

test('lastShownMapFromProgress: undefined → {}', () => {
  assert.deepEqual(lastShownMapFromProgress(undefined), {})
})

test('lastShownMapFromProgress: array → keyed map of Dates', () => {
  const map = lastShownMapFromProgress([
    { id: 'a', at: new Date('2026-05-25T00:00:00Z') },
    { id: 'b', at: new Date('2026-05-27T00:00:00Z') },
  ])
  assert.ok(map['a'] instanceof Date)
  assert.equal(map['a']?.toISOString(), '2026-05-25T00:00:00.000Z')
  assert.equal(map['b']?.toISOString(), '2026-05-27T00:00:00.000Z')
})

// --- metricsToAvailableTiles ------------------------------------------

test('metricsToAvailableTiles: tags each tile with metric.domain', () => {
  const metrics: Metric[] = [
    { id: 'm1', label: 'M1', unit: 'x', domain: 'workout', trendDirection: 'up-good', compute: async () => [] },
    { id: 'm2', label: 'M2', unit: 'y', domain: 'mindset', trendDirection: 'neutral', compute: async () => [] },
  ]
  const tiles = metricsToAvailableTiles(metrics)
  assert.deepEqual(tiles[0].tags, ['workout'])
  assert.deepEqual(tiles[1].tags, ['mindset'])
})

test('metricsToAvailableTiles: respects defaultFreshness / defaultSignalStrength', () => {
  const metrics: Metric[] = [
    { id: 'm1', label: 'M', unit: 'x', domain: 'workout', trendDirection: 'up-good', compute: async () => [] },
  ]
  const tiles = metricsToAvailableTiles(metrics, { defaultFreshness: 0.3, defaultSignalStrength: 0.4 })
  assert.equal(tiles[0].freshness, 0.3)
  assert.equal(tiles[0].signalStrength, 0.4)
})

// --- suggestionsToActive ----------------------------------------------

test('suggestionsToActive: maps id+severity+source-tag', () => {
  const suggestions: Suggestion[] = [
    {
      id: 's1', severity: 'warning', title: 't', body: 'b',
      dismissible: true, source: 'workout',
    },
  ]
  const out = suggestionsToActive(suggestions)
  assert.equal(out[0].suggestionId, 's1')
  assert.equal(out[0].severity, 'warning')
  assert.deepEqual(out[0].tags, ['workout'])
  assert.equal(out[0].freshness, 1)
})

// --- updateLastShown --------------------------------------------------

test('updateLastShown: appends new ids', () => {
  const next = updateLastShown([], ['a', 'b'], NOW)
  assert.equal(next.length, 2)
  assert.deepEqual(next.map((e) => e.id).sort(), ['a', 'b'])
  assert.equal(next[0].at.toISOString(), NOW.toISOString())
})

test('updateLastShown: refreshes existing entries with new timestamp', () => {
  const existing = [{ id: 'a', at: new Date('2026-05-20T00:00:00Z') }]
  const next = updateLastShown(existing, ['a'], NOW)
  assert.equal(next.length, 1)
  assert.equal(next[0].at.toISOString(), NOW.toISOString())
})

test('updateLastShown: preserves entries that were not served this round', () => {
  const existing = [{ id: 'a', at: new Date('2026-05-20T00:00:00Z') }]
  const next = updateLastShown(existing, ['b'], NOW)
  assert.equal(next.length, 2)
  const a = next.find((e) => e.id === 'a')
  assert.equal(a?.at.toISOString(), '2026-05-20T00:00:00.000Z')
})

// --- recentActivityFromProgress ---------------------------------------

test('recentActivityFromProgress: null progress → empty activity', () => {
  assert.deepEqual(recentActivityFromProgress(null, NOW), {})
})

test('recentActivityFromProgress: drops entries older than 30 days', () => {
  const prog = {
    weightHistory: [
      { date: new Date('2026-05-27T00:00:00Z'), weight: 180 },
      { date: new Date('2026-04-01T00:00:00Z'), weight: 175 }, // > 30 days old
    ],
    moodHistory: [],
    moodChangeHistory: [],
    workoutLogs: [],
    activePrograms: [],
    streakDays: 7,
    longestStreak: 7,
    streakFreezes: 0,
    milestonesReached: [],
    totalWorkouts: 0,
    exercisePRs: [
      {
        exerciseSlug: 'bench-press',
        exerciseName: 'Bench Press',
        maxWeight: {
          weight: 225,
          reps: 1,
          date: new Date('2026-05-25T00:00:00Z'),
        },
        maxReps: null,
        maxE1RM: null,
      },
    ],
    dismissedSuggestions: [],
    pinnedTiles: [],
    tileLastShownAt: [],
    lastActivityDate: new Date('2026-05-27T00:00:00Z'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  const activity = recentActivityFromProgress(prog, NOW)
  assert.equal(activity.weightHistory?.length, 1)
  assert.equal(activity.weightHistory?.[0].value, 180)
  assert.equal(activity.exercisePRs?.[0].exerciseSlug, 'bench-press')
  assert.equal(activity.exercisePRs?.[0].dates[0].toISOString(), '2026-05-25T00:00:00.000Z')
  assert.equal(activity.streak?.count, 7)
})

// --- buildRotatorInputFromProgress ------------------------------------

test('buildRotatorInputFromProgress: wires metrics + suggestions + progress into PickTopNInput', () => {
  const metrics: Metric[] = [
    { id: 'm1', label: 'M', unit: 'x', domain: 'workout', trendDirection: 'up-good', compute: async () => [] },
  ]
  const suggestions: Suggestion[] = [
    {
      id: 's1', severity: 'nudge', title: 't', body: 'b',
      dismissible: true, source: 'mindset',
    },
  ]
  const progress = {
    pinnedTiles: ['m1'],
    tileLastShownAt: [{ id: 'm1', at: new Date('2026-05-20T00:00:00Z') }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  const inp = buildRotatorInputFromProgress(progress, suggestions, 'hypertrophy', NOW, { metrics })
  assert.equal(inp.userGoal, 'hypertrophy')
  assert.deepEqual(inp.pinnedIds, ['m1'])
  assert.equal(inp.availableTiles.length, 1)
  assert.equal(inp.availableTiles[0].tileId, 'm1')
  assert.equal(inp.activeSuggestions.length, 1)
  assert.equal(inp.activeSuggestions[0].suggestionId, 's1')
  assert.ok(inp.lastShownMap['m1'] instanceof Date)
  assert.equal(inp.n, 5)
  assert.equal(inp.now, NOW)
})

test('buildRotatorInputFromProgress: null progress → empty pin/last-shown defaults', () => {
  const inp = buildRotatorInputFromProgress(null, [], undefined, NOW, { metrics: [] })
  assert.deepEqual(inp.pinnedIds, [])
  assert.deepEqual(inp.lastShownMap, {})
  assert.equal(inp.userGoal, undefined)
})
