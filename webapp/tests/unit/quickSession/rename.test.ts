// Run with: npx tsx --test tests/unit/quickSession/rename.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistSourceQuickSessionRename } from '../../../lib/quickSession/rename'
import type { StoredQuickSession } from '../../../lib/quickSession/store'

const SESSION: StoredQuickSession = {
  sessionId: 'new-repeat-id',
  sourceSessionId: 'thursday-history-id',
  title: 'Thursday workout',
  exercises: [],
}

test('renaming a reopened session patches its historical id, not the repeat id', async () => {
  let request: { input: string; init?: RequestInit } | undefined

  const changed = await persistSourceQuickSessionRename({
    session: SESSION,
    title: 'Thursday push',
    token: 'test-token',
    fetcher: async (input, init) => {
      request = { input, init }
      return { ok: true, json: async () => ({ success: true }) }
    },
  })

  assert.equal(changed, true)
  assert.equal(request?.input, '/api/workouts/session')
  assert.equal(request?.init?.method, 'PATCH')
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    id: 'thursday-history-id',
    title: 'Thursday push',
  })
  assert.doesNotMatch(String(request?.init?.body), /new-repeat-id/)
})

test('a local draft or unchanged name does not make a server request', async () => {
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return { ok: true, json: async () => ({ success: true }) }
  }

  const localOnly = await persistSourceQuickSessionRename({
    session: { ...SESSION, sourceSessionId: undefined },
    title: 'A local draft',
    fetcher,
  })
  const unchanged = await persistSourceQuickSessionRename({
    session: SESSION,
    title: `  ${SESSION.title}  `,
    fetcher,
  })

  assert.equal(localOnly, false)
  assert.equal(unchanged, false)
  assert.equal(calls, 0)
})

test('rename failures surface the API error and do not report success', async () => {
  await assert.rejects(
    persistSourceQuickSessionRename({
      session: SESSION,
      title: 'Thursday pull',
      fetcher: async () => ({
        ok: false,
        json: async () => ({ error: 'Quick session not found' }),
      }),
    }),
    /Quick session not found/,
  )
})
