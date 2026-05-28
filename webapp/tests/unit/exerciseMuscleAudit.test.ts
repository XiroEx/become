// Run with: npx tsx --test tests/unit/exerciseMuscleAudit.test.ts
//
// Covers the three classifier helpers used by scripts/audit-exercise-muscles.ts:
//   - isMissingPrimary
//   - antagonistContradictions
//   - categoryMismatch
//
// Plus the auditExercise() orchestrator and the CSV emitter.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isMissingPrimary,
  antagonistContradictions,
  categoryMismatch,
  auditExercise,
  issuesToCSV,
  isResistanceCategory,
  type AuditableExercise,
} from '../../lib/exerciseMuscleAudit'

const base: AuditableExercise = {
  slug: 'fixture',
  name: 'Fixture',
  category: 'strength',
  movementPatterns: ['squat'],
  primaryMuscles: ['quads'],
  secondaryMuscles: ['glutes'],
}

// ── isResistanceCategory ─────────────────────────────────────────────────────

test('isResistanceCategory: strength/power/calisthenics/olympic/strongman → true', () => {
  assert.equal(isResistanceCategory('strength'), true)
  assert.equal(isResistanceCategory('power'), true)
  assert.equal(isResistanceCategory('calisthenics'), true)
  assert.equal(isResistanceCategory('olympic'), true)
  assert.equal(isResistanceCategory('strongman'), true)
})

test('isResistanceCategory: cardio/mobility/warmup/cooldown/flexibility → false', () => {
  assert.equal(isResistanceCategory('cardio'), false)
  assert.equal(isResistanceCategory('mobility'), false)
  assert.equal(isResistanceCategory('warmup'), false)
  assert.equal(isResistanceCategory('cooldown'), false)
  assert.equal(isResistanceCategory('flexibility'), false)
  assert.equal(isResistanceCategory('plyometric'), false)
  assert.equal(isResistanceCategory('conditioning'), false)
  assert.equal(isResistanceCategory('protocol'), false)
})

// ── isMissingPrimary ─────────────────────────────────────────────────────────

test('isMissingPrimary: strength with empty primary → flagged', () => {
  assert.equal(isMissingPrimary({ ...base, primaryMuscles: [] }), true)
})

test('isMissingPrimary: power/calisthenics/olympic/strongman with empty primary → flagged', () => {
  for (const cat of ['power', 'calisthenics', 'olympic', 'strongman'] as const) {
    assert.equal(
      isMissingPrimary({ ...base, category: cat, primaryMuscles: [] }),
      true,
      `expected ${cat} with empty primary to be flagged`,
    )
  }
})

test('isMissingPrimary: strength with non-empty primary → not flagged', () => {
  assert.equal(isMissingPrimary({ ...base, primaryMuscles: ['quads'] }), false)
  assert.equal(isMissingPrimary({ ...base, primaryMuscles: ['chest', 'triceps'] }), false)
})

test('isMissingPrimary: cardio/mobility with empty primary → not flagged (legitimately empty)', () => {
  assert.equal(
    isMissingPrimary({ ...base, category: 'cardio', primaryMuscles: [] }),
    false,
  )
  assert.equal(
    isMissingPrimary({ ...base, category: 'mobility', primaryMuscles: [] }),
    false,
  )
  assert.equal(
    isMissingPrimary({ ...base, category: 'warmup', primaryMuscles: [] }),
    false,
  )
})

// ── antagonistContradictions ─────────────────────────────────────────────────

test('antagonistContradictions: squat with biceps secondary → flagged (canonical example)', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['squat'],
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes', 'biceps'],
  })
  assert.deepEqual(violations, ['biceps'])
})

test('antagonistContradictions: bench (horizontal_push) with lats secondary → flagged', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['horizontal_push'],
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'lats'],
  })
  assert.deepEqual(violations, ['lats'])
})

test('antagonistContradictions: pullup (vertical_pull) with triceps as primary → flagged', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['vertical_pull'],
    primaryMuscles: ['lats', 'triceps'],
    secondaryMuscles: ['biceps'],
  })
  assert.deepEqual(violations, ['triceps'])
})

test('antagonistContradictions: clean squat with no violations → empty', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['squat'],
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes', 'hamstrings', 'calves'],
  })
  assert.deepEqual(violations, [])
})

test('antagonistContradictions: hybrid pattern (squat+vertical_push thruster) — union allows both push and squat muscles', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['squat', 'vertical_push'],
    primaryMuscles: ['quads', 'front_delts'],
    secondaryMuscles: ['glutes', 'triceps'],
  })
  // Front delts + triceps are push, quads + glutes are squat — both legit when
  // the pattern is the union. Should NOT flag.
  assert.deepEqual(violations, [])
})

test('antagonistContradictions: hybrid thruster with lats secondary → still flagged (lats is neither push nor squat)', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['squat', 'vertical_push'],
    primaryMuscles: ['quads'],
    secondaryMuscles: ['lats'],
  })
  assert.deepEqual(violations, ['lats'])
})

test('antagonistContradictions: pattern is n/a only → no opinion, returns empty', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['n/a'],
    primaryMuscles: ['quads', 'biceps'], // intentionally weird; no opinion
    secondaryMuscles: [],
  })
  assert.deepEqual(violations, [])
})

test('antagonistContradictions: empty pattern list → no opinion, returns empty', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: [],
    primaryMuscles: ['quads', 'biceps'],
    secondaryMuscles: [],
  })
  assert.deepEqual(violations, [])
})

test('antagonistContradictions: leg-curl (knee_flexion) only allows hamstrings/calves', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['knee_flexion'],
    primaryMuscles: ['quads'], // wrong — should be hamstrings
    secondaryMuscles: [],
  })
  assert.deepEqual(violations, ['quads'])
})

test('antagonistContradictions: bicep curl (elbow_flexion) with triceps secondary → flagged (pure antagonist)', () => {
  const violations = antagonistContradictions({
    ...base,
    movementPatterns: ['elbow_flexion'],
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['triceps'], // classic muscle-mapping bug
  })
  assert.deepEqual(violations, ['triceps'])
})

// ── categoryMismatch ────────────────────────────────────────────────────────

test('categoryMismatch: strength with primary=[full_body] only → flagged', () => {
  const msg = categoryMismatch({
    ...base,
    primaryMuscles: ['full_body'],
  })
  assert.ok(msg && /full_body/.test(msg))
})

test('categoryMismatch: strength with full_body + other muscles → not flagged', () => {
  assert.equal(
    categoryMismatch({ ...base, primaryMuscles: ['full_body', 'quads'] }),
    null,
  )
})

test('categoryMismatch: strength with empty primary → null (covered by MISSING_PRIMARY)', () => {
  assert.equal(
    categoryMismatch({ ...base, primaryMuscles: [] }),
    null,
  )
})

test('categoryMismatch: cardio with empty primary → null', () => {
  assert.equal(
    categoryMismatch({ ...base, category: 'cardio', primaryMuscles: [] }),
    null,
  )
})

// ── auditExercise orchestrator ───────────────────────────────────────────────

test('auditExercise: clean exercise → no issues', () => {
  const issues = auditExercise({
    ...base,
    movementPatterns: ['squat'],
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes', 'hamstrings'],
  })
  assert.deepEqual(issues, [])
})

test('auditExercise: missing primary AND antagonist contradiction → two issues', () => {
  // Empty primary triggers MISSING_PRIMARY. Secondary biceps on a squat
  // triggers ANTAGONIST_CONTRADICTION (allow-list union from squat pattern
  // doesn't include biceps).
  const issues = auditExercise({
    ...base,
    movementPatterns: ['squat'],
    primaryMuscles: [],
    secondaryMuscles: ['biceps'],
  })
  assert.equal(issues.length, 2)
  assert.equal(issues[0].issueType, 'MISSING_PRIMARY')
  assert.equal(issues[1].issueType, 'ANTAGONIST_CONTRADICTION')
})

test('auditExercise: full_body-only primary → CATEGORY_MISMATCH (not MISSING_PRIMARY)', () => {
  const issues = auditExercise({
    ...base,
    movementPatterns: ['squat'],
    primaryMuscles: ['full_body'],
    secondaryMuscles: [],
  })
  // full_body is in the squat allow-list union, so no antagonist issue.
  assert.equal(issues.length, 1)
  assert.equal(issues[0].issueType, 'CATEGORY_MISMATCH')
})

test('auditExercise: each issue carries the slug, name, category, primary, secondary verbatim', () => {
  const issues = auditExercise({
    slug: 'leg-curl',
    name: 'Lying Leg Curl',
    category: 'strength',
    movementPatterns: ['knee_flexion'],
    primaryMuscles: ['quads'], // wrong
    secondaryMuscles: [],
  })
  assert.equal(issues.length, 1)
  assert.equal(issues[0].slug, 'leg-curl')
  assert.equal(issues[0].name, 'Lying Leg Curl')
  assert.equal(issues[0].currentCategory, 'strength')
  assert.deepEqual(issues[0].currentPrimary, ['quads'])
  assert.deepEqual(issues[0].currentSecondary, [])
})

// ── issuesToCSV ─────────────────────────────────────────────────────────────

test('issuesToCSV: emits header even with no rows', () => {
  const csv = issuesToCSV([])
  const lines = csv.trim().split('\n')
  assert.equal(lines.length, 1)
  assert.equal(
    lines[0],
    'slug,name,issueType,detail,currentPrimary,currentSecondary,currentCategory',
  )
})

test('issuesToCSV: muscle arrays are pipe-joined, not comma-joined (CSV-safe)', () => {
  const csv = issuesToCSV([
    {
      slug: 'bench',
      name: 'Bench Press',
      issueType: 'ANTAGONIST_CONTRADICTION',
      detail: 'foo',
      currentPrimary: ['chest', 'triceps'],
      currentSecondary: ['front_delts'],
      currentCategory: 'strength',
    },
  ])
  // Pipe-join means no extra commas appear in the muscle columns.
  const rowLine = csv.trim().split('\n')[1]
  assert.ok(rowLine.includes('chest|triceps'))
  assert.ok(rowLine.includes('front_delts'))
  // Total commas == column count - 1 == 6
  assert.equal(rowLine.split(',').length, 7)
})

test('issuesToCSV: detail with embedded commas is quoted', () => {
  const csv = issuesToCSV([
    {
      slug: 'x',
      name: 'X',
      issueType: 'ANTAGONIST_CONTRADICTION',
      detail: 'muscles outside allow-list: a, b, c',
      currentPrimary: [],
      currentSecondary: [],
      currentCategory: 'strength',
    },
  ])
  const rowLine = csv.trim().split('\n')[1]
  assert.ok(rowLine.includes('"muscles outside allow-list: a, b, c"'))
})

test('issuesToCSV: name with embedded quote is escaped', () => {
  const csv = issuesToCSV([
    {
      slug: 'x',
      name: 'Bob\'s "Curl"',
      issueType: 'MISSING_PRIMARY',
      detail: 'd',
      currentPrimary: [],
      currentSecondary: [],
      currentCategory: 'strength',
    },
  ])
  const rowLine = csv.trim().split('\n')[1]
  // Double-quote escape per RFC 4180: "Bob's ""Curl"""
  assert.ok(rowLine.includes('"Bob\'s ""Curl"""'))
})
