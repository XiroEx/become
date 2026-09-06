// Run with: npm run test:file tests/unit/dashboardTiles/rotator.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickTopNTiles,
  recencySinceLastShown,
  goalWeightFor,
  severitySignal,
  candidateId,
  GOAL_TAG_BOOSTS,
  type AvailableTile,
  type ActiveSuggestion,
  type PickTopNInput,
} from '../../../lib/dashboardTiles/rotator'

const NOW = new Date('2026-05-28T12:00:00Z')

function input(overrides: Partial<PickTopNInput> = {}): PickTopNInput {
  return {
    availableTiles: [],
    activeSuggestions: [],
    lastShownMap: {},
    pinnedIds: [],
    now: NOW,
    ...overrides,
  }
}

// --- helpers --------------------------------------------------------

test('severitySignal: warning > celebration > nudge > info', () => {
  assert.ok(severitySignal('warning') > severitySignal('celebration'))
  assert.ok(severitySignal('celebration') > severitySignal('nudge'))
  assert.ok(severitySignal('nudge') > severitySignal('info'))
})

test('recencySinceLastShown: never shown → 1', () => {
  assert.equal(recencySinceLastShown(undefined, NOW), 1)
})

test('recencySinceLastShown: shown today → 0', () => {
  assert.equal(recencySinceLastShown(NOW, NOW), 0)
})

test('recencySinceLastShown: shown 3.5 days ago → 0.5', () => {
  const past = new Date(NOW.getTime() - 3.5 * 86400 * 1000)
  assert.equal(recencySinceLastShown(past, NOW), 0.5)
})

test('recencySinceLastShown: shown 14 days ago → clamped to 1', () => {
  const past = new Date(NOW.getTime() - 14 * 86400 * 1000)
  assert.equal(recencySinceLastShown(past, NOW), 1)
})

test('goalWeightFor: no goal → 1', () => {
  assert.equal(goalWeightFor(['volume'], undefined), 1)
})

test('goalWeightFor: unknown goal → 1 (no penalty)', () => {
  assert.equal(goalWeightFor(['volume'], 'bodybuilder'), 1)
})

test('goalWeightFor: goal+tag match → 1.2', () => {
  assert.equal(goalWeightFor(['volume'], 'hypertrophy'), 1.2)
  assert.equal(goalWeightFor(['1rm'], 'strength'), 1.2)
})

test('goalWeightFor: no matching tag → 1', () => {
  assert.equal(goalWeightFor(['cardio'], 'strength'), 1)
})

test('goalWeightFor: any one matching tag in the set triggers the boost', () => {
  assert.equal(goalWeightFor(['mood', 'unrelated'], 'mindfulness'), 1.2)
})

test('GOAL_TAG_BOOSTS exposes the table (so callers can document available goals)', () => {
  assert.ok(Array.isArray(GOAL_TAG_BOOSTS.hypertrophy))
  assert.ok(GOAL_TAG_BOOSTS.hypertrophy.includes('volume'))
})

// --- pickTopNTiles --------------------------------------------------

test('pickTopNTiles: default n=5', () => {
  const tiles: AvailableTile[] = Array.from({ length: 8 }, (_, i) => ({
    tileId: `t${i}`,
    freshness: 1,
    signalStrength: 1,
  }))
  const out = pickTopNTiles(input({ availableTiles: tiles }))
  assert.equal(out.length, 5)
})

test('pickTopNTiles: explicit n is honored', () => {
  const tiles: AvailableTile[] = Array.from({ length: 8 }, (_, i) => ({
    tileId: `t${i}`,
    freshness: 1,
    signalStrength: 1,
  }))
  const out = pickTopNTiles(input({ availableTiles: tiles, n: 3 }))
  assert.equal(out.length, 3)
})

test('pickTopNTiles: empty inputs → empty array', () => {
  assert.deepEqual(pickTopNTiles(input()), [])
})

test('pickTopNTiles: pinned ids come FIRST in their declared order', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'a', freshness: 1, signalStrength: 1 },
    { tileId: 'b', freshness: 0.1, signalStrength: 0.1 },
    { tileId: 'c', freshness: 1, signalStrength: 1 },
  ]
  const out = pickTopNTiles(input({ availableTiles: tiles, pinnedIds: ['b', 'a'] }))
  assert.deepEqual(out.slice(0, 2).map(candidateId), ['b', 'a'])
  // c falls into the unpinned section even though it has higher score than b.
  assert.equal(candidateId(out[2]), 'c')
  assert.equal(out[0].pinned, true)
  assert.equal(out[1].pinned, true)
  assert.equal(out[2].pinned, false)
})

test('pickTopNTiles: unpinned sorted by score descending', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'low', freshness: 0.2, signalStrength: 0.2 },   // 0.04
    { tileId: 'high', freshness: 0.9, signalStrength: 0.9 },  // 0.81
    { tileId: 'mid', freshness: 0.5, signalStrength: 0.5 },   // 0.25
  ]
  const out = pickTopNTiles(input({ availableTiles: tiles }))
  assert.deepEqual(out.map(candidateId), ['high', 'mid', 'low'])
  assert.ok(out[0].score > out[1].score && out[1].score > out[2].score)
})

test('pickTopNTiles: tiebreaker is id ascending so output is deterministic', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'zebra', freshness: 0.5, signalStrength: 0.5 },
    { tileId: 'alpha', freshness: 0.5, signalStrength: 0.5 },
    { tileId: 'mango', freshness: 0.5, signalStrength: 0.5 },
  ]
  const out = pickTopNTiles(input({ availableTiles: tiles }))
  assert.deepEqual(out.map(candidateId), ['alpha', 'mango', 'zebra'])
})

test('pickTopNTiles: recencySinceLastShown applies — recently shown ranks below never-shown', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'fresh-feed', freshness: 1, signalStrength: 1 },
    { tileId: 'just-shown', freshness: 1, signalStrength: 1 },
  ]
  const out = pickTopNTiles(
    input({
      availableTiles: tiles,
      lastShownMap: {
        'just-shown': new Date(NOW.getTime() - 1 * 86400 * 1000), // 1 day ago → 1/7
      },
    }),
  )
  assert.equal(candidateId(out[0]), 'fresh-feed')
  assert.equal(candidateId(out[1]), 'just-shown')
  assert.ok(out[0].score > out[1].score)
})

test('pickTopNTiles: goal weighting boosts tagged tiles', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'volume-tile', freshness: 1, signalStrength: 0.5, tags: ['volume'] },
    { tileId: 'plain-tile', freshness: 1, signalStrength: 0.6 },
  ]
  // Without goal: plain-tile (0.6) > volume-tile (0.5)
  const noGoal = pickTopNTiles(input({ availableTiles: tiles }))
  assert.equal(candidateId(noGoal[0]), 'plain-tile')

  // With goal=hypertrophy: volume-tile gets ×1.2 → 0.6 vs 0.6, tied; alpha
  // tiebreaker brings plain-tile first ('plain-tile' < 'volume-tile'). Use a
  // larger gap to make the boost dominate.
  const tilesBigger: AvailableTile[] = [
    { tileId: 'volume-tile', freshness: 1, signalStrength: 0.55, tags: ['volume'] }, // 0.55 * 1.2 = 0.66
    { tileId: 'plain-tile', freshness: 1, signalStrength: 0.6 },                      // 0.60
  ]
  const withGoal = pickTopNTiles(
    input({ availableTiles: tilesBigger, userGoal: 'hypertrophy' }),
  )
  assert.equal(candidateId(withGoal[0]), 'volume-tile')
})

test('pickTopNTiles: mixes metric tiles and suggestion cards in the score ranking', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'mid-tile', freshness: 0.6, signalStrength: 0.6 }, // 0.36
  ]
  const suggestions: ActiveSuggestion[] = [
    { suggestionId: 'warn-msg', severity: 'warning', freshness: 1 }, // 1 * 0.9 = 0.9
    { suggestionId: 'info-msg', severity: 'info', freshness: 1 },    // 1 * 0.4 = 0.4
  ]
  const out = pickTopNTiles(
    input({ availableTiles: tiles, activeSuggestions: suggestions }),
  )
  assert.deepEqual(out.map(candidateId), ['warn-msg', 'info-msg', 'mid-tile'])
  assert.equal(out[0].kind, 'suggestion')
  assert.equal(out[2].kind, 'metric')
})

test('pickTopNTiles: pinned suggestion id also goes first', () => {
  const suggestions: ActiveSuggestion[] = [
    { suggestionId: 's1', severity: 'info', freshness: 1 },
    { suggestionId: 's2', severity: 'warning', freshness: 1 },
  ]
  const out = pickTopNTiles(
    input({ activeSuggestions: suggestions, pinnedIds: ['s1'] }),
  )
  assert.equal(candidateId(out[0]), 's1')
  assert.equal(out[0].pinned, true)
  assert.equal(candidateId(out[1]), 's2')
})

test('pickTopNTiles: identical inputs produce identical outputs (deterministic)', () => {
  const inp = input({
    availableTiles: [
      { tileId: 't1', freshness: 1, signalStrength: 1 },
      { tileId: 't2', freshness: 0.5, signalStrength: 0.5 },
    ],
    activeSuggestions: [
      { suggestionId: 's1', severity: 'nudge', freshness: 1 },
    ],
    pinnedIds: ['t2'],
    userGoal: 'hypertrophy',
  })
  const a = pickTopNTiles(inp)
  const b = pickTopNTiles(inp)
  assert.deepEqual(a, b)
})

test('pickTopNTiles: n=0 returns empty', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'a', freshness: 1, signalStrength: 1 },
  ]
  assert.deepEqual(pickTopNTiles(input({ availableTiles: tiles, n: 0 })), [])
})

test('pickTopNTiles: pinned id that is NOT in any candidate list is skipped (does not crash, does not occupy a slot)', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'real', freshness: 1, signalStrength: 1 },
  ]
  const out = pickTopNTiles(
    input({ availableTiles: tiles, pinnedIds: ['ghost', 'real'] }),
  )
  assert.deepEqual(out.map(candidateId), ['real'])
})

test('pickTopNTiles: each result carries a ScoreBreakdown for transparency', () => {
  const tiles: AvailableTile[] = [
    { tileId: 'a', freshness: 0.8, signalStrength: 0.7, tags: ['volume'] },
  ]
  const out = pickTopNTiles(
    input({ availableTiles: tiles, userGoal: 'hypertrophy' }),
  )
  assert.equal(out[0].breakdown.freshness, 0.8)
  assert.equal(out[0].breakdown.signalStrength, 0.7)
  assert.equal(out[0].breakdown.recencySinceLastShown, 1)
  assert.equal(out[0].breakdown.goalWeight, 1.2)
})
