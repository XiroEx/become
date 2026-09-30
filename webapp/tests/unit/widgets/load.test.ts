// Run with: npm run test:file tests/unit/widgets/load.test.ts
//
// The pure half of the widget loader: which timezone a background refresh
// happens in, and the two rollups it does by hand.
//
// Timezone is the one that bites. A widget refreshes without the member
// present, so unlike every in-app read there may be no `tz` on the request —
// and the fallback we reach for, the stored offset, is a SNAPSHOT taken the
// last time they opened the app. For a member who has gone quiet across a
// daylight-saving change it is an hour wrong, which moves the day boundary and
// makes "today" on the home screen a different day from "today" in the app.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { offsetFromZone, resolveWidgetTzOffset, sumMacros, weeksSince } from '@/lib/widgets/load'

// Mid-September and mid-January, so the same zone gives two different offsets.
const SUMMER = new Date(Date.UTC(2026, 8, 16, 15, 0, 0))
const WINTER = new Date(Date.UTC(2026, 0, 16, 15, 0, 0))

describe('offsetFromZone', () => {
  it('returns minutes WEST of UTC, matching Date.getTimezoneOffset()', () => {
    assert.equal(offsetFromZone(SUMMER, 'America/New_York'), 240) // EDT = UTC-4
    assert.equal(offsetFromZone(WINTER, 'America/New_York'), 300) // EST = UTC-5
    assert.equal(offsetFromZone(SUMMER, 'UTC'), 0)
  })

  it('handles zones east of UTC, where the offset is negative', () => {
    assert.equal(offsetFromZone(SUMMER, 'Europe/Berlin'), -120) // CEST = UTC+2
    assert.equal(offsetFromZone(WINTER, 'Europe/Berlin'), -60)  // CET  = UTC+1
  })

  it('returns null for a zone it cannot read, rather than a confident 0', () => {
    assert.equal(offsetFromZone(SUMMER, 'Not/AZone'), null)
    assert.equal(offsetFromZone(SUMMER, ''), null)
  })
})

describe('resolveWidgetTzOffset', () => {
  it('honours what the caller sent — it knows its own clock right now', () => {
    assert.equal(resolveWidgetTzOffset(-330, { timezone: 'America/New_York', timezoneOffset: 300 }, SUMMER), -330)
  })

  it('a caller-sent 0 is a real answer, not a missing one', () => {
    assert.equal(resolveWidgetTzOffset(0, { timezoneOffset: 300 }, SUMMER), 0)
  })

  // The whole reason the zone is preferred.
  it('prefers the stored ZONE over a stale stored offset across a DST change', () => {
    const stored = { timezone: 'America/New_York', timezoneOffset: 300 } // snapshot taken in winter
    assert.equal(resolveWidgetTzOffset(null, stored, SUMMER), 240)
    assert.equal(resolveWidgetTzOffset(null, stored, WINTER), 300)
  })

  it('falls back to the stored offset when there is no zone', () => {
    assert.equal(resolveWidgetTzOffset(null, { timezoneOffset: 300 }, SUMMER), 300)
  })

  it('falls back through an unreadable zone to the stored offset', () => {
    assert.equal(resolveWidgetTzOffset(null, { timezone: 'Not/AZone', timezoneOffset: 300 }, SUMMER), 300)
  })

  it('lands on UTC when the member has told us nothing', () => {
    assert.equal(resolveWidgetTzOffset(null, null, SUMMER), 0)
    assert.equal(resolveWidgetTzOffset(null, {}, SUMMER), 0)
    assert.equal(resolveWidgetTzOffset(null, undefined, SUMMER), 0)
  })
})

describe('sumMacros', () => {
  it('adds the food log and the day\'s quick-adds together', () => {
    const t = sumMacros(
      [
        { totalNutrition: { calories: 500, protein: 40, carbs: 50, fats: 15 } },
        { totalNutrition: { calories: 300, protein: 25, carbs: 30, fats: 8 } },
      ],
      [{ calories: 200, protein: 5, carbs: 25, fats: 6 }],
    )
    assert.deepEqual(t, { calories: 1000, protein: 70, carbs: 105, fats: 29, entries: 3 })
  })

  it('counts entries, so an empty day is distinguishable from a zero-calorie one', () => {
    assert.equal(sumMacros([], []).entries, 0)
    assert.equal(sumMacros([{ totalNutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 } }], []).entries, 1)
  })

  it('treats a missing macro as 0 rather than producing NaN', () => {
    const t = sumMacros([{ totalNutrition: { calories: 100 } }, {}], [{ protein: 10 }])
    assert.deepEqual(t, { calories: 100, protein: 10, carbs: 0, fats: 0, entries: 2 })
    for (const v of Object.values(t)) assert.ok(Number.isFinite(v))
  })
})

describe('weeksSince', () => {
  const tz = 0

  it('is week 1 on the day they joined, and stays week 1 for six more days', () => {
    assert.equal(weeksSince(new Date('2026-09-16T12:00:00Z'), '2026-09-16', tz), 1)
    assert.equal(weeksSince(new Date('2026-09-10T12:00:00Z'), '2026-09-16', tz), 1)
  })

  it('rolls to week 2 on the seventh day', () => {
    assert.equal(weeksSince(new Date('2026-09-09T12:00:00Z'), '2026-09-16', tz), 2)
    assert.equal(weeksSince(new Date('2026-08-05T12:00:00Z'), '2026-09-16', tz), 7)
  })

  it('returns null rather than "Week NaN" when there is nothing to count from', () => {
    assert.equal(weeksSince(null, '2026-09-16', tz), null)
    assert.equal(weeksSince(undefined, '2026-09-16', tz), null)
    assert.equal(weeksSince('not a date', '2026-09-16', tz), null)
  })

  it('returns null for a join date in the future — a clock skew must not read as week 0', () => {
    assert.equal(weeksSince(new Date('2026-09-20T12:00:00Z'), '2026-09-16', tz), null)
  })

  // A join instant late in the UTC day is still the PREVIOUS local day for a
  // member behind UTC; counting it in UTC put them a week ahead of themselves.
  it('counts the join date in the member\'s own timezone', () => {
    const joinedLateUtc = new Date('2026-09-10T02:00:00Z') // 2026-09-09 22:00 EDT
    assert.equal(weeksSince(joinedLateUtc, '2026-09-16', 240), 2)
    assert.equal(weeksSince(joinedLateUtc, '2026-09-16', 0), 1)
  })
})
