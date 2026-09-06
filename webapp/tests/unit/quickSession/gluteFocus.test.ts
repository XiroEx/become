// Run with: npm run test:file tests/unit/quickSession/gluteFocus.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { focusScore, generateSession } from '../../../lib/quickSession/generate'
import {
  FOCUS_DEFS,
  QUICK_FOCUS_ORDER,
  isFocusKey,
  type CandidateExercise,
} from '../../../lib/quickSession/types'

function exercise(slug: string, over: Partial<CandidateExercise> = {}): CandidateExercise {
  return {
    slug,
    name: slug.replace(/-/g, ' '),
    category: 'strength',
    role: 'accessory',
    mechanics: 'isolation',
    movementPatterns: ['n/a'],
    primaryMuscles: ['quads'],
    equipment: ['bodyweight'],
    difficulty: 'beginner',
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
    ...over,
  }
}

const hipThrust = exercise('hip-thrust', {
  role: 'secondary',
  mechanics: 'compound',
  movementPatterns: ['hinge'],
  primaryMuscles: ['glutes'],
})

const gluteCandidates: CandidateExercise[] = [
  hipThrust,
  exercise('glute-bridge', {
    role: 'secondary',
    mechanics: 'compound',
    movementPatterns: ['hinge'],
    primaryMuscles: ['glutes'],
  }),
  exercise('glute-cable-kickback', {
    movementPatterns: ['hip_extension'],
    primaryMuscles: ['glutes'],
  }),
  exercise('hip-abduction-machine', {
    primaryMuscles: ['abductors', 'glutes'],
  }),
  exercise('romanian-deadlift', {
    role: 'compound',
    mechanics: 'compound',
    movementPatterns: ['hinge'],
    primaryMuscles: ['hamstrings'],
  }),
  exercise('bulgarian-split-squat', {
    role: 'compound',
    mechanics: 'compound',
    movementPatterns: ['lunge'],
    primaryMuscles: ['quads', 'glutes'],
  }),
]

const offFocusCandidates: CandidateExercise[] = [
  exercise('leg-extension', { movementPatterns: ['knee_extension'] }),
  exercise('standing-calf-raise', {
    movementPatterns: ['ankle_flexion'],
    primaryMuscles: ['calves'],
  }),
  exercise('bench-press', {
    role: 'compound',
    mechanics: 'compound',
    movementPatterns: ['horizontal_push'],
    primaryMuscles: ['chest'],
    bodyRegion: 'upper_body',
  }),
]

test('glutes is a selectable focus shared by Workout Now and generation', () => {
  assert.equal(isFocusKey('glutes'), true)
  assert.equal(FOCUS_DEFS.glutes.label, 'Glutes')
  assert.equal(QUICK_FOCUS_ORDER.indexOf('glutes'), QUICK_FOCUS_ORDER.indexOf('legs') + 1)
})

test('glute scoring admits posterior-chain compounds without admitting generic leg isolation', () => {
  const legExtension = offFocusCandidates[0]

  assert.ok(focusScore(hipThrust, 'glutes') > 0)
  assert.equal(focusScore(legExtension, 'glutes'), 0)
  assert.ok(focusScore(hipThrust, 'glutes') > focusScore(legExtension, 'glutes'))
})

test('glute session generation stays on target and preserves the selected focus', () => {
  const session = generateSession([...gluteCandidates, ...offFocusCandidates], {
    focus: 'glutes',
    exerciseCount: 5,
    seed: 23,
  })
  const offFocusSlugs = new Set(offFocusCandidates.map((candidate) => candidate.slug))

  assert.equal(session.title, 'Glutes Session')
  assert.equal(session.focus, 'glutes')
  assert.equal(session.exercises.length, 5)
  assert.ok(session.exercises.every((candidate) => !offFocusSlugs.has(candidate.exerciseSlug)))
  assert.ok(session.exercises.filter((candidate) => candidate.primaryMuscles?.includes('glutes')).length >= 3)
})
