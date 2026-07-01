/**
 * SLOW, resumable, background-safe source reconciler.
 *
 * Same job as reconcile-foods-with-source.ts (re-fetch each USDA/OpenFoodFacts
 * food, compare to source, classify matches/fixable/broken-at-source, optionally
 * --apply) — but built to run UNATTENDED for hours without tripping rate limits
 * or losing progress if it's killed.
 *
 *   • Rate: HALF of each source's documented max, so it can't get us banned:
 *       USDA FDC  1000 req/hr  → default 500/hr  (1 every 7.2 s)
 *       OpenFoodFacts 100/min  → default 50/min  (1 every 1.2 s)
 *     Override with --usda-per-hour / --off-per-min. A full USDA+OFF pass at the
 *     defaults takes ~2–3 hours (that's intentional).
 *   • Resumable: writes a checkpoint of processed ids every few foods. Re-running
 *     SKIPS what's already done, so a crash/kill costs at most a handful of foods.
 *     Delete the checkpoint to start over.
 *   • Safe: never applies an implausible source value (>920 cal or >100 g of any
 *     macro per 100 g). Dry-run unless --apply.
 *   • Graceful: on Ctrl-C / kill it flushes checkpoint + results and exits.
 *
 * RUN IT BACKGROUNDED (from webapp/):
 *   PROD_MONGODB_URI="<uri>" USDA_API_KEY="<key>" \
 *     nohup npx tsx scripts/reconcile-slow.ts --prod --apply > /tmp/reconcile-slow.log 2>&1 &
 *
 * MONITOR:   tail -f /tmp/reconcile-slow.log
 * RESUME:    just re-run the same command — it picks up from the checkpoint.
 *
 * Flags: --prod  --apply  --source usda|off  --usda-per-hour N  --off-per-min N
 *        --checkpoint <path>  --results <path>
 */

import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs'
import * as dotenv from 'dotenv'
import { fetchUSDAById, mapUSDAFood } from '@/lib/usda'
import { convert } from '@/lib/units'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

// ── args ──
const has = (f: string) => process.argv.includes(f)
const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined }
const isProd = has('--prod')
const apply = has('--apply')
const sourceFilter = arg('--source')
const USDA_PER_HOUR = parseInt(arg('--usda-per-hour') || '500', 10)   // half of 1000/hr
const OFF_PER_MIN = parseInt(arg('--off-per-min') || '50', 10)        // half of 100/min
const USDA_DELAY = Math.ceil(3_600_000 / Math.max(1, USDA_PER_HOUR))  // ms between USDA calls
const OFF_DELAY = Math.ceil(60_000 / Math.max(1, OFF_PER_MIN))        // ms between OFF calls
const reportsDir = path.join(__dirname, 'reports')
fs.mkdirSync(reportsDir, { recursive: true })
const CHECKPOINT = arg('--checkpoint') || path.join(reportsDir, 'reconcile-slow.checkpoint.json')
const RESULTS = arg('--results') || path.join(reportsDir, 'reconcile-slow.results.json')

const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'}`); process.exit(1) }

const UA = 'BecomeNutrition/1.0 (george@redbtn.io)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : 0))
const r1 = (v: number) => Math.round(v * 10) / 10
const now = () => new Date().toISOString().slice(11, 19)

interface Nutrition { calories?: number; protein?: number; carbs?: number; fats?: number }
interface Variant { isDefault?: boolean; servingSize?: number; servingUnit?: string; gramsPerServing?: number; mlPerServing?: number; nutrition?: Nutrition }
interface FoodDoc { _id: mongoose.Types.ObjectId; name?: string; brand?: string; source?: string; externalId?: string; barcode?: string; variants?: Variant[] }

const MASS = new Set(['g', 'oz', 'lb', 'kg', 'mg'])
const VOL = new Set(['ml', 'fl_oz', 'cup', 'tbsp', 'tsp', 'pint', 'quart', 'liter'])
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
type Macro = { cal: number; p: number; c: number; f: number }
const macrosPositive = (x: Macro) => x.cal > 0 && (x.p + x.c + x.f) > 0
const plausible = (x: Macro) => x.cal <= 920 && x.p <= 100 && x.c <= 100 && x.f <= 100
const close = (a: number, b: number, tol = 0.15) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= tol

type OffRes = { kind: 'ok'; n: Record<string, unknown> } | { kind: 'missing' } | { kind: 'error' }
async function fetchOff(code: string): Promise<OffRes> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=nutriments,product_name`
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429 || res.status >= 500) { await sleep(5000 * (i + 1)); continue } // long backoff — we're patient
      if (!res.ok) return { kind: 'error' }
      const j = await res.json().catch(() => null) as { status?: number; product?: { nutriments?: Record<string, unknown> } } | null
      if (!j) return { kind: 'error' }
      if (j.status === 0 || !j.product?.nutriments) return { kind: 'missing' }
      return { kind: 'ok', n: j.product.nutriments }
    } catch { await sleep(5000 * (i + 1)) }
  }
  return { kind: 'error' }
}
const fdcIdOf = (f: FoodDoc) => (f.externalId || '').match(/(\d{3,})/)?.[1] || null
const offCodeOf = (f: FoodDoc) => ((f.barcode || f.externalId || '').replace(/^off:/i, '').trim() || null)

type Verdict = 'matches-source' | 'fixable' | 'broken-at-source' | 'source-unreachable' | 'no-source'

// ── checkpoint / results state ──
interface State { done: string[]; counts: Record<Verdict, number>; applied: number; fixable: Record<string, unknown>[]; brokenAtSource: Record<string, unknown>[]; startedAt: string }
function loadState(): State {
  try { if (fs.existsSync(CHECKPOINT)) return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')) } catch { /* fresh */ }
  return { done: [], counts: { 'matches-source': 0, fixable: 0, 'broken-at-source': 0, 'source-unreachable': 0, 'no-source': 0 }, applied: 0, fixable: [], brokenAtSource: [], startedAt: new Date().toISOString() }
}
const state = loadState()
const doneSet = new Set(state.done)
function save() {
  state.done = [...doneSet]
  fs.writeFileSync(CHECKPOINT, JSON.stringify(state))
  fs.writeFileSync(RESULTS, JSON.stringify({ counts: state.counts, applied: state.applied, fixable: state.fixable, brokenAtSource: state.brokenAtSource }, null, 2))
}
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { console.log(`\n[${now()}] ${sig} — flushing checkpoint and exiting (re-run to resume).`); stopping = true; save(); setTimeout(() => process.exit(0), 500) })
}

async function main() {
  console.log(`\n== Reconcile SLOW ==  (${isProd ? 'PROD' : 'DEV'}, ${apply ? 'APPLY' : 'DRY-RUN'})`)
  console.log(`   rate: USDA ${USDA_PER_HOUR}/hr (${USDA_DELAY}ms)  ·  OFF ${OFF_PER_MIN}/min (${OFF_DELAY}ms)`)
  console.log(`   checkpoint: ${CHECKPOINT}`)
  if (doneSet.size) console.log(`   RESUMING — ${doneSet.size} already processed.`)
  if ((!sourceFilter || sourceFilter === 'usda') && !process.env.USDA_API_KEY) console.log('   ⚠ USDA_API_KEY unset → DEMO_KEY (very low limit).')
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  const q: Record<string, unknown> = { source: sourceFilter === 'usda' ? 'usda' : sourceFilter === 'off' ? 'openfoodfacts' : { $in: ['usda', 'openfoodfacts'] } }
  const all = await Foods.find(q, { projection: { name: 1, brand: 1, source: 1, externalId: 1, barcode: 1, variants: 1 } }).toArray()
  const todo = all.filter((f) => !doneSet.has(String(f._id)))
  console.log(`   ${all.length} source-backed foods · ${todo.length} remaining\n`)

  let lastUsda = 0, lastOff = 0, sinceSave = 0
  for (const f of todo) {
    if (stopping) break
    const id = String(f._id)
    const label = `${f.name}${f.brand ? ` (${f.brand})` : ''}`
    const vs = f.variants ?? []
    let di = vs.findIndex((v) => v.isDefault); if (di < 0) di = 0
    const cur = vs[di]
    const stored = cur ? per100(cur) : null

    let src: Macro | null = null
    let mapped: ReturnType<typeof mapUSDAFood> | null = null
    let reach: 'ok' | 'missing' | 'error' = 'error'

    if (f.source === 'usda') {
      const fdc = fdcIdOf(f)
      if (!fdc) { state.counts['no-source']++; doneSet.add(id); continue }
      const wait = USDA_DELAY - (Date.now() - lastUsda); if (wait > 0) await sleep(wait)
      lastUsda = Date.now()
      const food = await fetchUSDAById(fdc).catch(() => null)
      if (!food) reach = 'error'
      else { mapped = mapUSDAFood(food); if (!mapped) reach = 'missing'; else { const g = basis(mapped as unknown as Variant); if (g) { const k = 100 / g; const n = mapped.nutrition; src = { cal: num(n.calories) * k, p: num(n.protein) * k, c: num(n.carbs) * k, f: num(n.fats) * k }; reach = 'ok' } else reach = 'missing' } }
    } else {
      const code = offCodeOf(f)
      if (!code) { state.counts['no-source']++; doneSet.add(id); continue }
      const wait = OFF_DELAY - (Date.now() - lastOff); if (wait > 0) await sleep(wait)
      lastOff = Date.now()
      const off = await fetchOff(code)
      if (off.kind === 'error') reach = 'error'
      else if (off.kind === 'missing') reach = 'missing'
      else { const n = off.n; src = { cal: num(n['energy-kcal_100g']), p: num(n['proteins_100g']), c: num(n['carbohydrates_100g']), f: num(n['fat_100g']) }; reach = 'ok' }
    }

    // classify — note: 'source-unreachable' does NOT mark done, so it retries next run.
    let verdict: Verdict
    if (reach === 'error') { verdict = 'source-unreachable' }
    else if (reach === 'missing' || !src || !macrosPositive(src) || !plausible(src)) {
      verdict = 'broken-at-source'
      state.brokenAtSource.push({ id, name: f.name, source: f.source, externalId: f.externalId || f.barcode, reason: reach === 'missing' ? 'not found / no usable data' : (src && !plausible(src)) ? `implausible source (${Math.round(src.cal)} cal/100)` : 'zero macros at source' })
    } else if (stored && macrosPositive(stored) && close(stored.cal, src.cal) && close(stored.p, src.p) && close(stored.c, src.c) && close(stored.f, src.f)) {
      verdict = 'matches-source'
    } else {
      verdict = 'fixable'
      state.fixable.push({ id, name: f.name, source: f.source, stored: stored && { cal: Math.round(stored.cal), p: r1(stored.p), c: r1(stored.c), f: r1(stored.f) }, source_per100: { cal: Math.round(src.cal), p: r1(src.p), c: r1(src.c), f: r1(src.f) } })
      if (apply && cur) {
        if (f.source === 'usda' && mapped) {
          await Foods.updateOne({ _id: f._id }, { $set: {
            [`variants.${di}.nutrition`]: mapped.nutrition,
            [`variants.${di}.servingSize`]: mapped.servingSize,
            [`variants.${di}.servingUnit`]: mapped.servingUnit,
            ...(mapped.displayLabel ? { [`variants.${di}.displayLabel`]: mapped.displayLabel } : {}),
            ...(mapped.gramsPerServing != null ? { [`variants.${di}.gramsPerServing`]: mapped.gramsPerServing } : {}),
            ...(mapped.mlPerServing != null ? { [`variants.${di}.mlPerServing`]: mapped.mlPerServing } : {}),
            ...(mapped.alternateServings ? { [`variants.${di}.alternateServings`]: mapped.alternateServings } : {}),
            needsReview: false,
          } })
        } else {
          const g = basis(cur) || 100, k = g / 100
          await Foods.updateOne({ _id: f._id }, { $set: { [`variants.${di}.nutrition`]: { calories: Math.round(src.cal * k), protein: r1(src.p * k), carbs: r1(src.c * k), fats: r1(src.f * k) }, needsReview: false } })
        }
        state.applied++
      }
    }

    if (verdict !== 'source-unreachable') { state.counts[verdict]++; doneSet.add(id) }
    else state.counts['source-unreachable']++

    if (++sinceSave >= 10) { sinceSave = 0; save() }
    const c = state.counts
    console.log(`[${now()}] ${verdict.padEnd(18)} ${label.slice(0, 48).padEnd(48)}  | done ${doneSet.size}/${all.length} match=${c['matches-source']} fix=${c.fixable} applied=${state.applied} broken=${c['broken-at-source']} unreach=${c['source-unreachable']}`)
  }

  save()
  console.log(`\n[${now()}] ${stopping ? 'STOPPED (resumable)' : 'DONE'} — ${doneSet.size}/${all.length} processed`)
  console.log(`  ${JSON.stringify(state.counts)}  applied=${state.applied}`)
  console.log(`  results: ${RESULTS}`)
  if (!stopping && doneSet.size >= all.length) console.log('  Complete. Delete the checkpoint to run again fresh.')
  await mongoose.disconnect()
}

main().catch((e) => { console.error('ERR', e); save(); process.exit(1) })
