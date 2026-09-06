// Run with: npm run test:file tests/unit/exerciseVideoStaleIndex.test.ts
//
// The reported bug: uploading (or removing) an exercise video failed with
//   "Plan executor error during findAndModify :: caused by :: E11000
//    duplicate key error collection: jondonfitdb.exercisevideos index:
//    exerciseName_1 dup key: { exerciseName: 'Leg Press' }"
// every single time, for any exercise sharing a display name with another
// exercise that already had a video row. Commit 9ce2da4 relaxed the
// `exerciseName` uniqueness in the Mongoose schema (switching the ExerciseVideo
// upsert key to `slug`), but never dropped the old UNIQUE index that was
// already built on the live collection — Mongoose's autoIndex only ever adds
// indexes the schema currently declares, never drops ones it stopped
// declaring. lib/exerciseVideoIndex.ts self-heals that stale index the first
// time an upsert collides with it, then retries once.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import {
  isStaleExerciseNameUniqueIndexError,
  dropStaleExerciseNameUniqueIndex,
  upsertRetryingStaleIndex,
} from '../../lib/exerciseVideoIndex'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── Classifying the error ────────────────────────────────────────────────

test('isStaleExerciseNameUniqueIndexError recognizes the exact production error', () => {
  const err = {
    code: 11000,
    keyPattern: { exerciseName: 1 },
    message:
      'E11000 duplicate key error collection: jondonfitdb.exercisevideos index: ' +
      'exerciseName_1 dup key: { exerciseName: "Leg Press" }',
  }
  assert.equal(isStaleExerciseNameUniqueIndexError(err), true)
})

test('isStaleExerciseNameUniqueIndexError falls back to the message when keyPattern is missing', () => {
  const err = { code: 11000, message: 'dup key error index: exerciseName_1' }
  assert.equal(isStaleExerciseNameUniqueIndexError(err), true)
})

test('isStaleExerciseNameUniqueIndexError ignores duplicate-key errors on other indexes', () => {
  const err = { code: 11000, keyPattern: { slug: 1 }, message: 'dup key error index: slug_1' }
  assert.equal(isStaleExerciseNameUniqueIndexError(err), false)
})

test('isStaleExerciseNameUniqueIndexError ignores non-duplicate-key errors', () => {
  assert.equal(isStaleExerciseNameUniqueIndexError(new Error('boom')), false)
  assert.equal(isStaleExerciseNameUniqueIndexError(null), false)
  assert.equal(isStaleExerciseNameUniqueIndexError(undefined), false)
  assert.equal(isStaleExerciseNameUniqueIndexError('nope'), false)
})

// ─── Repairing the index ──────────────────────────────────────────────────

interface FakeIndex {
  name: string
  key: Record<string, number>
  unique?: boolean
}

function fakeCollection(indexes: FakeIndex[]) {
  const calls = { indexes: 0, dropIndex: 0, createIndex: 0 }
  return {
    calls,
    async indexes() {
      calls.indexes++
      return indexes
    },
    async dropIndex(name: string) {
      calls.dropIndex++
      assert.equal(name, 'exerciseName_1', 'must only ever drop the stale exerciseName index')
    },
    async createIndex(key: Record<string, number>, options: Record<string, unknown>) {
      calls.createIndex++
      assert.deepEqual(key, { exerciseName: 1 })
      assert.equal(options.unique, false, 'the replacement index must not be unique')
    },
  }
}

test('dropStaleExerciseNameUniqueIndex drops the legacy unique index once, then serves from cache', async () => {
  const fake = fakeCollection([
    { name: '_id_', key: { _id: 1 } },
    { name: 'slug_1', key: { slug: 1 }, unique: true },
    { name: 'exerciseName_1', key: { exerciseName: 1 }, unique: true },
  ])
  const original = mongoose.connection.collection.bind(mongoose.connection)
  ;(mongoose.connection as unknown as { collection: unknown }).collection = () => fake
  try {
    const first = await dropStaleExerciseNameUniqueIndex()
    const second = await dropStaleExerciseNameUniqueIndex()
    assert.equal(first, true)
    assert.equal(second, true)
    assert.equal(fake.calls.indexes, 1, 'the second call must not re-list indexes')
    assert.equal(fake.calls.dropIndex, 1)
    assert.equal(fake.calls.createIndex, 1)
  } finally {
    ;(mongoose.connection as unknown as { collection: unknown }).collection = original
  }
})

// ─── The retry wrapper ─────────────────────────────────────────────────────
// By the time these run, the repair above already resolved and cached, so
// these exercise the retry path without touching mongoose.connection again.

test('upsertRetryingStaleIndex retries exactly once after self-healing the stale index', async () => {
  let calls = 0
  const staleError = Object.assign(
    new Error(
      'E11000 duplicate key error collection: jondonfitdb.exercisevideos index: exerciseName_1 dup key: { exerciseName: "Leg Press" }'
    ),
    { code: 11000, keyPattern: { exerciseName: 1 } }
  )
  const result = await upsertRetryingStaleIndex(async () => {
    calls++
    if (calls === 1) throw staleError
    return 'ok'
  })
  assert.equal(result, 'ok')
  assert.equal(calls, 2, 'the op must run once, fail, then run again after the repair')
})

test('upsertRetryingStaleIndex does not retry unrelated errors', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      upsertRetryingStaleIndex(async () => {
        calls++
        throw new Error('totally different failure')
      }),
    /totally different failure/
  )
  assert.equal(calls, 1, 'an unrelated error must propagate on the first attempt, not retry')
})

// ─── Wiring: every ExerciseVideo upsert goes through the wrapper ──────────
// Source scans rather than route tests, matching this suite's convention for
// routes that need a live Mongo + admin auth context (see
// exerciseVideoClear.test.ts) — the regression here is precisely identifiable
// in the source: a `findOneAndUpdate` call that bypasses the wrapper.

test('the primary video route imports and uses the stale-index wrapper for both writes', () => {
  const src = readSource('app/api/exercises/[slug]/video/route.ts')
  assert.match(
    src,
    /import \{ upsertRetryingStaleIndex \} from '@\/lib\/exerciseVideoIndex'/,
    'must import the wrapper'
  )
  const wrapped = src.match(/upsertRetryingStaleIndex\(\(\) =>/g) ?? []
  assert.equal(
    wrapped.length,
    2,
    'both the POST upsert and the DELETE update must go through the wrapper'
  )
})

test('the exercise-videos admin endpoint upserts through the stale-index wrapper', () => {
  const src = readSource('app/api/exercise-videos/route.ts')
  assert.match(
    src,
    /import \{ upsertRetryingStaleIndex \} from '@\/lib\/exerciseVideoIndex'/,
    'must import the wrapper'
  )
  assert.match(src, /upsertRetryingStaleIndex\(\(\) =>\s*\n\s*ExerciseVideo\.findOneAndUpdate/)
})
