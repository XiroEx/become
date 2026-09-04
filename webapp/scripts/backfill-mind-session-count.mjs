import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const dotenv = require('dotenv')

// Seed MindProgress.completedMainSessions — the truthful "how many Mind
// sessions has this member actually finished" counter.
//
// WHY IT EXISTS
//
// The free-tier 'mind-sessions' allowance used to read `mainSessionCount`,
// which is CHAPTER PROGRESS measured in sessions and is not a session count at
// all: /api/mind/progress persists max(count, (chapter - 1) * 10) so a chapter
// survives the round trip, and a chapter can come from the intake answer
// ('building' → 2, 'leveling_up' → 3), from a self-declared level-up, or from
// an admin. A brand-new free member was therefore 10/10 (or 20/10) before their
// first session and was refused it with "You've finished your first 10 Mind
// sessions."
//
// The code now counts `completedMainSessions`, which only a counted completion
// in POST /api/mind/session increments. Existing documents have no such field.
// Absent, it reads as 0 — nobody is ever locked out by this, but a member with
// 40 real sessions would silently get 10 more free ones. This restores the
// truth for the rows that already exist.
//
// WHAT IT WRITES
//
//   completedMainSessions = min(mainSessionCount, days this member completed a
//                               Mind session on)
//
// Both halves are honest bounds, and the smaller of two bounds is the safest
// answer available offline:
//
//   • mainSessionCount is real sessions PLUS the head start, so it can only be
//     too HIGH — never too low. It is the ceiling.
//   • a counted main session is gated to one per 20h and MindSession is one
//     document per user per LOCAL DAY, so the number of those documents is what
//     the member actually showed up for. It is the evidence.
//
// Where they disagree the difference IS the phantom head start, and the minimum
// drops it. The only inaccuracy left is a member who completed two counted
// sessions inside one local day (possible when a 20h cooldown straddles
// midnight), which under-counts by one — in the member's favour, which is the
// direction a paywall correction should err.
//
// IDEMPOTENT: it only fills documents where the field is ABSENT, so a second
// run matches nothing and a member's live increments are never clobbered.
//
// RUN IT BEFORE THE DEPLOY, like scripts/migrate-tiers.mjs. Not because
// anything breaks otherwise — nothing does, this fails open — but because after
// the deploy the first completed session creates the field via $inc, and this
// script will then correctly skip that member and leave their history at 1.
//
//   DRY RUN:  node scripts/backfill-mind-session-count.mjs
//   APPLY:    node scripts/backfill-mind-session-count.mjs --apply
//   PROD:     node scripts/backfill-mind-session-count.mjs --prod --apply
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

// Only rows that have never had the field. See IDEMPOTENT above.
const SELECTOR = { completedMainSessions: { $exists: false } }

await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 })
const db = mongoose.connection.db

// A wrong collection name would report "0 to fix" and look like a clean run, so
// prove both collections exist before believing any number below.
const names = (await db.listCollections().toArray()).map((c) => c.name)
for (const required of ['mindprogresses', 'mindsessions']) {
  if (!names.includes(required)) {
    console.error(`Collection '${required}' not found in this database — refusing to report on nothing.`)
    await mongoose.disconnect()
    process.exit(1)
  }
}

const progresses = db.collection('mindprogresses')
const sessions = db.collection('mindsessions')

const total = await progresses.countDocuments({})
const already = await progresses.countDocuments({ completedMainSessions: { $exists: true } })
const candidates = await progresses.countDocuments(SELECTOR)

console.log(`\n${PROD ? 'PROD' : 'DEV'} — mindprogresses`)
console.log(`  total ..................... ${total}`)
console.log(`  already counted ........... ${already}   (left alone)`)
console.log(`  → to seed ................. ${candidates}`)

const plan = []
const cursor = progresses.find(SELECTOR, {
  projection: { userId: 1, chapter: 1, mainSessionCount: 1 },
})
for await (const doc of cursor) {
  const ceiling = Math.max(0, Math.floor(doc.mainSessionCount ?? 0))
  const evidence = await sessions.countDocuments({ userId: doc.userId })
  plan.push({
    _id: doc._id,
    userId: String(doc.userId),
    chapter: doc.chapter ?? 1,
    ceiling,
    evidence,
    value: Math.min(ceiling, evidence),
  })
}

const inflated = plan.filter((p) => p.value < p.ceiling)
const phantom = inflated.reduce((n, p) => n + (p.ceiling - p.value), 0)
const zero = plan.filter((p) => p.value === 0)

console.log(`\n  of those:`)
console.log(`    carrying a head start ... ${inflated.length}   (${phantom} phantom sessions dropped)`)
console.log(`    at zero real sessions ... ${zero.length}`)

if (plan.length > 0) {
  console.log('\n  sample:')
  for (const p of plan.slice(0, 10)) {
    const note = p.value < p.ceiling ? `  ← was ${p.ceiling}` : ''
    console.log(
      `    user=${p.userId} ch${p.chapter}  counter=${p.ceiling} days=${p.evidence} → ${p.value}${note}`,
    )
  }
  if (plan.length > 10) console.log(`    … and ${plan.length - 10} more`)
}

if (APPLY && plan.length > 0) {
  const ops = plan.map((p) => ({
    updateOne: {
      filter: { _id: p._id, ...SELECTOR },
      update: { $set: { completedMainSessions: p.value } },
    },
  }))
  const r = await progresses.bulkWrite(ops, { ordered: false })
  console.log(`\nAPPLIED — matched ${r.matchedCount}, modified ${r.modifiedCount}`)
  const left = await progresses.countDocuments(SELECTOR)
  console.log(`Re-check (must be 0): ${left}`)
} else {
  console.log(`\n${APPLY ? 'APPLIED — nothing to do' : '(dry-run) — pass --apply to write'}`)
}

await mongoose.disconnect()
