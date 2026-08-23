// Run with: npx tsx --test tests/unit/quickSession/resume-name-flow.test.ts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

test('the overview recognizes an entered workout and renders Continue workout', () => {
  const source = read('app/dashboard/workout/quick-session/page.tsx')

  assert.match(source, /readQuickProgress\(sessionId\)/)
  assert.match(source, /startedFromHref/)
  assert.match(source, /hasStarted \? 'Continue workout' : 'Start workout'/)
})

test('leaving Live preserves both the server-backed and started state', () => {
  const source = read('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')

  assert.match(source, /quickSessionOverviewHref\(quickSessionId, \{ saved: true, started: true \}\)/)
})

test('Live and Track gate first completion on the shared naming prompt', () => {
  const live = read('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  const track = read('app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx')

  for (const source of [live, track]) {
    assert.match(source, /shouldPromptForQuickSessionName/)
    assert.match(source, /<QuickSessionNamePrompt/)
    assert.match(source, /Save name & finish/)
  }
  assert.match(track, /if \(!options\?\.completeQuick\) return true/)
})

test('the builder distinguishes a user-entered name and prompts on a direct unnamed log', () => {
  const source = read('components/SessionBuilder.tsx')

  assert.match(source, /titleWasEdited/)
  assert.match(source, /needsName: !hasChosenName/)
  assert.match(source, /!isFutureDate && !hasChosenName/)
  assert.match(source, /Save name & log/)
})
