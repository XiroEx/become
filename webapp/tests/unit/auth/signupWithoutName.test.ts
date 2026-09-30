// Run with: npm run test:file tests/unit/auth/signupWithoutName.test.ts
//
// Sign-up takes an email and nothing else. The name is asked for a minute later,
// during onboarding, where it is obvious why we want it.
//
// The source guard in authRoutes.test.ts says the box is gone from the form.
// This one drives the real route against the real (loopback, disposable) test
// database, because the half that would actually lock everyone out is the
// SERVER half: send-link answered 400 "Name is required for registration", so
// the moment the form stopped sending one, nobody could sign up at all.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { POST } from '../../../app/api/auth/send-link/route'
import MagicLink from '../../../models/MagicLink'
import User from '../../../models/User'
import { LEGAL_VERSION } from '../../../lib/legal'
import { fallbackNameFromEmail, isFallbackName } from '../../../lib/displayName'

const DOMAIN = 'signup-no-name.test'

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test')
})

after(async () => {
  await MagicLink.deleteMany({ email: new RegExp(`@${DOMAIN}$`) })
  await User.deleteMany({ email: new RegExp(`@${DOMAIN}$`) })
  await mongoose.disconnect()
})

/** A fresh address per case: send-link throttles one link per email per 30s. */
const freshEmail = () => `m${Date.now()}${Math.random().toString(36).slice(2, 8)}@${DOMAIN}`

function req(body: unknown) {
  return new Request('http://localhost/api/auth/send-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('a sign-up with no name is accepted, and mints a link carrying the agreement', async () => {
  const email = freshEmail()

  const res = await POST(req({ email, mode: 'register', consent: true }))
  // The email itself cannot be sent from a test (no SMTP credentials), so the
  // handler may still end in a 500 on the way out. What matters is that it was
  // not REFUSED: a 400 is the validation this change removed.
  assert.notEqual(res.status, 400, 'send-link refused a sign-up for want of a name')
  assert.notEqual(res.status, 409)

  const link = await MagicLink.findOne({ email })
  assert.ok(link, 'no magic link was minted, so validation rejected the request')
  assert.equal(link.mode, 'register')
  assert.equal(link.used, false)
  // Consent still has to land on the link — this change must not have widened
  // the one door that records that anybody agreed to anything.
  assert.equal(link.consentTermsVersion, LEGAL_VERSION)
  // And nothing writes a name any more.
  assert.equal(link.name, undefined)
})

test('a sign-up with no TICK is still refused — only the name requirement went', async () => {
  const email = freshEmail()
  const res = await POST(req({ email, mode: 'register' }))
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.message, /Terms of Service/i)
  assert.equal(await MagicLink.findOne({ email }), null)
})

test('an email that is not an email is still refused, with or without a name', async () => {
  const res = await POST(req({ email: 'not-an-email', mode: 'register', consent: true }))
  assert.equal(res.status, 400)
  assert.match((await res.json()).message, /valid email/i)
})

// ─── The placeholder onboarding has to recognise ─────────────────────────────

test('the invented name is the email local part, and is recognised as invented', () => {
  assert.equal(fallbackNameFromEmail('george8794@gmail.com'), 'george8794')
  assert.equal(isFallbackName('george8794', 'george8794@gmail.com'), true)
  // Case and padding are still the same invented string.
  assert.equal(isFallbackName('  George8794 ', 'george8794@gmail.com'), true)
  // A real answer is kept, and prefilled into the onboarding box.
  assert.equal(isFallbackName('George Abreu', 'george8794@gmail.com'), false)
})

test('an empty or missing name counts as a placeholder, so the box starts empty', () => {
  assert.equal(isFallbackName('', 'a@b.com'), true)
  assert.equal(isFallbackName('   ', 'a@b.com'), true)
  assert.equal(isFallbackName(undefined, 'a@b.com'), true)
  assert.equal(isFallbackName(null, 'a@b.com'), true)
  // No email to compare against: a name we cannot prove was invented is kept.
  assert.equal(isFallbackName('Sam', undefined), false)
})
