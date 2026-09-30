// Run with: npm run test:file tests/unit/security/blobAccess.test.ts
//
// AN UNAUTHENTICATED PROXY WAS SERVING EVERY MEMBER'S PHOTOS.
//
// `GET /api/blob/<...key>` streamed any object in the MinIO bucket to anyone,
// with no session and no owner check, behind
// `Cache-Control: public, max-age=31536000, immutable`. It was written for the
// shared exercise-demo catalogue, where that is correct. Then five per-user
// upload routes were pointed at the same proxy, and every one of them puts the
// owner's id in the key:
//
//     scans/<userId>/<rand>.jpg           a photo of that member's plate
//     food-flags/<userId>/<rand>.jpg      the nutrition panel on a food report
//     chat/<userId>/<rand>.jpg            a chat attachment
//     custom-exercises/<userId>/<slug>/…  a member's own demo video
//     avatars/<userId>/<rand>.jpg         a profile picture
//
// So a key that leaked — a shared link, a screenshot, a server log, a referrer
// — handed anyone on the internet another member's meal photos. `curl` against
// production, no cookie, no token.
//
// `lib/blobAccess.ts` decides from the KEY, which is the only thing that
// actually names the owner. A `?userId=` parameter would be worthless: a
// caller who could name the owner would name themselves.
//
// The classification is not "everything is private" — that would have broken
// three working surfaces — and each exception below is load-bearing:
//
//   • avatars stay PUBLIC because `components/Avatar.tsx` renders them through
//     `next/image`, and the Next image optimizer refetches the URL server-side
//     with no cookies. Gating them blanks the member's OWN avatar.
//   • chat attachments are shown to the other participants, who cannot be
//     recovered from the key without an unindexed `Message.findOne({ imageUrl })`.
//   • an approved custom exercise flips `isUniversal` without re-keying its
//     video, so every member sees it.
//
// Those three are narrowed from "the whole internet" to "a signed-in member".
// `scans/` and `food-flags/` — the ones that are actually somebody's dinner —
// are owner-or-admin.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { blobPolicy, canReadBlob, isSafeBlobKey } from '../../../lib/blobAccess'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const VICTIM = '65f0000000000000000000aa'
const ATTACKER = '65f0000000000000000000bb'

const VICTIM_SCAN = `scans/${VICTIM}/k3j4h5g6mabc.jpg`
const VICTIM_FLAG = `food-flags/${VICTIM}/k3j4h5g6mabc.jpg`

const anonymous = {}
const attacker = { userId: ATTACKER }
const owner = { userId: VICTIM }
const admin = { userId: ATTACKER, isAdmin: true }

// ─── The exploit ─────────────────────────────────────────────────────────────

test('THE EXPLOIT: an anonymous caller cannot fetch a member\'s scan', () => {
  assert.equal(canReadBlob(VICTIM_SCAN, anonymous), false)
})

test('THE EXPLOIT: another signed-in member cannot fetch it either', () => {
  assert.equal(canReadBlob(VICTIM_SCAN, attacker), false)
  assert.equal(canReadBlob(VICTIM_FLAG, attacker), false)
})

test('the owner can still fetch their own scan', () => {
  assert.equal(canReadBlob(VICTIM_SCAN, owner), true)
  assert.equal(canReadBlob(VICTIM_FLAG, owner), true)
})

test('a confirmed admin can fetch it (the food-report review queue)', () => {
  assert.equal(canReadBlob(VICTIM_SCAN, admin), true)
  assert.equal(canReadBlob(VICTIM_FLAG, admin), true)
})

test('the owner is taken from the key, so it cannot be claimed', () => {
  const policy = blobPolicy(VICTIM_SCAN)
  assert.equal(policy.visibility, 'owner')
  assert.equal(policy.ownerId, VICTIM)
  // The same key with the attacker's id spliced in is simply a different
  // (nonexistent) object — it never grants access to the victim's.
  assert.equal(canReadBlob(`scans/${ATTACKER}/k3j4h5g6mabc.jpg`, attacker), true)
  assert.equal(canReadBlob(VICTIM_SCAN, attacker), false)
})

// ─── What must keep working ──────────────────────────────────────────────────

test('avatars stay public — next/image refetches them with no cookies', () => {
  assert.equal(blobPolicy(`avatars/${VICTIM}/k3j4h5g6mabc.jpg`).visibility, 'public')
  assert.equal(canReadBlob(`avatars/${VICTIM}/k3j4h5g6mabc.jpg`, anonymous), true)
})

test('the shared exercise catalogue stays public', () => {
  assert.equal(canReadBlob('exercises/barbell-back-squat/k3j4h5g6m.mp4', anonymous), true)
})

test('chat attachments and universal custom videos need a session, not ownership', () => {
  for (const key of [
    `chat/${VICTIM}/k3j4h5g6mabc.jpg`,
    `custom-exercises/${VICTIM}/my-lift/k3j4h5g6m.mp4`,
  ]) {
    assert.equal(blobPolicy(key).visibility, 'member')
    assert.equal(canReadBlob(key, anonymous), false, `${key} must not be public`)
    assert.equal(canReadBlob(key, attacker), true, `${key} must stay visible to members`)
  }
})

// ─── Default-deny ────────────────────────────────────────────────────────────

test('an unknown per-user prefix is owner-scoped without anyone editing this file', () => {
  const future = `sleep-photos/${VICTIM}/k3j4h5g6mabc.jpg`
  assert.equal(blobPolicy(future).visibility, 'owner')
  assert.equal(canReadBlob(future, attacker), false)
  assert.equal(canReadBlob(future, owner), true)
})

test('an unknown non-user prefix still requires a session', () => {
  assert.equal(canReadBlob('brochures/2026/spring.pdf', anonymous), false)
  assert.equal(canReadBlob('brochures/2026/spring.pdf', attacker), true)
})

test('traversal and malformed keys are readable by nobody, admin included', () => {
  for (const bad of [
    `scans/${VICTIM}/../../avatars/${ATTACKER}/x.jpg`,
    '../secrets/env',
    `/scans/${VICTIM}/x.jpg`,
    `scans//x.jpg`,
    'single-segment',
    '',
  ]) {
    assert.equal(isSafeBlobKey(bad), false, `${bad} should be rejected outright`)
    assert.equal(canReadBlob(bad, admin), false, `${bad} must not be readable`)
  }
})

// ─── Source guards on the route ──────────────────────────────────────────────

test('the blob route authenticates, and reads the cookie an <img> actually sends', () => {
  const src = readSource('app/api/blob/[...key]/route.ts')
  assert.match(src, /blobPolicy\(/, 'the route must consult the key policy')
  assert.match(
    src,
    /cookies\.get\('auth_token'\)/,
    'verifyAuth only reads the Bearer header; an <img> can only send the cookie',
  )
  assert.match(src, /payload\.scope/, 'a scoped ai-tools token is not a session')
  assert.match(src, /isVerifiedAdmin\(/, 'admin must be confirmed against the User row')
})

test('a non-owner is refused with 404, never 403', () => {
  const src = readSource('app/api/blob/[...key]/route.ts')
  const denial = src.slice(src.indexOf('isVerifiedAdmin('))
  assert.match(denial.slice(0, 300), /status: 404/)
  assert.doesNotMatch(denial.slice(0, 300), /status: 403/)
})

test('a per-user object never carries a public, shared-cacheable header', () => {
  const src = readSource('app/api/blob/[...key]/route.ts')
  // The public immutable header must sit inside the public branch only: a
  // shared cache holding one member's photo under this URL would serve it to
  // the next caller and undo the check entirely.
  assert.match(src, /isPublicObject\)?\s*\{[\s\S]{0,400}?'public, max-age=31536000, immutable'/)
  assert.match(src, /'private, max-age=31536000, immutable'/)
  assert.match(src, /headers\.set\('Vary', 'Cookie, Authorization'\)/)
  // ...and there is exactly one place the public header is written.
  assert.equal(src.split("'public, max-age=31536000, immutable'").length - 1, 1)
})

test('refusals are never stored by any cache', () => {
  const src = readSource('app/api/blob/[...key]/route.ts')
  assert.match(src, /'Cache-Control': 'private, no-store'/)
  for (const status of ['401', '404']) {
    assert.ok(
      new RegExp(`status: ${status}, headers: NO_STORE`).test(src),
      `the ${status} refusal must not be cacheable`,
    )
  }
})

test('every upload route that writes a per-user key is classified here', () => {
  // A new upload route whose prefix nobody added to lib/blobAccess.ts still
  // fails closed (the unknown-prefix rule above), but it should be deliberate.
  // This lists what exists today so adding one is a visible edit.
  const UPLOADS: Array<[string, string]> = [
    ['app/api/nutrition/scans/image/route.ts', 'scans'],
    ['app/api/nutrition/flags/image/route.ts', 'food-flags'],
    ['app/api/chat/upload/route.ts', 'chat'],
    ['app/api/profile/avatar/route.ts', 'avatars'],
  ]
  for (const [rel, prefix] of UPLOADS) {
    assert.match(
      readSource(rel),
      new RegExp(`\`${prefix}/\\$\\{auth\\.userId\\}/`),
      `${rel} no longer writes ${prefix}/<userId>/ — reclassify it in lib/blobAccess.ts`,
    )
    const policy = blobPolicy(`${prefix}/${VICTIM}/x.jpg`)
    assert.notEqual(
      policy.visibility === 'public' && prefix !== 'avatars',
      true,
      `${prefix}/ must not be public`,
    )
  }
})
