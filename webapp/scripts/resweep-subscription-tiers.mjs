/**
 * Re-derive `tier` for members whose billing state expired without an event.
 *
 * WHY IT EXISTS
 *
 * `tier` is WRITTEN, never derived on read (lib/subscription.ts says so, and
 * lib/entitlements.ts deliberately cannot import it). Every writer is an event
 * handler. But two of deriveTier's rules are functions of the CLOCK, not of any
 * event, so the moment they start returning a different answer there is nothing
 * to run them:
 *
 *   • `canceled` keeps Plus only while `now < currentPeriodEnd`. Cancel with
 *     `cancel_at_period_end: false` — the "cancel immediately" button, a refund,
 *     a dispute — and Stripe writes `canceled` with a period end already in the
 *     past... but it emits NOTHING further for a subscription it has finished
 *     with. `customer.subscription.deleted` was the last word. So a row whose
 *     period end simply passes stays on the tier the last event wrote: Plus,
 *     forever, unpaid.
 *   • `active`/`trialing` expire `SUBSCRIPTION_GRACE_MS` past their period end.
 *     That grace is there to survive ONE missed webhook; when the webhook is
 *     missed permanently (endpoint disabled, secret rotated, an event Stripe
 *     gave up retrying) nothing ever closes it.
 *
 * This is the sweep for both. It is the ONLY thing here that recomputes a tier
 * off the clock, and it does it by calling the real `deriveTier` — never a copy
 * of its rules, which is the whole reason the script is loaded through tsx.
 *
 * WHAT IT WILL NOT DO
 *
 * It writes `tier` and nothing else. Stripe's state is Stripe's: `status`,
 * `currentPeriodEnd` and the ids are left exactly as the webhook left them. It
 * cannot revoke `grandfathered` or demote an admin either, because deriveTier
 * pins both to Plus and the script only ever writes what deriveTier returns.
 *
 * IDEMPOTENT, twice over: a row whose stored tier already equals the derived one
 * is never written, and the write re-asserts BOTH the candidate selector and the
 * tier that was read — so a webhook landing between the read and the write wins,
 * and a second run matches nothing.
 *
 * NOT WIRED TO ANYTHING. No cron, no route, no automation. Run it by hand, or
 * let the platform schedule it later; it is safe at any cadence, and safe to run
 * twice in a row. The dashboard tiles cache is not busted here and does not need
 * to be — it carries a 60-second TTL (lib/redis.ts).
 *
 *   DRY RUN:  npx tsx scripts/resweep-subscription-tiers.mjs
 *   APPLY:    npx tsx scripts/resweep-subscription-tiers.mjs --apply
 *   PROD:     npx tsx scripts/resweep-subscription-tiers.mjs --prod --apply
 *
 * tsx, not node: it imports ../lib/subscription.ts directly so the sweep and the
 * webhook can never disagree about what a tier means. That module has no runtime
 * imports of its own (both of its imports are `import type`), so nothing else is
 * dragged in.
 *
 * Reads MONGODB_URI (or PROD_MONGODB_URI / MONGODB_URI_PROD with --prod) from
 * the environment, falling back to webapp/.env.local. No connection string is
 * baked in, and without --prod it refuses any host that is not loopback.
 *
 * It prints COUNTS, and user ids where a row needs naming. Never emails: a
 * billing sweep's output ends up pasted into chat.
 */

import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const dotenv = require('dotenv')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const { deriveTier, SUBSCRIPTION_GRACE_MS } = await import('../lib/subscription.ts')

const APPLY = process.argv.includes('--apply')
const PROD = process.argv.includes('--prod')
const URI = PROD
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD)
  : process.env.MONGODB_URI

if (!URI) {
  console.error(`Missing ${PROD ? 'PROD_MONGODB_URI' : 'MONGODB_URI'}`)
  process.exit(1)
}

/** Hosts named by a mongodb:// or mongodb+srv:// URI, credentials stripped. */
function hostsOf(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri)
  if (!match) return []
  return match[1].split(',').map((h) => h.trim().replace(/:\d+$/, '').toLowerCase())
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])
const hosts = hostsOf(URI)
const remote = hosts.filter((h) => !LOOPBACK.has(h))

// Without --prod this is a local exercise. Refusing a remote host here is the
// difference between a dry run and a dry run against Atlas that is one --apply
// away from rewriting real tiers by accident.
if (!PROD && (remote.length > 0 || hosts.length === 0)) {
  console.error(
    `Refusing to run against a non-loopback host without --prod: ${
      hosts.length === 0 ? '(unparseable MONGODB_URI)' : remote.join(', ')
    }`,
  )
  process.exit(1)
}

const now = new Date()
const graceCutoff = new Date(now.getTime() - SUBSCRIPTION_GRACE_MS)

// Candidates. Both clauses mirror a deriveTier branch exactly; the derivation
// itself still runs per row, so a mismatch here can only ever cost a read.
//
//  1. canceled and the paid period is over (or was never recorded).
//  2. active/trialing whose period end is past the grace — the missed-webhook case.
const CANCELED_LAPSED = {
  'subscription.status': 'canceled',
  $or: [
    { 'subscription.currentPeriodEnd': { $lt: now } },
    { 'subscription.currentPeriodEnd': null },
  ],
}
const ACTIVE_STALE = {
  'subscription.status': { $in: ['active', 'trialing'] },
  'subscription.currentPeriodEnd': { $lt: graceCutoff },
}
const SELECTOR = { $or: [CANCELED_LAPSED, ACTIVE_STALE] }

await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 })
const db = mongoose.connection.db

// A mistyped collection name would report "0 to fix" and read as a clean run.
const names = (await db.listCollections().toArray()).map((c) => c.name)
if (!names.includes('users')) {
  console.error("Collection 'users' not found in this database — refusing to report on nothing.")
  await mongoose.disconnect()
  process.exit(1)
}

const users = db.collection('users')

const [total, withSub, plus, grandfathered, candidates] = await Promise.all([
  users.countDocuments({}),
  users.countDocuments({ 'subscription.status': { $exists: true, $ne: 'none' } }),
  users.countDocuments({ tier: 'plus' }),
  users.countDocuments({ grandfathered: true }),
  users.countDocuments(SELECTOR),
])

console.log(`\n${PROD ? 'PROD' : 'DEV'} — users (as of ${now.toISOString()})`)
console.log(`  total ..................... ${total}`)
console.log(`  with a subscription ....... ${withSub}`)
console.log(`  tier 'plus' ............... ${plus}`)
console.log(`  grandfathered ............. ${grandfathered}   (deriveTier pins these to plus)`)
console.log(`  → expired billing rows .... ${candidates}`)

const plan = []
const agreed = []

const cursor = users.find(SELECTOR, {
  projection: { tier: 1, role: 1, grandfathered: 1, subscription: 1 },
})
for await (const doc of cursor) {
  const want = deriveTier({
    subscription: doc.subscription ?? null,
    grandfathered: doc.grandfathered === true,
    role: doc.role,
    now,
  })
  const have = doc.tier ?? null
  const row = {
    _id: doc._id,
    have,
    want,
    status: doc.subscription?.status ?? 'none',
    periodEnd: doc.subscription?.currentPeriodEnd ?? null,
  }
  if (want === have) agreed.push(row)
  else plan.push(row)
}

console.log(`\n  of those:`)
console.log(`    already correct ......... ${agreed.length}   (left alone)`)
console.log(`    to re-derive ............ ${plan.length}`)

const downgrades = plan.filter((p) => p.want === 'free')
const upgrades = plan.filter((p) => p.want === 'plus')
if (plan.length > 0) {
  console.log(`      → free ................ ${downgrades.length}`)
  console.log(`      → plus ................ ${upgrades.length}`)
  console.log('\n  rows (ids only — never emails):')
  for (const p of plan.slice(0, 25)) {
    const end = p.periodEnd ? new Date(p.periodEnd).toISOString() : '(none)'
    console.log(`    ${p._id}  ${p.status}  periodEnd=${end}  ${p.have ?? '(absent)'} → ${p.want}`)
  }
  if (plan.length > 25) console.log(`    … and ${plan.length - 25} more`)
}

if (APPLY && plan.length > 0) {
  const ops = plan.map((p) => ({
    updateOne: {
      // Re-assert everything the decision rested on: still a candidate, and the
      // tier still the one that was read. A webhook that landed in between wins.
      filter: {
        _id: p._id,
        $and: [SELECTOR, p.have === null ? { tier: null } : { tier: p.have }],
      },
      update: { $set: { tier: p.want, updatedAt: new Date() } },
    },
  }))
  const r = await users.bulkWrite(ops, { ordered: false })
  console.log(`\nAPPLIED — matched ${r.matchedCount}, modified ${r.modifiedCount}`)
  if (r.modifiedCount < plan.length) {
    console.log(
      `  ${plan.length - r.modifiedCount} row(s) changed underneath the read and were left alone.`,
    )
  }
} else {
  console.log(`\n${APPLY ? 'APPLIED — nothing to do' : '(dry-run) — pass --apply to write'}`)
}

await mongoose.disconnect()
