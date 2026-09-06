// Run with: npm run test:file tests/unit/streakTile.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streakPages, superAtRisk, superMissing, type StreaksLite } from '../../lib/streaks/tile'

const base = (over: Partial<StreaksLite['pillars']> = {}, overall: Partial<StreaksLite['overall']> = {}): StreaksLite => ({
  overall: { current: 5, best: 18, nextMilestone: 7, activeToday: true, freezes: 1, ...overall },
  pillars: {
    workout: { unit: 'days', current: 10, best: 10, thisWeek: 1, target: 5, weekLost: false },
    nutrition: { current: 4, best: 9, activeToday: true },
    mindset: { current: 6, best: 17, activeToday: true },
    super: { current: 4, best: 4, activeToday: false, today: { nutrition: true, mindset: false, trained: true, restDay: false, weekOnTrack: true } },
    ...over,
  },
})

test('the super streak leads the tile and is the emphasised page', () => {
  const p = streakPages(base())
  assert.equal(p[0].id, 'super'); assert.equal(p[0].emphasis, true)
  assert.equal(p[0].value, '4'); assert.equal(p[0].unit, 'days')
  assert.equal(p[0].footer, 'Today: check in')
  assert.equal(p[1].id, 'overall')
  assert.deepEqual(p.map(x => x.id), ['super', 'overall', 'workout', 'nutrition', 'mindset'])
  assert.deepEqual(p.map(x => x.label), ['Super Streak', 'Day Streak', 'Workout', 'Nutrition', 'Mindset'], 'short labels leave room for the dots')
  assert.equal(p[2].fullLabel, 'Workout streak')
})

test('the workout footer names "workouts", so days-on-track never reads as workouts done', () => {
  // current is a day-on-track count and can run ahead of thisWeek, the actual
  // completed-workout count — the compact tile is the one place a member sees
  // the number with no page of explanation around it, so the footer has to
  // carry the distinction on its own.
  const onTrack = streakPages(base({ workout: { unit: 'days', current: 3, best: 3, thisWeek: 2, target: 3, weekLost: false } }))
  const workout = onTrack.find(p => p.id === 'workout')!
  assert.equal(workout.value, '3')
  assert.equal(workout.footer, '2/3 workouts this week')

  const lost = streakPages(base({ workout: { unit: 'days', current: 4, best: 4, thisWeek: 1, target: 3, weekLost: true } }))
  assert.equal(lost.find(p => p.id === 'workout')!.footer, '1/3 workouts this week · off track')
})

test('no super streak → the day streak leads and nothing is emphasised', () => {
  const p = streakPages(base({ super: { current: 0, best: 1, activeToday: false, today: { nutrition: false, mindset: false, trained: false, restDay: false, weekOnTrack: true } } }))
  assert.equal(p[0].id, 'overall')
  assert.ok(p.every(x => !x.emphasis))
})

test('only streaks that reached the visible minimum get a page; the day streak always does', () => {
  const p = streakPages(base(
    { nutrition: { current: 2, best: 9, activeToday: false }, mindset: { current: 1, best: 17, activeToday: false }, workout: { unit: 'days', current: 0, best: 3, thisWeek: 0, target: 5, weekLost: true }, super: { current: 0, best: 1, activeToday: false, today: { nutrition: false, mindset: false, trained: false, restDay: false, weekOnTrack: false } } },
    { current: 1 },
  ))
  assert.deepEqual(p.map(x => x.id), ['overall'])
  assert.equal(p[0].value, 'Building'); assert.match(p[0].footer, /1\/3 · 2 more days/)
})

test('a complete super day reads "All three today"', () => {
  const day = { nutrition: true, mindset: true, trained: true, restDay: false, weekOnTrack: true }
  // At the record, the record is not worth the width.
  const atBest = streakPages(base({ super: { current: 6, best: 6, activeToday: true, today: day } }))
  assert.equal(atBest[0].footer, 'All three today'); assert.equal(atBest[0].doneToday, true)
  // Below it, there is something to chase.
  const chasing = streakPages(base({ super: { current: 6, best: 11, activeToday: true, today: day } }))
  assert.equal(chasing[0].footer, 'All three · best 11')
})

test('missing pieces are named, and read as a sentence', () => {
  assert.deepEqual(superMissing(base()), ['mindset'])
  const two = base({ super: { current: 5, best: 5, activeToday: false, today: { nutrition: false, mindset: false, trained: true, restDay: false, weekOnTrack: true } } })
  assert.deepEqual(superMissing(two), ['food', 'mindset'])
  assert.equal(streakPages(two)[0].footer, 'Today: log food and check in')
})

test('super at risk: only in the evening, only when it is real, and it says what saves it', () => {
  const s = base()
  assert.equal(superAtRisk(s, 12).atRisk, false, 'too early')
  assert.equal(superAtRisk(s, 22).atRisk, false, 'too late')
  const r = superAtRisk(s, 18)
  assert.equal(r.atRisk, true)
  assert.equal(r.title, 'Your 4-day super streak needs you ✨')
  assert.equal(r.body, 'Just check in today and it survives.')
  // Already complete today → nothing
  assert.equal(superAtRisk(base({ super: { current: 4, best: 4, activeToday: true, today: { nutrition: true, mindset: true, trained: true, restDay: false, weekOnTrack: true } } }), 18).atRisk, false)
  // Too short to protect
  assert.equal(superAtRisk(base({ super: { current: 2, best: 2, activeToday: false, today: { nutrition: false, mindset: false, trained: false, restDay: false, weekOnTrack: true } } }), 18).atRisk, false)
  // Two missing → both named
  assert.equal(superAtRisk(base({ super: { current: 9, best: 9, activeToday: false, today: { nutrition: false, mindset: true, trained: false, restDay: false, weekOnTrack: true } } }), 19).body, 'log food and train today and it survives.')
})

test('the at-risk push offers the freeze, but only when it is in hand', () => {
  const today = { nutrition: true, mindset: false, trained: true, restDay: false, weekOnTrack: true }
  const withFreeze = base({
    super: { current: 9, best: 9, activeToday: false, today, freeze: { available: true, returnsOn: null, usedDays: [], frozenToday: false } },
  })
  assert.equal(
    superAtRisk(withFreeze, 18).body,
    'Just check in today and it survives. Or use your one freeze to hold it.',
  )

  // Spent: the message goes back to naming only what would save it.
  const spent = base({
    super: { current: 9, best: 9, activeToday: false, today, freeze: { available: false, returnsOn: '2026-09-17', usedDays: ['2026-08-18'], frozenToday: false } },
  })
  assert.equal(superAtRisk(spent, 18).body, 'Just check in today and it survives.')

  // A payload from before freezes existed still works.
  assert.equal(superAtRisk(base({ super: { current: 9, best: 9, activeToday: false, today } }), 18).body, 'Just check in today and it survives.')
})
