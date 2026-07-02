/**
 * dedupe-variants — Phase 2 (safe half) back-fill for FOOD_DATA_BUILD_AUDIT.md.
 *
 * On multi-variant foods:
 *   1. Remove EXACT-duplicate variants (same normalized displayLabel + same
 *      rounded calories + same servingSize/unit) — keeps the first occurrence.
 *   2. Guarantee exactly one isDefault survives (promote variant[0] if the
 *      default was a removed dup or none was flagged).
 *
 * It does NOT re-pick which variant is default on divergent foods, and it does
 * NOT un-merge — those need judgment. Instead it REPORTS "grossly divergent"
 * merged foods (calorie spread implying unrelated products glommed together,
 * e.g. brewed tea + tea powder) so they can be split in a reviewed Phase 2b.
 *
 *   npx tsx scripts/dedupe-variants.ts            # dry run
 *   npx tsx scripts/dedupe-variants.ts --apply    # write
 *
 * Uses PROD_MONGODB_URI (falls back to MONGODB_URI) from .env.local.
 */
import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import mongoose from 'mongoose'

dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI
if (!URI) { console.error('No PROD_MONGODB_URI/MONGODB_URI'); process.exit(1) }

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const cal = (v: any) => Math.round((v?.nutrition?.calories ?? 0))

/** Same test as lib/foodVariantMerge.caloriesGrosslyDivergent, kept local. */
function grosslyDivergent(a: number, b: number): boolean {
  const hi = Math.max(a, b), lo = Math.min(a, b)
  if (hi - lo < 40) return false
  if (lo <= 1) return hi >= 40
  return hi / lo > 2.5
}

async function main() {
  await mongoose.connect(URI!)
  const col = mongoose.connection.db!.collection('foods')
  console.log(`DB: ${mongoose.connection.db!.databaseName}  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const multi = await col.find({ 'variants.1': { $exists: true } }).toArray()
  console.log(`multi-variant foods: ${multi.length}`)

  let dupDocs = 0, dupVariantsRemoved = 0, defaultFixed = 0, docsTouched = 0
  const divergent: Array<{ name: string; n: number; spread: string }> = []
  const backup: any[] = []

  for (const f of multi as any[]) {
    const variants: any[] = Array.isArray(f.variants) ? f.variants : []

    // 1. dedupe exact duplicates
    const seen = new Set<string>()
    const kept: any[] = []
    let removed = 0
    for (const v of variants) {
      const key = `${norm(v.displayLabel)}|${cal(v)}|${v.servingSize}|${norm(v.servingUnit)}`
      if (seen.has(key)) { removed++; continue }
      seen.add(key)
      kept.push(v)
    }

    // 2. exactly one default
    let defaultChanged = false
    const defaults = kept.filter(v => v.isDefault)
    if (defaults.length !== 1) {
      kept.forEach((v, i) => { v.isDefault = i === 0 })
      defaultChanged = true
    }

    // report divergence (informational, not fixed here)
    const cals = kept.map(cal).filter(c => c > 0)
    if (cals.length > 1 && grosslyDivergent(Math.min(...cals), Math.max(...cals))) {
      divergent.push({ name: f.name, n: kept.length, spread: `${Math.min(...cals)}–${Math.max(...cals)} cal` })
    }

    if (removed > 0 || defaultChanged) {
      docsTouched++
      if (removed > 0) { dupDocs++; dupVariantsRemoved += removed }
      if (defaultChanged) defaultFixed++
      if (APPLY) {
        backup.push({ _id: String(f._id), name: f.name, variants: f.variants })
        await col.updateOne({ _id: f._id }, { $set: { variants: kept } })
      }
    }
  }

  if (APPLY && backup.length) {
    fs.writeFileSync('scripts/.backup-dedupe-variants.json', JSON.stringify(backup, null, 0))
    console.log(`Backup of ${backup.length} docs → scripts/.backup-dedupe-variants.json`)
  }

  console.log(`\nExact-duplicate variants: removed ${dupVariantsRemoved} across ${dupDocs} foods`)
  console.log(`Default-flag repaired on: ${defaultFixed} foods`)
  console.log(`Docs to update: ${docsTouched}`)
  console.log(`\nGrossly-divergent merged foods (need Phase 2b split, NOT auto-fixed): ${divergent.length}`)
  divergent.slice(0, 30).forEach(d => console.log(`  - ${JSON.stringify(d.name)} (${d.n} variants, ${d.spread})`))
  if (!APPLY) console.log('\nDRY-RUN — no writes. Re-run with --apply.')
  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
