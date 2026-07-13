import { createRequire } from 'module'; import { readFileSync } from 'fs'
const require = createRequire(import.meta.url); const mongoose = require('mongoose')

// Onboarding seeded the first weight-log entry with the PROFILE value (kg) while
// the weight log stores a raw number in the user's display unit (lbs). A user who
// typed 175 lb got a first log entry of 79, which rendered as "79 lbs" until they
// logged again. Repair those entries in place: rewrite them to the pound value the
// user actually typed (profile kg → lb).
//
// Only touches an entry when ALL hold, which is a very tight signature:
//   • the user is on lbs (weightUnit != 'kg')
//   • the entry equals the profile's kg value (within 1.5)
//   • the entry is < 110 (implausible as an adult's pounds)
//   • the kg value back-converts to a clean round pound number (i.e. it was
//     produced by lbsToKg(<round lbs>) — an actual metric user's kg would not)
// Read-only unless --apply.

const APPLY = process.argv.includes('--apply')
await mongoose.connect(readFileSync('/tmp/prod_uri.txt', 'utf8').trim(), { serverSelectionTimeoutMS: 15000 })
const db = mongoose.connection.db

const users = await db.collection('users').find(
  { 'profile.currentWeightKg': { $exists: true } },
  { projection: { email: 1, 'profile.currentWeightKg': 1, 'profile.weightUnit': 1 } },
).toArray()

let fixedUsers = 0, fixedEntries = 0
for (const u of users) {
  const kg = u.profile.currentWeightKg
  const unit = u.profile.weightUnit
  if (unit === 'kg') continue

  const lbs = Math.round(kg * 2.20462)
  // A kg produced by lbsToKg(round lbs) round-trips back to within ~0.3 lb.
  const roundTripsClean = Math.abs(kg * 2.20462 - lbs) < 0.35
  if (!roundTripsClean) continue

  const prog = await db.collection('userprogresses').findOne(
    { userId: u._id }, { projection: { weightHistory: 1 } },
  )
  const hist = prog?.weightHistory || []
  if (!hist.length) continue

  const patched = hist.map((e) => {
    const isKgSeed = Math.abs(e.weight - kg) < 1.5 && e.weight < 110
    if (!isKgSeed) return e
    fixedEntries++
    return { ...e, weight: lbs }
  })
  const changed = patched.some((e, i) => e.weight !== hist[i].weight)
  if (!changed) continue

  fixedUsers++
  const before = hist.map(e => Math.round(e.weight)).join(' → ')
  const after = patched.map(e => Math.round(e.weight)).join(' → ')
  console.log(`  ${String(u.email || '?').slice(0, 26).padEnd(28)} ${kg.toFixed(1)}kg → ${lbs}lb`)
  console.log(`      before: ${before}`)
  console.log(`      after : ${after}`)

  if (APPLY) {
    await db.collection('userprogresses').updateOne(
      { _id: prog._id },
      { $set: { weightHistory: patched } },
    )
    // Make the (previously never-persisted) unit explicit so nothing re-guesses it.
    await db.collection('users').updateOne(
      { _id: u._id }, { $set: { 'profile.weightUnit': 'lbs' } },
    )
  }
}

console.log(`\nusers repaired: ${fixedUsers} | entries rewritten: ${fixedEntries}`)
console.log(APPLY ? 'APPLIED' : '(dry-run — re-run with --apply)')
await mongoose.disconnect()
