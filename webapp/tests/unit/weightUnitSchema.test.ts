// NP-209 schema-level assertions. These do NOT touch a database — they
// instantiate the Mongoose models in-process and exercise the schema's
// defaults / validation directly, same pattern as userProgress-schema.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Types } from 'mongoose'
import User from '../../models/User'
import UserProgress from '../../models/UserProgress'

function pathDefault(path: unknown): unknown {
  const p = path as { defaultValue?: unknown; options?: { default?: unknown } }
  const d = p.options?.default ?? p.defaultValue
  return typeof d === 'function' ? (d as () => unknown)() : d
}

// ── profile.weightUnit: no default ──────────────────────────────────────────

test('profile.weightUnit carries NO default — absent means never asked', () => {
  const profilePath = User.schema.path('profile') as unknown as { schema?: { path(name: string): unknown } }
  assert.ok(profilePath.schema, 'profile must be a sub-schema')
  const weightUnitPath = profilePath.schema!.path('weightUnit')
  assert.ok(weightUnitPath, 'profile.weightUnit path must exist')
  assert.equal(pathDefault(weightUnitPath), undefined)
})

test('a new User has no profile.weightUnit until the member chooses', () => {
  const doc = new User({ email: 'np209@test.com', password: 'secret1', name: 'Test' })
  const obj = doc.toObject()
  assert.equal(obj.profile?.weightUnit, undefined)
})

test('profile.weightUnit still only accepts lbs/kg — invalid values are rejected', () => {
  const doc = new User({
    email: 'np209b@test.com',
    password: 'secret1',
    name: 'Test',
    profile: { weightUnit: 'stone' as unknown as 'lbs' },
  })
  const err = doc.validateSync()
  assert.ok(err, 'an invalid weightUnit must fail validation')
})

test('explicit lbs/kg still validates cleanly (the 46 grandfathered lbs accounts stay valid)', () => {
  for (const unit of ['lbs', 'kg'] as const) {
    const doc = new User({
      email: `np209-${unit}@test.com`,
      password: 'secret1',
      name: 'Test',
      profile: { weightUnit: unit },
    })
    const err = doc.validateSync()
    assert.equal(err, undefined, `${unit} should validate cleanly`)
  }
})

// ── ISetLog.weightUnit ──────────────────────────────────────────────────────

test('SetLog schema declares weightUnit as an optional lbs/kg enum with no default', () => {
  // Nested array-of-subdocuments schema chain: workoutLogs -> exercises -> sets.
  // Loosely typed (`as any`) purely for schema introspection, same pattern as
  // tests/unit/programExerciseRepairs.test.ts / dumbbellCatalog.test.ts.
  const workoutLogsPath = UserProgress.schema.path('workoutLogs') as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const exercisesPath = workoutLogsPath.schema.path('exercises')
  const setsPath = exercisesPath.schema.path('sets')
  const weightUnitPath = setsPath.schema.path('weightUnit')
  assert.ok(weightUnitPath, 'ISetLog.weightUnit path must exist')
  assert.equal(pathDefault(weightUnitPath), undefined)
})

test('a logged set with no weightUnit (grandfathered lbs) validates cleanly', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    workoutLogs: [
      {
        date: new Date('2026-05-01'),
        programId: 'p1',
        phase: 1,
        day: 'Day 1',
        completed: true,
        exercises: [
          { name: 'Bench Press', sets: [{ setNumber: 1, weight: 135, reps: 5, completed: true }] },
        ],
      },
    ],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined)
  const obj = doc.toObject()
  assert.equal(obj.workoutLogs[0].exercises[0].sets[0].weightUnit, undefined)
})

test('a logged set stamped with kg round-trips', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    workoutLogs: [
      {
        date: new Date('2026-05-01'),
        programId: 'p1',
        phase: 1,
        day: 'Day 1',
        completed: true,
        exercises: [
          { name: 'Bench Press', sets: [{ setNumber: 1, weight: 60, reps: 5, completed: true, weightUnit: 'kg' }] },
        ],
      },
    ],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined)
  assert.equal(doc.toObject().workoutLogs[0].exercises[0].sets[0].weightUnit, 'kg')
})

// ── IPRDimension.unit ────────────────────────────────────────────────────────

test('PRDimension carries an optional unit alongside weight/e1rm, raw + unit — not converted', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    exercisePRs: [
      {
        exerciseSlug: 'bench-press',
        exerciseName: 'Bench Press',
        maxWeight: { weight: 60, reps: 5, date: new Date('2026-05-01'), unit: 'kg' },
        maxReps: null,
        maxE1RM: { weight: 60, reps: 5, e1rm: 70, date: new Date('2026-05-01'), unit: 'kg' },
      },
    ],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined, `expected no validation errors, got: ${err?.message}`)
  const obj = doc.toObject()
  assert.equal(obj.exercisePRs[0].maxWeight?.unit, 'kg')
  assert.equal(obj.exercisePRs[0].maxE1RM?.unit, 'kg')
})

test('a pre-existing PR dimension with no unit (grandfathered lbs) still validates', () => {
  const doc = new UserProgress({
    userId: new Types.ObjectId(),
    exercisePRs: [
      {
        exerciseSlug: 'squat',
        exerciseName: 'Back Squat',
        maxWeight: { weight: 315, reps: 3, date: new Date('2026-04-01') },
        maxReps: null,
        maxE1RM: null,
      },
    ],
  })
  const err = doc.validateSync()
  assert.equal(err, undefined)
  assert.equal(doc.toObject().exercisePRs[0].maxWeight?.unit, undefined)
})
