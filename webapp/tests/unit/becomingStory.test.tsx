// Run with: npm run test:file tests/unit/becomingStory.test.tsx
//
// The Story screen of the Details sheet, as it actually renders. The decisions
// are pure (tests/unit/becomingWeekSummary.test.ts); this pins that the screen
// draws them in the order asked for:
//
//   • the week summary leads — press Details and you are told what this week
//     adds up to, not handed two histories;
//   • week by week comes BEFORE the evidence wall;
//   • each history shows four rows and a control for the rest, so neither is a
//     forty-row scroll.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import BecomingDetails, { StoryNextSteps } from '../../components/becoming/BecomingDetails'
import { buildWeeks, emptyDay, type DayEvents, type WeekSnapshot } from '../../lib/becoming/weeks'
import type { NextStep } from '../../lib/becoming/weekSummary'

const TODAY = '2026-08-18'

function build(spec: Record<string, Partial<DayEvents>>): WeekSnapshot[] {
  const days = new Map<string, DayEvents>()
  for (const [k, v] of Object.entries(spec)) days.set(k, { ...emptyDay(), ...v })
  return buildWeeks({
    days, todayKey: TODAY, weeklyTarget: 5, logTarget: 5, proteinTarget: 5,
    targetWeight: 205, weightUnit: 'lbs', direction: 'lose', identity: null,
  })
}
function sheet(weeks: WeekSnapshot[]): string {
  return renderToStaticMarkup(
    <BecomingDetails weeks={weeks} weighIns={[]} todayKey={TODAY} unit="lbs" onClose={() => {}} />,
  )
}
/** A week with something in it, every week from `fromWeekKey` to this one. */
function manyWeeks(count: number): WeekSnapshot[] {
  const spec: Record<string, Partial<DayEvents>> = {}
  const start = new Date(Date.UTC(2026, 7, 16) - (count - 1) * 7 * 86_400_000)
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 7 * 86_400_000)
    spec[d.toISOString().slice(0, 10)] = { workouts: ['A'], foodLogged: true }
  }
  return build(spec)
}

test('the summary leads the screen — Details answers "what is my week" first', () => {
  const html = sheet(build({
    '2026-08-16': { workouts: ['A'], foodLogged: true, mindSession: true },
    '2026-08-17': { workouts: ['B'], foodLogged: true },
  }))
  const summary = html.indexOf('data-testid="story-summary"')
  const weeks = html.indexOf('Week by week')
  const wall = html.indexOf('Evidence wall')
  assert.ok(summary >= 0, 'the summary card is drawn')
  assert.ok(summary < weeks && summary < wall, 'the summary comes before both histories')
})

test('week by week and the evidence wall are the other way round now', () => {
  const html = sheet(build({ '2026-08-16': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] } }))
  assert.ok(html.indexOf('Week by week') < html.indexOf('Evidence wall'))
})

test('the summary states what was actually done, per pillar', () => {
  const html = sheet(build({
    '2026-08-16': { workouts: ['A'], foodLogged: true, mindSession: true, weight: 210 },
    '2026-08-17': { workouts: ['B'], foodLogged: true, weight: 208 },
  }))
  assert.match(html, /data-testid="story-summary-training"/)
  assert.match(html, /data-testid="story-summary-fuel"/)
  assert.match(html, /data-testid="story-summary-mind"/)
  assert.match(html, /2 of 5 workouts/)
  assert.match(html, /logged 2 of 3 days/)
  assert.match(html, /down 2.0 lbs on the scale/)
})

test('week by week shows four weeks and a control for the rest', () => {
  const weeks = manyWeeks(9)
  assert.equal(weeks.length, 9)
  const html = sheet(weeks)
  assert.equal(html.match(/data-testid="details-week-row"/g)?.length, 4)
  assert.match(html, /data-testid="details-weeks-more"/)
  assert.match(html, /Show 5 more weeks/)
})

test('a member with four weeks or fewer is not offered a control', () => {
  const html = sheet(manyWeeks(4))
  assert.equal(html.match(/data-testid="details-week-row"/g)?.length, 4)
  assert.doesNotMatch(html, /details-weeks-more/)
})

test('no wins yet still reads as an invitation, not a broken list', () => {
  const html = sheet(build({ '2026-08-16': { workouts: ['A'] } }))
  assert.match(html, /No wins banked yet/)
  assert.doesNotMatch(html, /details-wins-more/)
})

test('the recommendations render one link each, coloured by pillar, in the order given', () => {
  const steps: NextStep[] = [
    { pillar: 'fuel', suggestion: { key: 'nutrition.behind', title: 'Behind pace by 2 lbs', sub: 'A tighter week gets you back.', severity: 'warn', url: '/dashboard/nutrition/goals' } },
    { pillar: 'training', suggestion: { key: 'training.week-tight', title: '2 more by Saturday', sub: 'No spare days.', severity: 'nudge', url: '/dashboard/workout' } },
  ]
  const html = renderToStaticMarkup(<StoryNextSteps steps={steps} onClose={() => {}} />)
  assert.match(html, /What to do next/)
  assert.match(html, /Behind pace by 2 lbs/)
  assert.match(html, /href="\/dashboard\/nutrition\/goals"/)
  assert.match(html, /2 more by Saturday/)
  assert.match(html, /href="\/dashboard\/workout"/)
  assert.ok(html.indexOf('Behind pace') < html.indexOf('2 more by Saturday'))
})

test('nothing to recommend draws nothing at all', () => {
  assert.equal(renderToStaticMarkup(<StoryNextSteps steps={[]} onClose={() => {}} />), '')
})
