// Run with: npm run test:file tests/unit/account/deletionRoutes.test.ts
//
// The auth, confirmation and safety branches of the deletion routes. The 200
// paths touch MongoDB (unavailable in the unit env) and their logic lives in
// the pure modules that deletion.test.ts drives — the convention every route
// test in this repo follows (see dashboardLayout/route.test.ts).
//
// What is pinned here is what cannot be pinned anywhere else:
//
//   • an authenticated DELETE with no confirmation does NOT delete an account;
//   • the public restore route's GET cannot mutate, because mail scanners,
//     link previewers and Safe Browsing fetch every URL in an email before a
//     person ever sees it;
//   • the restore route refuses everything the same way, so it cannot be used
//     to find out whether an account exists;
//   • the purge endpoint needs the cron secret, and its GET is a dry run.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

import { DELETE, GET, POST } from '../../../app/api/me/account/route'
import {
  GET as RESTORE_GET,
  POST as RESTORE_POST,
} from '../../../app/api/me/account/restore/route'
import { signToken } from '../../../lib/auth'
import { DELETE_CONFIRMATION } from '../../../lib/accountDeletion'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

function request(method: string, body?: unknown, authHeader?: string, url = 'http://localhost/api/me/account') {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  return new NextRequest(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })
}

async function authed() {
  return `Bearer ${await signToken({ userId: 'fake-user', email: 't@example.com' })}`
}

// ─── The authenticated routes ────────────────────────────────────────────────

test('GET /api/me/account: no auth → 401', async () => {
  const res = await GET(request('GET'))
  assert.equal(res.status, 401)
})

test('DELETE /api/me/account: no auth → 401', async () => {
  const res = await DELETE(request('DELETE', { confirm: DELETE_CONFIRMATION }))
  assert.equal(res.status, 401)
})

test('DELETE /api/me/account: invalid JWT → 401', async () => {
  const res = await DELETE(request('DELETE', { confirm: DELETE_CONFIRMATION }, 'Bearer garbage'))
  assert.equal(res.status, 401)
})

test('DELETE /api/me/account: an empty body does not delete an account', async () => {
  // The branch that matters most in this file. A route that deleted on an
  // empty DELETE is one mis-wired client away from deleting somebody because a
  // screen mounted — and it would never reach the database to be noticed.
  for (const body of [undefined, {}, 'not-json{{{', { confirm: true }, { confirm: 'delete' }]) {
    const res = await DELETE(request('DELETE', body, await authed()))
    assert.equal(res.status, 400, `body ${JSON.stringify(body)} was not refused`)
    const json = await res.json()
    assert.equal(json.error, 'confirmation_required')
    assert.equal(json.confirmation, DELETE_CONFIRMATION, 'the route must say what it wants')
  }
})

test('POST /api/me/account: cancelling needs auth and an explicit cancel', async () => {
  assert.equal((await POST(request('POST', { cancel: true }))).status, 401)

  const res = await POST(request('POST', {}, await authed()))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'cancel_required')
})

// ─── The public restore route ────────────────────────────────────────────────

test('GET /api/me/account/restore redirects and never mutates', async () => {
  const res = await RESTORE_GET(
    request('GET', undefined, undefined, 'http://localhost/api/me/account/restore?u=abc&t=def'),
  )
  assert.equal(res.status, 302)
  const location = new URL(res.headers.get('location') ?? '', 'http://localhost')
  assert.equal(location.pathname, '/account/restore', 'the GET must land on the page, not act')
  assert.equal(location.searchParams.get('u'), 'abc')
  assert.equal(location.searchParams.get('t'), 'def')

  // And the handler body itself must contain no write. A mail scanner opening
  // every link in the deletion email must not be able to cancel it.
  const src = read('app/api/me/account/restore/route.ts')
  const getBody = src.slice(src.indexOf('export async function GET'))
  assert.doesNotMatch(getBody, /updateOne|deleteOne|deleteMany|\$unset/, 'the GET handler writes')
})

test('POST /api/me/account/restore refuses a missing or malformed credential', async () => {
  for (const body of [undefined, {}, { u: 'abc' }, { t: 'def' }, { u: 'not-an-id', t: 'x'.repeat(32) }]) {
    const res = await RESTORE_POST(
      request('POST', body, undefined, 'http://localhost/api/me/account/restore'),
    )
    assert.equal(res.status, 400, `body ${JSON.stringify(body)} was not refused`)
    const json = await res.json()
    assert.equal(json.ok, false)
    // ONE refusal for every failure: an attacker must not be able to tell
    // "no such member" from "wrong MAC" from "already purged".
    assert.equal(json.error, 'invalid_or_expired')
  }
})

test('the restore route is public — it never calls verifyAuth', () => {
  const src = read('app/api/me/account/restore/route.ts')
  assert.doesNotMatch(src, /verifyAuth/, 'requesting deletion signs every device out; there is no session to check')
})

// ─── The purge endpoint and its schedule ─────────────────────────────────────

test('the purge route checks the cron secret before it reads a single row', () => {
  const src = read('app/api/cron/purge-deletions/route.ts')
  const handle = src.slice(src.indexOf('async function handle'))
  const secretAt = handle.indexOf('cronSecret')
  const readAt = handle.indexOf('User.find')
  assert.ok(secretAt > -1, 'the purge is unauthenticated')
  assert.ok(readAt > -1, 'the purge never reads the due rows')
  assert.ok(secretAt < readAt, 'the secret must be checked before anything is read or deleted')
})

test('the purge route’s GET is a dry run, so only a POST can delete a person', () => {
  const src = read('app/api/cron/purge-deletions/route.ts')
  const getBody = src.slice(src.indexOf('export async function GET'))
  assert.match(getBody, /handle\(request,\s*true\)/, 'GET must force the dry run')
})

test('there is exactly one purge schedule, and it names production', () => {
  const workflow = readFileSync(
    path.join(ROOT, '../.github/workflows/purge-deleted-accounts.yml'),
    'utf8',
  )
  assert.match(workflow, /cron:\s*'40 4 \* \* \*'/, 'the daily schedule moved or vanished')
  assert.match(workflow, /BASE_URL:\s*https:\/\/become\.redbtn\.io/, 'the purge must run against production')
  // Comments explain WHY beta is excluded, so they are stripped before the
  // check — what must not appear is a beta host the job would actually call.
  const live = workflow.replace(/^\s*#.*$/gm, '')
  assert.doesNotMatch(live, /become-beta/, 'beta and production share one database — one runner only')
  assert.match(workflow, /x-cron-secret/, 'the secret must travel in a header, not a URL')
  assert.match(workflow, /-X POST/, 'GET is a dry run; the scheduled call has to POST')

  // Exactly one schedule in the repo for this job.
  const schedules = workflow.match(/- cron:/g) ?? []
  assert.equal(schedules.length, 1, 'more than one schedule in the purge workflow')
})
