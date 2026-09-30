// Run with: npm run test:file tests/unit/recent-feeling.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recentFeelingLabel, isFallbackLabel, STATE_LABELS } from '../../lib/mind/recentFeeling'

const SCENE = readFileSync(
  join(process.cwd(), 'components/mind/session/scenes/StateCheckScene.tsx'),
  'utf8',
)

// ── The reported bug ─────────────────────────────────────────────────────────
//
// "I selected Scattered. If I go back OR do my next session, it says I selected
// distracted." Twenty feelings collapse onto four states; the client read back
// only the state and rendered the state's name — which is also the first tile of
// that colour group, so it looked like the answer had been reset to the top.

test('the exact feeling is what comes back, not the bucket', () => {
  assert.equal(recentFeelingLabel('distracted', 'Scattered'), 'Scattered')
  assert.equal(recentFeelingLabel('low_energy', 'Drained'), 'Drained')
  assert.equal(recentFeelingLabel('locked_in', 'Grateful'), 'Grateful')
  assert.equal(recentFeelingLabel('stressed', 'Overwhelmed'), 'Overwhelmed')
})

test('every reported collapse is covered', () => {
  // Each of these used to render as the FIRST tile of its colour group.
  const collapsed: [Parameters<typeof recentFeelingLabel>[0], string, string][] = [
    ['distracted', 'Scattered', 'distracted'],
    ['distracted', 'Restless', 'distracted'],
    ['distracted', 'Foggy', 'distracted'],
    ['distracted', 'Bored', 'distracted'],
    ['low_energy', 'Tired', 'low energy'],
    ['low_energy', 'Drained', 'low energy'],
    ['low_energy', 'Unmotivated', 'low energy'],
    ['low_energy', 'Down', 'low energy'],
    ['locked_in', 'Energized', 'locked in'],
    ['locked_in', 'Motivated', 'locked in'],
    ['locked_in', 'Calm', 'locked in'],
    ['locked_in', 'Grateful', 'locked in'],
    ['stressed', 'Anxious', 'stressed'],
    ['stressed', 'Overwhelmed', 'stressed'],
    ['stressed', 'Frustrated', 'stressed'],
    ['stressed', 'Angry', 'stressed'],
  ]
  for (const [state, feeling, oldWrongLabel] of collapsed) {
    const got = recentFeelingLabel(state, feeling)
    assert.equal(got, feeling, `${feeling} must stay ${feeling}`)
    assert.notEqual(got, oldWrongLabel, `${feeling} must no longer read as "${oldWrongLabel}"`)
  }
})

test('a log with no stored feeling still gets a sensible name', () => {
  // Check-ins written before feelings were persisted, and the "Something else"
  // escape hatch.
  assert.equal(recentFeelingLabel('distracted', undefined), 'distracted')
  assert.equal(recentFeelingLabel('low_energy', null), 'low energy')
  assert.equal(isFallbackLabel(undefined), true)
  assert.equal(isFallbackLabel('Scattered'), false)
})

test('a blank or whitespace feeling never renders as an empty label', () => {
  assert.equal(recentFeelingLabel('stressed', ''), 'stressed')
  assert.equal(recentFeelingLabel('stressed', '   '), 'stressed')
  assert.equal(isFallbackLabel('   '), true)
})

test('the fallback names cover every state', () => {
  for (const s of ['stressed', 'distracted', 'low_energy', 'locked_in'] as const) {
    assert.ok(STATE_LABELS[s]?.length > 0, `${s} needs a fallback name`)
  }
})

// ── The read path that dropped it ────────────────────────────────────────────

test('the scene reads `feeling` back off the API', () => {
  // POST already stored it; the response type simply omitted it, so it was
  // discarded on the way in.
  assert.match(SCENE, /logs\?: \{ state: MindState; timestamp: string; feeling\?: string \}\[\]/)
  assert.match(SCENE, /setRecentFeeling\(last\.feeling\?\.trim\(\) \|\| null\)/)
})

test('every place that names the last check-in uses the feeling', () => {
  // The opener, the resume hand-off into the rest of the session, and the
  // "what changed?" summary all named the bucket before.
  const uses = SCENE.match(/recentFeelingLabel\(recent, recentFeeling\)/g) ?? []
  assert.ok(uses.length >= 3, `expected 3+ uses, found ${uses.length}`)
  assert.doesNotMatch(
    SCENE,
    /STATE_META\[recent\]\.label/,
    'no render site may fall back to the bucket name directly',
  )
})

test('the change summary names both ends by feeling', () => {
  assert.match(SCENE, /\{pendingFeeling \|\| STATE_META\[pendingState\]\.label\}/)
})

test('the opener icon matches the feeling, not just the bucket', () => {
  assert.match(SCENE, /function recentIcon/)
  assert.match(SCENE, /recentIcon\(recent, recentFeeling\)/)
})
