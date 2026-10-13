// Run with: npm run test:file tests/unit/userProgress-schema.test.ts
//
// Schema-level assertions for the persistent ExercisePR subdocument added to
// UserProgress. These do NOT touch a database — they instantiate the Mongoose
// model in-process and exercise the schema's defaults / validation directly,
// so a regression in the schema declaration shows up here even when no test
// MongoDB is available.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import UserProgress from '../../models/UserProgress'

test('UserProgress schema declares exercisePRs as an array defaulting to []', () => {
  const path = UserProgress.schema.path('exercisePRs') as unknown as {
    instance: string
    defaultValue?: unknown
    options?: { default?: unknown }
  }
  assert.ok(path, 'exercisePRs path must exist on the schema')
  assert.equal(path.instance, 'Array')

  // Mongoose stores the user-provided default either at path.options.default
  // or path.defaultValue depending on version — accept either.
  const dflt =
    typeof path.options?.default === 'function'
      ? (path.options.default as () => unknown)()
      : path.options?.default ?? path.defaultValue
  assert.ok(Array.isArray(dflt), `default must be an array, got ${typeof dflt}`)
  assert.equal((dflt as unknown[]).length, 0)
})

test('new UserProgress() instances start with exercisePRs = []', () => {
  const doc = new UserProgress({ userId: new Types.ObjectId() })
  // doc.exercisePRs is a Mongoose array-like; use toObject() for stable shape.
  const obj = doc.toObject()
  assert.ok(Array.isArray(obj.exercisePRs))
  assert.equal(obj.exercisePRs.length, 0)
})

test('docs constructed WITHOUT exercisePRs (existing prod docs) validate cleanly', () => {
  // Simulates an existing user document predating the migration: no
  // exercisePRs field in source, no workoutLogs either.
  const doc = new UserProgress({ userId: new Types.ObjectId() })
  const err = doc.validateSync()
  assert.equal(err, undefined, 'no validation errors expected for pre-migration shape')
})

test('a well-formed ExercisePR subdocument validates cleanly', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    exercisePRs: [
      {
        exerciseSlug: 'bench-press',
        exerciseName: 'Bench Press',
        maxWeight: { weight: 225, reps: 5, date: new Date('2026-05-01'), programId: 'p1' },
        maxReps: { weight: 135, reps: 12, date: new Date('2026-05-02') },
        maxE1RM: { weight: 225, reps: 5, e1rm: 262.5, date: new Date('2026-05-01') },
      },
    ],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined, `expected no validation errors, got: ${err?.message}`)
  const obj = doc.toObject()
  assert.equal(obj.exercisePRs.length, 1)
  assert.equal(obj.exercisePRs[0].exerciseSlug, 'bench-press')
  assert.equal(obj.exercisePRs[0].maxWeight?.weight, 225)
  assert.equal(obj.exercisePRs[0].maxE1RM?.e1rm, 262.5)
})

test('ExercisePR with all dimensions null is valid (e.g. exercise reset to no records)', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    exercisePRs: [
      { exerciseSlug: 'squat', exerciseName: 'Squat', maxWeight: null, maxReps: null, maxE1RM: null },
    ],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined)
})

test('ExercisePR without exerciseSlug fails validation (slug is required)', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    exercisePRs: [
      // Intentionally missing required exerciseSlug field.
      { exerciseName: 'Pull Ups', maxReps: { weight: 0, reps: 15, date: new Date() } },
    ],
  })
  const err = doc.validateSync()
  assert.ok(err, 'missing exerciseSlug should produce a validation error')
  assert.ok(
    Object.keys(err.errors).some((k) => k.includes('exerciseSlug')),
    `error keys should mention exerciseSlug; got ${Object.keys(err.errors).join(', ')}`,
  )
})

test('PRDimension without required {weight, reps, date} fails validation', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    exercisePRs: [
      {
        exerciseSlug: 'bench-press',
        exerciseName: 'Bench Press',
        // Intentionally missing required date field.
        maxWeight: { weight: 225, reps: 5 },
        maxReps: null,
        maxE1RM: null,
      },
    ],
  })
  const err = doc.validateSync()
  assert.ok(err, 'PR dimension missing required date should fail validation')
})

test('UserProgress schema has compound index on (userId, exercisePRs.exerciseSlug)', () => {
  const indexes = UserProgress.schema.indexes() as Array<[Record<string, unknown>, unknown]>
  const compound = indexes.find(([fields]: [Record<string, unknown>, unknown]) => {
    const keys = Object.keys(fields)
    return keys.includes('userId') && keys.includes('exercisePRs.exerciseSlug')
  })
  assert.ok(
    compound,
    `expected (userId, exercisePRs.exerciseSlug) compound index; got: ${JSON.stringify(indexes)}`,
  )
})
