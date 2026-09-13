// Run with: npm run test:file tests/unit/email/canSpam.test.ts
//
// CAN-SPAM (16 CFR 316) in three checks: the sender's physical address on
// every outbound email, a working opt-out on every non-transactional one, and
// an opt-out that is honoured at send time. Plus the HMAC round trip that
// makes the opt-out link safe to put in an email.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildUnsubscribeUrl,
  unsubscribeToken,
  verifyUnsubscribeToken,
  UNSUBSCRIBE_PATH,
} from '../../../lib/emailUnsubscribe'
import { emailFooter } from '../../../lib/email'
import { LEGAL_ADDRESS_LINES } from '../../../lib/legal'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const SECRET = 'unit-test-secret'
const USER = '64b8f0c2e4b0a1d2c3f4e5a6'

// ─── The link ────────────────────────────────────────────────────────────────

test('the unsubscribe token round-trips and rejects tampering', () => {
  const token = unsubscribeToken(USER, SECRET)
  assert.match(token, /^[0-9a-f]{32}$/)
  assert.equal(verifyUnsubscribeToken(USER, token, SECRET), true)
  assert.equal(verifyUnsubscribeToken(USER, token.toUpperCase(), SECRET), true, 'case must not matter')
  assert.equal(verifyUnsubscribeToken(USER, token, 'other-secret'), false)
  assert.equal(verifyUnsubscribeToken('64b8f0c2e4b0a1d2c3f4e5a7', token, SECRET), false, 'another member')
  assert.equal(verifyUnsubscribeToken(USER, token.slice(0, 31) + '0', SECRET), token.endsWith('0'), 'one flipped char')
  assert.equal(verifyUnsubscribeToken(USER, '', SECRET), false)
  assert.equal(verifyUnsubscribeToken(USER, 'not-hex', SECRET), false)
  assert.equal(verifyUnsubscribeToken('', token, SECRET), false)
})

test('the unsubscribe URL points at the public route with both parameters', () => {
  const url = new URL(buildUnsubscribeUrl('https://become.redbtn.io', USER, 'ab'.repeat(16)))
  assert.equal(url.pathname, UNSUBSCRIBE_PATH)
  assert.equal(url.searchParams.get('u'), USER)
  assert.equal(url.searchParams.get('t'), 'ab'.repeat(16))
  // Not under /dashboard, or middleware would bounce a signed-out click to /login.
  assert.doesNotMatch(UNSUBSCRIBE_PATH, /^\/dashboard/)
})

// ─── The footer ──────────────────────────────────────────────────────────────

test('every footer carries the postal address; engagement footers carry the opt-out', () => {
  const plain = emailFooter({ reason: 'because' })
  for (const line of LEGAL_ADDRESS_LINES) assert.ok(plain.includes(line), `address line missing: ${line}`)
  assert.doesNotMatch(plain, /Unsubscribe/, 'a transactional footer must not offer an opt-out it cannot honour')

  const engagement = emailFooter({ reason: 'because', unsubscribeUrl: 'https://x.test/u?u=1&t=2' })
  assert.match(engagement, /href="https:\/\/x\.test\/u\?u=1&t=2"/)
  assert.match(engagement, /Unsubscribe/)
})

test('the streak emails use the footer with an opt-out; the sign-in email without one', () => {
  const src = read('lib/email.ts')
  const fn = (name: string) => {
    const start = src.indexOf(`export async function ${name}`)
    assert.ok(start >= 0, `${name} missing`)
    const next = src.indexOf('export async function', start + 1)
    return src.slice(start, next === -1 ? undefined : next)
  }
  for (const name of ['sendStreakMilestoneEmail', 'sendStreakAtRiskEmail']) {
    const body = fn(name)
    assert.match(body, /unsubscribeUrlFor\(userId\)/, `${name}: no opt-out link`)
    assert.match(body, /emailFooter\(\{[\s\S]*?unsubscribeUrl \}\)/, `${name}: footer has no opt-out`)
    assert.match(body, /unsubscribeUrl,\s*\n\s*\}\)/, `${name}: List-Unsubscribe headers not requested`)
  }
  const verify = fn('sendVerificationEmail')
  assert.match(verify, /emailFooter\(/, 'sign-in email has no address footer')
  assert.doesNotMatch(verify, /unsubscribeUrl/, 'sign-in email must not offer an opt-out')

  // sendEmail turns the URL into the RFC 8058 headers.
  assert.match(src, /'List-Unsubscribe':\s*`<\$\{unsubscribeUrl\}>`/)
  assert.match(src, /'List-Unsubscribe-Post':\s*'List-Unsubscribe=One-Click'/)
})

// ─── Honoured at send time ───────────────────────────────────────────────────

test('the streak milestone send checks the opt-out first', () => {
  const src = read('lib/streak.ts')
  const block = src.slice(src.indexOf('Send milestone email'))
  assert.match(block, /emailPreferences\?\.engagement === false\)\s*return/, 'the opt-out is not honoured')
  assert.match(block, /sendStreakMilestoneEmail\([^)]*userId\)/, 'the send does not pass userId for the link')
})

test('the public unsubscribe route verifies the MAC and flips only the one boolean', () => {
  const src = read('app/api/email/unsubscribe/route.ts')
  assert.match(src, /verifyUnsubscribe\(userId, token\)/)
  assert.match(src, /isValidObjectId\(userId\)/)
  assert.match(src, /'emailPreferences\.engagement':\s*false/)
  assert.doesNotMatch(src, /verifyAuth\(/, 'an opt-out must not require a session')
  assert.match(src, /export async function POST/, 'RFC 8058 one-click needs POST')
})

test('the settings toggle and the preferences endpoint speak the same field', () => {
  assert.match(read('app/api/notifications/preferences/route.ts'), /emailEngagement/)
  assert.match(read('app/dashboard/settings/page.tsx'), /emailEngagement/)
})
