// Run with: npm run test:file tests/unit/becomingDoorPulse.test.ts
//
// The Becoming doorway turns purple when a new week has been written (the
// week rolls over on Sunday, see localWeekKey in BecomingDoor.tsx) and has
// not been opened since. It should also pulsate in that state to draw the
// eye — calm once the member has opened it for the week.
//
// The calm state is not dead still, though: whenever the tile is carrying its
// "what to work on" line it breathes on a quieter, slower loop (Jon asked for
// the tile to pulsate so the eye finds it on a busy Home). Both loops live in
// app/globals.css and both are off under prefers-reduced-motion, which is
// asserted here too — a stylesheet is the only part of this an in-container
// test can read.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import BecomingDoor, { doorClassName } from '../../components/dashboard/BecomingDoor'
import type { GoalProgress } from '../../lib/goals/progress'

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

test('an unread new week pulses purple', () => {
  const cls = doorClassName(true)
  assert.match(cls, /becoming-door-pulse/)
  assert.match(cls, /from-violet-600/)
})

test('a read/caught-up week is calm — no pulse', () => {
  const cls = doorClassName(false)
  assert.doesNotMatch(cls, /becoming-door-pulse/)
})

test('the calm tile breathes while it has something to work on', () => {
  const cls = doorClassName(false, true)
  assert.match(cls, /becoming-door-nudge/)
  // Still the calm card — the nudge is a pulse, not the loud purple state.
  assert.doesNotMatch(cls, /from-violet-600/)
  assert.doesNotMatch(cls, /becoming-door-pulse\b/)
})

test('nothing to work on, nothing moving', () => {
  const cls = doorClassName(false, false)
  assert.doesNotMatch(cls, /becoming-door-nudge/)
  assert.doesNotMatch(cls, /becoming-door-pulse/)
})

test('the two loops never stack: an unread week keeps only the loud pulse', () => {
  const cls = doorClassName(true, true)
  assert.match(cls, /becoming-door-pulse/)
  assert.doesNotMatch(cls, /becoming-door-nudge/)
})

// ── The stylesheet half ─────────────────────────────────────────────────────

test('the nudge is a real, gentle, looping animation', () => {
  assert.match(css, /@keyframes becoming-door-nudge\s*\{/)
  const rule = /\.becoming-door-nudge\s*\{\s*animation:\s*becoming-door-nudge\s+([\d.]+)s\s+ease-in-out\s+infinite;/.exec(css)
  assert.ok(rule, '.becoming-door-nudge must loop the becoming-door-nudge keyframes')
  // Slower than the unread pulse (2.4s): a nudge, not a flashing banner.
  assert.ok(Number(rule[1]) > 2.4, `expected a loop slower than the unread pulse, got ${rule[1]}s`)
})

test('both pulses are off under prefers-reduced-motion', () => {
  const reduced = css.split('@media (prefers-reduced-motion: reduce)').slice(1).join('\n')
  assert.match(reduced, /\.becoming-door-pulse\s*\{\s*animation:\s*none;/)
  assert.match(reduced, /\.becoming-door-nudge\s*\{\s*animation:\s*none;/)
})

// ── The rendered tile ───────────────────────────────────────────────────────

// Only the fields the door reads; the rest of GoalProgress is irrelevant here.
const goalsWithWork = {
  todayKey: '2026-10-13',
  nutrition: {
    unit: 'lbs',
    status: 'active',
    kind: 'weight',
    direction: 'lose',
    target: { weight: 205, paceKgPerWeek: null, pacePerWeek: null, bandKg: 1 },
    pace: null,
    adherence: null,
    proteinGoal: null,
    suggestion: { key: 'nutrition.log', title: 'Log more days', sub: '3 of 7 days logged', severity: 'nudge', url: '/dashboard/nutrition' },
  },
  training: {
    status: 'active',
    target: { daysPerWeek: 4, programId: null },
    thisWeek: { done: 2, remaining: 2, chancesLeft: 3, weekLost: false },
    suggestion: { key: 'training.on-track', title: 'On track this week', sub: '2 of 4 done', severity: 'good', url: '/dashboard/workout' },
  },
} as unknown as GoalProgress

test('the Home tile renders the what-to-work-on line AND pulses', () => {
  const html = renderToStaticMarkup(createElement(BecomingDoor, { goals: goalsWithWork, mind: null }))
  assert.match(html, /data-testid="becoming-door-next"/)
  assert.match(html, /Log more days/)
  assert.match(html, /becoming-door-nudge/)
})

test('with no goals there is no line and nothing pulses', () => {
  const html = renderToStaticMarkup(createElement(BecomingDoor, { goals: null, mind: null }))
  assert.doesNotMatch(html, /data-testid="becoming-door-next"/)
  assert.doesNotMatch(html, /becoming-door-nudge/)
})
