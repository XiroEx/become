// Run with: npm run test:file tests/unit/metrics/insightsDrillIn.test.tsx
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
// The page header's profile menu calls useRouter(), which needs the App Router
// mounted; a stub router is enough because nothing is clicked here.
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  registerMetric,
  __resetRegistryForTest,
} from '../../../lib/metrics/registry'
import InsightsDrillInPage from '../../../app/dashboard/insights/[metricId]/page'
import type { Metric } from '../../../lib/metrics/types'

beforeEach(() => {
  __resetRegistryForTest()
})

const stubRouter = {
  push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {},
}
const render = (jsx: React.ReactElement) =>
  renderToStaticMarkup(
    <AppRouterContext.Provider value={stubRouter as never}>{jsx}</AppRouterContext.Provider>,
  )

const M: Metric = {
  id: 'totalWorkoutsThisWeek',
  label: 'Workouts this week',
  unit: 'workouts',
  domain: 'workout',
  trendDirection: 'up-good',
  compute: async () => [],
}

test('InsightsDrillInPage: resolves metricId from params and renders metric label', async () => {
  registerMetric(M)
  const jsx = await InsightsDrillInPage({
    params: Promise.resolve({ metricId: 'totalWorkoutsThisWeek' }),
  })
  const html = render(jsx)
  assert.match(html, /data-testid="insights-drill-in"/)
  assert.match(html, /data-metric-id="totalWorkoutsThisWeek"/)
  assert.match(html, />Workouts this week</)
  assert.match(html, /Drill-in view coming soon/)
  assert.match(html, /href="\/dashboard"/)
})

test('InsightsDrillInPage: unknown metricId still renders the page with a clear message', async () => {
  const jsx = await InsightsDrillInPage({
    params: Promise.resolve({ metricId: 'unknown-id' }),
  })
  const html = render(jsx)
  assert.match(html, /data-metric-id="unknown-id"/)
  assert.match(html, />Unknown metric</)
  assert.match(html, /No metric is registered under this id/)
})
