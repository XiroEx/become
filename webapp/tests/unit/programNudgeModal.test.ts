// Run with: npm run test:file tests/unit/programNudgeModal.test.ts
//
// The pure backoff/opt-out logic behind components/ProgramNudgeModal.tsx: an
// exponential-backoff re-show cadence (1 → 2 → 4 → 8 → 16 days, capped), plus
// a permanent "don't show this again" opt-out offered once the nudge has
// already been dismissed DONT_SHOW_AGAIN_THRESHOLD times.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DONT_SHOW_AGAIN_THRESHOLD,
  recordNudgeDismiss,
  recordNudgeDismissForever,
  shouldShowNudge,
  type NudgeState,
} from '../../components/ProgramNudgeModal'

const DAY = 24 * 60 * 60 * 1000

function stateAt(dismissCount: number, msAgo: number, dontShowAgain?: boolean): NudgeState {
  return {
    dismissCount,
    lastDismissedAt: new Date(Date.now() - msAgo).toISOString(),
    ...(dontShowAgain !== undefined ? { dontShowAgain } : {}),
  }
}

test('shouldShowNudge: a member who has never seen it gets it immediately', () => {
  assert.equal(shouldShowNudge(null), true)
})

test('shouldShowNudge: backoff waits double the previous interval each time, capped at 16 days', () => {
  // dismissCount 1 → wait 1 day
  assert.equal(shouldShowNudge(stateAt(1, DAY - 1000)), false)
  assert.equal(shouldShowNudge(stateAt(1, DAY + 1000)), true)
  // dismissCount 2 → wait 2 days
  assert.equal(shouldShowNudge(stateAt(2, 2 * DAY - 1000)), false)
  assert.equal(shouldShowNudge(stateAt(2, 2 * DAY + 1000)), true)
  // dismissCount 5 → wait 16 days (2^4=16, still under the cap)
  assert.equal(shouldShowNudge(stateAt(5, 16 * DAY - 1000)), false)
  assert.equal(shouldShowNudge(stateAt(5, 16 * DAY + 1000)), true)
  // dismissCount 10 → still capped at 16 days, not 2^9
  assert.equal(shouldShowNudge(stateAt(10, 16 * DAY + 1000)), true)
})

test('shouldShowNudge: dontShowAgain permanently suppresses it regardless of elapsed time', () => {
  assert.equal(shouldShowNudge(stateAt(2, 1000, true)), false)
  assert.equal(shouldShowNudge(stateAt(2, 999 * DAY, true)), false)
})

test('recordNudgeDismiss increments the count and never sets dontShowAgain', () => {
  const first = recordNudgeDismiss(null)
  assert.equal(first.dismissCount, 1)
  assert.equal(first.dontShowAgain, undefined)

  const second = recordNudgeDismiss(first)
  assert.equal(second.dismissCount, 2)
  assert.equal(second.dontShowAgain, undefined)
})

test('recordNudgeDismissForever sets dontShowAgain without inflating dismissCount', () => {
  const current = stateAt(3, DAY)
  const forever = recordNudgeDismissForever(current)
  assert.equal(forever.dontShowAgain, true)
  assert.equal(forever.dismissCount, 3) // preserved, not incremented
  assert.equal(shouldShowNudge(forever), false)
})

test('recordNudgeDismissForever from a fresh (null) state still opts out permanently', () => {
  const forever = recordNudgeDismissForever(null)
  assert.equal(forever.dontShowAgain, true)
  assert.equal(forever.dismissCount, 0)
  assert.equal(shouldShowNudge(forever), false)
})

test('DONT_SHOW_AGAIN_THRESHOLD is 2 — the option appears starting on the 3rd showing', () => {
  assert.equal(DONT_SHOW_AGAIN_THRESHOLD, 2)
})
