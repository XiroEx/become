/**
 * One-shot cleanup: drop User.savedFoods entries pointing at Foods that no
 * longer exist.
 *
 * Why: an earlier `merge-existing-variants` backfill deleted source Foods
 * after moving their variants to a target. That backfill predated the
 * `redirectFoodRefs` helper, so the source Foods' _ids stayed in
 * `User.savedFoods[].foodId` and now dangle. New merges (admin route +
 * backfill) call `redirectFoodRefs`, but those already-stale entries need a
 * one-time sweep.
 *
 * What it touches:
 *   - User.savedFoods only. MealLog/Meal items are intentionally left alone:
 *     log items already snapshot nutrition at log-time so calories still
 *     render even when the foodId no longer resolves; deleting historical
 *     log items would lose user data.
 *
 * Idempotent — re-running matches nothing once the refs are gone.
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/cleanup-dangling-savedFoods.ts
 *   PROD: npx tsx scripts/cleanup-dangling-savedFoods.ts --prod
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

interface SavedFoodEntry {
  foodId: mongoose.Types.ObjectId
  savedAt: Date
}
interface UserDoc {
  _id: mongoose.Types.ObjectId
  savedFoods?: SavedFoodEntry[]
}

async function main() {
  console.log(`[cleanup-dangling-savedFoods] connecting to ${isProd ? 'PROD' : 'DEV'}...`)
  await mongoose.connect(MONGODB_URI as string)

  const Users = mongoose.connection.collection<UserDoc>('users')
  const Foods = mongoose.connection.collection('foods')

  // Collect every distinct foodId referenced by ANY user.
  const referenced = new Set<string>()
  let usersScanned = 0
  for await (const u of Users.find({ 'savedFoods.0': { $exists: true } })) {
    usersScanned++
    for (const sf of u.savedFoods ?? []) {
      if (sf?.foodId) referenced.add(sf.foodId.toString())
    }
  }
  console.log(`[cleanup-dangling-savedFoods] scanned ${usersScanned} users, ${referenced.size} distinct foodIds referenced`)

  if (referenced.size === 0) {
    console.log('[cleanup-dangling-savedFoods] nothing referenced; done.')
    await mongoose.disconnect()
    return
  }

  // Find which of those foodIds still exist in the foods collection.
  const referencedObjectIds = Array.from(referenced).map(s => new mongoose.Types.ObjectId(s))
  const foundDocs = await Foods.find(
    { _id: { $in: referencedObjectIds } },
    { projection: { _id: 1 } },
  ).toArray()
  const existingIds = new Set(foundDocs.map(f => f._id.toString()))
  const missingIds = new Set<string>()
  for (const id of referenced) {
    if (!existingIds.has(id)) missingIds.add(id)
  }
  console.log(`[cleanup-dangling-savedFoods] dangling foodIds: ${missingIds.size}`)

  if (missingIds.size === 0) {
    console.log('[cleanup-dangling-savedFoods] no dangling refs; done.')
    await mongoose.disconnect()
    return
  }

  // For each user with at least one dangling ref, rewrite savedFoods without
  // the dead entries. Walk in JS rather than $pull because the stored entry
  // is an object — keeps the filter trivially correct.
  const missingObjectIds = Array.from(missingIds).map(s => new mongoose.Types.ObjectId(s))
  const affected = Users.find({ 'savedFoods.foodId': { $in: missingObjectIds } })
  let usersUpdated = 0
  let entriesRemoved = 0
  for await (const u of affected) {
    const before = u.savedFoods ?? []
    const next = before.filter(sf => sf?.foodId && !missingIds.has(sf.foodId.toString()))
    const removedHere = before.length - next.length
    if (removedHere === 0) continue
    await Users.updateOne({ _id: u._id }, { $set: { savedFoods: next } })
    entriesRemoved += removedHere
    usersUpdated++
  }

  console.log(`[cleanup-dangling-savedFoods] users updated: ${usersUpdated}`)
  console.log(`[cleanup-dangling-savedFoods] dangling entries removed: ${entriesRemoved}`)

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('[cleanup-dangling-savedFoods] failed:', err)
  try { await mongoose.disconnect() } catch { /* ignore */ }
  process.exit(1)
})
