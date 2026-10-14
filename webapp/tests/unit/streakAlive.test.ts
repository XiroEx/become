// Run with: npm run test:file tests/unit/streakAlive.test.ts
//
// A member who stopped logging still saw their old streakDays forever,
// because nothing recomputed it until their next log. `isStreakAlive`
// (lib/streak.ts) is the ONE place that decides whether a stored streak
// still has a pulse — recordStreakActivity (the write path) and GET
// /api/streak (the read path) both call it, so they can never drift.
//
// These cases mirror recordStreakActivity's own fate table exactly:
//   diff === 0            → already logged today, alive
//   diff === 1            → next log extends it, alive
//   diff === 2 + a freeze → next log auto-applies the freeze, alive
//   anything else         → the next log resets it to 1; already dead

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStreakAlive } from '../../lib/streak'

const DAY_MS = 24 * 60 * 60 * 1000
const TODAY = new Date('2026-10-14T12:00:00.000Z')
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * DAY_MS)

test('active today: logged today keeps the streak alive', () => {
  assert.equal(
    isStreakAlive({ lastActivityDate: daysAgo(0), streakFreezes: 0 }, TODAY),
    true,
  )
})

test('missed exactly one day but holds a freeze: still alive, the next log will auto-apply it', () => {
  assert.equal(
    isStreakAlive({ lastActivityDate: daysAgo(2), streakFreezes: 1 }, TODAY),
    true,
  )
})

test('missed exactly one day with NO freezes left: dead — the next log would reset it', () => {
  assert.equal(
    isStreakAlive({ lastActivityDate: daysAgo(2), streakFreezes: 0 }, TODAY),
    false,
  )
})

test('one day stale (diff === 1) is always alive, freeze or not — a log tomorrow extends it, no freeze needed', () => {
  assert.equal(
    isStreakAlive({ lastActivityDate: daysAgo(1), streakFreezes: 0 }, TODAY),
    true,
  )
})

test('quiet for 7 days: dead, even holding freezes — a freeze only covers a ONE-day gap', () => {
  assert.equal(
    isStreakAlive({ lastActivityDate: daysAgo(7), streakFreezes: 3 }, TODAY),
    false,
  )
})

test('quiet for 14 days: dead', () => {
  assert.equal(
    isStreakAlive({ lastActivityDate: daysAgo(14), streakFreezes: 3 }, TODAY),
    false,
  )
})

test('a member with no progress document (no lastActivityDate at all): dead, not a crash', () => {
  assert.equal(isStreakAlive({ lastActivityDate: null, streakFreezes: 1 }, TODAY), false)
  assert.equal(isStreakAlive({ lastActivityDate: undefined, streakFreezes: 1 }, TODAY), false)
})

test('diff === 2 with exactly 0 freezes is dead, but 1 freeze is enough', () => {
  assert.equal(isStreakAlive({ lastActivityDate: daysAgo(2), streakFreezes: 0 }, TODAY), false)
  assert.equal(isStreakAlive({ lastActivityDate: daysAgo(2), streakFreezes: 1 }, TODAY), true)
})

test('accepts a stored lastActivityDate as a string, same as Mongo gives back through .lean()', () => {
  assert.equal(
    isStreakAlive({ lastActivityDate: daysAgo(1).toISOString(), streakFreezes: 0 }, TODAY),
    true,
  )
})
