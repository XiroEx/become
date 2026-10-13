// Run with: npm run test:file tests/unit/widgets/feed.test.ts
//
// The widget feed is drawn by the OS, not by our React tree. Nobody sees it in
// a browser, nothing type-checks the string that ends up on a lock screen, and
// a member who installs a widget looks at it more often than they open the app.
// So the wording, the states and the deep links are pinned here.
//
// Two classes of bug this exists to catch:
//   1. A caption or headline that renders EMPTY. A widget with a blank line in
//      it reads as a broken app, and there is no error to notice.
//   2. A deep link or manifest shortcut pointing at a route that does not
//      exist. Both are invisible until someone taps them.

import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildWidgetFeed, WIDGET_REFRESH_SECONDS, type WidgetFeedInput, type BecomeWidget } from '@/lib/widgets/feed'

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

const pick = (f: ReturnType<typeof buildWidgetFeed>, key: BecomeWidget['key']) => {
  const w = f.widgets.find((x) => x.key === key)
  assert.ok(w, `no ${key} widget`)
  return w
}

describe('the feed itself', () => {
  it('ships all five widgets, in gallery order, with unique keys', () => {
    const feed = buildWidgetFeed(input())
    assert.deepEqual(
      feed.widgets.map((w) => w.key),
      ['streak', 'nutrition', 'mind', 'becoming', 'training'],
    )
    assert.equal(new Set(feed.widgets.map((w) => w.key)).size, 5)
  })

  it('tells the client when to come back, so a timeline need not guess', () => {
    const feed = buildWidgetFeed(input())
    assert.equal(feed.refreshAfterSeconds, WIDGET_REFRESH_SECONDS)
    assert.equal(feed.generatedAt, NOW)
    assert.equal(feed.todayKey, '2026-09-16')
  })

  // The empty-string bug, swept across every branch that can produce a widget.
  it('never emits an empty headline or caption, in any state', () => {
    const cases: Array<Partial<WidgetFeedInput>> = [
      {},
      { streak: { current: 0, longest: 0, activityToday: false } },
      { streak: { current: 9, longest: 9, activityToday: false } },
      { streak: { current: 400, longest: 400, activityToday: true } },
      { nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0, targets: { calories: null, protein: null, carbs: null, fats: null }, entries: 0 } },
      { mind: { chapter: 1, chapterName: null, sessionDoneToday: true, sessionAvailable: false, sessionsIntoChapter: 0, sessionsPerChapter: 10 } },
      { becoming: { week: null, identity: null, chapterName: null, workoutsThisWeek: 0, weeklyTarget: null } },
      { training: { title: null, completedToday: false, restDay: true } },
      { training: { title: null, completedToday: false, restDay: false } },
      { training: { title: null, completedToday: true, restDay: false } },
    ]
    for (const over of cases) {
      for (const w of buildWidgetFeed(input(over)).widgets) {
        assert.ok(w.headline.trim().length > 0, `${w.key} headline empty for ${JSON.stringify(over)}`)
        assert.ok(w.caption.trim().length > 0, `${w.key} caption empty for ${JSON.stringify(over)}`)
        assert.ok(w.title.trim().length > 0, `${w.key} title empty`)
      }
    }
  })

  it('keeps every progress fraction inside 0..1 even when the member overshoots', () => {
    const feed = buildWidgetFeed(input({
      nutrition: { calories: 5000, protein: 400, carbs: 500, fats: 200, targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 }, entries: 9 },
      becoming: { week: 6, identity: null, chapterName: null, workoutsThisWeek: 9, weeklyTarget: 4 },
    }))
    for (const w of feed.widgets) {
      if (w.progress == null) continue
      assert.ok(w.progress >= 0 && w.progress <= 1, `${w.key} progress ${w.progress}`)
    }
    for (const r of pick(feed, 'nutrition').rings) {
      assert.ok(r.pct != null && r.pct >= 0 && r.pct <= 1, `${r.key} pct ${r.pct}`)
    }
  })
})

describe('streak', () => {
  it('distinguishes "never started" from "alive but unlogged"', () => {
    const fresh = pick(buildWidgetFeed(input({ streak: { current: 0, longest: 0, activityToday: false } })), 'streak')
    assert.equal(fresh.state, 'none')
    assert.match(fresh.caption, /start/i)

    const atRisk = pick(buildWidgetFeed(input({ streak: { current: 9, longest: 12, activityToday: false } })), 'streak')
    assert.equal(atRisk.state, 'at-risk')
    assert.match(atRisk.caption, /Nothing logged yet today/)
  })

  it('counts down to the next milestone once today is safe', () => {
    const w = pick(buildWidgetFeed(input({ streak: { current: 5, longest: 12, activityToday: true } })), 'streak')
    assert.equal(w.state, 'done')
    assert.equal(w.headline, '5')
    assert.equal(w.headlineUnit, 'days')
    assert.equal(w.caption, '2 days to 7')
  })

  it('says "1 day", not "1 days"', () => {
    const w = pick(buildWidgetFeed(input({ streak: { current: 1, longest: 1, activityToday: true } })), 'streak')
    assert.equal(w.headlineUnit, 'day')
    assert.equal(w.caption, '2 days to 3')

    const two = pick(buildWidgetFeed(input({ streak: { current: 2, longest: 2, activityToday: true } })), 'streak')
    assert.equal(two.caption, '1 day to 3')
  })

  it('past the last milestone, falls back to the personal best rather than a blank', () => {
    const w = pick(buildWidgetFeed(input({ streak: { current: 400, longest: 400, activityToday: true } })), 'streak')
    assert.equal(w.caption, 'Longest: 400')
    assert.equal(w.progress, 1)
  })
})

describe('nutrition', () => {
  it('leads with calories LEFT, which is the question a member is asking', () => {
    const w = pick(buildWidgetFeed(input()), 'nutrition')
    assert.equal(w.headline, '800')
    assert.equal(w.headlineUnit, 'cal left')
    assert.equal(w.caption, 'P 90/150g · C 130/200g · F 40/65g')
  })

  it('says "over" rather than a negative number', () => {
    const w = pick(buildWidgetFeed(input({
      nutrition: { calories: 2300, protein: 160, carbs: 210, fats: 70, targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 }, entries: 5 },
    })), 'nutrition')
    assert.equal(w.headline, '300')
    assert.equal(w.headlineUnit, 'cal over')
  })

  it('with no targets set, shows what was eaten instead of a made-up goal', () => {
    const w = pick(buildWidgetFeed(input({
      nutrition: { calories: 1234, protein: 90, carbs: 130, fats: 40, targets: { calories: null, protein: null, carbs: null, fats: null }, entries: 2 },
    })), 'nutrition')
    assert.equal(w.headline, '1,234')
    assert.equal(w.headlineUnit, 'cal')
    assert.equal(w.progress, null)
    assert.equal(w.caption, 'P 90g · C 130g · F 40g')
    for (const r of w.rings) assert.equal(r.pct, null)
  })

  it('an empty day is "nothing logged", not a confident zero', () => {
    const w = pick(buildWidgetFeed(input({
      nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0, targets: { calories: 2000, protein: 150, carbs: 200, fats: 65 }, entries: 0 },
    })), 'nutrition')
    assert.equal(w.state, 'todo')
    assert.equal(w.caption, 'Nothing logged yet today')
  })

  it('carries a ring per macro, in a fixed order', () => {
    const rings = pick(buildWidgetFeed(input()), 'nutrition').rings
    assert.deepEqual(rings.map((r) => r.key), ['calories', 'protein', 'carbs', 'fats'])
    assert.equal(rings[1].value, 90)
    assert.equal(rings[1].target, 150)
    assert.equal(rings[1].unit, 'g')
  })
})

describe('mind', () => {
  it('reads Ready / Done / Resting, and never says Ready during the cooldown', () => {
    const ready = pick(buildWidgetFeed(input()), 'mind')
    assert.equal(ready.headline, 'Ready')
    assert.equal(ready.state, 'todo')

    const done = pick(buildWidgetFeed(input({
      mind: { chapter: 2, chapterName: 'Momentum', sessionDoneToday: true, sessionAvailable: true, sessionsIntoChapter: 5, sessionsPerChapter: 10 },
    })), 'mind')
    assert.equal(done.headline, 'Done')
    assert.equal(done.state, 'done')

    // The between-sessions cooldown is real; "Ready" here sends the member into
    // a locked screen.
    const resting = pick(buildWidgetFeed(input({
      mind: { chapter: 2, chapterName: 'Momentum', sessionDoneToday: false, sessionAvailable: false, sessionsIntoChapter: 5, sessionsPerChapter: 10 },
    })), 'mind')
    assert.equal(resting.headline, 'Resting')
  })

  it('names the chapter, and survives not knowing its name', () => {
    assert.equal(pick(buildWidgetFeed(input()), 'mind').caption, 'Chapter 2 · Momentum · 4/10')
    const unnamed = pick(buildWidgetFeed(input({
      mind: { chapter: 9, chapterName: null, sessionDoneToday: false, sessionAvailable: true, sessionsIntoChapter: 1, sessionsPerChapter: 10 },
    })), 'mind')
    assert.equal(unnamed.caption, 'Chapter 9 · 1/10')
  })
})

describe('becoming', () => {
  it('counts the week, and says "Day one" before there is one', () => {
    assert.equal(pick(buildWidgetFeed(input()), 'becoming').headline, 'Week 6')
    const fresh = pick(buildWidgetFeed(input({
      becoming: { week: null, identity: null, chapterName: null, workoutsThisWeek: 0, weeklyTarget: null },
    })), 'becoming')
    assert.equal(fresh.headline, 'Day one')
    assert.equal(fresh.state, 'none')
    assert.equal(fresh.caption, '0 sessions this week')
  })

  it("prefers the member's own identity statement over any metric we could print", () => {
    const w = pick(buildWidgetFeed(input({
      becoming: { week: 6, identity: '  I am someone who   shows up  ', chapterName: 'Momentum', workoutsThisWeek: 2, weeklyTarget: 4 },
    })), 'becoming')
    assert.equal(w.caption, 'I am someone who shows up')
  })

  it('trims a long identity on a word boundary — a line cut mid-word reads as a bug', () => {
    const long = 'I am becoming the kind of person who trains with intention and eats deliberately every single day'
    const w = pick(buildWidgetFeed(input({
      becoming: { week: 6, identity: long, chapterName: null, workoutsThisWeek: 2, weeklyTarget: 4 },
    })), 'becoming')
    assert.ok(w.caption.length <= 64, `caption is ${w.caption.length} chars`)
    assert.ok(w.caption.endsWith('…'))
    assert.ok(!w.caption.includes('  '))
    // The character before the ellipsis ends a whole word.
    assert.ok(long.startsWith(w.caption.slice(0, -1)), 'trim must not invent text')
  })

  it('goes done once the week\'s training target is met', () => {
    const w = pick(buildWidgetFeed(input({
      becoming: { week: 6, identity: null, chapterName: null, workoutsThisWeek: 4, weeklyTarget: 4 },
    })), 'becoming')
    assert.equal(w.state, 'done')
    assert.equal(w.progress, 1)
    assert.equal(w.caption, '4 of 4 this week')
  })

  it('says "1 session", not "1 sessions", when there is no target to count against', () => {
    const w = pick(buildWidgetFeed(input({
      becoming: { week: 2, identity: null, chapterName: null, workoutsThisWeek: 1, weeklyTarget: null },
    })), 'becoming')
    assert.equal(w.caption, '1 session this week')
  })
})

describe('training', () => {
  it('names today\'s session and invites the tap', () => {
    const w = pick(buildWidgetFeed(input()), 'training')
    assert.equal(w.headline, 'Upper Body Strength')
    assert.equal(w.caption, 'Tap to start')
    assert.equal(w.state, 'todo')
  })

  it('separates "rest day" from "nothing scheduled" — they mean different things', () => {
    const rest = pick(buildWidgetFeed(input({ training: { title: null, completedToday: false, restDay: true } })), 'training')
    assert.equal(rest.headline, 'Rest day')
    assert.match(rest.caption, /recover/i)

    const none = pick(buildWidgetFeed(input({ training: { title: null, completedToday: false, restDay: false } })), 'training')
    assert.equal(none.headline, 'Open')
    assert.match(none.caption, /No session scheduled/)
  })

  it('completed beats everything else, including a rest day marked after the fact', () => {
    const w = pick(buildWidgetFeed(input({ training: { title: 'Leg Day', completedToday: true, restDay: true } })), 'training')
    assert.equal(w.headline, 'Complete')
    assert.equal(w.caption, 'Leg Day')
    assert.equal(w.progress, 1)
  })

  it('trims a long session title to something a 2x2 widget can draw', () => {
    const w = pick(buildWidgetFeed(input({
      training: { title: 'Phase 3 Day 4 — Posterior Chain and Accessory Volume', completedToday: false, restDay: false },
    })), 'training')
    assert.ok(w.headline.length <= 28, `headline is ${w.headline.length} chars`)
  })
})

// ---------------------------------------------------------------------------
// The two "invisible until tapped" guards.
// ---------------------------------------------------------------------------

/** Does `/dashboard/mind/becoming` correspond to a real App Router page? */
function pageExists(url: string): boolean {
  const rel = url.replace(/^\//, '').split('?')[0]
  const dir = path.join(ROOT, 'app', rel)
  return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((f) => fs.existsSync(path.join(dir, f)))
}

test('every widget deep link points at a page that exists', () => {
  const feed = buildWidgetFeed(input())
  const broken = feed.widgets
    .filter((w) => !pageExists(w.deepLink))
    .map((w) => `${w.key} -> ${w.deepLink}`)
  assert.deepEqual(broken, [], `A widget tap would 404:\n  ${broken.join('\n  ')}`)
})

describe('home-screen shortcuts', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/manifest.json/route.ts'), 'utf8')
  // Only the SHORTCUTS block — `start_url` is a url: too, and matching it would
  // make this guard silently pass with three shortcuts and the start page.
  const block = src.slice(src.indexOf('const SHORTCUTS'), src.indexOf('export function GET'))
  const urls = [...block.matchAll(/url:\s*'([^']+)'/g)].map((m) => m[1])

  it('are actually in the manifest', () => {
    assert.match(src, /shortcuts: SHORTCUTS/)
    assert.equal(urls.length, 4, `expected 4 shortcut urls, got ${urls.length}`)
  })

  it('each point at a page that exists', () => {
    const broken = urls.filter((u) => !pageExists(u))
    assert.deepEqual(broken, [], `A long-press shortcut would 404: ${broken.join(', ')}`)
  })

  it('stay inside the manifest scope, or the launcher drops them', () => {
    for (const u of urls) assert.ok(u.startsWith('/'), `${u} must be root-relative`)
  })
})
