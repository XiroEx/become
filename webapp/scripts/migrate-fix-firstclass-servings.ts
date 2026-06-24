/**
 * Migration: fix first-class produce/staple foods whose serving shape is corrupt.
 *
 * The seeder stored the GRAM WEIGHT in `servingSize` with a household
 * `servingUnit` (e.g. Blueberries servingSize=148, servingUnit='cup' → "148 cups"
 * per serving). A later bridge backfill then set mlPerServing = servingSize × 240.
 * Net effect: logging a real "1 cup" scales to 1/148 ≈ 0 macros, and the AI
 * matcher can't convert cup/each → grams (no valid gram bridge).
 *
 * Fix per affected variant (household unit AND servingSize > 3):
 *   gramsPerServing := servingSize    (the stored value IS the gram weight)
 *   servingSize     := 1              (one cup / each / slice / tbsp)
 *   mlPerServing    := unset          (the backfilled value was garbage)
 * nutrition and alternateServings are LEFT UNCHANGED — their multipliers scale the
 * (unchanged) per-serving nutrition, so they stay correct.
 *
 * Scoped to isFirstClass foods (the seeded catalog); USDA/OFF foods store per-100 g
 * so they're unaffected. Idempotent (servingSize<=3 variants are skipped).
 *
 * Run from webapp/:
 *   DRY  : PROD_MONGODB_URI="<uri>" npx tsx scripts/migrate-fix-firstclass-servings.ts --prod
 *   APPLY: PROD_MONGODB_URI="<uri>" npx tsx scripts/migrate-fix-firstclass-servings.ts --prod --apply
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('Missing Mongo URI'); process.exit(1) }

const HOUSEHOLD = new Set(['each', 'cup', 'slice', 'tbsp', 'tsp', 'scoop', 'serving'])

interface Variant { name?: string; isDefault?: boolean; servingSize?: number; servingUnit?: string; gramsPerServing?: number; mlPerServing?: number }
interface FoodDoc { _id: mongoose.Types.ObjectId; name?: string; variants?: Variant[] }

async function main() {
  console.log(`\n== Fix first-class serving shapes ==  (${isProd ? 'PROD' : 'DEV'}, ${apply ? 'APPLY' : 'DRY-RUN'})\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  const docs = await Foods.find({ isFirstClass: true }).toArray()
  let foodsFixed = 0, variantsFixed = 0

  for (const f of docs) {
    const vs = f.variants ?? []
    let changed = false
    const newVariants = vs.map((v) => {
      const unit = v.servingUnit ?? ''
      const size = typeof v.servingSize === 'number' ? v.servingSize : 0
      if (HOUSEHOLD.has(unit) && size > 3) {
        changed = true
        variantsFixed++
        console.log(`  ${f.name} · "${v.name}"  ${size} ${unit}  →  1 ${unit} (gramsPerServing=${size}, mlPerServing cleared)`)
        const { mlPerServing: _drop, ...rest } = v
        void _drop
        return { ...rest, servingSize: 1, gramsPerServing: size }
      }
      return v
    })
    if (changed) {
      foodsFixed++
      if (apply) await Foods.updateOne({ _id: f._id }, { $set: { variants: newVariants } })
    }
  }

  console.log(`\n${apply ? 'Fixed' : 'Would fix'}: ${variantsFixed} variants across ${foodsFixed} foods (of ${docs.length} first-class).`)
  if (!apply) console.log('(dry-run — re-run with --apply to write)')
  await mongoose.disconnect()
  console.log('Done.')
}

main().catch((e) => { console.error(e); process.exit(1) })
