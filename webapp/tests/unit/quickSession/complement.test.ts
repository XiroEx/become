// Run with: npm run test:file tests/unit/quickSession/complement.test.ts
//
// Covers draft criteria inference, complement coverage/deduplication,
// deterministic seeded selection, auto-finish target sizing, and suggestion
// explanations. The fixtures are intentionally small and IO-free.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSession } from '../../../lib/quickSession/generate'
import {
  completeDraft,
  inferSessionCriteria,
  selectComplements,
  suggestComplements,
} from '../../../lib/quickSession/complement'
import type { CandidateExercise } from '../../../lib/quickSession/types'

function exercise(slug: string, over: Partial<CandidateExercise> = {}): CandidateExercise {
  return {
    slug,
    name: slug.replace(/-/g, ' '),
    category: 'strength',
    role: 'accessory',
    mechanics: 'isolation',
    movementPatterns: ['knee_flexion'],
    primaryMuscles: ['hamstrings'],
    equipment: ['bodyweight'],
    difficulty: 'beginner',
    trackingType: 'reps_weight',
    bodyRegion: 'lower_body',
    defaultSets: 3,
    defaultReps: '10-15',
    defaultRest: '60s',
    ...over,
  }
}

const squat = exercise('back-squat', {
  name: 'Back Squat',
  role: 'compound',
  mechanics: 'compound',
  movementPatterns: ['squat'],
  primaryMuscles: ['quads', 'glutes'],
  equipment: ['barbell'],
})

const hinge = exercise('romanian-deadlift', {
  name: 'Romanian Deadlift',
  role: 'compound',
  mechanics: 'compound',
  movementPatterns: ['hinge'],
  primaryMuscles: ['hamstrings', 'glutes'],
  equipment: ['barbell'],
})

const candidates: CandidateExercise[] = [
  squat,
  hinge,
  exercise('leg-press', {
    name: 'Leg Press',
    role: 'compound',
    mechanics: 'compound',
    movementPatterns: ['squat'],
    primaryMuscles: ['quads', 'glutes'],
    equipment: ['machine'],
  }),
  exercise('lying-leg-curl', { name: 'Lying Leg Curl', primaryMuscles: ['hamstrings'] }),
  exercise('standing-calf-raise', {
    name: 'Standing Calf Raise',
    movementPatterns: ['ankle_flexion'],
    primaryMuscles: ['calves'],
  }),
  exercise('seated-calf-raise', {
    name: 'Seated Calf Raise',
    movementPatterns: ['ankle_flexion'],
    primaryMuscles: ['calves'],
  }),
  exercise('hip-thrust', {
    name: 'Hip Thrust',
    role: 'secondary',
    mechanics: 'compound',
    movementPatterns: ['hip_extension'],
    primaryMuscles: ['glutes'],
  }),
]

test('inferSessionCriteria: squat + hinge seeds infer a lower-body focus and coverage', () => {
  const result = inferSessionCriteria([squat, hinge])
  assert.ok(result.focus === 'lower' || result.focus === 'legs')
  assert.equal(result.coverage.primaryMuscles.quads, 1)
  assert.equal(result.coverage.primaryMuscles.glutes, 2)
  assert.equal(result.coverage.movementPatterns.squat, 1)
  assert.equal(result.coverage.movementPatterns.hinge, 1)
  assert.equal(result.coverage.bodyRegions.lower_body, 2)
})

test('selectComplements: prefers uncovered muscles and deduplicates seeds/results', () => {
  const selected = selectComplements(candidates, [squat, hinge], 3, { seed: 7 })
  const slugs = selected.map((candidate) => candidate.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  assert.ok(!slugs.includes('back-squat'))
  assert.ok(!slugs.includes('romanian-deadlift'))
  assert.ok(slugs.includes('standing-calf-raise') || slugs.includes('seated-calf-raise'))
})

test('selectComplements: same seed reproduces and a different seed can vary ties', () => {
  const once = selectComplements(candidates, [squat, hinge], 1, { seed: 11 })
  const twice = selectComplements(candidates, [squat, hinge], 1, { seed: 11 })
  assert.deepEqual(once, twice)

  const outputs = new Set([1, 2, 3, 4, 5, 6].map((seed) => selectComplements(candidates, [squat, hinge], 1, { seed }).map((e) => e.slug).join(',')))
  assert.ok(outputs.size > 1)
})

test('completeDraft: raises targets to add at least one complement for 1- and 4-exercise drafts', () => {
  const one = completeDraft(candidates, [squat], { targetTotal: 3, seed: 2 })
  assert.equal(one.length, 2)

  const fourSeeds = [squat, hinge, candidates[2], candidates[3]]
  const four = completeDraft(candidates, fourSeeds, { targetTotal: 3, seed: 2 })
  assert.equal(four.length, 1)
})

test('completeDraft: returns empty for a full or exhausted draft and handles empty seeds', () => {
  assert.deepEqual(completeDraft(candidates, candidates.slice(0, 10), { seed: 1 }), [])
  assert.deepEqual(completeDraft([squat], [squat], { seed: 1 }), [])
  assert.doesNotThrow(() => selectComplements([], [], 3, { seed: 1 }))
  assert.deepEqual(selectComplements([], [], 3, { seed: 1 }), [])
})

test('suggestComplements: returns draft-ready exercises with a plain gap reason', () => {
  const suggestions = suggestComplements(candidates, [squat, hinge], 2, { seed: 3 })
  assert.equal(suggestions.length, 2)
  assert.ok(suggestions.every(({ exercise, reason }) => exercise.exerciseSlug && reason.includes('—')))
  assert.ok(suggestions.some(({ reason }) => /calves|knee flexion|ankle flexion/.test(reason)))
})

test('generateSession: remains deterministic for a fixed fixture and seed', () => {
  const first = generateSession(candidates, { focus: 'legs', exerciseCount: 3, seed: 19 })
  const second = generateSession(candidates, { focus: 'legs', exerciseCount: 3, seed: 19 })
  assert.deepEqual(first, second)
})
