/**
 * Diagnose foods that would FAIL or misbehave in the log picker — i.e. where the
 * QuantityPicker's math (lib/foodMath.scalingFactor) throws or yields 0/NaN, which
 * makes the picker show 0 nutrition and DISABLE the submit button (user "can't log
 * it"). Focuses on raw foods / vegetables but scans the whole catalog.
 *
 * Checks per food's DEFAULT variant (+ alternateServings):
 *   - servingSize <= 0 / non-finite  → scalingFactor throws → can't log
 *   - missing servingUnit
 *   - logging the default serving yields 0 nutrition despite the variant having macros
 *   - gram-bridge inconsistency: resolving via grams diverges wildly from the
 *     native serving (the cup/each ↔ grams conflation bug)
 *
 * Read-only. Run from webapp/:
 *   PROD_MONGODB_URI="<uri>" npx tsx scripts/diagnose-food-logging.ts --prod
 *   (optional: --category Vegetable  to focus a category)
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import { scalingFactor, type VariantForMath } from '../lib/foodMath'
import type { Unit } from '../lib/units'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const catIdx = process.argv.indexOf('--category')
const onlyCategory = catIdx >= 0 ? process.argv[catIdx + 1] : null
const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('Missing Mongo URI'); process.exit(1) }

interface Nut { calories?: number; protein?: number; carbs?: number; fats?: number }
interface Variant { name?: string; isDefault?: boolean; servingSize?: number; servingUnit?: string; nutrition?: Nut; gramsPerServing?: number; mlPerServing?: number }
interface FoodDoc { _id: mongoose.Types.ObjectId; name?: string; brand?: string; category?: string; source?: string; variants?: Variant[] }

const KNOWN_UNITS = new Set<Unit>(['g', 'oz', 'lb', 'ml', 'fl_oz', 'cup', 'tbsp', 'tsp', 'each', 'slice', 'scoop', 'serving'])
const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)
const hasMacros = (nu?: Nut) => !!nu && (n(nu.calories) + n(nu.protein) + n(nu.carbs) + n(nu.fats)) > 0

async function main() {
  console.log(`\n== Food logging diagnostic ==  (${isProd ? 'PROD' : 'DEV'}${onlyCategory ? `, category=${onlyCategory}` : ''})\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  const query = onlyCategory ? { category: onlyCategory } : {}
  const cursor = Foods.find(query, { projection: { name: 1, brand: 1, category: 1, source: 1, variants: 1 } })

  let total = 0
  const badSize: string[] = []       // servingSize <= 0 → throws → can't log
  const badUnit: string[] = []       // servingUnit missing or not a known Unit
  const zeroOnLog: string[] = []     // default serving logs 0 nutrition despite variant having macros
  const bridgeOff: string[] = []     // gram bridge wildly inconsistent with native serving
  const catUnit: Record<string, number> = {} // servingUnit distribution

  for await (const f of cursor) {
    total++
    const v = (f.variants ?? []).find(x => x.isDefault) ?? (f.variants ?? [])[0]
    if (!v) continue
    const label = `${f.name}${f.brand ? ` (${f.brand})` : ''} [${f.category}/${f.source}] ${v.servingSize}${v.servingUnit ?? '?'} ${f._id}`
    const unit = (v.servingUnit ?? '') as Unit
    catUnit[v.servingUnit ?? '∅'] = (catUnit[v.servingUnit ?? '∅'] ?? 0) + 1

    if (!v.servingUnit || !KNOWN_UNITS.has(unit)) badUnit.push(label)
    if (!(typeof v.servingSize === 'number' && isFinite(v.servingSize) && v.servingSize > 0)) { badSize.push(label); continue }

    const vm: VariantForMath = {
      servingSize: v.servingSize,
      servingUnit: unit as VariantForMath['servingUnit'],
      nutrition: { calories: n(v.nutrition?.calories), protein: n(v.nutrition?.protein), carbs: n(v.nutrition?.carbs), fats: n(v.nutrition?.fats) },
      gramsPerServing: v.gramsPerServing,
      mlPerServing: v.mlPerServing,
    }
    // Simulate logging the DEFAULT serving (the primary chip): qty = servingSize, native unit.
    try {
      const factor = scalingFactor(vm, v.servingSize, unit)
      if (!Number.isFinite(factor) || factor <= 0) { if (hasMacros(v.nutrition)) zeroOnLog.push(`${label}  factor=${factor}`); }
    } catch (e) {
      zeroOnLog.push(`${label}  THROW: ${(e as Error).message}`)
    }
    // Gram-bridge sanity: if gramsPerServing set, logging `gramsPerServing g` should
    // ≈ logging one native serving (factor ≈ 1). Flag big divergence (the cup↔g bug).
    if (v.gramsPerServing && v.gramsPerServing > 0 && unit !== 'g') {
      try {
        const fg = scalingFactor(vm, v.gramsPerServing, 'g' as Unit)
        const fnat = scalingFactor(vm, v.servingSize, unit)
        if (Number.isFinite(fg) && Number.isFinite(fnat) && fnat > 0) {
          const ratio = fg / fnat
          if (ratio < 0.5 || ratio > 2) bridgeOff.push(`${label}  gramsPerServing=${v.gramsPerServing} → grams/native factor ratio=${ratio.toFixed(2)}`)
        }
      } catch { /* covered above */ }
    }
  }

  console.log(`Scanned: ${total}\n`)
  console.log(`servingSize<=0 / non-finite (THROWS → can't log): ${badSize.length}`)
  console.log(`unknown/missing servingUnit: ${badUnit.length}`)
  console.log(`default-serving logs 0/throws despite macros: ${zeroOnLog.length}`)
  console.log(`gram-bridge inconsistent (cup/each↔g conflation): ${bridgeOff.length}`)
  console.log('\nservingUnit distribution:')
  for (const [u, c] of Object.entries(catUnit).sort((a, b) => b[1] - a[1])) console.log(`  ${u.padEnd(10)} ${c}`)

  const dump = (title: string, arr: string[]) => {
    if (!arr.length) return
    console.log(`\n${title} (${arr.length}${arr.length > 60 ? ', first 60' : ''}):`)
    for (const s of arr.slice(0, 60)) console.log(`  - ${s}`)
  }
  dump('servingSize<=0', badSize)
  dump('unknown servingUnit', badUnit)
  dump('default-serving 0/throw', zeroOnLog)
  dump('gram-bridge inconsistent', bridgeOff)

  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
