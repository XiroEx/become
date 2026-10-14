import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  getMongoHostPort,
  isDbTestFile,
  isMongoReachable,
} from './_preflight'
import { requireLocalTestTarget } from './_guard'

test('getMongoHostPort extracts host and port correctly', () => {
  const orig = process.env.MONGODB_URI
  try {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/become-test'
    assert.deepEqual(getMongoHostPort(), { host: '127.0.0.1', port: 27017 })

    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018/become-test'
    assert.deepEqual(getMongoHostPort(), { host: '127.0.0.1', port: 27018 })

    process.env.MONGODB_URI = 'mongodb://localhost/become-test'
    assert.deepEqual(getMongoHostPort(), { host: 'localhost', port: 27017 })

    delete process.env.MONGODB_URI
    assert.deepEqual(getMongoHostPort(), { host: '127.0.0.1', port: 27017 })
  } finally {
    if (orig !== undefined) {
      process.env.MONGODB_URI = orig
    } else {
      delete process.env.MONGODB_URI
    }
  }
})

test('isDbTestFile correctly identifies DB vs non-DB suites', () => {
  // DB-backed files
  assert.equal(
    isDbTestFile(path.resolve('tests/unit/adminSubmittedExerciseEdit.test.ts')),
    true,
  )
  assert.equal(
    isDbTestFile(path.resolve('tests/unit/contract/np015Routes.test.ts')),
    true,
  )
  assert.equal(
    isDbTestFile(path.resolve('tests/unit/healthWeightImport.test.ts')),
    true,
  )
  assert.equal(
    isDbTestFile(path.resolve('tests/unit/weightMoodBackdate.test.ts')),
    true,
  )

  // Non-DB files
  assert.equal(
    isDbTestFile(path.resolve('tests/unit/MacroBar.test.tsx')),
    false,
  )
  assert.equal(
    isDbTestFile(path.resolve('tests/unit/userProgress-schema.test.ts')),
    false,
  )
  assert.equal(
    isDbTestFile(path.resolve('tests/unit/exerciseVideoStaleIndex.test.ts')),
    false,
  )
})

test('requireLocalTestTarget enforces loopback host and -test database suffix', () => {
  const VAR = 'PREFLIGHT_TEST_MONGO_URI'
  const orig = process.env[VAR]
  try {
    // Valid loopback with -test db
    process.env[VAR] = 'mongodb://127.0.0.1:27017/my-app-test'
    assert.doesNotThrow(() => requireLocalTestTarget(VAR, { needsTestDb: true }))

    // Valid loopback without -test db when needsTestDb is false
    process.env[VAR] = 'mongodb://127.0.0.1:27017/redshared'
    assert.doesNotThrow(() => requireLocalTestTarget(VAR, { needsTestDb: false }))

    // Refusal: non-loopback host
    process.env[VAR] = 'mongodb://db.internal.example.com:27017/my-app-test'
    assert.throws(
      () => requireLocalTestTarget(VAR, { needsTestDb: true }),
      /names a non-loopback host/,
    )

    // Refusal: missing -test suffix when needsTestDb is true
    process.env[VAR] = 'mongodb://127.0.0.1:27017/production'
    assert.throws(
      () => requireLocalTestTarget(VAR, { needsTestDb: true }),
      /names a database that does not end in "-test"/,
    )
  } finally {
    if (orig !== undefined) {
      process.env[VAR] = orig
    } else {
      delete process.env[VAR]
    }
  }
})

test('isMongoReachable returns false for unopened port', () => {
  // Port 59999 should not be open on loopback
  const reachable = isMongoReachable('127.0.0.1', 59999)
  assert.equal(reachable, false)
})
