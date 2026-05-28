// Run with: npx tsx --test tests/unit/dashboardTiles/IntelligenceRotator.test.tsx
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { IntelligenceRotator } from '../../../components/intelligence/IntelligenceRotator'
import {
  registerMetric,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import type { Suggestion } from '../../../lib/suggestions/types'
import type { Metric } from '../../../lib/metrics/types'

beforeEach(() => {
  __resetRegistryForTest()
})

function metric(id: string, label = 'X'): Metric {
  return {
    id,
    label,
    unit: 'x',
    domain: 'workout',
    trendDirection: 'up-good',
    compute: async () => [
      { t: new Date('2026-05-26T00:00:00Z'), value: 1 },
      { t: new Date('2026-05-27T00:00:00Z'), value: 2 },
    ],
  }
}

const NOW_ISO = '2026-05-28T12:00:00Z'

test('IntelligenceRotator: empty tiles → empty-state hint', () => {
  const html = renderToStaticMarkup(
    <IntelligenceRotator initialResponse={{ tiles: [], now: NOW_ISO }} />,
  )
  assert.match(html, /data-testid="rotator-empty"/)
  assert.match(html, /keep logging activity/)
})

// (Metric-tile render path requires rendering an async server component
//  inside the sync SSR pipeline, which suspends. Routing is covered by the
//  missing-metric placeholder test and by Playwright e2e end-to-end.)

test('IntelligenceRotator: grid wrapper renders when tiles array is non-empty', () => {
  registerMetric(metric('workouts-this-week', 'Workouts'))
  // Use a suggestion candidate (sync render path) just to confirm the grid
  // container renders. We assert the grid testid only.
  const tiles: import('../../../lib/dashboardTiles/rotator').TileCandidate[] = [
    {
      kind: 'suggestion',
      suggestionId: 'log-weight',
      score: 0.9,
      pinned: false,
      breakdown: { freshness: 1, signalStrength: 1, recencySinceLastShown: 1, goalWeight: 1 },
    },
  ]
  const html = renderToStaticMarkup(
    <IntelligenceRotator initialResponse={{ tiles, now: NOW_ISO }} />,
  )
  assert.match(html, /data-testid="rotator-grid"/)
})

test('IntelligenceRotator: missing-metric placeholder when tileId not in registry', () => {
  const tiles: import('../../../lib/dashboardTiles/rotator').TileCandidate[] = [
    {
      kind: 'metric',
      tileId: 'never-registered',
      score: 0.9,
      pinned: false,
      breakdown: { freshness: 1, signalStrength: 1, recencySinceLastShown: 1, goalWeight: 1 },
    },
  ]
  const html = renderToStaticMarkup(
    <IntelligenceRotator initialResponse={{ tiles, now: NOW_ISO }} />,
  )
  assert.match(html, /data-testid="rotator-missing-metric"/)
  assert.match(html, /data-tile-id="never-registered"/)
})

test('IntelligenceRotator: suggestion tile renders via SuggestionCard when resolver provides', () => {
  const tiles: import('../../../lib/dashboardTiles/rotator').TileCandidate[] = [
    {
      kind: 'suggestion',
      suggestionId: 'log-weight',
      score: 0.8,
      pinned: false,
      breakdown: { freshness: 1, signalStrength: 1, recencySinceLastShown: 1, goalWeight: 1 },
    },
  ]
  const suggestion: Suggestion = {
    id: 'log-weight',
    severity: 'nudge',
    title: 'Log your weight',
    body: 'Quick check-in.',
    dismissible: true,
    source: 'mindset',
  }
  const html = renderToStaticMarkup(
    <IntelligenceRotator
      initialResponse={{ tiles, now: NOW_ISO }}
      resolveSuggestion={(id) => (id === 'log-weight' ? suggestion : undefined)}
    />,
  )
  assert.match(html, /data-testid="suggestion-card"/)
  assert.match(html, />Log your weight</)
})

test('IntelligenceRotator: suggestion id without resolver → missing-suggestion placeholder', () => {
  const tiles: import('../../../lib/dashboardTiles/rotator').TileCandidate[] = [
    {
      kind: 'suggestion',
      suggestionId: 'log-weight',
      score: 0.8,
      pinned: false,
      breakdown: { freshness: 1, signalStrength: 1, recencySinceLastShown: 1, goalWeight: 1 },
    },
  ]
  const html = renderToStaticMarkup(
    <IntelligenceRotator initialResponse={{ tiles, now: NOW_ISO }} />,
  )
  assert.match(html, /data-testid="rotator-missing-suggestion"/)
  assert.match(html, /data-suggestion-id="log-weight"/)
})

test('IntelligenceRotator: no initialResponse → loading indicator on first render', () => {
  // No initialResponse, so the SSR'd snapshot is the loading state.
  const html = renderToStaticMarkup(<IntelligenceRotator />)
  assert.match(html, /data-testid="rotator-loading"/)
  assert.match(html, /aria-busy="true"/)
})
