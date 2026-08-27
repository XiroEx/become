// Run with: npx tsx --test tests/unit/mind/autoStart.test.ts
//
// The home dashboard's Mindset tile links to /dashboard/mind?start=1 and
// promises to "jump straight into today's session" — not just onto the page.
// shouldAutoStartMindSession is the pure decision behind that: it must only
// fire once, and only once there's an actual session ready to begin.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldAutoStartMindSession, type AutoStartMindSessionInput } from '../../../lib/mind/autoStart'

const READY: AutoStartMindSessionInput = {
  autoStart: true,
  alreadyStarted: false,
  loading: false,
  playing: false,
  onboarded: true,
  available: true,
  hasPlan: true,
}

test('all conditions satisfied → starts', () => {
  assert.equal(shouldAutoStartMindSession(READY), true)
})

test('no ?start=1 → never starts', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, autoStart: false }), false)
})

test('already started this mount → does not re-fire', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, alreadyStarted: true }), false)
})

test('initial data still loading → waits', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, loading: true }), false)
})

test('already inside a session → does not restart it', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, playing: true }), false)
})

test('onboarding not completed → does not force a session', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, onboarded: false }), false)
})

test('onboarded still unknown (null, identity loading) → waits', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, onboarded: null }), false)
})

test('main session in cooldown (not available) → does not start', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, available: false }), false)
})

test('no composed plan yet → does not start', () => {
  assert.equal(shouldAutoStartMindSession({ ...READY, hasPlan: false }), false)
})
