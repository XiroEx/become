// Run with: npx tsx --test tests/unit/dashboardTiles/homeSmartTiles.test.tsx
//
// Three new home-dashboard smart tiles, all "jump straight in, not just
// onto the page": Mindset begins today's session, Nutrition opens the food
// log, Workout Now opens the quick-session sheet in place. Card brief:
// personal, addable/editable tiles via the existing Customize tiles picker
// (no changes needed there — it's driven entirely by ALL_TILE_IDS/TILE_DEFS).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ALL_TILE_IDS, TILE_DEFS, type DashboardTileContext } from '../../../lib/dashboardTiles'

const ROOT = path.join(__dirname, '../../..')
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function ctx(over: Partial<DashboardTileContext> = {}): DashboardTileContext {
  return {
    data: {
      weightData: [],
      bmiData: [],
      moodData: [],
      currentProgram: null,
      stats: { streakDays: 0, totalWorkouts: 0, thisWeekWorkouts: 0, goalProgress: 0 },
    },
    streakData: null,
    nutritionData: null,
    weeklyAvailability: 4,
    weightUnit: 'lbs',
    todaysMood: null,
    isMoodUpdating: false,
    onMoodChange: () => {},
    onOpenWeightSheet: () => {},
    onOpenQuickSession: () => {},
    ...over,
  }
}

// --- registry -----------------------------------------------------------

test('all three tiles are registered in ALL_TILE_IDS and TILE_DEFS', () => {
  for (const id of ['mindset', 'nutrition', 'workoutNow'] as const) {
    assert.ok(ALL_TILE_IDS.includes(id), `${id} missing from ALL_TILE_IDS`)
    assert.ok(TILE_DEFS[id], `${id} missing from TILE_DEFS`)
    assert.equal(TILE_DEFS[id].id, id)
  }
})

// --- Mindset: jumps into the session, not just the page ------------------

test('Mindset tile links to /dashboard/mind?start=1 (auto-begins the session)', () => {
  const html = renderToStaticMarkup(TILE_DEFS.mindset.render(ctx()))
  assert.match(html, /href="\/dashboard\/mind\?start=1"/)
  assert.match(html, />Mindset</)
})

test('Mindset tile shows a loading skeleton while ctx.loading is true (no href flash)', () => {
  const html = renderToStaticMarkup(TILE_DEFS.mindset.render(ctx({ loading: true })))
  assert.doesNotMatch(html, /href="\/dashboard\/mind/)
})

// --- Nutrition: straight to the page --------------------------------------

test('Nutrition tile links straight to /dashboard/nutrition', () => {
  const html = renderToStaticMarkup(TILE_DEFS.nutrition.render(ctx()))
  assert.match(html, /href="\/dashboard\/nutrition"/)
  assert.match(html, />Nutrition</)
})

// --- Workout Now: opens the quick-session sheet in place ------------------

test('Workout Now tile renders as a button (in-place action), not a link', () => {
  const html = renderToStaticMarkup(TILE_DEFS.workoutNow.render(ctx()))
  assert.match(html, /<button/)
  assert.doesNotMatch(html, /<a /)
  assert.match(html, />Workout Now</)
})

test('Workout Now tile wires onClick to ctx.onOpenQuickSession, not a static handler', () => {
  const tilesSrc = readSource('lib/dashboardTiles.tsx')
  const fn = tilesSrc.slice(tilesSrc.indexOf('function renderWorkoutNow'))
  assert.match(fn.slice(0, fn.indexOf('\n\n')), /onClick=\{ctx\.onOpenQuickSession\}/)
})

// --- wiring: the dashboard actually mounts the sheet + passes the callback -

test('DashboardClient mounts QuickSessionModal and wires onOpenQuickSession to open it', () => {
  const dashboardSrc = readSource('app/dashboard/DashboardClient.tsx')
  assert.match(dashboardSrc, /import QuickSessionModal from ['"]@\/components\/QuickSessionModal['"]/)
  assert.match(dashboardSrc, /<QuickSessionModal/)
  assert.match(dashboardSrc, /open=\{quickSessionOpen\}/)
  assert.match(dashboardSrc, /onOpenQuickSession: \(\) => setQuickSessionOpen\(true\)/)
})

// --- wiring: TileGrid recognizes the new ids as renderable stat tiles -----

test('TileGrid treats mindset/nutrition/workoutNow as valid stat-tile ids', () => {
  const gridSrc = readSource('components/dashboard/TileGrid.tsx')
  const statIdsBlock = gridSrc.slice(gridSrc.indexOf('const STAT_IDS'), gridSrc.indexOf('function isStatId'))
  for (const id of ['mindset', 'nutrition', 'workoutNow']) {
    assert.match(statIdsBlock, new RegExp(`'${id}'`))
  }
})

// --- wiring: MindJourney auto-starts on ?start=1 --------------------------

test('MindJourney reads ?start=1 and calls begin() via the auto-start helper', () => {
  const src = readSource('components/mind/MindJourney.tsx')
  assert.match(src, /import \{ useSearchParams \} from 'next\/navigation'/)
  assert.match(src, /import \{ shouldAutoStartMindSession \} from '@\/lib\/mind\/autoStart'/)
  assert.match(src, /searchParams\?\.get\('start'\) === '1'/)
  assert.match(src, /shouldAutoStartMindSession\(\{/)
  assert.match(src, /autoStartedRef\.current = true\s*\n\s*begin\(\)/)
})

test('Mind page wraps MindJourney in a Suspense boundary (useSearchParams requires one)', () => {
  const src = readSource('app/dashboard/mind/page.tsx')
  assert.match(src, /<Suspense/)
  assert.match(src, /<MindJourney\s*\/>/)
})
