// Run with: npx tsx --test tests/unit/entitlements/migrateTiers.test.ts
//
// scripts/migrate-tiers.mjs is a one-shot, run-once-against-production script,
// so it gets read far less often than it gets trusted. A source scan is the
// only cheap guard against the three ways it could go wrong: writing by
// default, promoting someone the billing webhook owns, or promoting the same
// rows twice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SRC = fs.readFileSync(
  path.join(__dirname, '../../../scripts/migrate-tiers.mjs'),
  'utf8',
)

test('dry run is the default and the write is behind --apply', () => {
  assert.match(SRC, /const APPLY = process\.argv\.includes\('--apply'\)/)
  assert.match(SRC, /if \(APPLY && candidates > 0\)/)
  // updateMany appears exactly once, inside that branch.
  assert.equal((SRC.match(/updateMany\(/g) ?? []).length, 1)
  const beforeApply = SRC.slice(0, SRC.indexOf('if (APPLY && candidates > 0)'))
  assert.doesNotMatch(beforeApply, /updateMany\(|updateOne\(|deleteMany\(/)
})

test('the selector skips deliberate free users, prior runs, and live subscribers', () => {
  const selector = SRC.slice(SRC.indexOf('const SELECTOR'), SRC.indexOf('await mongoose.connect'))
  // Only tier-absent / null / legacy rows are candidates — never tier:'free'.
  assert.match(selector, /\{ tier: \{ \$exists: false \} \}/)
  assert.match(selector, /\{ tier: null \}/)
  assert.match(selector, /\{ tier: \{ \$in: LEGACY_TIERS \} \}/)
  assert.doesNotMatch(selector, /tier: 'free'/)
  // The billing webhook owns anyone mid-subscription.
  assert.match(selector, /'subscription\.status': \{ \$nin: LIVE_SUB_STATUSES \}/)
  assert.match(SRC, /const LIVE_SUB_STATUSES = \['active', 'trialing', 'past_due'\]/)
})

test('the migration is idempotent by construction', () => {
  // The selector excludes grandfathered:true and the write sets it, so a
  // promoted row can never match a second run.
  const selector = SRC.slice(SRC.indexOf('const SELECTOR'), SRC.indexOf('await mongoose.connect'))
  assert.match(selector, /grandfathered: \{ \$ne: true \}/)
  assert.match(SRC, /\$set: \{ tier: 'plus', grandfathered: true, updatedAt: new Date\(\) \}/)
  // And it says so out loud, since re-running after the enforcement flip would
  // wrongly promote genuinely-new free members.
  assert.match(SRC, /Idempotent/)
})

test('no connection string is baked into the script', () => {
  assert.doesNotMatch(SRC, /mongodb\+srv:\/\//)
  assert.doesNotMatch(SRC, /mongodb:\/\/[^'"\s]*@/)
  assert.match(SRC, /process\.env\.MONGODB_URI/)
})
