// Run with: npx tsx --test tests/unit/suggestedExercises.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSuggestedExercises, type SuggestedCandidate } from '@/lib/workout/suggestedExercises'

const cand = (slug: string, name = slug): SuggestedCandidate => ({ slug, name, trackingType: 'reps_weight' })

test('buildSuggestedExercises: empty candidates → empty list', () => {
  assert.deepEqual(buildSuggestedExercises([], []), [])
})

test('buildSuggestedExercises: drops exercises already in the workout', () => {
  const out = buildSuggestedExercises(
    [cand('incline-bench'), cand('flat-bench'), cand('cable-fly')],
    ['flat-bench'],
  )
  assert.deepEqual(out.map(c => c.slug), ['incline-bench', 'cable-fly'])
})

test('buildSuggestedExercises: the workout-slug match is case-insensitive', () => {
  const out = buildSuggestedExercises([cand('Flat-Bench')], ['flat-bench'])
  assert.deepEqual(out, [])
})

test('buildSuggestedExercises: dedupes repeated candidate slugs', () => {
  const out = buildSuggestedExercises([cand('cable-fly'), cand('cable-fly')], [])
  assert.deepEqual(out.map(c => c.slug), ['cable-fly'])
})

test('buildSuggestedExercises: preserves incoming (score) order', () => {
  const out = buildSuggestedExercises([cand('a'), cand('b'), cand('c')], [])
  assert.deepEqual(out.map(c => c.slug), ['a', 'b', 'c'])
})

test('buildSuggestedExercises: caps at the given limit', () => {
  const candidates = ['a', 'b', 'c', 'd', 'e'].map(s => cand(s))
  const out = buildSuggestedExercises(candidates, [], 3)
  assert.equal(out.length, 3)
  assert.deepEqual(out.map(c => c.slug), ['a', 'b', 'c'])
})

test('buildSuggestedExercises: defaults to a limit of 6', () => {
  const candidates = Array.from({ length: 10 }, (_, i) => cand(`ex-${i}`))
  const out = buildSuggestedExercises(candidates, [])
  assert.equal(out.length, 6)
})
