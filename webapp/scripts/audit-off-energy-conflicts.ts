/**
 * Audit: Food docs whose stored calories are contradicted by their own macros,
 * cross-examined against the live OpenFoodFacts record.
 *
 * REPORT ONLY — it never writes. That is the whole point. A contradiction says
 * the record disagrees with itself; it does not say which field is broken, and
 * the two real examples below break in opposite directions:
 *
 *   Sipping Bone Broth   OFF publishes 89 kcal/100 g. Its kJ field and its
 *                        macros both say ~17. The CALORIES are wrong.
 *   Pistachios           OFF publishes 571 kcal/100 g, which is correct. Its
 *                        macros are the per-28 g label figures sitting in the
 *                        per-100 g fields, and its kJ was entered on that same
 *                        wrong basis. The MACROS are wrong.
 *
 * Auto-"correcting" from the majority would have fixed the first and broken the
 * second. So this produces a queue for a human, sorted worst-first, with every
 * figure needed to make the call in one line.
 *
 * Run from webapp/:
 *   PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-off-energy-conflicts.ts
 *   PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-off-energy-conflicts.ts --flag
 *
 * --flag sets needsReview=true on the conflicting foods (the only write it can
 * make, and it changes no nutrition value).
 */

import mongoose from 'mongoose'
import Food, { type IFoodVariant } from '../models/Food'
import { detectOffEnergyConflict, offKjPer100 } from '../lib/offEnergy'

const FLAG = process.argv.includes('--flag')
const URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI
const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'
const UA = 'BecomeApp/1.0 (nutrition data audit)'

/** Be a good OFF citizen — their docs ask for well under 100 req/min. */
const REQUEST_SPACING_MS = 700
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Nutrition = {
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
  fiber?: number
}

/** Cheap pre-filter, so only real suspects cost an OFF request. */
function looksSuspect(n: Nutrition): boolean {
  const kcal = Number(n.calories) || 0
  if (kcal <= 0) return false
  const p = Number(n.protein) || 0
  const c = Number(n.carbs) || 0
  const f = Number(n.fats) || 0
  const fiber = Number(n.fiber) || 0
  const high = 4 * p + 4 * c + 9 * f + 2 * fiber
  return kcal > high * 2 + 25
}

async function fetchOff(barcode: string) {
  const res = await fetch(`${OFF_ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=nutriments`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { status?: number; product?: { nutriments?: Record<string, unknown> } }
  // v2 omits `status` entirely when the field list is narrow, so presence of
  // the nutriments block is the real signal — checking status alone reported
  // every hit as a miss.
  if (data.status != null && data.status !== 1) return null
  return data.product?.nutriments ?? null
}

async function main() {
  if (!URI) throw new Error('Set PROD_MONGODB_URI (or MONGODB_URI)')
  await mongoose.connect(URI)
  console.log(`connected · ${FLAG ? 'REPORT + FLAG' : 'REPORT ONLY'}`)

  const foods = await Food.find(
    { barcode: { $exists: true, $ne: null } },
    { name: 1, brand: 1, barcode: 1, variants: 1, needsReview: 1 },
  ).lean()

  console.log(`${foods.length} barcoded foods examined\n`)

  const rows: string[] = []
  let flagged = 0
  let unreachable = 0

  for (const food of foods) {
    const variants = food.variants ?? []
    // Only the per-100 g shape; anything else isn't comparable to OFF's fields.
    const variant = (variants as IFoodVariant[]).find(
      (v) => v.servingUnit === 'g' && Number(v.servingSize) === 100 && looksSuspect(v.nutrition ?? {}),
    )
    if (!variant) continue

    const stored = Math.round(Number(variant.nutrition?.calories) || 0)
    const label = `${food.name}${food.brand ? ` (${food.brand})` : ''} [${food.barcode}]`

    await sleep(REQUEST_SPACING_MS)
    let raw: Record<string, unknown> | null = null
    try {
      raw = await fetchOff(String(food.barcode))
    } catch {
      raw = null
    }

    if (!raw) {
      unreachable++
      rows.push(`  ?  ${label}\n       stored ${stored} kcal/100g · no live OFF record to cross-check`)
      continue
    }

    const conflict = detectOffEnergyConflict({
      energy_kcal_100g: Number(raw['energy-kcal_100g'] ?? raw['energy_kcal_100g']) || undefined,
      energy_kj_100g: offKjPer100(raw),
      proteins_100g: Number(raw['proteins_100g']) || undefined,
      carbohydrates_100g: Number(raw['carbohydrates_100g']) || undefined,
      fat_100g: Number(raw['fat_100g']) || undefined,
      fiber_100g: Number(raw['fiber_100g']) || undefined,
      alcohol_100g: Number(raw['alcohol_100g']) || undefined,
    })

    if (!conflict) {
      rows.push(`  ok ${label}\n       stored ${stored} kcal/100g · OFF is self-consistent; our copy is stale`)
      continue
    }

    rows.push(
      `  !  ${label}\n` +
        `       stored ${stored} · OFF kcal ${conflict.stated} · kJ→kcal ${conflict.fromKj ?? 'n/a'} · macros ${conflict.fromMacros ?? 'n/a'}\n` +
        `       ${conflict.reason}`,
    )

    if (FLAG && !food.needsReview) {
      await Food.updateOne({ _id: food._id }, { $set: { needsReview: true } })
      flagged++
    }
  }

  console.log(rows.join('\n'))
  console.log(
    `\n${rows.length} to review · ${unreachable} with no live OFF record` +
      (FLAG ? ` · ${flagged} newly flagged` : ''),
  )
  console.log('No nutrition value was changed. Resolving these needs a human — see lib/offEnergy.ts.')

  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
