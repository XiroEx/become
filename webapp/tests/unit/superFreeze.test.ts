import test from 'node:test'
import assert from 'node:assert/strict'
import {
  freezeAvailable,
  freezeReturnsOn,
  checkFreeze,
  applyFreezes,
  daysBetween,
  lastFreezeDay,
  SUPER_FREEZE_COOLDOWN_DAYS,
} from '@/lib/streaks/freeze'

const req = (over: Partial<Parameters<typeof checkFreeze>[0]> = {}) => checkFreeze({
  dayKey: '2026-08-19',
  todayKey: '2026-08-19',
  usedDays: [],
  currentStreak: 12,
  completeToday: false,
  ...over,
})

test('one freeze, and it takes a month to earn back', () => {
  assert.equal(freezeAvailable([], '2026-08-19'), true)
  assert.equal(freezeAvailable(null, '2026-08-19'), true)
  // Spent yesterday: not available.
  assert.equal(freezeAvailable(['2026-08-18'], '2026-08-19'), false)
  // Twenty-nine days later, still recharging; thirty and it is back.
  assert.equal(freezeAvailable(['2026-08-18'], '2026-09-15'), false)
  assert.equal(freezeAvailable(['2026-08-18'], '2026-09-17'), true)
  assert.equal(daysBetween('2026-08-18', '2026-09-17'), SUPER_FREEZE_COOLDOWN_DAYS)
  // The most recent spend is the one that counts.
  assert.equal(lastFreezeDay(['2026-01-02', '2026-08-18', '2026-05-05']), '2026-08-18')
})

test('it says when the freeze comes back', () => {
  assert.equal(freezeReturnsOn(['2026-08-18'], '2026-08-19'), '2026-09-17')
  assert.equal(freezeReturnsOn([], '2026-08-19'), null)
  assert.equal(freezeReturnsOn(['2026-01-01'], '2026-08-19'), null)
})

test('a freeze covers today, once, and only when there is something to save', () => {
  assert.deepEqual(req(), { ok: true })
  // Yesterday is gone; a freeze is a decision, not a rewrite of the record.
  assert.deepEqual(req({ dayKey: '2026-08-18' }), { ok: false, reason: 'not_today' })
  // Nothing to spend it on.
  assert.deepEqual(req({ completeToday: true }), { ok: false, reason: 'day_already_complete' })
  // Nothing to protect.
  assert.deepEqual(req({ currentStreak: 2 }), { ok: false, reason: 'nothing_to_protect' })
  // Not twice in a month, and not twice in a day.
  assert.deepEqual(req({ usedDays: ['2026-08-10'] }), { ok: false, reason: 'already_used' })
  assert.deepEqual(req({ usedDays: ['2026-08-19'] }), { ok: false, reason: 'already_frozen' })
})

test('a frozen day counts as a super day', () => {
  const real = new Set(['2026-08-16', '2026-08-17', '2026-08-19'])
  // The 18th was missed and frozen: the run is unbroken through the 19th.
  const withFreeze = applyFreezes(real, ['2026-08-18'])
  assert.equal(withFreeze.has('2026-08-18'), true)
  assert.equal(withFreeze.size, 4)
  // Nothing frozen leaves the set exactly as it was.
  assert.equal(applyFreezes(real, []), real)
  assert.equal(applyFreezes(real, undefined), real)
})
