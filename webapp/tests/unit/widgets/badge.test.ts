// Run with: npm run test:file tests/unit/widgets/badge.test.ts
//
// The app-icon badge is the one piece of a home-screen WIDGET a web app can
// actually draw, and it is the least observable thing in the product: it is a
// number on an icon, on a phone, outside the browser, that nobody can see in a
// test run or a screenshot. Two failures would both be silent —
//
//   1. counting the wrong widgets, so the icon says "2" on a day the member
//      owes nothing (or "0 unread" forever, which trains people to ignore it);
//   2. calling setAppBadge(0), which the spec draws as a dot rather than
//      nothing — a finished day that still looks like an unread notification.
//
// so both are pinned here.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildWidgetFeed, badgeCountFor, type WidgetFeedInput } from '@/lib/widgets/feed'
import { applyAppBadge, badgeSupported, clearAppBadge, type BadgeCapableNavigator } from '@/lib/widgets/badge'

const ROOT = path.join(__dirname, '../../..')
const NOW = Date.UTC(2026, 8, 16, 15, 0, 0)

function input(over: Partial<WidgetFeedInput> = {}): WidgetFeedInput {
  return {
    todayKey: '2026-09-16',
    now: NOW,
    streak: { current: 5, longest: 12, activityToday: true },
    nutrition: {
      calories: 1200, protein: 90, carbs: 130, fats: 40,
      targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 },
      entries: 3,
    },
    mind: {
      chapter: 2, chapterName: 'Momentum', sessionDoneToday: false,
      sessionAvailable: true, sessionsIntoChapter: 4, sessionsPerChapter: 10,
    },
    becoming: { week: 6, identity: null, chapterName: 'Momentum', workoutsThisWeek: 2, weeklyTarget: 4 },
    training: { title: 'Upper Body Strength', completedToday: false, restDay: false },
    ...over,
  }
}

/** A navigator that records what it was asked to draw. */
function fakeNav(opts: { throws?: boolean } = {}) {
  const calls: Array<{ kind: 'set' | 'clear'; count?: number }> = []
  const nav: BadgeCapableNavigator = {
    setAppBadge: async (count?: number) => {
      if (opts.throws) throw new Error('NotAllowedError')
      calls.push({ kind: 'set', count })
    },
    clearAppBadge: async () => {
      if (opts.throws) throw new Error('NotAllowedError')
      calls.push({ kind: 'clear' })
    },
  }
  return { nav, calls }
}

describe('what the badge counts', () => {
  it('counts the daily commitments still open', () => {
    // Nothing logged, a session waiting, Mind ready: three things owed.
    const feed = buildWidgetFeed(input({
      nutrition: {
        calories: 0, protein: 0, carbs: 0, fats: 0,
        targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 },
        entries: 0,
      },
    }))
    assert.equal(feed.badgeCount, 3)
  })

  it('is 0 on a finished day, so the icon goes clean', () => {
    const feed = buildWidgetFeed(input({
      mind: {
        chapter: 2, chapterName: 'Momentum', sessionDoneToday: true,
        sessionAvailable: false, sessionsIntoChapter: 5, sessionsPerChapter: 10,
      },
      training: { title: 'Upper Body Strength', completedToday: true, restDay: false },
    }))
    assert.equal(feed.badgeCount, 0)
  })

  it('never counts the streak, which is a consequence of the other three', () => {
    // A member with a live streak who has logged nothing today: the streak
    // widget is 'at-risk', but the three tasks that would save it are already
    // being counted. Counting it too would say 4 things are owed when 3 are.
    const feed = buildWidgetFeed(input({
      streak: { current: 9, longest: 12, activityToday: false },
      nutrition: {
        calories: 0, protein: 0, carbs: 0, fats: 0,
        targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 },
        entries: 0,
      },
    }))
    const streak = feed.widgets.find((w) => w.key === 'streak')
    assert.equal(streak?.state, 'at-risk')
    assert.equal(feed.badgeCount, 3)
  })

  it('never counts Becoming, which stays open all week', () => {
    // Everything today is done; Becoming is mid-week and therefore 'todo'. The
    // badge must be clear, or it would be stuck at 1 for days at a time.
    const feed = buildWidgetFeed(input({
      becoming: { week: 6, identity: null, chapterName: 'Momentum', workoutsThisWeek: 1, weeklyTarget: 4 },
      mind: {
        chapter: 2, chapterName: 'Momentum', sessionDoneToday: true,
        sessionAvailable: false, sessionsIntoChapter: 5, sessionsPerChapter: 10,
      },
      training: { title: 'Upper Body Strength', completedToday: true, restDay: false },
    }))
    const becoming = feed.widgets.find((w) => w.key === 'becoming')
    assert.equal(becoming?.state, 'todo')
    assert.equal(feed.badgeCount, 0)
  })

  it('does not count what the member cannot do — rest day, Mind cooldown', () => {
    const feed = buildWidgetFeed(input({
      training: { title: null, completedToday: false, restDay: true },
      mind: {
        chapter: 2, chapterName: 'Momentum', sessionDoneToday: false,
        sessionAvailable: false, sessionsIntoChapter: 4, sessionsPerChapter: 10,
      },
      nutrition: {
        calories: 1800, protein: 140, carbs: 190, fats: 60,
        targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 },
        entries: 4,
      },
    }))
    assert.equal(feed.badgeCount, 0)
  })

  it('never exceeds the three daily widgets', () => {
    const feed = buildWidgetFeed(input({
      streak: { current: 0, longest: 0, activityToday: false },
      nutrition: {
        calories: 0, protein: 0, carbs: 0, fats: 0,
        targets: { calories: null, protein: null, carbs: null, fats: null },
        entries: 0,
      },
      becoming: { week: null, identity: null, chapterName: null, workoutsThisWeek: 0, weeklyTarget: null },
    }))
    assert.ok(feed.badgeCount <= 3, `badge was ${feed.badgeCount}`)
    assert.equal(badgeCountFor(feed.widgets), feed.badgeCount)
  })
})

describe('drawing it', () => {
  it('sets a positive count', async () => {
    const { nav, calls } = fakeNav()
    assert.equal(await applyAppBadge(2, nav), true)
    assert.deepEqual(calls, [{ kind: 'set', count: 2 }])
  })

  it('CLEARS at zero rather than setting 0 (which renders as a dot)', async () => {
    const { nav, calls } = fakeNav()
    await applyAppBadge(0, nav)
    assert.deepEqual(calls, [{ kind: 'clear' }])
  })

  it('clamps nonsense instead of passing it to the platform', async () => {
    const { nav, calls } = fakeNav()
    await applyAppBadge(-4, nav)
    await applyAppBadge(Number.NaN, nav)
    await applyAppBadge(2.7, nav)
    assert.deepEqual(calls, [{ kind: 'clear' }, { kind: 'clear' }, { kind: 'set', count: 2 }])
  })

  it('is a no-op where the API does not exist, rather than throwing', async () => {
    assert.equal(badgeSupported({}), false)
    assert.equal(badgeSupported(null), false)
    assert.equal(await applyAppBadge(3, {}), false)
    assert.equal(await applyAppBadge(3, null), false)
  })

  it('swallows a rejected permission — a badge may never break a page', async () => {
    const { nav } = fakeNav({ throws: true })
    // setAppBadge rejects with NotAllowedError for anyone who has not granted
    // notifications, which is most people. It must not surface.
    assert.equal(await applyAppBadge(3, nav), false)
    assert.equal(await clearAppBadge(nav), false)
  })
})

describe('the service worker copy', () => {
  // public/sw.js cannot be imported by the test runner (it is a worker script
  // served verbatim), so this is the same arrangement lib/swStrategy.ts has:
  // the rules are asserted against the source text.
  const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8')

  it('applies a badge when a push carries one', () => {
    assert.match(sw, /applyBadge\(payload\.badgeCount\)/)
  })

  it('clears at zero instead of calling setAppBadge(0)', () => {
    const fn = sw.slice(sw.indexOf('function applyBadge'), sw.indexOf('self.addEventListener(\'push\''))
    assert.match(fn, /clearAppBadge\(\)/)
    assert.doesNotMatch(fn, /setAppBadge\(0\)/)
  })

  it('feature-detects, because Android Chromium has no Badging API', () => {
    const fn = sw.slice(sw.indexOf('function applyBadge'), sw.indexOf('self.addEventListener(\'push\''))
    assert.match(fn, /typeof self\.navigator\.setAppBadge !== 'function'/)
    assert.match(fn, /typeof self\.navigator\.clearAppBadge !== 'function'/)
  })
})

describe('sign-out', () => {
  it('clears the badge, so one member\'s day does not follow another', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/clientAuth.ts'), 'utf8')
    const logout = src.slice(src.indexOf('export function logout'))
    assert.match(logout, /clearAppBadge\(\)/)
  })
})
