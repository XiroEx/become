/**
 * Categorize EVERY broken food in the catalog (read-only classifier).
 *
 * Walks every Food's default variant and tags it with zero or more defect
 * categories, then prints a summary and writes a full JSON + CSV report so the
 * fixable set can be fed to `reconcile-foods-with-source.ts`.
 *
 * Categories (a food can be in several):
 *   degenerate-serving  gram/ml-served with NO friendly household serving →
 *                       the picker shows a bare "1 g". (the 685 we counted)
 *   energy-mismatch     calories disagree with 4·P+4·C+9·F by >30% → macros or
 *                       calories are wrong.
 *   implausible-density per-100 g calories physically impossible (>902).
 *   produce-suspicious  fruit/vegetable category reading >220 cal/100 g (e.g.
 *                       the Blueberries at 317) → likely wrong macros.
 *   zero-macros         claims calories but P+C+F == 0 (excl. legit near-zero).
 *   missing-calories    has macros but calories <= 0.
 *   garbled-name        non-food gibberish name (ALL-CAPS no vowels / junk).
 *   duplicate-external  shares source+externalId with another food.
 *   no-serving-basis    can't resolve a gram/ml basis at all (unit math breaks).
 *
 * Run from webapp/:
 *   DEV:   npx tsx scripts/audit-foods-categorize.ts
 *   PROD:  PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-foods-categorize.ts --prod
 * Read-only. Reads MONGODB_URI (dev) or PROD_MONGODB_URI (--prod).
 */

import mongoose from 'mongoose'
import path from 'path'
import fs from 'fs'
import * as dotenv from 'dotenv'
import { convert } from '@/lib/units'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'}`); process.exit(1) }

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)

interface Nutrition { calories?: number; protein?: number; carbs?: number; fats?: number }
interface Variant {
  isDefault?: boolean; servingSize?: number; servingUnit?: string
  displayLabel?: string; gramsPerServing?: number; mlPerServing?: number
  nutrition?: Nutrition; alternateServings?: { label?: string; multiplier?: number }[]
}
interface FoodDoc {
  _id: mongoose.Types.ObjectId; name?: string; brand?: string; category?: string
  source?: string; externalId?: string; barcode?: string; variants?: Variant[]
}

const MASS = new Set(['g', 'oz', 'lb', 'kg', 'mg'])
const VOL = new Set(['ml', 'fl_oz', 'cup', 'tbsp', 'tsp', 'pint', 'quart', 'liter'])

function defaultVariant(f: FoodDoc): Variant | undefined {
  const vs = f.variants ?? []
  return vs.find((v) => v.isDefault) ?? vs[0]
}

/** The amount (g or ml) the nutrition is actually PER. Nutrition is stored per
 *  `servingSize × servingUnit`, so for a mass/volume native food that's the
 *  converted servingSize — NOT gramsPerServing (a household-serving bridge that
 *  can disagree). Discrete native units fall back to the gram/ml bridge. */
function basis(v: Variant): number | null {
  const u = (v.servingUnit || '').toLowerCase()
  if (MASS.has(u) && v.servingSize && v.servingSize > 0) { try { return convert(v.servingSize, u as never, 'g') } catch { return null } }
  if (VOL.has(u) && v.servingSize && v.servingSize > 0) { try { return convert(v.servingSize, u as never, 'ml') } catch { return null } }
  if (v.gramsPerServing && v.gramsPerServing > 0) return v.gramsPerServing
  if (v.mlPerServing && v.mlPerServing > 0) return v.mlPerServing
  return null
}

/** Per-100 calories/macros, or null when no basis is resolvable. */
function per100(v: Variant): { cal: number; p: number; c: number; f: number } | null {
  const n = v.nutrition
  if (!n) return null
  const g = basis(v)
  if (!g) return null
  const k = 100 / g
  return { cal: num(n.calories) * k, p: num(n.protein) * k, c: num(n.carbs) * k, f: num(n.fats) * k }
}

// A bare gram/ml label like "80.0g", "100 g", "40 g" — no household words.
const GRAM_ONLY_LABEL = /^\s*\d+(\.\d+)?\s*(g|grams?|ml|millilitres?|milliliters?)\s*$/i
const HOUSEHOLD_WORDS = /(cup|tbsp|tablespoon|tsp|teaspoon|slice|piece|bar|can|bottle|container|bag|scoop|egg|breast|medium|small|large|oz|ounce|fl|serving|stick|packet|pack|bowl|plate|handful|fruit|whole|filet|fillet|patty|link|wing|thigh|drumstick|cookie|cracker|chip|portion|roll|muffin|bagel|kiwi|banana|apple|pint|quart)/i

function hasHouseholdServing(v: Variant): boolean {
  const dl = (v.displayLabel || '').trim()
  if (dl && HOUSEHOLD_WORDS.test(dl) && !GRAM_ONLY_LABEL.test(dl)) return true
  for (const a of v.alternateServings ?? []) {
    const l = (a.label || '').trim()
    if (l && HOUSEHOLD_WORDS.test(l) && !GRAM_ONLY_LABEL.test(l) && !/^100\s*(g|ml)/i.test(l)) return true
  }
  return false
}

const PRODUCE = /(fruit|vegetable|produce|berry|berries|greens|salad|melon)/i
function isProduce(f: FoodDoc): boolean {
  return PRODUCE.test(f.category || '') || PRODUCE.test(f.name || '')
}

function isGarbledName(name: string): boolean {
  const n = (name || '').trim()
  if (n.length < 2) return true
  const letters = n.replace(/[^a-zA-Z]/g, '')
  if (letters.length === 0) return true
  const nonAlpha = n.replace(/[a-zA-Z0-9\s.,'&()/+%-]/g, '').length
  if (nonAlpha / n.length > 0.3) return true
  // ALL-CAPS chunk with no vowels and length>4 (e.g. "WARTS PEPSI FEROPICAL Tpal")
  const vowels = (letters.match(/[aeiouAEIOU]/g) || []).length
  if (letters.length > 5 && vowels / letters.length < 0.15) return true
  return false
}

async function main() {
  console.log(`\n== Categorize broken foods ==  (${isProd ? 'PROD' : 'DEV'}, READ-ONLY)\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')
  const all = await Foods.find({}, { projection: { name: 1, brand: 1, category: 1, source: 1, externalId: 1, barcode: 1, variants: 1 } }).toArray()
  console.log(`Scanning ${all.length} foods…\n`)

  // duplicate source+externalId map
  const extKey = (f: FoodDoc) => (f.source && f.externalId ? `${f.source}:${f.externalId}` : '')
  const extCounts = new Map<string, number>()
  for (const f of all) { const k = extKey(f); if (k) extCounts.set(k, (extCounts.get(k) || 0) + 1) }

  const flagged: Array<{ id: string; name: string; source: string; externalId: string; cats: string[]; per100cal: number | null; note: string }> = []
  const catCounts: Record<string, number> = {}
  const bump = (c: string) => { catCounts[c] = (catCounts[c] || 0) + 1 }

  for (const f of all) {
    const v = defaultVariant(f)
    const cats: string[] = []
    let note = ''
    const p1 = v ? per100(v) : null

    if (!v) {
      cats.push('no-serving-basis'); note = 'no variants'
    } else {
      const u = (v.servingUnit || '').toLowerCase()
      const n = v.nutrition || {}
      const pcf = num(n.protein) + num(n.carbs) + num(n.fats)

      if ((MASS.has(u) || VOL.has(u)) && !hasHouseholdServing(v)) cats.push('degenerate-serving')
      if (!per100(v)) cats.push('no-serving-basis')

      // energy vs Atwater (same basis). Skip alcohol — ethanol's 7 cal/g isn't
      // in the 4/4/9 model, so booze legitimately reads "mismatched".
      const isAlcohol = /(alcohol|wine|beer|liquor|vodka|rum|whisk|tequila|gin|brandy|cognac|cocktail|cider|spirit|ale|lager|champagne|prosecco)/i.test(`${f.name} ${f.category}`)
      const atwater = 4 * num(n.protein) + 4 * num(n.carbs) + 9 * num(n.fats)
      const cal = num(n.calories)
      if (!isAlcohol && cal > 20 && atwater > 0 && Math.abs(cal - atwater) / Math.max(cal, atwater) > 0.30) {
        cats.push('energy-mismatch'); note = `cal ${Math.round(cal)} vs atwater ${Math.round(atwater)}`
      }
      if (p1 && p1.cal > 902) { cats.push('implausible-density'); note = `${Math.round(p1.cal)} cal/100g` }
      else if (p1 && isProduce(f) && p1.cal > 220) { cats.push('produce-suspicious'); note = `${Math.round(p1.cal)} cal/100g (produce)` }

      if (pcf === 0 && cal > 5) cats.push('zero-macros')
      if (cal <= 0 && pcf > 0) cats.push('missing-calories')
    }

    if (isGarbledName(f.name || '')) cats.push('garbled-name')
    const k = extKey(f)
    if (k && (extCounts.get(k) || 0) > 1) cats.push('duplicate-external')

    if (cats.length > 0) {
      for (const c of cats) bump(c)
      flagged.push({ id: String(f._id), name: f.name || '?', source: f.source || '?', externalId: f.externalId || f.barcode || '', cats, per100cal: p1 ? Math.round(p1.cal) : null, note })
    }
  }

  // ── summary ──
  console.log(`Flagged ${flagged.length} / ${all.length} foods (${Math.round((flagged.length / all.length) * 100)}%)\n`)
  console.log('By category:')
  for (const [c, n] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(20)} ${n}`)
  }
  console.log('\nSamples per category:')
  for (const c of Object.keys(catCounts).sort()) {
    const ex = flagged.filter((f) => f.cats.includes(c)).slice(0, 4)
    console.log(`  [${c}]`)
    for (const e of ex) console.log(`     ${e.name}${e.note ? ` — ${e.note}` : ''}  (${e.source}${e.externalId ? ` ${e.externalId}` : ''})`)
  }

  // ── reports ──
  const dir = path.join(__dirname, 'reports')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const jsonPath = path.join(dir, `food-audit-${stamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({ total: all.length, flagged: flagged.length, catCounts, foods: flagged }, null, 2))
  const csvPath = path.join(dir, `food-audit-${stamp}.csv`)
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  const csv = ['id,name,source,externalId,per100cal,categories,note',
    ...flagged.map((f) => [f.id, esc(f.name), f.source, f.externalId, f.per100cal ?? '', esc(f.cats.join('|')), esc(f.note)].join(','))].join('\n')
  fs.writeFileSync(csvPath, csv)
  console.log(`\nReports written:\n  ${jsonPath}\n  ${csvPath}`)

  await mongoose.disconnect()
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
