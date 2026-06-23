/**
 * Re-import nutrition for OpenFoodFacts foods whose macros got stripped to 0g.
 *
 * Targets: source='openfoodfacts' foods with a barcode whose DEFAULT variant has
 * all macros (protein+carbs+fats) == 0. Re-fetches the product LIVE from the
 * OpenFoodFacts API by barcode and updates the default variant's per-100 nutrition
 * — ONLY when the live data actually has non-zero macros, so it can never make a
 * food worse. Clears needsReview on the ones it fixes. Genuinely near-zero foods
 * (water/tea) get left alone (live API returns ~0 too → no change).
 *
 * Run from webapp/:
 *   DRY  (prod):  PROD_MONGODB_URI="<uri>" npx tsx scripts/reimport-off-macros.ts --prod
 *   APPLY(prod):  PROD_MONGODB_URI="<uri>" npx tsx scripts/reimport-off-macros.ts --prod --apply
 *
 * Read-only unless --apply. Reads MONGODB_URI (dev) or PROD_MONGODB_URI (--prod).
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

const UA = 'BecomeNutrition/1.0 (george@redbtn.io)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const BASE_DELAY = 1200 // ms between calls — OFF throttles aggressively
const r1 = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : 0)
const r3 = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1000) / 1000 : 0)
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : 0))

interface Variant { isDefault?: boolean; servingSize?: number; servingUnit?: string; nutrition?: { calories?: number; protein?: number; carbs?: number; fats?: number } }
interface FoodDoc { _id: mongoose.Types.ObjectId; name?: string; brand?: string; barcode?: string; externalId?: string; variants?: Variant[] }

type OffResult =
  | { kind: 'ok'; nutriments: Record<string, unknown> }
  | { kind: 'missing' }   // OFF explicitly has no such product (status 0)
  | { kind: 'error' }     // network / rate-limit / parse — retry later, NOT "not found"

// Retries on throttling (429/5xx) with backoff so a rate-limit blip isn't
// mistaken for a missing product (the bug the first run hit).
async function fetchOff(code: string): Promise<OffResult> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=nutriments,product_name`
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue }
      if (!res.ok) return { kind: 'error' }
      const j = await res.json().catch(() => null) as { status?: number; product?: { nutriments?: Record<string, unknown> } } | null
      if (!j) return { kind: 'error' }
      if (j.status === 0) return { kind: 'missing' }
      if (!j.product?.nutriments) return { kind: 'missing' }
      return { kind: 'ok', nutriments: j.product.nutriments }
    } catch { await sleep(2000 * (attempt + 1)) }
  }
  return { kind: 'error' }
}

async function main() {
  console.log(`\n== Re-import OFF macros ==  (${isProd ? 'PROD' : 'DEV'}, ${apply ? 'APPLY' : 'DRY-RUN'})\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  // Candidates: OFF foods whose default variant has zero macros.
  const all = await Foods.find({ source: 'openfoodfacts' }, { projection: { name: 1, brand: 1, barcode: 1, externalId: 1, variants: 1 } }).toArray()
  const candidates = all.filter((f) => {
    const v = (f.variants ?? []).find((x) => x.isDefault) ?? (f.variants ?? [])[0]
    const nu = v?.nutrition
    return nu && (num(nu.protein) + num(nu.carbs) + num(nu.fats)) === 0
  })
  console.log(`OFF foods: ${all.length} · zero-macro candidates: ${candidates.length}\n`)

  let fixed = 0, noBetter = 0, noBarcode = 0, notFound = 0, errored = 0
  const needManual: string[] = []
  const retryLater: string[] = []

  for (const f of candidates) {
    const code = (f.barcode || f.externalId || '').trim()
    const label = `${f.name}${f.brand ? ` (${f.brand})` : ''}`
    if (!code) { noBarcode++; needManual.push(`${label} — no barcode`); continue }
    const off = await fetchOff(code)
    await sleep(BASE_DELAY) // be polite to the OFF API
    if (off.kind === 'error') { errored++; retryLater.push(`${label} [${code}] — OFF fetch error (rate-limited?), retry`); continue }
    if (off.kind === 'missing') { notFound++; needManual.push(`${label} [${code}] — not on OFF`); continue }
    const nutr = off.nutriments

    const newN = {
      calories: Math.round(num(nutr['energy-kcal_100g'])) || undefined,
      protein: r1(nutr['proteins_100g']),
      carbs: r1(nutr['carbohydrates_100g']),
      fats: r1(nutr['fat_100g']),
      fiber: nutr['fiber_100g'] != null ? r1(nutr['fiber_100g']) : undefined,
      sugar: nutr['sugars_100g'] != null ? r1(nutr['sugars_100g']) : undefined,
      sodium: nutr['sodium_100g'] != null ? r3(nutr['sodium_100g']) : undefined,
      saturatedFat: nutr['saturated-fat_100g'] != null ? r1(nutr['saturated-fat_100g']) : undefined,
    }
    if ((newN.protein + newN.carbs + newN.fats) <= 0) { noBetter++; needManual.push(`${label} [${code}] — OFF also has 0 macros`); continue }

    const vs = f.variants ?? []
    let idx = vs.findIndex((x) => x.isDefault)
    if (idx < 0) idx = 0
    const cur = vs[idx]?.nutrition || {}
    const finalNutrition = {
      calories: newN.calories ?? num(cur.calories),
      protein: newN.protein, carbs: newN.carbs, fats: newN.fats,
      ...(newN.fiber != null ? { fiber: newN.fiber } : {}),
      ...(newN.sugar != null ? { sugar: newN.sugar } : {}),
      ...(newN.sodium != null ? { sodium: newN.sodium } : {}),
      ...(newN.saturatedFat != null ? { saturatedFat: newN.saturatedFat } : {}),
    }
    console.log(`  FIX ${label} [${code}]`)
    console.log(`      ${num(cur.calories)}cal P${num(cur.protein)} C${num(cur.carbs)} F${num(cur.fats)}  →  ${finalNutrition.calories}cal P${finalNutrition.protein} C${finalNutrition.carbs} F${finalNutrition.fats}`)
    if (apply) {
      await Foods.updateOne({ _id: f._id }, { $set: { [`variants.${idx}.nutrition`]: finalNutrition, needsReview: false } })
    }
    fixed++
  }

  console.log(`\n${apply ? 'Fixed' : 'Would fix'}: ${fixed}`)
  console.log(`Left as-is (OFF also 0 macros / genuinely near-zero): ${noBetter}`)
  console.log(`Not found on OFF: ${notFound}   No barcode: ${noBarcode}   Fetch errors (retry): ${errored}`)
  if (retryLater.length) {
    console.log(`\nRetry later — OFF fetch error, NOT confirmed missing (${retryLater.length}):`)
    for (const m of retryLater) console.log(`  - ${m}`)
  }
  if (needManual.length) {
    console.log(`\nNeeds manual info (${needManual.length}):`)
    for (const m of needManual) console.log(`  - ${m}`)
  }
  if (!apply) console.log('\n(dry-run — re-run with --apply to write)')
  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
