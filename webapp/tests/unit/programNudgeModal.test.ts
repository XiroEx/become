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
  nudgeShowings,
  offersDontShowAgain,
  parseLegacyNudgeState,
  recordNudgeDismiss,
  recordNudgeDismissForever,
  recordNudgeShown,
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
  // First showing: they have not seen it yet, so no invitation to suppress it.
  assert.equal(offersDontShowAgain(0), false)
  // Second showing — one sighting behind them. This is the card.
  assert.equal(offersDontShowAgain(1), true)
  for (const n of [2, 3, 7, 42]) {
    assert.equal(offersDontShowAgain(n), true, `showing after ${n} sightings`)
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
  assert.ok(Number.isFinite(new Date(wild!.lastDismissedAt!).getTime()))

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


// ── Showings, not dismissals ──────────────────────────────────────────────────
//
// THE SECOND HALF OF THE SAME BUG. Moving the record onto the account fixed
// where it was stored; it did not fix WHAT was stored. Only the two buttons and
// the backdrop wrote anything, so a member who left the modal any other way —
// backgrounded the installed PWA, killed it, reloaded the page — had nothing
// recorded at all. Two consequences, and the card is both: the nudge was due
// again on the very next dashboard load (no dismissal, so no backoff to serve),
// and it came back with `dismissCount: 0` every time, so the opt-out it gates
// on could never appear. "The second time this pops up" was never reached, no
// matter how many times it popped up.

test('a showing that is never dismissed still counts', () => {
  const afterFirst = recordNudgeShown(null)
  assert.equal(nudgeShowings(afterFirst), 1)
  assert.equal(afterFirst.dismissCount, 0, 'being shown is not being dismissed')
  assert.equal(
    offersDontShowAgain(nudgeShowings(afterFirst)),
    true,
    'the NEXT showing must offer the way out, dismissal or not',
  )
})

test('an un-dismissed showing starts the backoff, so it is not due again on the next load', () => {
  const shown = recordNudgeShown(null)
  assert.equal(shouldShowNudge(shown), false, 'it must not reappear the moment the page reloads')

  const aDayLater = { ...shown, lastShownAt: new Date(Date.now() - (DAY + 1000)).toISOString() }
  assert.equal(shouldShowNudge(aDayLater), true)
  assert.equal(offersDontShowAgain(nudgeShowings(aDayLater)), true)
})

test('showings compound the same way dismissals do', () => {
  let state = recordNudgeShown(null)
  for (const expected of [2, 3, 4]) {
    state = recordNudgeShown(state)
    assert.equal(nudgeShowings(state), expected)
  }
  // Four sightings → a 8-day wait (2^3), measured from the last one.
  state = { ...state, lastShownAt: new Date(Date.now() - (7 * DAY)).toISOString() }
  assert.equal(shouldShowNudge(state), false)
  state = { ...state, lastShownAt: new Date(Date.now() - (8 * DAY + 1000)).toISOString() }
  assert.equal(shouldShowNudge(state), true)
})

test('nudgeShowings: a legacy record that only ever counted dismissals keeps its credit', () => {
  // A dismissal implies a sighting, so a row written before showings existed
  // must not be demoted to zero and re-nagged from scratch.
  assert.equal(nudgeShowings({ dismissCount: 3, lastDismissedAt: new Date().toISOString() }), 3)
  assert.equal(nudgeShowings(null), 0)
  assert.equal(nudgeShowings({ dismissCount: 0, shownCount: 2 }), 2)
  // Whichever is higher wins — the two are written by different events.
  assert.equal(nudgeShowings({ dismissCount: 5, shownCount: 2 }), 5)
})

test('recordNudgeShown never clears an opt-out or a dismissal already recorded', () => {
  const optedOut = recordNudgeDismissForever(null)
  const shownAnyway = recordNudgeShown(optedOut)
  assert.equal(shownAnyway.dontShowAgain, true)
  assert.equal(shouldShowNudge(shownAnyway), false, 'a stray showing must not undo "never again"')

  const dismissed = recordNudgeDismiss(null)
  const thenShown = recordNudgeShown(dismissed)
  assert.equal(thenShown.dismissCount, 1)
  assert.equal(nudgeShowings(thenShown), 2)
})

test('a dismissal counts as a sighting too, for a browser whose "shown" write never landed', () => {
  // The showing is recorded from a fire-and-forget POST. If it is lost, the
  // dismissal that follows must still move the member off zero.
  const dismissed = recordNudgeDismiss(null)
  assert.equal(nudgeShowings(dismissed), 1)
})

test('the backoff reads whichever contact is more recent', () => {
  // A dismissal is stamped a beat after the showing it ends; a lone showing has
  // no dismissal stamp at all. Either one on its own must anchor the wait.
  const shownRecentlyDismissedLongAgo: NudgeState = {
    dismissCount: 1,
    lastDismissedAt: new Date(Date.now() - 40 * DAY).toISOString(),
    shownCount: 1,
    lastShownAt: new Date(Date.now() - 1000).toISOString(),
  }
  assert.equal(shouldShowNudge(shownRecentlyDismissedLongAgo), false)

  const bothLongAgo: NudgeState = {
    dismissCount: 1,
    lastDismissedAt: new Date(Date.now() - 40 * DAY).toISOString(),
    shownCount: 1,
    lastShownAt: new Date(Date.now() - 40 * DAY).toISOString(),
  }
  assert.equal(shouldShowNudge(bothLongAgo), true)
})

test('parseLegacyNudgeState: carries a mirrored showing record, and clamps it', () => {
  const stamp = new Date(Date.now() - 2 * DAY).toISOString()
  const parsed = parseLegacyNudgeState(
    JSON.stringify({ dismissCount: 0, shownCount: 2, lastShownAt: stamp }),
  )
  assert.equal(parsed?.shownCount, 2)
  assert.equal(parsed?.lastShownAt, stamp)
  assert.equal(
    parsed?.lastDismissedAt,
    undefined,
    'a record that was only ever shown must not be given a fake dismissal stamp',
  )
  assert.equal(nudgeShowings(parsed), 2)

  const wild = parseLegacyNudgeState(JSON.stringify({ dismissCount: 0, shownCount: -4 }))
  assert.equal(wild?.shownCount, 0)
})
