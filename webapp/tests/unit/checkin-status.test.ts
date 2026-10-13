// Run with: npm run test:file tests/unit/checkin-status.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkInDecision,
  PARTIAL_SUPPRESS_HOURS,
} from '../../lib/checkin/status'

const NOW = new Date('2026-08-05T15:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000)

test('the partial window is 8 hours', () => {
  assert.equal(PARTIAL_SUPPRESS_HOURS, 8)
})

test('both halves logged closes the check-in for the day', () => {
  // The original complaint: members who saved a check-in got asked again the
  // same day. A complete check-in must not be re-shown at ANY later hour.
  for (const h of [0, 1, 8, 9, 23]) {
    const d = checkInDecision(
      {
        moodLoggedToday: true,
        weightLoggedToday: true,
        skippedToday: false,
        lastShownAt: hoursAgo(h),
      },
      NOW,
    )
    assert.equal(d.due, false, `re-prompted ${h}h after a complete check-in`)
    assert.equal(d.reason, 'complete')
    assert.equal(d.complete, true)
  }
})

test('weight without mood is NOT a complete check-in', () => {
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: true,
      skippedToday: false,
      lastShownAt: hoursAgo(9),
    },
    NOW,
  )
  assert.equal(d.complete, false)
  assert.equal(d.due, true, 'the missing mood should still be asked for')
})

test('a partial check-in is throttled for exactly 8 hours, then may ask again', () => {
  const partial = (h: number) =>
    checkInDecision(
      {
        moodLoggedToday: false,
        weightLoggedToday: true,
        skippedToday: false,
        lastShownAt: hoursAgo(h),
      },
      NOW,
    )

  assert.equal(partial(0).due, false)
  assert.equal(partial(7.9).due, false)
  assert.equal(partial(7.9).reason, 'throttled')
  assert.equal(partial(8).due, true, 'the 8h boundary is inclusive')
  assert.equal(partial(20).due, true)
})

test('"Skip for Today" means the whole day, not 8 hours', () => {
  // This is the button members pressed and then saw the modal again.
  for (const h of [0, 8, 9, 23]) {
    const d = checkInDecision(
      {
        moodLoggedToday: false,
        weightLoggedToday: false,
        skippedToday: true,
        lastShownAt: hoursAgo(h),
      },
      NOW,
    )
    assert.equal(d.due, false, `re-prompted ${h}h after Skip for Today`)
    assert.equal(d.reason, 'skipped')
  }
})

test('a member who has done nothing today is due', () => {
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: false,
      skippedToday: false,
      lastShownAt: null,
    },
    NOW,
  )
  assert.equal(d.due, true)
  assert.equal(d.reason, 'due')
})

test('a clock that moved backwards does not pin the prompt shut', () => {
  // A device whose time jumped forward and back can leave lastShownAt in the
  // future. Treating that as "0 hours elapsed" would suppress the check-in
  // until real time caught up.
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: false,
      skippedToday: false,
      lastShownAt: new Date(NOW.getTime() + 72 * 60 * 60 * 1000),
    },
    NOW,
  )
  assert.equal(d.due, true)
})

test('lastShownAt accepts the ISO strings that come back over JSON', () => {
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: false,
      skippedToday: false,
      lastShownAt: hoursAgo(1).toISOString(),
    },
    NOW,
  )
  assert.equal(d.due, false)
  assert.equal(d.reason, 'throttled')
})

test('an unparseable lastShownAt fails open rather than hiding the check-in', () => {
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: false,
      skippedToday: false,
      lastShownAt: 'not a date',
    },
    NOW,
  )
  assert.equal(d.due, true)
})

test('at most 3 prompts a day was the old behaviour; complete/skip now cap it at 1', () => {
  // Regression guard on the actual member-facing number. With a 24h day and an
  // 8h window and nothing closing the loop, the old rule allowed 24/8 = 3.
  // Under the new rule a member who completes or skips sees it once.
  let prompts = 0
  let lastShownAt: Date | null = null
  const skippedToday = true
  for (let h = 0; h < 24; h++) {
    const at = new Date(NOW.getTime() + h * 60 * 60 * 1000)
    const d = checkInDecision(
      { moodLoggedToday: false, weightLoggedToday: false, skippedToday: h > 0 && skippedToday, lastShownAt },
      at,
    )
    if (d.due) {
      prompts++
      lastShownAt = at
    }
  }
  assert.equal(prompts, 1, 'a member who skips should be asked once per day')
})

// ─── the 8-hour floor holds across the check-in day boundary ────────────────
//
// George's report on 2026-08-19: he opened the app repeatedly all day and
// never saw the check-in. The first fix for that shipped a day-boundary
// override — "the first ask of a new check-in day always fires, even under
// 8h since the last one" — but George flagged that this can violate "never
// within 8 hours of the last one" when the last showing landed shortly
// before the check-in day's 4am rollover. The rule is corrected here:
// `lastShownAt` alone gates the throttle, with no day-boundary exception, so
// a stamp minutes before a day rolls over still buys the full 8 hours.

test('a stamp minutes before the check-in day rolls over still buys the full 8 hours', () => {
  // e.g. shown at 11:55pm — 10 minutes ago from "now", which is just past
  // the check-in day's 4am rollover. Must NOT fire again yet.
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: false,
      skippedToday: false,
      lastShownAt: new Date(NOW.getTime() - 10 * 60 * 1000),
    },
    NOW,
  )
  assert.equal(d.due, false)
  assert.equal(d.reason, 'throttled')
})

test('once 8 hours have passed, the next ask fires even on the same check-in day', () => {
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: false,
      skippedToday: false,
      lastShownAt: hoursAgo(8),
    },
    NOW,
  )
  assert.equal(d.due, true)
  assert.equal(d.reason, 'due')
})

test('never having been shown before is always due, day boundary or not', () => {
  const d = checkInDecision(
    {
      moodLoggedToday: false,
      weightLoggedToday: false,
      skippedToday: false,
      lastShownAt: null,
    },
    NOW,
  )
  assert.equal(d.due, true)
  assert.equal(d.reason, 'due')
})
