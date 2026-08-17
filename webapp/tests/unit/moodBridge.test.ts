// Run with: npx tsx --test tests/unit/moodBridge.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedStateForMood, feelingOrderForMood, moodOpenerLine, moodGateway, isMoodLevel } from '../../lib/mind/moodBridge'

test('low moods seed the gentle register, high moods locked in, okay seeds nothing', () => {
  assert.equal(seedStateForMood(1), 'low_energy')
  assert.equal(seedStateForMood(2), 'low_energy')
  assert.equal(seedStateForMood(3), null)
  assert.equal(seedStateForMood(4), 'locked_in')
  assert.equal(seedStateForMood(5), 'locked_in')
})

test('a bad mood puts the low/stressed feelings first in the grid', () => {
  assert.deepEqual(feelingOrderForMood(1), ['low_energy', 'stressed', 'distracted', 'locked_in'])
  assert.deepEqual(feelingOrderForMood(4), ['locked_in', 'low_energy', 'distracted', 'stressed'])
  assert.deepEqual(feelingOrderForMood(null), ['locked_in', 'low_energy', 'distracted', 'stressed'])
})

test('opener line names the mood and roughly when', () => {
  const now = Date.parse('2026-08-17T15:00:00Z')
  assert.equal(moodOpenerLine({ value: 1, label: 'Bad', at: now - 3 * 3_600_000 }, now), 'You checked in feeling bad 3 hours ago.')
  assert.equal(moodOpenerLine({ value: 4, label: 'Pretty good', at: now - 10 * 60_000 }, now), 'You checked in feeling pretty good just now.')
  assert.equal(moodOpenerLine({ value: 2, label: 'Not great', at: now - 3_600_000 }, now), 'You checked in feeling not great an hour ago.')
})

test('every mood has gateway copy with a CTA', () => {
  for (const m of [1, 2, 3, 4, 5] as const) {
    const g = moodGateway(m)
    assert.ok(g.headline && g.body && g.cta)
  }
  assert.match(moodGateway(1).cta, /Mindset/)
})

test('isMoodLevel guards junk', () => {
  assert.equal(isMoodLevel(3), true)
  assert.equal(isMoodLevel(0), false)
  assert.equal(isMoodLevel('4'), false)
})
