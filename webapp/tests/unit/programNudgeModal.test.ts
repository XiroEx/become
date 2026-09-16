// Run with: npm run test:file tests/unit/programNudgeModal.test.ts
//
// The pure backoff/opt-out logic behind components/ProgramNudgeModal.tsx: an
// exponential-backoff re-show cadence (1 → 2 → 4 → 8 → 16 days, capped), plus
// a permanent "don't show this again" opt-out offered once the nudge has
// already been dismissed DONT_SHOW_AGAIN_THRESHOLD times.
//
// Imported through the component, which re-exports lib/programNudge — the rules
// moved there so the API route that now owns this state can share them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DONT_SHOW_AGAIN_THRESHOLD,
  offersDontShowAgain,
  parseLegacyNudgeState,
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

// ── The opt-out is offered on the SECOND showing ──────────────────────────────
//
// It used to be gated at 2 prior dismissals, so the earliest it could appear
// was the THIRD showing. Combined with the backoff that is at best three days
// and two dismissals after the first sighting — and, before the record moved
// onto the account, usually never, because localStorage rarely survived the
// 2-then-4-day gaps. The reported symptom was exactly this: the nudge came back
// a second time with no way to stop it.

test('DONT_SHOW_AGAIN_THRESHOLD is 1 — the option appears from the 2nd showing on', () => {
  assert.equal(DONT_SHOW_AGAIN_THRESHOLD, 1)
})

test('offersDontShowAgain: hidden on the first showing, shown on every one after', () => {
  // First showing: nothing dismissed yet, so no invitation to suppress it.
  assert.equal(offersDontShowAgain(0), false)
  // Second showing — one dismissal behind them. This is the card.
  assert.equal(offersDontShowAgain(1), true)
  for (const n of [2, 3, 7, 42]) {
    assert.equal(offersDontShowAgain(n), true, `showing after ${n} dismissals`)
  }
})

test('one dismissal then the backoff elapsing puts the opt-out on screen', () => {
  // The whole reported journey, end to end through the pure rules.
  const afterFirst = recordNudgeDismiss(null)
  assert.equal(afterFirst.dismissCount, 1)

  // A day later it is due again — and this time it offers the way out.
  const due = { ...afterFirst, lastDismissedAt: new Date(Date.now() - (DAY + 1000)).toISOString() }
  assert.equal(shouldShowNudge(due), true)
  assert.equal(offersDontShowAgain(due.dismissCount), true)

  // Taking it is final.
  assert.equal(shouldShowNudge(recordNudgeDismissForever(due)), false)
})

// ── Reading the legacy localStorage record ────────────────────────────────────

test('parseLegacyNudgeState: junk, empty and missing all read as "nothing stored"', () => {
  assert.equal(parseLegacyNudgeState(null), null)
  assert.equal(parseLegacyNudgeState(''), null)
  assert.equal(parseLegacyNudgeState('not json'), null)
  assert.equal(parseLegacyNudgeState('null'), null)
  assert.equal(parseLegacyNudgeState('"a string"'), null)
})

test('parseLegacyNudgeState: a real record survives intact', () => {
  const stamp = new Date(Date.now() - 3 * DAY).toISOString()
  const parsed = parseLegacyNudgeState(
    JSON.stringify({ dismissCount: 2, lastDismissedAt: stamp, dontShowAgain: true }),
  )
  assert.deepEqual(parsed, { dismissCount: 2, lastDismissedAt: stamp, dontShowAgain: true })
})

test('parseLegacyNudgeState: clamps a nonsense count and repairs a bad timestamp', () => {
  const wild = parseLegacyNudgeState(
    JSON.stringify({ dismissCount: 1e9, lastDismissedAt: 'never' }),
  )
  assert.equal(wild?.dismissCount, 99)
  assert.ok(Number.isFinite(new Date(wild!.lastDismissedAt).getTime()))

  const negative = parseLegacyNudgeState(JSON.stringify({ dismissCount: -5 }))
  assert.equal(negative?.dismissCount, 0)
})

test('parseLegacyNudgeState: only a literal true is an opt-out', () => {
  // A truthy-but-not-true value must not silently suppress the modal forever.
  const sneaky = parseLegacyNudgeState(
    JSON.stringify({ dismissCount: 1, dontShowAgain: 'yes' }),
  )
  assert.equal(sneaky?.dontShowAgain, undefined)
})

// ── Timestamp robustness ──────────────────────────────────────────────────────

test('shouldShowNudge: an unparseable timestamp shows the nudge rather than reading as 1970', () => {
  // Epoch-0 would make `daysSince` enormous and the nudge permanently due; a
  // one-off show is the honest answer to "we do not know when we last asked".
  assert.equal(shouldShowNudge({ dismissCount: 3, lastDismissedAt: 'garbage' }), true)
})
