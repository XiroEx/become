/**
 * Audit: find Food docs with empty / broken nutrition.
 *
 * A food's DEFAULT variant (the one used for display + logging) is "broken" when
 * it has real calories but 0 macros, or 0 everything — UNLESS it's a legitimately
 * near-zero food (water / tea / coffee / seltzer / vinegar / spirits / diet drink),
 * which genuinely has ~0 macros. Those are classified "legit near-zero" and are
 * NOT flagged.
 *
 * Read-only by default. Modes:
 *   --flag         set needsReview=true on the TRULY-broken foods (skips legit)
 *   --clear-legit  clear needsReview on flagged foods that are legit near-zero
 *
 * Run from webapp/:
 *   AUDIT:        PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-empty-foods.ts --prod
 *   CLEAR LEGIT:  PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-empty-foods.ts --prod --clear-legit
 *   FLAG BROKEN:  PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-empty-foods.ts --prod --flag
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod).
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const doFlag = process.argv.includes('--flag')
const doClearLegit = process.argv.includes('--clear-legit')

const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`); process.exit(1) }

interface Nutrition { calories?: number; protein?: number; carbs?: number; fats?: number }
interface Variant { name?: string; isDefault?: boolean; servingSize?: number; servingUnit?: string; nutrition?: Nutrition }
interface FoodDoc {
  _id: mongoose.Types.ObjectId
  name?: string; brand?: string; category?: string; source?: string
  isFirstClass?: boolean; isVerified?: boolean; needsReview?: boolean
  variants?: Variant[]
}

const n = (v: number | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0)
const defaultVariant = (f: FoodDoc): Variant | undefined => (f.variants ?? []).find(v => v.isDefault) ?? (f.variants ?? [])[0]

// Foods that legitimately have ~0 macros regardless of calories: beverages,
// spirits, vinegars, diet/zero drinks. Detected by name/brand keywords, the
// Beverage category, or an explicit allowlist for branded items the keywords
// miss (verified by hand 2026-06-23).
const LEGIT_RE = /\b(water|sparkling|seltzer|tonic|soda|cola|tea|coffee|espresso|latte|cappuccino|kombucha|vinegar|rum|vodka|gin|whisk(?:e)?y|tequila|liquor|liqueur|brandy|bourbon|cognac|scotch|wine|beer|ale|cider|spirit|hydration|electrolyte|energy drink|bcaa|hoplark|tulsi)\b/i
const LEGIT_IDS = new Set<string>([
  '6a2513a9a75ea6fbd168de67', // Captain Morgan (spirit)
  '6a26e1f8f4cd4f7c997df1e5', // Reign Total Body Fuel (0-cal energy drink)
  '6a251178a75ea6fbd168de65', // Poland Spring (water)
])
function isLegitNearZero(f: FoodDoc): boolean {
  if (LEGIT_IDS.has(String(f._id))) return true
  if (f.category === 'Beverage') return true
  return LEGIT_RE.test(`${f.name ?? ''} ${f.brand ?? ''}`)
}

/** Reason the default variant is suspect, or null if it looks fine. */
function brokenReason(v: Variant | undefined): string | null {
  if (!v || !v.nutrition) return 'no-nutrition'
  const c = n(v.nutrition.calories), p = n(v.nutrition.protein), cb = n(v.nutrition.carbs), f = n(v.nutrition.fats)
  if (c === 0 && p === 0 && cb === 0 && f === 0) return '0-everything'
  if (p === 0 && cb === 0 && f === 0) return '0-macros'
  if (c === 1) return '1-cal'
  if (c === 0) return '0-cal'
  return null
}

async function main() {
  console.log(`\n== Empty/broken food audit ==  (${isProd ? 'PROD' : 'DEV'}${doFlag ? ', FLAG broken' : doClearLegit ? ', CLEAR-LEGIT' : ', read-only'})\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  const total = await Foods.countDocuments({})
  const cursor = Foods.find({}, { projection: { name: 1, brand: 1, category: 1, source: 1, isFirstClass: 1, isVerified: 1, needsReview: 1, variants: 1 } })

  const broken: FoodDoc[] = []   // truly broken (needs fixing)
  const legit: FoodDoc[] = []    // flagged-but-legit near-zero (false positives)
  const reasonCounts: Record<string, number> = {}

  for await (const f of cursor) {
    const reason = brokenReason(defaultVariant(f))
    if (!reason) continue
    if (isLegitNearZero(f)) { legit.push(f); continue }
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1
    broken.push(f)
  }

  console.log(`Total foods: ${total}`)
  console.log(`Truly broken (real food, 0 macros): ${broken.length}`)
  console.log(`Legit near-zero (beverage/spirit/vinegar — not broken): ${legit.length}`)
  console.log('\nBroken by reason:')
  for (const [r, c] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(14)} ${c}`)

  const sample = [...broken].slice(0, 80)
  console.log(`\nTruly-broken sample (${sample.length} of ${broken.length}):`)
  for (const b of sample) {
    const dv = defaultVariant(b)
    console.log(`  ${b.name}${b.brand ? ` (${b.brand})` : ''} · ${b.source} · ${b.category} · ${dv?.servingSize ?? '?'} ${dv?.servingUnit ?? ''} · ${n(dv?.nutrition?.calories)}cal P${n(dv?.nutrition?.protein)} C${n(dv?.nutrition?.carbs)} F${n(dv?.nutrition?.fats)} · ${b._id}`)
  }

  if (doFlag && broken.length) {
    const res = await Foods.updateMany({ _id: { $in: broken.map(b => b._id) } }, { $set: { needsReview: true } })
    console.log(`\nFlagged needsReview=true on ${res.modifiedCount} truly-broken foods.`)
  }
  if (doClearLegit) {
    // Clear needsReview on flagged-but-legit foods (de-noise the review queue).
    const flaggedLegit = legit.filter(f => f.needsReview)
    if (flaggedLegit.length) {
      const res = await Foods.updateMany({ _id: { $in: flaggedLegit.map(f => f._id) } }, { $set: { needsReview: false } })
      console.log(`\nCleared needsReview on ${res.modifiedCount} legit near-zero foods:`)
      for (const f of flaggedLegit) console.log(`  - ${f.name}${f.brand ? ` (${f.brand})` : ''}`)
    } else {
      console.log('\nNo flagged legit-near-zero foods to clear.')
    }
  }

  await mongoose.disconnect()
  console.log('\nDone.\n')
}

main().catch((err) => { console.error(err); process.exit(1) })
