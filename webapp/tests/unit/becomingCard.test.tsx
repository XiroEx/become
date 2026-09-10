// Run with: npm run test:file tests/unit/becomingCard.test.tsx
//
// The rendered half of the Becoming card rework. The pure decisions live in
// lib/becoming/signals (tests/unit/becomingSignals.test.ts); this pins that the
// card actually draws them — no Sun→Sat dots, no row for a pillar the member
// does not use, a visible change against last week, and one tappable
// invitation — and that the details sheet opens on Story.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import WeekCard from '../../components/becoming/journey/WeekCard'
import BecomingDetails from '../../components/becoming/BecomingDetails'
import { buildWeeks, emptyDay, type DayEvents } from '../../lib/becoming/weeks'
import { weekSignals } from '../../lib/becoming/signals'

function build(spec: Record<string, Partial<DayEvents>>) {
  const days = new Map<string, DayEvents>()
  for (const [k, v] of Object.entries(spec)) days.set(k, { ...emptyDay(), ...v })
  return buildWeeks({
    days, todayKey: '2026-08-18', weeklyTarget: 5, logTarget: 5, proteinTarget: 5,
    targetWeight: 205, weightUnit: 'lbs', direction: 'lose', identity: null,
  })
}

function card(spec: Record<string, Partial<DayEvents>>, index?: number): string {
  const weeks = build(spec)
  const i = index ?? weeks.length - 1
  return renderToStaticMarkup(
    <WeekCard
      week={weeks[i]}
      signals={weekSignals(weeks, i, 'lbs')}
      unit="lbs"
      width={330}
      height={520}
      focused
      landed
      compact={false}
      exitEdge={null}
      totalWeeks={weeks.length}
      identity={null}
      reduced
    />,
  )
}

// Every proof dot was this exact element: a 7px round span in the metrics block.
const DOT = /h-\[7px\] w-\[7px\] rounded-full/

test('the Sun→Sat dot strip is gone', () => {
  const html = card({
    '2026-08-16': { workouts: ['A'], foodLogged: true, mindSession: true },
    '2026-08-17': { workouts: ['B'], foodLogged: true },
  })
  assert.doesNotMatch(html, DOT)
})

test('a training-only member sees Training and is not told "0 sessions"', () => {
  const html = card({
    '2026-08-09': { workouts: ['A'] }, '2026-08-11': { workouts: ['B'] },
    '2026-08-16': { workouts: ['C'] }, '2026-08-17': { workouts: ['D'] },
  })
  assert.match(html, /week-card-row-training/)
  assert.doesNotMatch(html, /week-card-row-mind/)
  assert.doesNotMatch(html, /week-card-row-fuel/)
  assert.doesNotMatch(html, /sessions/)
  // The number that matters, in words rather than a bare "2/5".
  assert.match(html, /2 of 5 workouts/)
})

test('the change against last week is drawn, and named so the arrow means something', () => {
  // Last week 1 workout, this week (through Tuesday) 2 → up 1.
  const html = card({
    '2026-08-09': { workouts: ['A'] },
    '2026-08-16': { workouts: ['B'] }, '2026-08-17': { workouts: ['C'] },
  })
  assert.match(html, /week-card-delta-up/)
  assert.match(html, /vs the same days last week/)
})

test('a first week has nothing to compare against, so no chip and no caption', () => {
  const html = card({ '2026-08-16': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] } })
  assert.doesNotMatch(html, /week-card-delta-/)
  assert.doesNotMatch(html, /vs the same days last week/)
  assert.match(html, /week-card-row-training/)
})

test('an unused pillar becomes one small link into the feature, not a row of zeroes', () => {
  const html = card({
    '2026-08-09': { workouts: ['A'] }, '2026-08-16': { workouts: ['B'] }, '2026-08-17': { workouts: ['C'] },
  })
  assert.match(html, /week-card-nudge/)
  assert.match(html, /Log a meal/)
  assert.match(html, /href="\/dashboard\/nutrition"/)
})

test('a member using everything gets no invitation', () => {
  const html = card({
    '2026-08-16': { workouts: ['A'], foodLogged: true, mindSession: true },
    '2026-08-17': { workouts: ['B'], foodLogged: true, mindSession: true },
  })
  assert.doesNotMatch(html, /week-card-nudge/)
})

test('an "away" card carries no metrics block at all', () => {
  const weeks = build({ '2026-07-05': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } })
  const gap = weeks.findIndex(w => !!w.gap)
  assert.ok(gap > 0)
  const html = renderToStaticMarkup(
    <WeekCard
      week={weeks[gap]} signals={weekSignals(weeks, gap, 'lbs')} unit="lbs" width={330} height={520}
      focused landed compact={false} exitEdge={null} totalWeeks={weeks.length} identity={null} reduced
    />,
  )
  assert.doesNotMatch(html, /week-card-metrics/)
  assert.doesNotMatch(html, /week-card-nudge/)
})

test('"what writes this card" drops the suggestion for a pillar they do not use', () => {
  const next = {
    nutrition: { title: 'You reached your target', sub: 'hold it' },
    training: { title: 'Averaging 1.3/wk against 5', sub: 'protect the schedule' },
  }
  const weeks = build({
    '2026-08-09': { workouts: ['A'] }, '2026-08-16': { workouts: ['B'] }, '2026-08-17': { workouts: ['C'] },
  })
  const i = weeks.length - 1
  const html = renderToStaticMarkup(
    <WeekCard
      week={weeks[i]} signals={weekSignals(weeks, i, 'lbs')} unit="lbs" width={330} height={520}
      focused landed compact={false} exitEdge={null} totalWeeks={weeks.length} identity={null} next={next} reduced
    />,
  )
  assert.match(html, /Averaging 1.3\/wk against 5/)
  assert.doesNotMatch(html, /You reached your target/)
})

test('the details sheet leads with Story — the one screen everybody has — then training, fuel, mind', () => {
  const weeks = build({ '2026-08-16': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] } })
  const html = renderToStaticMarkup(
    <BecomingDetails weeks={weeks} weighIns={[]} todayKey="2026-08-18" unit="lbs" onClose={() => {}} />,
  )
  const order = [...html.matchAll(/details-tab-(story|training|fuel|mind)/g)].map(m => m[1])
  assert.deepEqual(order, ['story', 'training', 'fuel', 'mind'])
  assert.match(html, /details-screen-story/)
})
