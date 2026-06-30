/**
 * Reconcile catalog foods against their SOURCE database (USDA FDC / OpenFoodFacts).
 *
 * For every source-backed food it re-fetches the live source record by id/barcode,
 * normalises both stored and source to per-100, compares, and classifies:
 *
 *   matches-source     stored ≈ source (within tolerance) — fine.
 *   fixable            source has good data that differs from stored → our copy
 *                      is wrong but the source can fix it (macros AND, for USDA,
 *                      the serving shape — re-mapped via mapUSDAFood).
 *   broken-at-source   the source itself is missing / has zero macros → NOT
 *                      fixable from source, needs manual data.
 *   source-unreachable fetch error / rate-limited → retry later.
 *   no-source          manual food or no external id → not reconcilable here.
 *
 * Writes a JSON manifest of the `fixable` corrections + a `broken-at-source` list.
 * With --apply it writes the fixable corrections to the default variant.
 *
 * Run from webapp/:
 *   DRY  (prod):  PROD_MONGODB_URI="<uri>" npx tsx scripts/reconcile-foods-with-source.ts --prod
 *   ONE SOURCE:   ... --source usda           (usda | off)
 *   CHUNK:        ... --limit 200             (rate-limit friendly; DEMO_KEY is slow)
 *   APPLY:        ... --apply
 *   FROM AUDIT:   ... --ids scripts/reports/food-audit-XXXX.json   (only reconcile flagged)
 *
 * USDA needs USDA_API_KEY (falls back to DEMO_KEY — ~30 req/hr, so use --limit).
 * Read-only unless --apply.
 */

import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs'
import * as dotenv from 'dotenv'
import { fetchUSDAById, mapUSDAFood } from '@/lib/usda'
import { convert } from '@/lib/units'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const sourceFilter = arg('--source') // 'usda' | 'off'
const limit = arg('--limit') ? parseInt(arg('--limit')!, 10) : Infinity
const idsFile = arg('--ids')
const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'}`); process.exit(1) }

const UA = 'BecomeNutrition/1.0 (george@redbtn.io)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : 0))
const r1 = (v: number) => Math.round(v * 10) / 10

interface Nutrition { calories?: number; protein?: number; carbs?: number; fats?: number; fiber?: number; sugar?: number; sodium?: number; saturatedFat?: number }
interface Variant { isDefault?: boolean; servingSize?: number; servingUnit?: string; gramsPerServing?: number; mlPerServing?: number; nutrition?: Nutrition }
interface FoodDoc { _id: mongoose.Types.ObjectId; name?: string; brand?: string; source?: string; externalId?: string; barcode?: string; variants?: Variant[] }

const MASS = new Set(['g', 'oz', 'lb', 'kg', 'mg'])
const VOL = new Set(['ml', 'fl_oz', 'cup', 'tbsp', 'tsp', 'pint', 'quart', 'liter'])
/** The amount (grams or ml) the variant's nutrition is actually PER. The
 *  nutrition is stored per `servingSize × servingUnit`, so for a mass/volume
 *  native food that's the converted servingSize — NOT gramsPerServing (which is
 *  a cross-unit bridge to a household serving and can disagree). Only a discrete
 *  native unit (each/slice/serving) has to fall back to the gram/ml bridge. */
function basis(v: Variant): number | null {
  const u = (v.servingUnit || '').toLowerCase()
  if (MASS.has(u) && v.servingSize && v.servingSize > 0) { try { return convert(v.servingSize, u as never, 'g') } catch { return null } }
  if (VOL.has(u) && v.servingSize && v.servingSize > 0) { try { return convert(v.servingSize, u as never, 'ml') } catch { return null } }
  if (v.gramsPerServing && v.gramsPerServing > 0) return v.gramsPerServing
  if (v.mlPerServing && v.mlPerServing > 0) return v.mlPerServing
  return null
}
function per100(v: Variant): { cal: number; p: number; c: number; f: number } | null {
  const n = v.nutrition; if (!n) return null
  const g = basis(v); if (!g) return null
  const k = 100 / g
  return { cal: num(n.calories) * k, p: num(n.protein) * k, c: num(n.carbs) * k, f: num(n.fats) * k }
}
const macrosPositive = (x: { p: number; c: number; f: number; cal: number }) => x.cal > 0 && (x.p + x.c + x.f) > 0
function close(a: number, b: number, tol = 0.15): boolean {
  const m = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / m <= tol
}

// ── OpenFoodFacts fetch (same hardening as reimport-off-macros) ──
type OffRes = { kind: 'ok'; n: Record<string, unknown> } | { kind: 'missing' } | { kind: 'error' }
async function fetchOff(code: string): Promise<OffRes> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=nutriments,product_name`
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue }
      if (!res.ok) return { kind: 'error' }
      const j = await res.json().catch(() => null) as { status?: number; product?: { nutriments?: Record<string, unknown> } } | null
      if (!j) return { kind: 'error' }
      if (j.status === 0 || !j.product?.nutriments) return { kind: 'missing' }
      return { kind: 'ok', n: j.product.nutriments }
    } catch { await sleep(2000 * (i + 1)) }
  }
  return { kind: 'error' }
}

function fdcIdOf(f: FoodDoc): string | null {
  const raw = (f.externalId || '').trim()
  const m = raw.match(/(\d{3,})/)
  return m ? m[1] : null
}
function offCodeOf(f: FoodDoc): string | null {
  const c = (f.barcode || f.externalId || '').replace(/^off:/i, '').trim()
  return c || null
}

type Verdict = 'matches-source' | 'fixable' | 'broken-at-source' | 'source-unreachable' | 'no-source'

async function main() {
  console.log(`\n== Reconcile foods with source ==  (${isProd ? 'PROD' : 'DEV'}, ${apply ? 'APPLY' : 'DRY-RUN'}${sourceFilter ? `, source=${sourceFilter}` : ''}, limit=${limit})\n`)
  if ((!sourceFilter || sourceFilter === 'usda') && !process.env.USDA_API_KEY) {
    console.log('⚠  USDA_API_KEY not set — USDA falls back to DEMO_KEY (~30 req/hr). Use --limit and re-run, or set the key.\n')
  }
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  const q: Record<string, unknown> = {}
  if (sourceFilter === 'usda') q.source = 'usda'
  else if (sourceFilter === 'off') q.source = 'openfoodfacts'
  else q.source = { $in: ['usda', 'openfoodfacts'] }
  if (idsFile) {
    const rep = JSON.parse(fs.readFileSync(idsFile, 'utf8'))
    const ids = (rep.foods || []).map((x: { id: string }) => new mongoose.Types.ObjectId(x.id))
    q._id = { $in: ids }
  }
  const all = (await Foods.find(q, { projection: { name: 1, brand: 1, source: 1, externalId: 1, barcode: 1, variants: 1 } }).toArray()).slice(0, limit)
  console.log(`Reconciling ${all.length} source-backed foods…\n`)

  const counts: Record<Verdict, number> = { 'matches-source': 0, fixable: 0, 'broken-at-source': 0, 'source-unreachable': 0, 'no-source': 0 }
  const fixable: Array<Record<string, unknown>> = []
  const brokenAtSource: Array<Record<string, unknown>> = []
  let applied = 0

  for (const f of all) {
    const label = `${f.name}${f.brand ? ` (${f.brand})` : ''}`
    const vs = f.variants ?? []
    let di = vs.findIndex((v) => v.isDefault); if (di < 0) di = 0
    const cur = vs[di]
    const stored = cur ? per100(cur) : null

    let srcPer100: { cal: number; p: number; c: number; f: number } | null = null
    let mappedForFix: ReturnType<typeof mapUSDAFood> | null = null
    let reach: 'ok' | 'missing' | 'error' = 'error'

    if (f.source === 'usda') {
      const fdc = fdcIdOf(f)
      if (!fdc) { counts['no-source']++; continue }
      const food = await fetchUSDAById(fdc).catch(() => null)
      await sleep(process.env.USDA_API_KEY ? 250 : 1500)
      if (!food) { reach = 'error' }
      else {
        const mapped = mapUSDAFood(food)
        if (!mapped) { reach = 'missing' }
        else {
          mappedForFix = mapped
          const g = mapped.gramsPerServing && mapped.gramsPerServing > 0 ? mapped.gramsPerServing
            : (mapped.servingUnit === 'g' ? mapped.servingSize : null)
          if (g) { const k = 100 / g; const n = mapped.nutrition; srcPer100 = { cal: num(n.calories) * k, p: num(n.protein) * k, c: num(n.carbs) * k, f: num(n.fats) * k }; reach = 'ok' }
          else reach = 'missing'
        }
      }
    } else if (f.source === 'openfoodfacts') {
      const code = offCodeOf(f)
      if (!code) { counts['no-source']++; continue }
      const off = await fetchOff(code)
      await sleep(1200)
      if (off.kind === 'error') reach = 'error'
      else if (off.kind === 'missing') reach = 'missing'
      else {
        const n = off.n
        srcPer100 = { cal: num(n['energy-kcal_100g']), p: num(n['proteins_100g']), c: num(n['carbohydrates_100g']), f: num(n['fat_100g']) }
        reach = 'ok'
      }
    } else { counts['no-source']++; continue }

    if (reach === 'error') { counts['source-unreachable']++; continue }
    if (reach === 'missing' || !srcPer100 || !macrosPositive(srcPer100)) {
      counts['broken-at-source']++
      brokenAtSource.push({ id: String(f._id), name: f.name, source: f.source, externalId: f.externalId || f.barcode, reason: reach === 'missing' ? 'not found / no usable data at source' : 'source has zero macros' })
      continue
    }

    // Source is good. Does stored agree?
    const agrees = stored && macrosPositive(stored)
      && close(stored.cal, srcPer100.cal) && close(stored.p, srcPer100.p) && close(stored.c, srcPer100.c) && close(stored.f, srcPer100.f)
    if (agrees) { counts['matches-source']++; continue }

    counts.fixable++
    const correction = {
      id: String(f._id), name: f.name, source: f.source, externalId: f.externalId || f.barcode,
      stored: stored ? { cal: Math.round(stored.cal), p: r1(stored.p), c: r1(stored.c), f: r1(stored.f) } : null,
      sourceMacros: { cal: Math.round(srcPer100.cal), p: r1(srcPer100.p), c: r1(srcPer100.c), f: r1(srcPer100.f) },
    }
    fixable.push(correction)
    console.log(`  FIXABLE ${label}`)
    console.log(`     stored ${correction.stored ? `${correction.stored.cal}cal P${correction.stored.p} C${correction.stored.c} F${correction.stored.f}` : '—'} → source ${correction.sourceMacros.cal}cal P${correction.sourceMacros.p} C${correction.sourceMacros.c} F${correction.sourceMacros.f} (per 100)`)

    if (apply && cur) {
      // USDA: re-map the full default variant (fixes serving shape + macros).
      if (f.source === 'usda' && mappedForFix) {
        const m = mappedForFix
        await Foods.updateOne({ _id: f._id }, { $set: {
          [`variants.${di}.nutrition`]: m.nutrition,
          [`variants.${di}.servingSize`]: m.servingSize,
          [`variants.${di}.servingUnit`]: m.servingUnit,
          ...(m.displayLabel ? { [`variants.${di}.displayLabel`]: m.displayLabel } : {}),
          ...(m.gramsPerServing != null ? { [`variants.${di}.gramsPerServing`]: m.gramsPerServing } : {}),
          ...(m.mlPerServing != null ? { [`variants.${di}.mlPerServing`]: m.mlPerServing } : {}),
          ...(m.alternateServings ? { [`variants.${di}.alternateServings`]: m.alternateServings } : {}),
          needsReview: false,
        } })
      } else {
        // OFF: correct per-100 macros only (serving handled separately by reimport).
        const g = basis(cur) || 100
        const k = g / 100
        await Foods.updateOne({ _id: f._id }, { $set: { [`variants.${di}.nutrition`]: {
          calories: Math.round(srcPer100.cal * k), protein: r1(srcPer100.p * k), carbs: r1(srcPer100.c * k), fats: r1(srcPer100.f * k),
        }, needsReview: false } })
      }
      applied++
    }
  }

  console.log('\n── Reconcile summary ──')
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${n}`)
  if (apply) console.log(`  applied corrections:  ${applied}`)

  const dir = path.join(__dirname, 'reports'); fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const out = path.join(dir, `reconcile-${stamp}.json`)
  fs.writeFileSync(out, JSON.stringify({ counts, applied, fixable, brokenAtSource }, null, 2))
  console.log(`\nManifest written: ${out}`)
  console.log(`  fixable: ${fixable.length}  ·  broken-at-source: ${brokenAtSource.length}`)
  if (!apply && fixable.length) console.log('  Re-run with --apply to write the fixable corrections.')

  await mongoose.disconnect()
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
