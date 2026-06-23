/**
 * Audit: find Food docs with empty / broken nutrition.
 *
 * Flags any food whose DEFAULT variant (the one used for display + logging) has
 * suspect nutrition: 0 cal, 1 cal, or all macros (protein/carbs/fats) = 0g.
 * These produce nonsense in the app (e.g. "1 cup blueberries · 1 cal · 0g").
 *
 * Read-only by default — prints a report (counts + breakdown + a sample list).
 * Pass --flag to set `needsReview: true` on the broken foods so they surface in
 * the admin Foods review queue (reversible; idempotent).
 *
 * Run from webapp/:
 *   AUDIT (prod):  PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-empty-foods.ts --prod
 *   FLAG  (prod):  PROD_MONGODB_URI="<uri>" npx tsx scripts/audit-empty-foods.ts --prod --flag
 *   DEV:           npx tsx scripts/audit-empty-foods.ts
 *
 * Reads MONGODB_URI (dev) or PROD_MONGODB_URI / MONGODB_URI_PROD (--prod) — from
 * the env or .env.local, same convention as sibling migrations.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const doFlag = process.argv.includes('--flag')

const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error(`Missing ${isProd ? 'PROD_MONGODB_URI' : 'MONGODB_URI'} env var`)
  process.exit(1)
}

interface Nutrition { calories?: number; protein?: number; carbs?: number; fats?: number }
interface Variant { name?: string; isDefault?: boolean; servingSize?: number; servingUnit?: string; nutrition?: Nutrition }
interface FoodDoc {
  _id: mongoose.Types.ObjectId
  name?: string
  brand?: string
  category?: string
  source?: string
  isFirstClass?: boolean
  isVerified?: boolean
  needsReview?: boolean
  variants?: Variant[]
}

const n = (v: number | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0)

/** Reason a variant's nutrition is suspect, or null if it looks fine. */
function brokenReason(v: Variant | undefined): string | null {
  if (!v || !v.nutrition) return 'no-nutrition'
  const c = n(v.nutrition.calories)
  const p = n(v.nutrition.protein), cb = n(v.nutrition.carbs), f = n(v.nutrition.fats)
  if (c === 0 && p === 0 && cb === 0 && f === 0) return '0-everything'
  if (p === 0 && cb === 0 && f === 0) return '0-macros'
  if (c === 0) return '0-cal'
  if (c === 1) return '1-cal'
  return null
}

function defaultVariant(f: FoodDoc): Variant | undefined {
  const vs = f.variants ?? []
  return vs.find(v => v.isDefault) ?? vs[0]
}

async function main() {
  console.log(`\n== Empty/broken food audit ==  (${isProd ? 'PROD' : 'DEV'}${doFlag ? ', FLAGGING' : ', read-only'})\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection<FoodDoc>('foods')

  const total = await Foods.countDocuments({})
  const cursor = Foods.find({}, { projection: { name: 1, brand: 1, category: 1, source: 1, isFirstClass: 1, isVerified: 1, needsReview: 1, variants: 1 } })

  let generic = 0, branded = 0
  const broken: Array<{ id: string; name: string; brand: string; source: string; cat: string; reason: string; cal: number; p: number; c: number; f: number; serving: string; generic: boolean }> = []
  const reasonCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}

  for await (const f of cursor) {
    const isGeneric = !f.brand || !String(f.brand).trim()
    if (isGeneric) generic++; else branded++
    const dv = defaultVariant(f)
    const reason = brokenReason(dv)
    if (reason) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1
      const src = f.source || 'manual'
      sourceCounts[`${src}${isGeneric ? '/generic' : '/branded'}`] = (sourceCounts[`${src}${isGeneric ? '/generic' : '/branded'}`] ?? 0) + 1
      broken.push({
        id: String(f._id),
        name: f.name || '(unnamed)',
        brand: f.brand || '',
        source: src,
        cat: f.category || '',
        reason,
        cal: n(dv?.nutrition?.calories), p: n(dv?.nutrition?.protein), c: n(dv?.nutrition?.carbs), f: n(dv?.nutrition?.fats),
        serving: `${dv?.servingSize ?? '?'} ${dv?.servingUnit ?? ''}`.trim(),
        generic: isGeneric,
      })
    }
  }

  console.log(`Total foods:      ${total}`)
  console.log(`  generic (no brand): ${generic}`)
  console.log(`  branded:            ${branded}`)
  console.log(`\nBroken (default variant): ${broken.length}  (${broken.filter(b => b.generic).length} generic, ${broken.filter(b => !b.generic).length} branded)`)
  console.log('\nBy reason:')
  for (const [r, c] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(14)} ${c}`)
  console.log('\nBy source:')
  for (const [s, c] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${s.padEnd(22)} ${c}`)

  // Sample — generic first (most user-visible), then branded.
  const sample = [...broken].sort((a, b) => Number(b.generic) - Number(a.generic) || a.name.localeCompare(b.name)).slice(0, 80)
  console.log(`\nSample (${sample.length} of ${broken.length}):`)
  for (const b of sample) {
    console.log(`  [${b.reason.padEnd(12)}] ${b.name}${b.brand ? ` (${b.brand})` : ''} · ${b.source} · ${b.cat} · ${b.serving} · ${b.cal}cal P${b.p} C${b.c} F${b.f} · ${b.id}`)
  }

  if (doFlag && broken.length) {
    const ids = broken.map(b => new mongoose.Types.ObjectId(b.id))
    const res = await Foods.updateMany({ _id: { $in: ids } }, { $set: { needsReview: true } })
    console.log(`\nFlagged needsReview=true on ${res.modifiedCount} foods (matched ${res.matchedCount}).`)
  } else if (broken.length) {
    console.log('\n(read-only — re-run with --flag to set needsReview=true on these)')
  }

  await mongoose.disconnect()
  console.log('\nDone.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
