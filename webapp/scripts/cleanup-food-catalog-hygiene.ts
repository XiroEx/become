/**
 * Dry-run/apply cleanup for food catalog hygiene.
 *
 * Default mode is read-only. With --apply it:
 *   - clears refs and deletes known bad Food records from FOOD_DATA_QUALITY_SPEC
 *   - clears dangling foodId references that point at missing Food docs
 *
 * Run from webapp/:
 *   npx tsx scripts/cleanup-food-catalog-hygiene.ts
 *   PROD_MONGODB_URI="<uri>" npx tsx scripts/cleanup-food-catalog-hygiene.ts --prod
 *   PROD_MONGODB_URI="<uri>" npx tsx scripts/cleanup-food-catalog-hygiene.ts --prod --apply
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import { clearFoodReferences } from '../lib/nutrition/foodReferenceCleanup'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const doApply = process.argv.includes('--apply')
const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

const KNOWN_BAD_IDS = [
  '6a3b3f7aff7e93c00c7d14b1',
]

interface RefDoc {
  _id: mongoose.Types.ObjectId
  savedFoods?: Array<{ foodId?: mongoose.Types.ObjectId }>
  items?: Array<{ foodId?: mongoose.Types.ObjectId }>
  ingredients?: Array<{ foodId?: mongoose.Types.ObjectId }>
  savedFoodId?: mongoose.Types.ObjectId
}

function addObjectId(set: Set<string>, value: unknown) {
  if (value instanceof mongoose.Types.ObjectId) set.add(value.toString())
}

async function collectReferencedFoodIds(): Promise<Set<string>> {
  const db = mongoose.connection.db
  if (!db) throw new Error('Mongo connection is not ready')

  const refs = new Set<string>()

  for await (const user of db.collection<RefDoc>('users').find({ 'savedFoods.foodId': { $exists: true } }, { projection: { savedFoods: 1 } })) {
    for (const item of user.savedFoods ?? []) addObjectId(refs, item.foodId)
  }
  for await (const doc of db.collection<RefDoc>('meallogs').find({ 'items.foodId': { $exists: true } }, { projection: { items: 1 } })) {
    for (const item of doc.items ?? []) addObjectId(refs, item.foodId)
  }
  for await (const doc of db.collection<RefDoc>('mealplans').find({ 'items.foodId': { $exists: true } }, { projection: { items: 1 } })) {
    for (const item of doc.items ?? []) addObjectId(refs, item.foodId)
  }
  for await (const doc of db.collection<RefDoc>('meals').find({ 'items.foodId': { $exists: true } }, { projection: { items: 1 } })) {
    for (const item of doc.items ?? []) addObjectId(refs, item.foodId)
  }
  for await (const doc of db.collection<RefDoc>('recipes').find(
    { $or: [{ 'ingredients.foodId': { $exists: true } }, { savedFoodId: { $exists: true } }] },
    { projection: { ingredients: 1, savedFoodId: 1 } },
  )) {
    addObjectId(refs, doc.savedFoodId)
    for (const item of doc.ingredients ?? []) addObjectId(refs, item.foodId)
  }
  for await (const doc of db.collection<RefDoc>('platescans').find({ 'items.foodId': { $exists: true } }, { projection: { items: 1 } })) {
    for (const item of doc.items ?? []) addObjectId(refs, item.foodId)
  }

  return refs
}

async function main() {
  console.log(`\n== Food catalog hygiene cleanup == (${isProd ? 'PROD' : 'DEV'}, ${doApply ? 'APPLY' : 'dry-run'})\n`)
  await mongoose.connect(MONGODB_URI as string)
  const db = mongoose.connection.db
  if (!db) throw new Error('Mongo connection is not ready')

  const Foods = db.collection('foods')

  const knownBadObjectIds = KNOWN_BAD_IDS.map(id => new mongoose.Types.ObjectId(id))
  const knownBad = await Foods.find(
    { _id: { $in: knownBadObjectIds } },
    { projection: { _id: 1, name: 1, brand: 1, source: 1 } },
  ).toArray()

  console.log(`Known bad Food records present: ${knownBad.length}`)
  for (const food of knownBad) {
    console.log(`  - ${food.name ?? '(missing name)'}${food.brand ? ` (${food.brand})` : ''} · ${food.source ?? '?'} · ${food._id}`)
  }

  const referenced = await collectReferencedFoodIds()
  const referencedObjectIds = Array.from(referenced).map(id => new mongoose.Types.ObjectId(id))
  const existing = referencedObjectIds.length > 0
    ? await Foods.find({ _id: { $in: referencedObjectIds } }, { projection: { _id: 1 } }).toArray()
    : []
  const existingIds = new Set(existing.map(doc => doc._id.toString()))
  const danglingIds = Array.from(referenced).filter(id => !existingIds.has(id))

  console.log(`Referenced Food ids scanned: ${referenced.size}`)
  console.log(`Dangling Food ids found: ${danglingIds.length}`)
  for (const id of danglingIds.slice(0, 40)) console.log(`  - ${id}`)
  if (danglingIds.length > 40) console.log(`  ... ${danglingIds.length - 40} more`)

  if (!doApply) {
    console.log('\nDry-run only. Re-run with --apply to clear refs and delete known bad records.\n')
    await mongoose.disconnect()
    return
  }

  for (const id of danglingIds) {
    await clearFoodReferences(id)
  }

  for (const food of knownBad) {
    await clearFoodReferences(food._id)
  }
  const deleted = knownBadObjectIds.length > 0
    ? await Foods.deleteMany({ _id: { $in: knownBadObjectIds } })
    : { deletedCount: 0 }

  console.log(`\nCleared dangling references for ${danglingIds.length} missing Food ids.`)
  console.log(`Deleted known bad Food records: ${deleted.deletedCount}`)
  console.log('\nDone.\n')
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  try { await mongoose.disconnect() } catch { /* ignore */ }
  process.exit(1)
})
