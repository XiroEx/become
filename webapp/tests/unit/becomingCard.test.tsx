// Run with: npm run test:file tests/unit/becomingCard.test.tsx
//
// The rendered half of the Becoming card rework. The pure decisions live in
// lib/becoming/signals (tests/unit/becomingSignals.test.ts); this pins that the
// card actually draws them — no Sun→Sat dots, no fixed pillar rows and so no
// "0 sessions", a lead highlight that changes with the week, a visible change
// against last week, and one tappable invitation — and that the details sheet
// opens on Story.

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

test('a member who did Mind last week and none this week is not told "0 sessions"', () => {
  // The report on the card: Mind is still "in use" (last week), so the old
  // fixed table printed a Mind row with a zero in it.
  const html = card({
    '2026-08-09': { workouts: ['A'], mindSession: true }, '2026-08-11': { mindSession: true },
    '2026-08-16': { workouts: ['C'] }, '2026-08-17': { workouts: ['D'] },
  })
  assert.doesNotMatch(html, /week-card-row-/, 'there are no fixed pillar rows any more')
  assert.doesNotMatch(html, /\b0 (Mind )?sessions?\b/)
  assert.doesNotMatch(html, /week-card-hl-sessions/)
})

test('the card leads with the week\'s biggest thing, drawn large, and the rest behind it', () => {
  // Frozen week one: "Where it started", so a PR is the card's to tell.
  const html = card({
    '2026-08-09': { workouts: ['A'], prs: [{ name: 'Bench', e1RM: 225 }], foodLogged: true },
    '2026-08-10': { workouts: ['B'], foodLogged: true },
    '2026-08-16': { workouts: ['C'] },
  }, 0)
  assert.match(html, /data-testid="week-card-highlights"/)
  assert.match(html, /data-testid="week-card-hl-prs" data-lead="true"/)
  assert.match(html, /Bench · new best/)
  assert.match(html, /week-card-hl-workouts/)
  // The PR is not listed a second time in a trophy line under the highlights.
  assert.equal(html.match(/Bench/g)?.length, 1)
})

test('a PR the headline already announced is not drawn again underneath it', () => {
  const html = card({
    '2026-08-02': { workouts: ['A'] },
    '2026-08-09': { workouts: ['A'] }, '2026-08-10': { workouts: ['B'], prs: [{ name: 'Preacher Curl', e1RM: 120 }] },
    '2026-08-16': { workouts: ['C'] },
  }, 1)
  assert.match(html, /New best: Preacher Curl/)
  assert.doesNotMatch(html, /week-card-hl-prs/)
  assert.equal(html.match(/Preacher Curl/g)?.length, 1)
})

test('the change against last week is drawn, and named so it means something', () => {
  // Last week 1 workout by Tuesday, this week 2 → "+1 workout vs last week",
  // because the headline ("2 down, 3 to go") already said the 2.
  const html = card({
    '2026-08-09': { workouts: ['A'] },
    '2026-08-16': { workouts: ['B'] }, '2026-08-17': { workouts: ['C'] },
  })
  assert.match(html, /2 down, 3 to go/)
  assert.match(html, /\+1/)
  assert.match(html, /workout vs last week/)
  assert.match(html, /vs the same days last week/)
})

test('a counted fact that moved carries an arrow chip', () => {
  const weeks = buildWeeks({
    days: new Map(Object.entries({
      '2026-08-09': { ...emptyDay(), mindSession: true },
      '2026-08-16': { ...emptyDay(), mindSession: true, workouts: ['A'] }, '2026-08-17': { ...emptyDay(), workouts: ['B'] },
    })),
    todayKey: '2026-08-18', weeklyTarget: null, logTarget: 5, proteinTarget: 5,
    targetWeight: null, weightUnit: 'lbs', direction: null, identity: null,
  })
  const i = weeks.length - 1
  const html = renderToStaticMarkup(
    <WeekCard
      week={weeks[i]} signals={weekSignals(weeks, i, 'lbs')} unit="lbs" width={330} height={520}
      focused landed compact={false} exitEdge={null} totalWeeks={weeks.length} identity={null} reduced
    />,
  )
  assert.match(html, /week-card-delta-up/)
  assert.match(html, /up 2 from last week/)
})

test('a first week has nothing to compare against, so no chip and no caption', () => {
  const html = card({ '2026-08-16': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] } })
  assert.doesNotMatch(html, /week-card-delta-/)
  assert.doesNotMatch(html, /vs the same days last week/)
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

test('an "away" card carries no highlights at all', () => {
  const weeks = build({ '2026-07-05': { workouts: ['x'] }, '2026-08-17': { foodLogged: true } })
  const gap = weeks.findIndex(w => !!w.gap)
  assert.ok(gap > 0)
  const html = renderToStaticMarkup(
    <WeekCard
      week={weeks[gap]} signals={weekSignals(weeks, gap, 'lbs')} unit="lbs" width={330} height={520}
      focused landed compact={false} exitEdge={null} totalWeeks={weeks.length} identity={null} reduced
    />,
  )
  assert.doesNotMatch(html, /week-card-highlights/)
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
