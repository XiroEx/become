// Run with: npm run test:file tests/unit/workouts-get-cleanups.test.ts
//
// Locks in the contract for UserProgress.updateOne cleanups in GET /api/workouts:
//   - Expired logs cleanup (older than 30 days) is awaited and logs errors to console.error
//   - Already-resolved stale logs cleanup is awaited and logs errors to console.error
//   - Neither write is unawaited (ALLOWLIST entry removed from unawaitedWriteParity)
//   - Auth (401) and query validation (400) branches behave as expected
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { GET } from '../../app/api/workouts/route'
import { signToken } from '../../lib/auth'

function makeRequest(query: string, authHeader?: string): NextRequest {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest(`http://localhost/api/workouts${query}`, {
    method: 'GET',
    headers,
  })
}

async function authedHeader() {
  const token = await signToken({ userId: 'fake-test-user', email: 't@example.com' })
  return `Bearer ${token}`
}

test('GET /api/workouts: no auth header → 401 (no DB touched)', async () => {
  const res = await GET(makeRequest('?programId=p1'))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /No token provided/)
})

test('GET /api/workouts: invalid JWT → 401 (no DB touched)', async () => {
  const res = await GET(makeRequest('?programId=p1', 'Bearer invalid-token'))
  assert.equal(res.status, 401)
  const json = await res.json()
  assert.match(String(json.error), /Invalid token/)
})

test('GET /api/workouts: authed + missing programId → 400 (no DB touched)', async () => {
  const res = await GET(makeRequest('', await authedHeader()))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.match(String(json.error), /programId is required/)
})

test('GET /api/workouts awaits expired logs and resolved logs cleanups with console.error logging', () => {
  const routePath = path.join(__dirname, '..', '..', 'app', 'api', 'workouts', 'route.ts')
  const src = fs.readFileSync(routePath, 'utf8')

  const getStart = src.indexOf('export async function GET')
  const getEnd = src.indexOf('export async function DELETE')
  assert.ok(getStart !== -1 && getEnd !== -1 && getEnd > getStart, 'could not isolate GET handler')
  const getFn = src.slice(getStart, getEnd)

  // 1. Expired logs cleanup: must be awaited and log error
  assert.match(
    getFn,
    /await\s+UserProgress\.updateOne\(\s*\{\s*userId:\s*payload\.userId\s*\},\s*\{\s*\$pull:\s*\{\s*workoutLogs:\s*\{\s*programId,\s*completed:\s*false,\s*date:\s*\{\s*\$lt:\s*staleCutoff\s*\}\s*\}\s*\}\s*\}\s*\)\.catch\(/,
    'UserProgress.updateOne for expired logs must be awaited',
  )
  assert.match(
    getFn,
    /console\.error\(\s*['"]GET \/api\/workouts expired logs cleanup error:['"],\s*err\s*\)/,
    'expired logs cleanup error must be logged to console.error',
  )

  // 2. Already-resolved logs cleanup: must be awaited and log error
  assert.match(
    getFn,
    /await\s+UserProgress\.updateOne\(\s*\{\s*userId:\s*payload\.userId\s*\},\s*\{\s*\$pull:\s*\{\s*workoutLogs:\s*\{\s*programId,\s*day:\s*logDay,\s*completed:\s*false,\s*date:\s*staleLog\.date\s*\}\s*\}\s*\}\s*\)\.catch\(/,
    'UserProgress.updateOne for resolved logs must be awaited',
  )
  assert.match(
    getFn,
    /console\.error\(\s*['"]GET \/api\/workouts resolved log cleanup error:['"],\s*err\s*\)/,
    'resolved logs cleanup error must be logged to console.error',
  )

  // 3. No swallowed .catch(() => {}) left in GET handler
  assert.doesNotMatch(
    getFn,
    /UserProgress\.updateOne[\s\S]*?\.catch\(\(\)\s*=>\s*\{\}\)/,
    'UserProgress.updateOne in GET must not swallow errors with empty catch',
  )
})

test('app/api/workouts/route.ts is not allowlisted in unawaitedWriteParity', () => {
  const parityTestPath = path.join(__dirname, 'unawaitedWriteParity.test.ts')
  const src = fs.readFileSync(parityTestPath, 'utf8')
  assert.equal(
    src.includes("'app/api/workouts/route.ts'"),
    false,
    'app/api/workouts/route.ts must not be in ALLOWLIST of unawaitedWriteParity.test.ts',
  )
})
