// Run with: npm run test:file tests/unit/becomingWeekSummary.test.ts
//
// The Story screen's week summary — the pure half. Pressing Details used to
// open on two long histories and never say what THIS week adds up to or what
// to do about it; this is the module that answers both, so it is pinned here:
// every pillar the member uses is reported (including an honest zero), a
// pillar they do not use is never mentioned, and the recommendations are the
// goal suggestions ranked worst-first.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeeks, emptyDay, type DayEvents, type WeekSnapshot } from '../../lib/becoming/weeks'
import { summarizeWeek, nextSteps, rankSuggestions, previewList, MAX_NEXT_STEPS, MAX_CARD_STEPS, STORY_PREVIEW } from '../../lib/becoming/weekSummary'
import type { Suggestion } from '../../lib/goals/suggestions'

const TODAY = '2026-08-18' // a Tuesday: week of Aug 16, three days elapsed

function build(spec: Record<string, Partial<DayEvents>>, weeklyTarget: number | null = 5): WeekSnapshot[] {
  const days = new Map<string, DayEvents>()
  for (const [k, v] of Object.entries(spec)) days.set(k, { ...emptyDay(), ...v })
  return buildWeeks({
    days, todayKey: TODAY, weeklyTarget, logTarget: 5, proteinTarget: 5,
    targetWeight: 205, weightUnit: 'lbs', direction: 'lose', identity: null,
  })
}
function live(spec: Record<string, Partial<DayEvents>>, weeklyTarget: number | null = 5): WeekSnapshot {
  const weeks = build(spec, weeklyTarget)
  return weeks[weeks.length - 1]
}
function lineFor(summary: ReturnType<typeof summarizeWeek>, pillar: string): string | null {
  const l = summary.lines.find(x => x.pillar === pillar)
  return l ? l.facts.join(' · ') : null
}
function sg(key: string, severity: Suggestion['severity'], title = key): Suggestion {
  return { key, title, sub: 'because', severity, url: `/dashboard/${key}` }
}

test('the summary reports every pillar the member is using, with the numbers', () => {
  const week = live({
    '2026-08-16': { workouts: ['A'], foodLogged: true, proteinHit: true, calories: 2100, mindSession: true, mood: 4, weight: 210 },
    '2026-08-17': { workouts: ['B'], foodLogged: true, prs: [{ name: 'Bench', e1RM: 225 }] },
    '2026-08-18': { foodLogged: true, weight: 208.5 },
  })
  const s = summarizeWeek({ week, unit: 'lbs' })
  assert.equal(s.quiet, false)
  assert.match(lineFor(s, 'training') ?? '', /2 of 5 workouts/)
  assert.match(lineFor(s, 'training') ?? '', /new best: Bench/)
  assert.match(lineFor(s, 'fuel') ?? '', /logged 3 of 3 days/)
  assert.match(lineFor(s, 'fuel') ?? '', /protein hit 1 day/)
  assert.match(lineFor(s, 'fuel') ?? '', /2,100 cal a day/)
  assert.match(lineFor(s, 'fuel') ?? '', /down 1\.5 lbs on the scale/)
  assert.match(lineFor(s, 'mind') ?? '', /1 session/)
  assert.match(lineFor(s, 'mind') ?? '', /checked in 1 day/)
})

test('it names the week it is about, and carries that week\'s own story line', () => {
  const week = live({ '2026-08-16': { workouts: ['A'] }, '2026-08-17': { workouts: ['B'] } })
  const s = summarizeWeek({ week, unit: 'lbs' })
  assert.equal(s.live, true)
  assert.match(s.label, /^Aug 16/)
  assert.equal(s.headline, week.headline)
  assert.equal(s.sub, week.sub)
})

test('a pillar this member does not use is left out — never "0 sessions"', () => {
  // Training and food only, for weeks. Mind has never been opened.
  const week = live({
    '2026-08-09': { workouts: ['A'], foodLogged: true },
    '2026-08-16': { workouts: ['B'], foodLogged: true },
  })
  const s = summarizeWeek({ week, unit: 'lbs' })
  assert.equal(lineFor(s, 'mind'), null)
  assert.doesNotMatch(JSON.stringify(s.lines), /0 sessions|no sessions/)
})

test('a pillar they DO use reports its zero honestly — that is what the advice answers', () => {
  // They trained and logged last week; this week has only a Mind session.
  const week = live({
    '2026-08-09': { workouts: ['A'], foodLogged: true },
    '2026-08-16': { mindSession: true },
  })
  const s = summarizeWeek({ week, unit: 'lbs' })
  assert.match(lineFor(s, 'training') ?? '', /0 of 5 workouts/)
  assert.match(lineFor(s, 'fuel') ?? '', /nothing logged yet/)
})

test('with no weekly target the training line counts what was done, not a fraction', () => {
  const week = live({ '2026-08-16': { workouts: ['A'] } }, null)
  assert.match(lineFor(summarizeWeek({ week, unit: 'lbs' }), 'training') ?? '', /^1 workout$/)
})

test('sets and load moved come from the goals read, and only when there was a session', () => {
  const week = live({ '2026-08-16': { workouts: ['A'] } })
  const metrics = { sessions: 1, sets: 14, reps: 120, volume: 12400, workSeconds: 0, topSet: null, exercises: 5, hasWeightedWork: true }
  assert.match(lineFor(summarizeWeek({ week, unit: 'lbs', training: metrics }), 'training') ?? '', /14 sets · 12\.4k lbs moved/)
  const none = { ...metrics, sessions: 0, sets: 0 }
  assert.doesNotMatch(lineFor(summarizeWeek({ week, unit: 'lbs', training: none }), 'training') ?? '', /sets|moved/)
})

test('time under load stands in for volume when nothing was weighted', () => {
  const week = live({ '2026-08-16': { workouts: ['A'] } })
  const metrics = { sessions: 1, sets: 6, reps: 0, volume: 0, workSeconds: 900, topSet: null, exercises: 2, hasWeightedWork: false }
  assert.match(lineFor(summarizeWeek({ week, unit: 'lbs', training: metrics }), 'training') ?? '', /15m under load/)
})

test('wins banked and the streak are their own line', () => {
  const week = live({ '2026-08-16': { wins: ['I showed up'], mood: 3 } })
  const s = summarizeWeek({ week, unit: 'lbs', streak: 9 })
  assert.match(lineFor(s, 'you') ?? '', /1 win banked/)
  assert.match(lineFor(s, 'you') ?? '', /9-day streak/)
})

test('a scale that held is reported as steady, not as a move', () => {
  const week = live({ '2026-08-16': { weight: 210 }, '2026-08-17': { weight: 210 } })
  assert.match(lineFor(summarizeWeek({ week, unit: 'lbs' }), 'fuel') ?? '', /steady at 210 lbs/)
})

test('someone who weighs in but never logs food gets the scale, and no "nothing logged"', () => {
  const week = live({ '2026-08-16': { weight: 210 }, '2026-08-18': { weight: 208 } })
  const fuel = lineFor(summarizeWeek({ week, unit: 'lbs' }), 'fuel')
  assert.match(fuel ?? '', /down 2\.0 lbs on the scale/)
  assert.doesNotMatch(fuel ?? '', /nothing logged/)
})

test('a blank week says so, and still has advice attached', () => {
  const week = live({ '2026-08-09': { workouts: ['A'], foodLogged: true } })
  const s = summarizeWeek({ week, unit: 'lbs', suggestions: { training: sg('training.week-tight', 'nudge') } })
  assert.equal(s.quiet, true)
  assert.equal(s.next.length, 1)
})

test('before the journey loads there is still a summary to draw', () => {
  const s = summarizeWeek({ week: null, unit: 'lbs' })
  assert.equal(s.quiet, true)
  assert.deepEqual(s.lines, [])
  assert.ok(s.headline.length > 0)
})

/* ── what to do next ──────────────────────────────────────────────────── */

test('the recommendations are ranked worst first, and capped', () => {
  const week = live({ '2026-08-16': { workouts: ['A'], foodLogged: true, mindSession: true } })
  const steps = nextSteps({
    week, unit: 'lbs',
    suggestions: {
      training: sg('training.on-track', 'good'),
      fuel: sg('nutrition.behind', 'warn'),
      mind: sg('mind.stressed', 'info'),
    },
  })
  assert.deepEqual(steps.map(s => s.suggestion.key), ['nutrition.behind', 'mind.stressed', 'training.on-track'])
  assert.deepEqual(steps.map(s => s.pillar), ['fuel', 'mind', 'training'])
  assert.ok(steps.length <= MAX_NEXT_STEPS)
})

test('equal severities keep the coach\'s order: workouts, then food, then mindset', () => {
  const week = live({ '2026-08-16': { workouts: ['A'], foodLogged: true, mindSession: true } })
  const steps = nextSteps({
    week, unit: 'lbs',
    suggestions: { fuel: sg('nutrition.log', 'nudge'), training: sg('training.week-tight', 'nudge') },
  })
  assert.deepEqual(steps.map(s => s.suggestion.key), ['training.week-tight', 'nutrition.log'])
})

test('no advice is given about a pillar the member does not use', () => {
  const week = live({ '2026-08-09': { workouts: ['A'] }, '2026-08-16': { workouts: ['B'] } })
  const steps = nextSteps({
    week, unit: 'lbs',
    suggestions: { training: sg('training.on-track', 'good'), fuel: sg('nutrition.set-target', 'info') },
  })
  assert.deepEqual(steps.map(s => s.suggestion.key), ['training.on-track'])
})

test('a member using nothing yet gets every "set a goal" suggestion — they are written for exactly them', () => {
  const week = live({ '2026-08-16': { mood: 3 } })
  week.uses = { training: false, fuel: false, mind: false, mindMode: null }
  const steps = nextSteps({
    week, unit: 'lbs',
    suggestions: { training: sg('training.set-days', 'info'), fuel: sg('nutrition.set-target', 'info') },
  })
  assert.deepEqual(steps.map(s => s.suggestion.key), ['training.set-days', 'nutrition.set-target'])
})

/* ── the same ranking, on the week card ───────────────────────────────── */

// The live card carries the recommendations too (it is what someone is looking
// at when they wonder what to do), so the ranking is one function. If the card
// and the sheet could rank differently, the card would say one thing and the
// sheet opened from it another.

test('the card ranks the same way the Story sheet does, from the pillars the journey found active', () => {
  const steps = rankSuggestions(['training', 'fuel'], {
    training: sg('training.on-track', 'good'),
    fuel: sg('nutrition.behind', 'warn'),
  }, MAX_CARD_STEPS)
  assert.deepEqual(steps.map(s => s.suggestion.key), ['nutrition.behind', 'training.on-track'])
})

test('the card takes two — it is a fixed height with the week\'s own numbers already on it', () => {
  const steps = rankSuggestions(['training', 'fuel', 'mind'], {
    training: sg('training.week-tight', 'nudge'),
    fuel: sg('nutrition.log', 'nudge'),
    mind: sg('mind.stressed', 'nudge'),
  }, MAX_CARD_STEPS)
  assert.equal(MAX_CARD_STEPS, 2)
  assert.deepEqual(steps.map(s => s.suggestion.key), ['training.week-tight', 'nutrition.log'])
})

test('a pillar outside the pool is never recommended, however urgent it reads', () => {
  // The card passes the pillars the member is actually using. A warning about
  // food for someone who has never logged a meal is not a recommendation.
  const steps = rankSuggestions(['training'], {
    training: sg('training.on-track', 'good'),
    fuel: sg('nutrition.behind', 'warn'),
  }, MAX_CARD_STEPS)
  assert.deepEqual(steps.map(s => s.suggestion.key), ['training.on-track'])
})

test('a pillar with nothing to say is dropped rather than drawn empty', () => {
  const steps = rankSuggestions(['training', 'fuel', 'mind'], { fuel: sg('nutrition.log', 'nudge') }, MAX_CARD_STEPS)
  assert.deepEqual(steps.map(s => s.pillar), ['fuel'])
  assert.deepEqual(rankSuggestions(['training', 'fuel'], undefined, MAX_CARD_STEPS), [])
  assert.deepEqual(rankSuggestions([], { fuel: sg('nutrition.log', 'nudge') }, MAX_CARD_STEPS), [])
})

/* ── the two histories ────────────────────────────────────────────────── */

test('a history is cut to four rows, and says how many are behind the control', () => {
  const items = Array.from({ length: 13 }, (_, i) => i)
  const closed = previewList(items, false)
  assert.equal(STORY_PREVIEW, 4)
  assert.deepEqual(closed.shown, [0, 1, 2, 3])
  assert.equal(closed.hidden, 9)
  const open = previewList(items, true)
  assert.equal(open.shown.length, 13)
})

test('a short history has nothing to hide, so it gets no control', () => {
  assert.equal(previewList([1, 2, 3, 4], false).hidden, 0)
  assert.equal(previewList([], false).hidden, 0)
})
