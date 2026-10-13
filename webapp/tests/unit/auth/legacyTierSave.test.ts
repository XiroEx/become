// Run with: npm run test:file tests/unit/auth/legacyTierSave.test.ts
//
// THE ENUM SHIPS WITH THE BUILD, NOT WITH THE KILL-SWITCH.
//
// `tier` collapsed from free|plus|premium|pro to free|plus. Reads are safe —
// Mongoose only validates writes — so a legacy 'pro' row simply reads as
// 'free' until scripts/migrate-tiers.mjs promotes it. What is NOT safe is a
// write, and `save()` validates every INITIALIZED path, not merely the ones
// the caller touched.
//
// That turns lib/authBridge.ts's harmless-looking backfill (stamp `authId` on
// a member's first Google/passkey sign-in) into a hard sign-in failure for
// every un-migrated member: the save throws, the backfill never persists, and
// the next attempt does exactly the same thing. Google redirects to
// /login?error=google; passkey answers 400 'Passkey sign-in failed'. None of
// it is behind ENTITLEMENTS_ENFORCED.
//
// Two defences, and the tests below hold both: run the migration BEFORE the
// deploy (the data), and save pre-existing users with validateModifiedOnly
// (the code, which also has to survive a row restored from an old backup).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import User from '../../../models/User'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** A member who signed up before the collapse, as they exist on disk today. */
function legacyMember() {
  return User.hydrate({
    _id: new mongoose.Types.ObjectId(),
    email: 'legacy@example.com',
    password: 'hashed-password-placeholder',
    name: 'Legacy Member',
    tier: 'pro',
    authId: null,
  })
}

// ─── The trap is real ────────────────────────────────────────────────────────

test('a plain save() of a legacy-tier member fails validation on an untouched path', async () => {
  const doc = legacyMember()
  doc.authId = 'redauth-user-123' // exactly what the bridge backfills

  await assert.rejects(
    () => doc.validate(),
    (err: Error) => {
      assert.equal(err.name, 'ValidationError')
      assert.match(err.message, /tier/)
      return true
    },
    'if this ever stops throwing the enum was widened — check the fix below is still needed',
  )
})

test('validateModifiedOnly lets the backfill through', async () => {
  const doc = legacyMember()
  doc.authId = 'redauth-user-123'

  // The path the caller actually changed is still validated; the stale enum
  // value it never touched is not.
  await doc.validate(undefined, { validateModifiedOnly: true })
})

test('validateModifiedOnly still rejects a bad value on a path that WAS touched', async () => {
  // It must not degrade into "skip validation" — that would let the bridge
  // write nonsense as long as the rest of the document was clean.
  const doc = legacyMember()
  doc.set('tier', 'unicorn')

  await assert.rejects(() => doc.validate(undefined, { validateModifiedOnly: true }))
})

// ─── The call site keeps the fix ─────────────────────────────────────────────

test('authBridge saves a pre-existing user with validateModifiedOnly', () => {
  const src = read('lib/authBridge.ts')
  assert.match(
    src,
    /user\.save\(\{\s*validateModifiedOnly:\s*true\s*\}\)/,
    'a bare save() here breaks Google and passkey sign-in for every un-migrated member',
  )
})

test('the migration is documented as a PRE-DEPLOY step, not a pre-flip one', () => {
  // Ordering it "before flipping enforcement" reads reasonable and is wrong:
  // the enum is live from the moment the build is, so the window between
  // deploy and flip is exactly when sign-ins break.
  const agents = read('../AGENTS.md')
  const at = agents.indexOf('migrate-tiers.mjs --prod --apply')
  assert.ok(at > 0, 'AGENTS.md must still name the migration command')
  assert.match(
    agents.slice(at, at + 200),
    /BEFORE THE DEPLOY/,
    'the migration must be ordered before the deploy',
  )

  assert.match(
    read('scripts/migrate-tiers.mjs'),
    /RUN IT BEFORE THE DEPLOY/,
    'the script header must say the same thing as AGENTS.md',
  )
})
