import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  __resetRuntimeConfigForTests,
  getRuntimeConfig,
  RuntimeConfigError,
} from '../../lib/runtimeConfig'

const originalNodeEnv = process.env.NODE_ENV
const originalMongoUri = process.env.MONGODB_URI
const originalJwtSecret = process.env.JWT_SECRET
const env = process.env as Record<string, string | undefined>

function restoreEnv() {
  env.NODE_ENV = originalNodeEnv
  if (originalMongoUri === undefined) delete process.env.MONGODB_URI
  else process.env.MONGODB_URI = originalMongoUri
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
  __resetRuntimeConfigForTests()
}

test.afterEach(restoreEnv)

test('runtime config resolves valid local configuration through typed boundary', async () => {
  env.NODE_ENV = 'test'
  process.env.MONGODB_URI = 'mongodb://localhost:27017/become-test'
  process.env.JWT_SECRET = 'test-only-secret-that-is-not-a-default'
  __resetRuntimeConfigForTests()

  const config = await getRuntimeConfig()

  assert.equal(config.auth.mongoUri, 'mongodb://localhost:27017/become-test')
  assert.equal(config.auth.jwtSecret, 'test-only-secret-that-is-not-a-default')
  assert.equal(config.email.port, 587)
})

test('runtime config fails closed when JWT secret is missing', async () => {
  env.NODE_ENV = 'test'
  process.env.MONGODB_URI = 'mongodb://localhost:27017/become-test'
  delete process.env.JWT_SECRET
  __resetRuntimeConfigForTests()

  await assert.rejects(
    getRuntimeConfig(),
    (error: unknown) => error instanceof RuntimeConfigError && /auth\.jwtSecret is required/.test(String(error)),
  )
})
