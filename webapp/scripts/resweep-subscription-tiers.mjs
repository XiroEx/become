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
 * THIS IS THE HAND-RUN DOOR ONTO THE SCHEDULED SWEEP, not a second copy of it.
 * The rules, the selector and the guarded write all live in
 * `lib/billing/tierResweep.ts`, which `app/api/cron/resweep-tiers` also calls —
 * so the thing that runs every six hours and the thing an operator runs at 2am
 * cannot disagree about what a lapsed subscription means. That module calls the
 * real `deriveTier`, never a copy of its rules, which is the whole reason this
 * script is loaded through tsx.
 *
 * THE SCHEDULE lives in `.github/workflows/resweep-subscription-tiers.yml`
 * (every 6 hours, production only, one place). You do not need to run this to
 * keep tiers correct; run it when you want to SEE the state, or to close
 * something out immediately rather than within the next few hours.
 *
 * WHAT IT WILL NOT DO
 *
 * It writes `tier` and nothing else. Stripe's state is Stripe's: `status`,
 * `currentPeriodEnd` and the ids are left exactly as the webhook left them. It
 * cannot revoke `grandfathered` or demote an admin either, because deriveTier
 * pins both to Plus and the sweep only ever writes what deriveTier returns.
 *
 * IDEMPOTENT, twice over: a row whose stored tier already equals the derived one
 * is never written, and the write re-asserts BOTH the candidate selector and the
 * tier that was read — so a webhook landing between the read and the write wins,
 * and a second run matches nothing. A run that changes nothing writes nothing.
 *
 *   DRY RUN:  npx tsx scripts/resweep-subscription-tiers.mjs
 *   APPLY:    npx tsx scripts/resweep-subscription-tiers.mjs --apply
 *   PROD:     npx tsx scripts/resweep-subscription-tiers.mjs --prod --apply
 *
 * tsx, not node: it imports ../lib/billing/tierResweep.ts directly so the sweep
 * and the webhook can never disagree about what a tier means. Everything that
 * module imports at runtime is lib/subscription.ts, whose own imports are all
 * `import type`, so nothing else is dragged in.
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

const { runTierResweep, resweepSelector } = await import('../lib/billing/tierResweep.ts')

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

const [total, withSub, plus, grandfathered] = await Promise.all([
  users.countDocuments({}),
  users.countDocuments({ 'subscription.status': { $exists: true, $ne: 'none' } }),
  users.countDocuments({ tier: 'plus' }),
  users.countDocuments({ grandfathered: true }),
])

// One call, the same one the scheduled route makes. `apply: false` computes the
// plan and writes nothing, which is what makes the dry run the default here.
const result = await runTierResweep({ users, now, apply: APPLY, maxReportedChanges: 25 })

console.log(`\n${PROD ? 'PROD' : 'DEV'} — users (as of ${result.ranAt})`)
console.log(`  total ..................... ${total}`)
console.log(`  with a subscription ....... ${withSub}`)
console.log(`  tier 'plus' ............... ${plus}`)
console.log(`  grandfathered ............. ${grandfathered}   (deriveTier pins these to plus)`)
console.log(`  → expired billing rows .... ${result.candidates}`)

console.log(`\n  of those:`)
console.log(`    already correct ......... ${result.alreadyCorrect}   (left alone)`)
console.log(`    to re-derive ............ ${result.planned}`)

if (result.planned > 0) {
  console.log(`      → free ................ ${result.downgrades}`)
  console.log(`      → plus ................ ${result.upgrades}`)
  console.log('\n  rows (ids only — never emails):')
  for (const change of result.changes) {
    const end = change.periodEnd ?? '(none)'
    console.log(
      `    ${change.userId}  ${change.status}  periodEnd=${end}  ${change.from ?? '(absent)'} → ${change.to}`,
    )
  }
  const hidden = result.planned - result.changes.length
  if (hidden > 0) console.log(`    … and ${hidden} more`)
}

if (result.wrote) {
  console.log(`\nAPPLIED — matched ${result.matched}, modified ${result.modified}`)
  if (result.modified < result.planned) {
    console.log(
      `  ${result.planned - result.modified} row(s) changed underneath the read and were left alone.`,
    )
  }
} else {
  console.log(`\n${APPLY ? 'APPLIED — nothing to do' : '(dry-run) — pass --apply to write'}`)
}

// The selector is printed on request so an operator can check the candidate set
// by hand in mongosh against the exact filter the sweep used.
if (process.argv.includes('--show-selector')) {
  console.log(`\nselector: ${JSON.stringify(resweepSelector(now))}`)
}

await mongoose.disconnect()
