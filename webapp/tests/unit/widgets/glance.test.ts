// Run with: npm run test:file tests/unit/widgets/glance.test.ts
//
// The daily glance is the lock-screen card. Nobody reviews it in a browser and
// nothing type-checks the sentence that ends up on a phone at 6am, so the
// wording is pinned here the same way the widget feed's is.
//
// The failures this exists to catch:
//   1. An EMPTY body. A notification with a blank line reads as a broken app
//      and raises no error anywhere.
//   2. "🔥 0 days" — greeting someone whose streak just reset with a zero.
//   3. The opt-in gate silently becoming an opt-out one, which would hand a
//      third morning push to every member at once.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildWidgetFeed, type WidgetFeedInput } from '@/lib/widgets/feed'
import { buildDailyGlance } from '@/lib/widgets/glance'

const ROOT = path.join(__dirname, '../../..')
const NOW = Date.UTC(2026, 8, 16, 11, 0, 0)

function input(over: Partial<WidgetFeedInput> = {}): WidgetFeedInput {
  return {
    todayKey: '2026-09-16',
    now: NOW,
    streak: { current: 12, longest: 20, activityToday: false },
    nutrition: {
      calories: 0, protein: 0, carbs: 0, fats: 0,
      targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 },
      entries: 0,
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

const glance = (over: Partial<WidgetFeedInput> = {}) => buildDailyGlance(buildWidgetFeed(input(over)))

describe('the title', () => {
  it('leads with the streak, because that is what a member checks first', () => {
    assert.equal(glance().title, '🔥 12 days')
  })

  it('says "1 day", not "1 days"', () => {
    assert.equal(glance({ streak: { current: 1, longest: 3, activityToday: false } }).title, '🔥 1 day')
  })

  it('does not greet a reset streak with a zero', () => {
    assert.equal(
      glance({ streak: { current: 0, longest: 8, activityToday: false } }).title,
      'Today at a glance',
    )
    // ...and not by accident: the streak widget itself is showing 0 here.
    const feed = buildWidgetFeed(input({ streak: { current: 0, longest: 8, activityToday: true } }))
    assert.equal(feed.widgets.find((w) => w.key === 'streak')?.headline, '0')
    assert.equal(buildDailyGlance(feed).title, 'Today at a glance')
  })
})

describe('the body', () => {
  it('reads as one card: session, food, mind', () => {
    assert.equal(glance().body, 'Upper Body Strength · No food logged · Mind session ready')
  })

  it('names calories LEFT once something is logged, matching the widget', () => {
    const g = glance({
      nutrition: {
        calories: 1200, protein: 90, carbs: 130, fats: 40,
        targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 },
        entries: 3,
      },
    })
    assert.match(g.body, /800 cal left/)
  })

  it('celebrates a finished day rather than nagging about it', () => {
    const g = glance({
      training: { title: 'Upper Body Strength', completedToday: true, restDay: false },
      nutrition: {
        calories: 1950, protein: 150, carbs: 200, fats: 65,
        targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 },
        entries: 5,
      },
      mind: {
        chapter: 2, chapterName: 'Momentum', sessionDoneToday: true,
        sessionAvailable: false, sessionsIntoChapter: 5, sessionsPerChapter: 10,
      },
    })
    assert.equal(g.body, 'Training done · 50 cal left · Mind done')
    assert.equal(g.badgeCount, 0)
  })

  it('says the same thing for a rest day and for no program at all', () => {
    const rest = glance({ training: { title: null, completedToday: false, restDay: true } })
    const none = glance({ training: { title: null, completedToday: false, restDay: false } })
    assert.match(rest.body, /^No session today · /)
    assert.match(none.body, /^No session today · /)
  })

  it('leaves the Mind cooldown out instead of printing a shrug', () => {
    const g = glance({
      mind: {
        chapter: 2, chapterName: 'Momentum', sessionDoneToday: false,
        sessionAvailable: false, sessionsIntoChapter: 4, sessionsPerChapter: 10,
      },
    })
    assert.doesNotMatch(g.body, /Mind/)
    assert.equal(g.body, 'Upper Body Strength · No food logged')
  })

  it('is never empty, on any shape of day', () => {
    const shapes: Partial<WidgetFeedInput>[] = [
      {},
      { streak: { current: 0, longest: 0, activityToday: false } },
      {
        nutrition: {
          calories: 0, protein: 0, carbs: 0, fats: 0,
          targets: { calories: null, protein: null, carbs: null, fats: null },
          entries: 0,
        },
      },
      {
        training: { title: null, completedToday: false, restDay: true },
        mind: {
          chapter: 1, chapterName: null, sessionDoneToday: false,
          sessionAvailable: false, sessionsIntoChapter: 0, sessionsPerChapter: 10,
        },
        becoming: { week: null, identity: null, chapterName: null, workoutsThisWeek: 0, weeklyTarget: null },
      },
    ]
    for (const shape of shapes) {
      const g = glance(shape)
      assert.ok(g.title.trim().length > 0, `empty title for ${JSON.stringify(shape)}`)
      assert.ok(g.body.trim().length > 0, `empty body for ${JSON.stringify(shape)}`)
      assert.ok(!g.body.includes(' ·  ·'), `empty segment in "${g.body}"`)
      assert.ok(!g.body.endsWith('·'), `trailing separator in "${g.body}"`)
    }
  })

  it('carries the badge count, so one push lights the icon too', () => {
    assert.equal(glance().badgeCount, 3)
  })
})

describe('how the cron sends it', () => {
  const cron = fs.readFileSync(path.join(ROOT, 'app/api/cron/notify/route.ts'), 'utf8')

  it('is OPT-IN — an explicit true, never "not false"', () => {
    // Every other sweep here uses `{ $ne: false }`, which treats an untouched
    // preference as consent. This one must not: flipping it would hand a third
    // morning notification to every member in one deploy.
    assert.match(cron, /'notificationPrefs\.dailyGlance': true/)
    assert.doesNotMatch(cron, /'notificationPrefs\.dailyGlance': \{ \$ne: false \}/)
  })

  it('sends at most one per member per LOCAL day', () => {
    const section = cron.slice(cron.indexOf('0.5 Daily glance'), cron.indexOf('1. Streak at-risk'))
    assert.match(section, /lastPushSentAt\?\.dailyGlance/)
    assert.match(section, /localDateKeyForUser\(new Date\(lastSent\)/)
    assert.match(section, /'lastPushSentAt\.dailyGlance': now/)
  })

  it('stays inside the member\'s own morning', () => {
    const section = cron.slice(cron.indexOf('0.5 Daily glance'), cron.indexOf('1. Streak at-risk'))
    assert.match(section, /DAILY_GLANCE_START_HOUR/)
    assert.match(section, /DAILY_GLANCE_END_HOUR/)
  })

  it('goes out before the morning nudges, not among them', () => {
    // Ordering is the whole reason it reads as a summary rather than a fourth
    // reminder, and it is one line-move away from being lost.
    assert.ok(cron.indexOf('0.5 Daily glance') < cron.indexOf('2. Workout reminder'))
    assert.ok(cron.indexOf('0.5 Daily glance') < cron.indexOf('2.6 Daily Mind session'))
  })

  it('passes the badge count through to the push', () => {
    const section = cron.slice(cron.indexOf('0.5 Daily glance'), cron.indexOf('1. Streak at-risk'))
    assert.match(section, /badgeCount: glance\.badgeCount/)
  })

  it('cannot take a nudge down with it', () => {
    const section = cron.slice(cron.indexOf('0.5 Daily glance'), cron.indexOf('1. Streak at-risk'))
    assert.match(section, /catch \(err\)/)
  })
})

describe('the preference', () => {
  it('is accepted by the preferences route and reported as OFF by default', () => {
    const route = fs.readFileSync(
      path.join(ROOT, 'app/api/notifications/preferences/route.ts'), 'utf8',
    )
    assert.match(route, /const allowed = \[[^\]]*'dailyGlance'/)
    assert.match(route, /dailyGlance: false/)
  })

  it('has a row in Settings, or it can never be turned on', () => {
    const settings = fs.readFileSync(path.join(ROOT, 'app/dashboard/settings/page.tsx'), 'utf8')
    const toggles = settings.slice(
      settings.indexOf('const NOTIFICATION_TOGGLES'),
      settings.indexOf('const VAPID_PUBLIC_KEY'),
    )
    assert.match(toggles, /key: 'dailyGlance'/)
    // Default must survive a round trip through the API, not silently become on.
    assert.match(settings, /dailyGlance: p\.dailyGlance \?\? false/)
  })
})
