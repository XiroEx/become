/**
 * Dry-run catalog hygiene audit.
 *
 * Flags likely external-import pollution without mutating data:
 *   - intrinsically bad food payloads by lib/nutrition/foodQuality
 *   - known bad imported records called out by the handoff spec
 *   - duplicate top-level source+externalId pairs
 *   - duplicate variant-level externalIds inside imported foods
 *
 * Run from webapp/:
 *   npx tsx scripts/audit-food-catalog-hygiene.ts
 *   PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-food-catalog-hygiene.ts --prod
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import { assessFoodImportQuality } from '../lib/nutrition/foodQuality'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

interface Nutrition {
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
}

interface Variant {
  name?: string
  isDefault?: boolean
  servingSize?: number
  servingUnit?: string
  gramsPerServing?: number
  mlPerServing?: number
  nutrition?: Nutrition
  externalId?: string
}

interface FoodDoc {
  _id: mongoose.Types.ObjectId
  name?: string
  brand?: string
  category?: string
  source?: string
  externalId?: string
  barcode?: string
  isFirstClass?: boolean
  isVerified?: boolean
  needsReview?: boolean
  variants?: Variant[]
}

const KNOWN_BAD_IDS = new Set([
  '6a3b3f7aff7e93c00c7d14b1',
])

const defaultVariant = (f: FoodDoc): Variant | undefined => {
  return (f.variants ?? []).find(v => v.isDefault) ?? (f.variants ?? [])[0]
}

const label = (f: FoodDoc): string => {
  return `${f.name ?? '(missing name)'}${f.brand ? ` (${f.brand})` : ''} · ${f.source ?? '?'} · ${f.category ?? '?'} · ${f._id}`
}

async function main() {
  console.log(`\n== Food catalog hygiene audit == (${isProd ? 'PROD' : 'DEV'}, dry-run)\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  const total = await Foods.countDocuments({})
  const cursor = Foods.find({}, {
    projection: {
      name: 1,
      brand: 1,
      category: 1,
      source: 1,
      externalId: 1,
      barcode: 1,
      isFirstClass: 1,
      isVerified: 1,
      needsReview: 1,
      variants: 1,
    },
  })

  const byReason: Record<string, FoodDoc[]> = {}
  const sourceExternal: Record<string, FoodDoc[]> = {}
  const variantExternal: Record<string, string[]> = {}
  const knownBad: FoodDoc[] = []

  for await (const food of cursor) {
    if (KNOWN_BAD_IDS.has(String(food._id))) knownBad.push(food)

    const variant = defaultVariant(food)
    const quality = assessFoodImportQuality({
      name: food.name,
      brand: food.brand,
      category: food.category,
      servingSize: variant?.servingSize,
      servingUnit: variant?.servingUnit,
      gramsPerServing: variant?.gramsPerServing,
      mlPerServing: variant?.mlPerServing,
      nutrition: variant?.nutrition,
    })
    if (!quality.ok) {
      for (const reason of quality.reasons) {
        byReason[reason] ??= []
        byReason[reason].push(food)
      }
    }

    if (food.source && food.externalId) {
      const key = `${food.source}:${food.externalId}`
      sourceExternal[key] ??= []
      sourceExternal[key].push(food)
    }

    for (const v of food.variants ?? []) {
      if (!food.source || !v.externalId) continue
      const key = `${food.source}:${v.externalId}`
      variantExternal[key] ??= []
      variantExternal[key].push(`${food._id}${v.name ? `/${v.name}` : ''}`)
    }
  }

  const dupTopLevel = Object.entries(sourceExternal).filter(([, foods]) => foods.length > 1)
  const dupVariantLevel = Object.entries(variantExternal).filter(([, owners]) => owners.length > 1)

  console.log(`Total foods: ${total}`)
  console.log(`Known bad records present: ${knownBad.length}`)
  console.log(`Top-level duplicate source+externalId groups: ${dupTopLevel.length}`)
  console.log(`Variant duplicate source+externalId groups: ${dupVariantLevel.length}`)
  console.log('\nIntrinsic quality flags:')
  for (const [reason, foods] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${reason.padEnd(22)} ${foods.length}`)
  }

  const dumpFoods = (title: string, foods: FoodDoc[], max = 40) => {
    if (!foods.length) return
    console.log(`\n${title} (${foods.length}${foods.length > max ? `, first ${max}` : ''}):`)
    for (const f of foods.slice(0, max)) console.log(`  - ${label(f)}`)
  }

  dumpFoods('Known bad records', knownBad)
  for (const [reason, foods] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
    dumpFoods(`Sample: ${reason}`, foods, 20)
  }

  if (dupTopLevel.length) {
    console.log(`\nDuplicate top-level source+externalId samples (${Math.min(20, dupTopLevel.length)} of ${dupTopLevel.length}):`)
    for (const [key, foods] of dupTopLevel.slice(0, 20)) {
      console.log(`  - ${key}: ${foods.map(f => String(f._id)).join(', ')}`)
    }
  }

  if (dupVariantLevel.length) {
    console.log(`\nDuplicate variant source+externalId samples (${Math.min(20, dupVariantLevel.length)} of ${dupVariantLevel.length}):`)
    for (const [key, owners] of dupVariantLevel.slice(0, 20)) {
      console.log(`  - ${key}: ${owners.join(', ')}`)
    }
  }

  await mongoose.disconnect()
  console.log('\nDry-run only. No records were changed.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
