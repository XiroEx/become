import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const TSX_CLI = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs')

function runIsolatedRuntimeConfig(code: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [TSX_CLI, '--eval', code], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

test('runtime config resolves valid local configuration through typed boundary', async () => {
  const result = runIsolatedRuntimeConfig(
    "import { getRuntimeConfig } from './lib/runtimeConfig.ts'; (async () => { const config = await getRuntimeConfig(); if (config.auth.mongoUri !== 'mongodb://127.0.0.1:27017/become-test' || config.auth.jwtSecret !== 'test-only-secret-that-is-not-a-default' || config.email.port !== 587) process.exitCode = 1 })()",
    {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/become-test',
      JWT_SECRET: 'test-only-secret-that-is-not-a-default',
    },
  )

  assert.equal(result.status, 0, result.stderr)
})

test('runtime config fails closed when JWT secret is missing', async () => {
  const result = runIsolatedRuntimeConfig(
    "import { getRuntimeConfig } from './lib/runtimeConfig.ts'; delete process.env.JWT_SECRET; (async () => { try { await getRuntimeConfig(); process.exitCode = 1 } catch (error) { if (!(error instanceof Error) || !/auth\\.jwtSecret is required/.test(error.message)) process.exitCode = 2 } })()",
    {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/become-test',
      JWT_SECRET: 'test-only-secret-that-is-not-a-default',
    },
  )

  assert.equal(result.status, 0, result.stderr)
})
