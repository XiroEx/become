// Run with: npm run test:file tests/unit/suggestions/workout-sources.test.ts
import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  __resetSourceRegistryForTest,
  listSources,
} from '../../../lib/suggestions/registry'
import { runSuggestions } from '../../../lib/suggestions/engine'
import {
  ensureWorkoutSuggestionsRegistered,
  fatigueFlagSource,
  neglectedMuscleSource,
  plateauWarningSource,
  progressionNudgeSource,
} from '../../../lib/suggestions/workout'
import type { RecentActivity } from '../../../lib/suggestions/types'

beforeEach(() => {
  __resetSourceRegistryForTest()
})

const ACTIVITY: RecentActivity = {
  workoutLogs: [
    { date: new Date('2026-05-20T00:00:00Z'), exerciseSlugs: ['bench-press', 'row'] },
    { date: new Date('2026-05-23T00:00:00Z'), exerciseSlugs: ['bench-press'] },
    { date: new Date('2026-05-26T00:00:00Z'), exerciseSlugs: ['bench-press'] },
    { date: new Date('2026-05-27T00:00:00Z'), exerciseSlugs: ['shoulder-press'] },
  ],
  moodHistory: [
    { date: new Date('2026-05-25T00:00:00Z'), value: 2 },
    { date: new Date('2026-05-26T00:00:00Z'), value: 2 },
    { date: new Date('2026-05-27T00:00:00Z'), value: 3 },
  ],
  exercisePRs: [],
}

test('ensureWorkoutSuggestionsRegistered registers four workout sources idempotently', () => {
  ensureWorkoutSuggestionsRegistered()
  ensureWorkoutSuggestionsRegistered()
  assert.deepEqual(
    listSources().map((source) => source.id).sort(),
    [
      'workout.fatigue-flag',
      'workout.neglected-muscle',
      'workout.plateau-warning',
      'workout.progression-nudge',
    ],
  )
})

test('progressionNudgeSource emits for repeated recent exercise', async () => {
  const suggestion = await progressionNudgeSource('u1', ACTIVITY)
  assert.equal(suggestion?.id, 'workout.progression-nudge.bench-press')
  assert.equal(suggestion?.severity, 'nudge')
})

test('plateauWarningSource skips when the repeated exercise has a recent PR', async () => {
  const suggestion = await plateauWarningSource('u1', {
    ...ACTIVITY,
    exercisePRs: [
      {
        exerciseSlug: 'bench-press',
        exerciseName: 'Bench Press',
        dates: [new Date('2026-05-24T00:00:00Z')],
      },
    ],
  })
  assert.equal(suggestion, null)
})

test('neglectedMuscleSource nudges for missing recent training category', async () => {
  const suggestion = await neglectedMuscleSource('u1', ACTIVITY)
  assert.equal(suggestion?.id, 'workout.neglected-muscle.legs')
  assert.match(String(suggestion?.body), /legs/)
})

test('fatigueFlagSource warns when training density and low mood overlap', async () => {
  const suggestion = await fatigueFlagSource('u1', ACTIVITY)
  assert.equal(suggestion?.id, 'workout.fatigue-flag')
  assert.equal(suggestion?.severity, 'warning')
})

test('runSuggestions emits registered workout source suggestions', async () => {
  ensureWorkoutSuggestionsRegistered()
  const out = await runSuggestions('u1', ACTIVITY)
  const ids = out.map((suggestion) => suggestion.id).sort()
  assert.ok(ids.includes('workout.fatigue-flag'))
  assert.ok(ids.includes('workout.neglected-muscle.legs'))
  assert.ok(ids.includes('workout.progression-nudge.bench-press'))
})
