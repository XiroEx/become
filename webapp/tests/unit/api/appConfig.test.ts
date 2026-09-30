import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GET } from '@/app/api/app/config/route'

test('GET /api/app/config returns 200 with cache headers and config object', async () => {
  const response = await GET()
  assert.equal(response.status, 200)

  const cacheControl = response.headers.get('Cache-Control')
  assert.ok(cacheControl, 'Cache-Control header must be present')
  assert.match(cacheControl, /public/)
  assert.match(cacheControl, /max-age=/)

  const data = await response.json()
  assert.ok(typeof data === 'object' && data !== null)
  assert.ok('ios' in data)
  assert.ok('android' in data)
})
