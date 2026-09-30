import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const dotenv = require('dotenv')

// Grandfather existing members onto Plus.
//
// The tier model collapsed to free|plus and the model default flipped from
// 'pro' to 'free'. Anyone who signed up before that has either no tier field at
// all or a legacy 'premium'/'pro' string, and loadUserEntitlement now reads
// both as 'free'. Left alone they would silently lose access on the day
// ENTITLEMENTS_ENFORCED flips on. This promotes them ONCE, offline, and stamps
// grandfathered:true so it is visible forever why they are on Plus without a
// Stripe subscription.
//
// It never touches: tier:'free' set deliberately, someone already promoted, or
// a user with a live subscription (that one is the billing webhook's to own).
//
// Idempotent — a second run matches nothing, because the $set writes the very
// field the selector excludes.
//
// RUN IT BEFORE THE DEPLOY — not merely before flipping enforcement. The
// collapsed enum ships with the BUILD, and Mongoose validates every
// initialized path on save(), so from the moment the new code is live any
// write to a hydrated legacy user throws `tier: 'pro' is not a valid enum
// value`. That includes the authId/avatar backfill on the first Google or
// passkey sign-in (lib/authBridge.ts), which would then fail on every retry,
// and any admin PATCH with runValidators.
//
//   DRY RUN:  node scripts/migrate-tiers.mjs
//   APPLY:    node scripts/migrate-tiers.mjs --apply
//   PROD:     node scripts/migrate-tiers.mjs --prod --apply
//
// Reads MONGODB_URI (or PROD_MONGODB_URI / MONGODB_URI_PROD with --prod) from
// the environment, falling back to webapp/.env.local.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')
const URI = PROD
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD)
  : process.env.MONGODB_URI

if (!URI) {
  console.error(`Missing ${PROD ? 'PROD_MONGODB_URI' : 'MONGODB_URI'}`)
  process.exit(1)
}

const LEGACY_TIERS = ['premium', 'pro']
const LIVE_SUB_STATUSES = ['active', 'trialing', 'past_due']

// Rows that should become grandfathered Plus: tier absent, null, or legacy.
const SELECTOR = {
  $or: [
    { tier: { $exists: false } },
    { tier: null },
    { tier: { $in: LEGACY_TIERS } },
  ],
  // Never re-promote someone an earlier run already handled.
  grandfathered: { $ne: true },
  // Never touch anyone the billing webhook owns.
  'subscription.status': { $nin: LIVE_SUB_STATUSES },
}

await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 })
const users = mongoose.connection.db.collection('users')

const [
  total, missing, legacyPro, legacyPremium,
  alreadyFree, alreadyPlus, alreadyGrandfathered, subscribed,
] = await Promise.all([
  users.countDocuments({}),
  users.countDocuments({ $or: [{ tier: { $exists: false } }, { tier: null }] }),
  users.countDocuments({ tier: 'pro' }),
  users.countDocuments({ tier: 'premium' }),
  users.countDocuments({ tier: 'free' }),
  users.countDocuments({ tier: 'plus' }),
  users.countDocuments({ grandfathered: true }),
  users.countDocuments({ 'subscription.status': { $in: LIVE_SUB_STATUSES } }),
])

const candidates = await users.countDocuments(SELECTOR)

console.log(`\n${PROD ? 'PROD' : 'DEV'} — users collection`)
console.log(`  total ................. ${total}`)
console.log(`  tier missing/null ..... ${missing}`)
console.log(`  tier 'pro' (legacy) ... ${legacyPro}`)
console.log(`  tier 'premium' ........ ${legacyPremium}`)
console.log(`  tier 'free' ........... ${alreadyFree}   (left alone)`)
console.log(`  tier 'plus' ........... ${alreadyPlus}   (left alone)`)
console.log(`  already grandfathered . ${alreadyGrandfathered}   (left alone)`)
console.log(`  live subscription ..... ${subscribed}   (left alone — webhook owns these)`)
console.log(`\n  → to promote .......... ${candidates}`)

if (candidates > 0) {
  const sample = await users
    .find(SELECTOR, { projection: { email: 1, tier: 1 }, limit: 10 })
    .toArray()
  console.log('\n  sample:')
  for (const u of sample) {
    console.log(`    ${u.email}  tier=${u.tier ?? '(absent)'} → plus (grandfathered)`)
  }
  if (candidates > sample.length) {
    console.log(`    … and ${candidates - sample.length} more`)
  }
}

if (APPLY && candidates > 0) {
  const r = await users.updateMany(SELECTOR, {
    $set: { tier: 'plus', grandfathered: true, updatedAt: new Date() },
  })
  console.log(`\nAPPLIED — matched ${r.matchedCount}, modified ${r.modifiedCount}`)
  const left = await users.countDocuments(SELECTOR)
  console.log(`Re-check (must be 0): ${left}`)
} else {
  console.log(`\n${APPLY ? 'APPLIED — nothing to do' : '(dry-run) — pass --apply to write'}`)
}

// Anyone who signs up BETWEEN this run and the enforcement flip lands on 'free'
// — intended, so keep the two steps close together. Do not re-run afterwards to
// "catch stragglers": those stragglers are genuinely-new free members and the
// selector cannot tell them apart. Add a createdAt cutoff if a second run is
// ever really needed.
await mongoose.disconnect()
