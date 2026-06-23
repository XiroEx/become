/**
 * Inspect foods / meals / recipes matching a name substring, with owner lookup.
 * Answers "who saved this food and what nutrition does it carry?"
 *
 * Run from webapp/:
 *   PROD_MONGODB_URI="<uri>" npx tsx scripts/inspect-food.ts --prod --q blueberr
 *
 * Read-only. Reads MONGODB_URI (dev) or PROD_MONGODB_URI (--prod).
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const qIdx = process.argv.indexOf('--q')
const q = qIdx >= 0 ? process.argv[qIdx + 1] : ''
if (!q) { console.error('Pass --q <name substring>'); process.exit(1) }

const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('Missing Mongo URI'); process.exit(1) }

const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)

async function main() {
  await mongoose.connect(MONGODB_URI as string)
  const db = mongoose.connection
  const rx = new RegExp(q, 'i')
  const users = db.collection('users')

  const ownerLabel = async (createdBy: unknown): Promise<string> => {
    if (!createdBy) return 'NO OWNER (global/catalog)'
    try {
      const u = await users.findOne({ _id: new mongoose.Types.ObjectId(String(createdBy)) }, { projection: { email: 1, name: 1 } })
      return u ? `owner=${u.name || '?'} <${u.email || '?'}> (${createdBy})` : `owner id ${createdBy} (user not found)`
    } catch { return `owner id ${createdBy}` }
  }

  for (const coll of ['foods', 'meals', 'recipes']) {
    const docs = await db.collection(coll).find({ name: rx }).limit(50).toArray()
    console.log(`\n===== ${coll}: ${docs.length} match "${q}" =====`)
    for (const d of docs) {
      const owner = await ownerLabel(d.createdBy)
      console.log(`\n• ${d.name}${d.brand ? ` (${d.brand})` : ''}  [${coll} ${d._id}]`)
      console.log(`   source=${d.source || '—'} firstClass=${d.isFirstClass ?? '—'} verified=${d.isVerified ?? '—'} needsReview=${d.needsReview ?? false}`)
      console.log(`   ${owner}`)
      if (Array.isArray(d.variants)) {
        for (const v of d.variants) {
          const nu = v.nutrition || {}
          console.log(`   variant ${v.isDefault ? '*' : ' '}"${v.name}"  ${v.servingSize} ${v.servingUnit}  →  ${n(nu.calories)}cal P${n(nu.protein)} C${n(nu.carbs)} F${n(nu.fats)}  (gPerServing=${v.gramsPerServing ?? '—'})`)
        }
      }
      // Meals/recipes carry totals, not variants
      if (d.totalNutrition) {
        const t = d.totalNutrition
        console.log(`   totalNutrition: ${n(t.calories)}cal P${n(t.protein)} C${n(t.carbs)} F${n(t.fats)}`)
      }
      if (d.totalsPerServing) {
        const t = d.totalsPerServing
        console.log(`   totalsPerServing: ${n(t.calories)}cal P${n(t.protein)} C${n(t.carbs)} F${n(t.fats)}`)
      }
    }
  }

  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
