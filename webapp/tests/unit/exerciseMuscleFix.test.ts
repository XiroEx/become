// Run with: npx tsx --test tests/unit/exerciseMuscleFix.test.ts
//
// Covers the pure helpers used by scripts/fix-exercise-muscles.ts:
//   - muscleArrayEqual (order-independent set equality)
//   - computeFixDiff (idempotency: re-applying a fix that already matches is
//     a no-op)
//   - formatDiff (shape of the human-readable line)
//
// Plus a smoke check that MUSCLE_FIXES is non-empty and slug-unique.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  muscleArrayEqual,
  computeFixDiff,
  formatDiff,
  MUSCLE_FIXES,
  type MuscleFix,
} from '../../lib/exerciseMuscleFix'
import type { MuscleGroup } from '../../models/Exercise'

const sampleFix: MuscleFix = {
  slug: 'bench-press',
  reason: 'classic horizontal push',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps', 'front_delts'],
}

// ── muscleArrayEqual ────────────────────────────────────────────────────────

test('muscleArrayEqual: both empty → true', () => {
  assert.equal(muscleArrayEqual([], []), true)
})

test('muscleArrayEqual: identical order → true', () => {
  assert.equal(muscleArrayEqual(['chest', 'triceps'], ['chest', 'triceps']), true)
})

test('muscleArrayEqual: different order → true (set equality)', () => {
  assert.equal(muscleArrayEqual(['chest', 'triceps'], ['triceps', 'chest']), true)
})

test('muscleArrayEqual: different lengths → false', () => {
  assert.equal(muscleArrayEqual(['chest'], ['chest', 'triceps']), false)
  assert.equal(muscleArrayEqual(['chest', 'triceps'], ['chest']), false)
})

test('muscleArrayEqual: different elements → false', () => {
  assert.equal(muscleArrayEqual(['chest'], ['triceps']), false)
})

test('muscleArrayEqual: empty vs non-empty → false', () => {
  assert.equal(muscleArrayEqual([], ['chest']), false)
  assert.equal(muscleArrayEqual(['chest'], []), false)
})

// ── computeFixDiff ─────────────────────────────────────────────────────────

test('computeFixDiff: current already matches fix → changed=false (idempotency)', () => {
  const diff = computeFixDiff(
    { primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'] },
    sampleFix,
  )
  assert.equal(diff.changed, false)
  assert.equal(diff.primaryChanged, false)
  assert.equal(diff.secondaryChanged, false)
})

test('computeFixDiff: current matches fix in different order → changed=false (set equality)', () => {
  const diff = computeFixDiff(
    { primaryMuscles: ['chest'], secondaryMuscles: ['front_delts', 'triceps'] }, // swapped
    sampleFix,
  )
  assert.equal(diff.changed, false)
})

test('computeFixDiff: primary differs → primaryChanged=true, secondaryChanged=false', () => {
  const diff = computeFixDiff(
    { primaryMuscles: ['chest', 'triceps'], secondaryMuscles: ['triceps', 'front_delts'] },
    sampleFix,
  )
  assert.equal(diff.changed, true)
  assert.equal(diff.primaryChanged, true)
  assert.equal(diff.secondaryChanged, false)
})

test('computeFixDiff: secondary differs → primaryChanged=false, secondaryChanged=true', () => {
  const diff = computeFixDiff(
    { primaryMuscles: ['chest'], secondaryMuscles: ['biceps'] }, // wrong
    sampleFix,
  )
  assert.equal(diff.changed, true)
  assert.equal(diff.primaryChanged, false)
  assert.equal(diff.secondaryChanged, true)
})

test('computeFixDiff: both differ → both changed flags true', () => {
  const diff = computeFixDiff(
    { primaryMuscles: [], secondaryMuscles: [] },
    sampleFix,
  )
  assert.equal(diff.changed, true)
  assert.equal(diff.primaryChanged, true)
  assert.equal(diff.secondaryChanged, true)
})

test('computeFixDiff: before/after carry the actual arrays (for logging)', () => {
  const diff = computeFixDiff(
    { primaryMuscles: ['chest', 'biceps'], secondaryMuscles: [] },
    sampleFix,
  )
  assert.deepEqual(diff.before.primaryMuscles, ['chest', 'biceps'])
  assert.deepEqual(diff.before.secondaryMuscles, [])
  assert.deepEqual(diff.after.primaryMuscles, ['chest'])
  assert.deepEqual(diff.after.secondaryMuscles, ['triceps', 'front_delts'])
  assert.equal(diff.reason, 'classic horizontal push')
})

// ── Idempotency: applying twice produces no second update ───────────────────

test('idempotency: after applying fix, recomputing diff against the new state shows no change', () => {
  // Simulate the script: starting state is wrong.
  let current: { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] } = {
    primaryMuscles: ['chest', 'biceps'],
    secondaryMuscles: [],
  }

  // First run: detects a change.
  const first = computeFixDiff(current, sampleFix)
  assert.equal(first.changed, true)

  // Apply (script: ex.primaryMuscles = fix.primaryMuscles; ex.secondaryMuscles = fix.secondaryMuscles)
  current = {
    primaryMuscles: [...sampleFix.primaryMuscles],
    secondaryMuscles: [...sampleFix.secondaryMuscles],
  }

  // Second run: identical state, must report no change.
  const second = computeFixDiff(current, sampleFix)
  assert.equal(second.changed, false)
  assert.equal(second.primaryChanged, false)
  assert.equal(second.secondaryChanged, false)
})

// ── formatDiff ─────────────────────────────────────────────────────────────

test('formatDiff: unchanged → single-line ✓ notice', () => {
  const diff = computeFixDiff(
    { primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front_delts'] },
    sampleFix,
  )
  const out = formatDiff(diff)
  assert.ok(out.startsWith('✓ bench-press'))
  assert.equal(out.split('\n').length, 1)
})

test('formatDiff: changed primary only → header + one indented line', () => {
  const diff = computeFixDiff(
    { primaryMuscles: [], secondaryMuscles: ['triceps', 'front_delts'] },
    sampleFix,
  )
  const out = formatDiff(diff)
  const lines = out.split('\n')
  assert.ok(lines[0].startsWith('✎ bench-press'))
  assert.ok(lines[0].includes('classic horizontal push'))
  assert.equal(lines.length, 2)
  assert.ok(lines[1].includes('primary:'))
  assert.ok(lines[1].includes('[] → [chest]'))
})

test('formatDiff: changed both → header + two indented lines', () => {
  const diff = computeFixDiff(
    { primaryMuscles: [], secondaryMuscles: [] },
    sampleFix,
  )
  const out = formatDiff(diff)
  const lines = out.split('\n')
  assert.equal(lines.length, 3)
  assert.ok(lines[1].includes('primary:'))
  assert.ok(lines[2].includes('secondary:'))
})

// ── MUSCLE_FIXES allow-list integrity ───────────────────────────────────────

test('MUSCLE_FIXES: non-empty', () => {
  assert.ok(MUSCLE_FIXES.length > 0)
})

test('MUSCLE_FIXES: slugs are unique (one fix per exercise)', () => {
  const slugs = MUSCLE_FIXES.map(f => f.slug)
  const unique = new Set(slugs)
  assert.equal(unique.size, slugs.length, `duplicate slug(s) in allow-list: ${slugs.join(', ')}`)
})

test('MUSCLE_FIXES: every fix has a non-empty reason + non-empty primary', () => {
  for (const f of MUSCLE_FIXES) {
    assert.ok(f.reason && f.reason.length > 0, `fix for ${f.slug} missing reason`)
    assert.ok(
      f.primaryMuscles.length > 0,
      `fix for ${f.slug} has empty primaryMuscles — fixes should specify the canonical primary`,
    )
  }
})
