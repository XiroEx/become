import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const dotenv = require('dotenv')

// Give every ownerless Meal its owner back.
//
// WHY IT EXISTS
//
// POST /api/meal-logs/combine created the saved meal as
//
//     Meal.create({ user: auth.userId, name, items, totalNutrition })
//
// `user` is the owner field on MealLog. On Meal it is `createdBy`, so Mongoose
// strict mode dropped the key and the meal was written with NO owner. That is
// not a cosmetic defect:
//
//   • the free 3-meal allowance counts Meal.countDocuments({ createdBy }), so
//     these rows were never counted — combine-save was an uncapped bypass;
//   • GET /api/meals?mine=true filters on createdBy, GET /api/meals (no
//     `mine`) matches createdBy / isPublic / isVerified, and DELETE checks
//     ownership — so an ownerless meal is invisible everywhere in the app and
//     its creator cannot delete it. Clearing them took direct DB access.
//
// The route is fixed (it writes createdBy, through createStrict, which now
// throws on a key that is not a schema path — lib/strictCreate.ts). This
// repairs the rows written before that.
//
// HOW OWNERSHIP IS RECOVERED
//
// The same request that created the meal also created the merged MealLog, with
// `mealId` pointing at the meal and `user` set correctly — MealLog HAS a `user`
// path, so that half always landed. The log is therefore a witness to who made
// the meal.
//
// The rule is deliberately strict: repair only when every MealLog referencing
// the meal names the SAME user. One distinct user is proof. Zero (the log was
// since deleted) or two or more (the meal was also logged by someone else) are
// reported and left alone — a guess here would hand one member's meal to
// another and, because the allowance counts rows, would also charge them a slot
// for it.
//
// Ownerless meals that are isPublic or isVerified are NOT candidates: a catalog
// row with no author is a different thing entirely and must not be reassigned
// to whoever logged it first. They are counted in the summary so they stay
// visible.
//
// IDEMPOTENT: the selector matches only rows with no owner and the write
// re-asserts that in its filter, so a second run matches nothing and a row
// repaired by hand in between is never overwritten.
//
//   DRY RUN:  node scripts/repair-orphan-meals.mjs
//   APPLY:    node scripts/repair-orphan-meals.mjs --apply
//   PROD:     node scripts/repair-orphan-meals.mjs --prod --apply
//
// Reads MONGODB_URI (or PROD_MONGODB_URI / MONGODB_URI_PROD with --prod) from
// the environment, falling back to webapp/.env.local. No connection string is
// baked in.

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

// No owner: the field was never written, or was written as null.
const NO_OWNER = [{ createdBy: { $exists: false } }, { createdBy: null }]

// Candidates: ownerless AND not a catalog row.
const SELECTOR = {
  $and: [
    { $or: NO_OWNER },
    { isPublic: { $ne: true } },
    { isVerified: { $ne: true } },
  ],
}

await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 })
const db = mongoose.connection.db

// A mistyped collection name would report "0 to fix" and read as a clean run,
// so prove both collections exist before believing any number below.
const names = (await db.listCollections().toArray()).map((c) => c.name)
for (const required of ['meals', 'meallogs']) {
  if (!names.includes(required)) {
    console.error(`Collection '${required}' not found in this database — refusing to report on nothing.`)
    await mongoose.disconnect()
    process.exit(1)
  }
}

const meals = db.collection('meals')
const mealLogs = db.collection('meallogs')

const total = await meals.countDocuments({})
const owned = await meals.countDocuments({ createdBy: { $exists: true, $ne: null } })
const ownerless = await meals.countDocuments({ $or: NO_OWNER })
const candidates = await meals.countDocuments(SELECTOR)
const catalog = ownerless - candidates

console.log(`\n${PROD ? 'PROD' : 'DEV'} — meals`)
console.log(`  total ..................... ${total}`)
console.log(`  with an owner ............. ${owned}   (left alone)`)
console.log(`  ownerless ................. ${ownerless}`)
console.log(`    public/verified ......... ${catalog}   (catalog rows — never reassigned)`)
console.log(`  → candidates .............. ${candidates}`)

const repairable = []
const unrecoverable = []

const cursor = meals.find(SELECTOR, { projection: { name: 1, createdAt: 1 } })
for await (const meal of cursor) {
  const users = await mealLogs.distinct('user', { mealId: meal._id })
  const distinct = users.filter((u) => u != null)
  const row = {
    _id: meal._id,
    name: meal.name ?? '(unnamed)',
    createdAt: meal.createdAt ?? null,
    witnesses: distinct.length,
  }
  if (distinct.length === 1) {
    repairable.push({ ...row, owner: distinct[0] })
  } else {
    unrecoverable.push({
      ...row,
      reason: distinct.length === 0
        ? 'no surviving meal log references it'
        : `${distinct.length} different members logged it — owner is ambiguous`,
    })
  }
}

console.log(`\n  of those:`)
console.log(`    recoverable ............. ${repairable.length}`)
console.log(`    unrecoverable ........... ${unrecoverable.length}`)

if (repairable.length > 0) {
  console.log('\n  will set createdBy:')
  for (const p of repairable.slice(0, 20)) {
    console.log(`    ${p._id}  "${p.name}"  → ${p.owner}`)
  }
  if (repairable.length > 20) console.log(`    … and ${repairable.length - 20} more`)
}

if (unrecoverable.length > 0) {
  console.log('\n  LEFT ALONE (needs a human — these stay invisible to their creator):')
  for (const p of unrecoverable) {
    console.log(`    ${p._id}  "${p.name}"  created=${p.createdAt ?? '?'}  — ${p.reason}`)
  }
}

if (APPLY && repairable.length > 0) {
  const ops = repairable.map((p) => ({
    updateOne: {
      // Re-assert ownerlessness in the filter: a row fixed by another run, or
      // by hand, between the read above and this write is skipped rather than
      // overwritten.
      filter: { _id: p._id, $or: NO_OWNER },
      update: { $set: { createdBy: p.owner, updatedAt: new Date() } },
    },
  }))
  const r = await meals.bulkWrite(ops, { ordered: false })
  console.log(`\nAPPLIED — matched ${r.matchedCount}, modified ${r.modifiedCount}`)
  const left = await meals.countDocuments(SELECTOR)
  console.log(`Re-check (expected ${unrecoverable.length}, the unrecoverable ones): ${left}`)
} else {
  console.log(`\n${APPLY ? 'APPLIED — nothing to do' : '(dry-run) — pass --apply to write'}`)
}

await mongoose.disconnect()
