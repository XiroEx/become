/**
 * Backfill: enrich existing Food.variants with gramsPerServing / mlPerServing
 * cross-domain bridges where they're missing.
 *
 * After PR 3 lands, all NEW imports populate the bridges automatically; this
 * script handles the historical data that was imported before the new fields
 * existed. It's idempotent — variants that already have at least one bridge
 * are skipped, so a re-run is harmless.
 *
 * Strategy per source:
 *
 *   - source: 'manual' — when servingUnit is in the mass family (g/oz/lb)
 *     gramsPerServing = convert(servingSize → g). Symmetric for volume
 *     family. Discrete-unit variants (each/slice/scoop/serving) are left
 *     alone; we don't fake density.
 *
 *   - source: 'openfoodfacts' — re-run the OFF mapping logic against the
 *     persisted variant.displayLabel (which is the OFF serving_size text).
 *     Skip when no usable parse falls out.
 *
 *   - source: 'usda' — Foundation/SR Legacy/Survey foods can be enriched
 *     locally (mass-only servingSizeUnit means gramsPerServing = servingSize;
 *     per-100g defaults to 100). Branded foods would need a USDA refetch to
 *     mine householdServingFullText accurately, so we SKIP them here — too
 *     costly and risks rate-limiting the public API. They'll backfill
 *     organically as users open them in the picker (PR 4 onwards).
 *
 * Run from webapp/:
 *   DEV:  npx tsx scripts/backfill-bridges.ts
 *   PROD: npx tsx scripts/backfill-bridges.ts --prod
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod)
 * from .env.local. Logs scan/update/skip counts and exits cleanly.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'
import { parseQuantityString, convert, type Unit } from '../lib/units'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')

const PROD_URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD
const DEV_URI = process.env.MONGODB_URI
const MONGODB_URI = isProd ? PROD_URI : DEV_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

// Minimal shape — we don't import the full Food model so this script stays
// schema-agnostic if the schema gains fields later.
interface VariantDoc {
  _id: mongoose.Types.ObjectId
  name?: string
  servingSize?: number
  servingUnit?: string
  displayLabel?: string
  gramsPerServing?: number
  mlPerServing?: number
}

interface FoodDoc {
  _id: mongoose.Types.ObjectId
  source: 'usda' | 'openfoodfacts' | 'manual'
  externalDataType?: string
  variants: VariantDoc[]
}

const USDA_MASS_UNITS = new Set(['grm', 'g', 'gram', 'grams'])
const USDA_VOLUME_UNITS = new Set(['mlt', 'ml', 'milliliter', 'milliliters'])

const MASS_FAMILY_UNITS = new Set<Unit>(['g', 'oz', 'lb'])
const VOLUME_FAMILY_UNITS = new Set<Unit>(['ml', 'fl_oz', 'cup', 'tbsp', 'tsp'])

/**
 * Try parsing a freeform serving-size text into a gram value. Mirrors the
 * helper in foodImport.ts; we duplicate it here so the script doesn't pull
 * mongoose-bound modules.
 */
function extractGrams(text: string | undefined): number | null {
  if (!text) return null
  const tryOne = (s: string): number | null => {
    const p = parseQuantityString(s)
    if (!p) return null
    if (MASS_FAMILY_UNITS.has(p.unit)) return convert(p.value, p.unit, 'g')
    return null
  }
  const direct = tryOne(text)
  if (direct != null) return direct
  const parens = text.match(/\(([^)]+)\)/g)
  if (parens) {
    for (const par of parens) {
      const inner = par.slice(1, -1).trim()
      const v = tryOne(inner)
      if (v != null) return v
    }
  }
  return null
}

function extractMl(text: string | undefined): number | null {
  if (!text) return null
  const tryOne = (s: string): number | null => {
    const p = parseQuantityString(s)
    if (!p) return null
    if (VOLUME_FAMILY_UNITS.has(p.unit)) return convert(p.value, p.unit, 'ml')
    return null
  }
  const direct = tryOne(text)
  if (direct != null) return direct
  const parens = text.match(/\(([^)]+)\)/g)
  if (parens) {
    for (const par of parens) {
      const inner = par.slice(1, -1).trim()
      const v = tryOne(inner)
      if (v != null) return v
    }
  }
  return null
}

function bridgesForVariant(food: FoodDoc, v: VariantDoc): { gramsPerServing?: number; mlPerServing?: number } | null {
  // Already has at least one bridge — skip.
  if (v.gramsPerServing != null || v.mlPerServing != null) return null

  const unit = (v.servingUnit || '').toLowerCase()
  const size = v.servingSize

  if (food.source === 'manual') {
    if (size == null || size <= 0) return null
    if (unit === 'g' || unit === 'oz' || unit === 'lb') {
      return { gramsPerServing: convert(size, unit, 'g') }
    }
    if (VOLUME_FAMILY_UNITS.has(unit as Unit)) {
      return { mlPerServing: convert(size, unit as Unit, 'ml') }
    }
    return null
  }

  if (food.source === 'openfoodfacts') {
    // Persisted displayLabel mirrors OFF serving_size text. Pull bridges from it.
    const grams = extractGrams(v.displayLabel)
    const ml = extractMl(v.displayLabel)
    const out: { gramsPerServing?: number; mlPerServing?: number } = {}
    if (grams != null && grams >= 5) out.gramsPerServing = grams
    if (ml != null && ml >= 5) out.mlPerServing = ml
    if (out.gramsPerServing == null && out.mlPerServing == null) return null
    return out
  }

  if (food.source === 'usda') {
    // Branded foods need an upstream refetch to mine householdServingFullText
    // accurately — out of scope for this offline backfill.
    if (food.externalDataType === 'Branded') return null

    if (size == null || size <= 0) return null
    // foodImport coerces stored servingUnit to the canonical Unit set, but be
    // defensive in case any pre-coerce USDA codes ('GRM'/'MLT') leaked through.
    if (USDA_MASS_UNITS.has(unit)) return { gramsPerServing: size }
    if (USDA_VOLUME_UNITS.has(unit)) return { mlPerServing: size }
    if (unit === 'oz' || unit === 'lb') return { gramsPerServing: convert(size, unit, 'g') }
    if (VOLUME_FAMILY_UNITS.has(unit as Unit)) return { mlPerServing: convert(size, unit as Unit, 'ml') }
    return null
  }

  return null
}

async function main() {
  console.log(`[backfill-bridges] connecting to ${isProd ? 'PROD' : 'DEV'}...`)
  await mongoose.connect(MONGODB_URI as string)

  const Food = mongoose.connection.collection('foods')

  let foodsScanned = 0
  let variantsUpdated = 0
  let variantsSkippedHasBridge = 0
  let variantsSkippedNoDerivation = 0

  // Stream the collection — don't slurp into memory. We only update one
  // variant at a time via positional `$` so we never replace the whole
  // variants array.
  const cursor = Food.find<FoodDoc>(
    {},
    { projection: { source: 1, externalDataType: 1, 'variants._id': 1, 'variants.name': 1, 'variants.servingSize': 1, 'variants.servingUnit': 1, 'variants.displayLabel': 1, 'variants.gramsPerServing': 1, 'variants.mlPerServing': 1 } },
  )

  for await (const food of cursor) {
    foodsScanned++
    if (!Array.isArray(food.variants)) continue

    for (const v of food.variants) {
      if (v.gramsPerServing != null || v.mlPerServing != null) {
        variantsSkippedHasBridge++
        continue
      }
      let bridges: { gramsPerServing?: number; mlPerServing?: number } | null = null
      try {
        bridges = bridgesForVariant(food, v)
      } catch (err) {
        console.warn(`[backfill-bridges] derive failed for food=${food._id} variant=${v._id}: ${err instanceof Error ? err.message : err}`)
      }
      if (!bridges || (bridges.gramsPerServing == null && bridges.mlPerServing == null)) {
        variantsSkippedNoDerivation++
        continue
      }

      const set: Record<string, number> = {}
      if (bridges.gramsPerServing != null) set['variants.$.gramsPerServing'] = bridges.gramsPerServing
      if (bridges.mlPerServing != null) set['variants.$.mlPerServing'] = bridges.mlPerServing

      try {
        const res = await Food.updateOne(
          { _id: food._id, 'variants._id': v._id },
          { $set: set },
        )
        if (res.modifiedCount > 0) variantsUpdated++
      } catch (err) {
        console.warn(`[backfill-bridges] update failed for food=${food._id} variant=${v._id}: ${err instanceof Error ? err.message : err}`)
      }
    }

    if (foodsScanned % 500 === 0) {
      console.log(`[backfill-bridges] scanned=${foodsScanned} updated=${variantsUpdated} skippedHasBridge=${variantsSkippedHasBridge} skippedNoDerivation=${variantsSkippedNoDerivation}`)
    }
  }

  console.log('---')
  console.log(`[backfill-bridges] DONE. ${isProd ? 'PROD' : 'DEV'}`)
  console.log(`  foods scanned:                 ${foodsScanned}`)
  console.log(`  variants updated:              ${variantsUpdated}`)
  console.log(`  variants skipped (had bridge): ${variantsSkippedHasBridge}`)
  console.log(`  variants skipped (no derive):  ${variantsSkippedNoDerivation}`)

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('[backfill-bridges] failed:', err)
  try { await mongoose.disconnect() } catch { /* ignore */ }
  process.exit(1)
})
