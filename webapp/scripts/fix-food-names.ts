/**
 * fix-food-names — Phase 1 back-fill for FOOD_DATA_BUILD_AUDIT.md.
 *
 * Applies cleanFoodName() to every food's `name` and sanitizeServingLabel() to
 * every variant `displayLabel`, in the PROD catalog. Dry-run by default; pass
 * --apply to write. Prints a change sample + totals.
 *
 *   npx tsx scripts/fix-food-names.ts            # dry run (no writes)
 *   npx tsx scripts/fix-food-names.ts --apply    # write changes
 *
 * Connects to PROD_MONGODB_URI (falls back to MONGODB_URI). Reads creds from
 * webapp/.env.local — no params needed.
 */
import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import mongoose from 'mongoose'
import { cleanFoodName, sanitizeServingLabel } from '../lib/foodNameClean'

dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')
const URI = process.env.PROD_MONGODB_URI || process.env.MONGODB_URI
if (!URI) { console.error('No PROD_MONGODB_URI/MONGODB_URI'); process.exit(1) }

async function main() {
  await mongoose.connect(URI!)
  const col = mongoose.connection.db!.collection('foods')
  console.log(`DB: ${mongoose.connection.db!.databaseName}  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const cursor = col.find({}, { projection: { name: 1, variants: 1 } })
  let scanned = 0, nameChanges = 0, labelChanges = 0, docsTouched = 0, labelsDropped = 0
  const samples: string[] = []
  const backup: Array<{ _id: string; name: string; variants?: unknown[] }> = []

  while (await cursor.hasNext()) {
    const f = await cursor.next() as any
    scanned++
    const set: Record<string, unknown> = {}

    const newName = cleanFoodName(f.name)
    if (newName && newName !== f.name) {
      set.name = newName
      nameChanges++
      if (samples.length < 40) samples.push(`  name: ${JSON.stringify(f.name)} → ${JSON.stringify(newName)}`)
    }

    if (Array.isArray(f.variants)) {
      const variants = f.variants.map((v: any) => v)
      let changed = false
      variants.forEach((v: any, i: number) => {
        if (v?.displayLabel == null) return
        const cleaned = sanitizeServingLabel(v.displayLabel)
        if (cleaned !== v.displayLabel) {
          changed = true
          labelChanges++
          if (cleaned == null) labelsDropped++
          if (samples.length < 40) samples.push(`  label[${i}] on ${JSON.stringify(f.name)}: ${JSON.stringify(v.displayLabel)} → ${JSON.stringify(cleaned)}`)
          if (cleaned == null) delete variants[i].displayLabel
          else variants[i].displayLabel = cleaned
        }
      })
      if (changed) set.variants = variants
    }

    if (Object.keys(set).length > 0) {
      docsTouched++
      if (APPLY) {
        backup.push({ _id: String(f._id), name: f.name, variants: f.variants })
        await col.updateOne({ _id: f._id }, { $set: set })
      }
    }
  }

  if (APPLY && backup.length) {
    const path = `scripts/.backup-food-names.json`
    fs.writeFileSync(path, JSON.stringify(backup, null, 0))
    console.log(`Backup of ${backup.length} original docs → ${path}`)
  }

  console.log('\nSample changes:')
  console.log(samples.join('\n'))
  console.log(`\nScanned ${scanned} foods`)
  console.log(`  name changes:   ${nameChanges}`)
  console.log(`  label changes:  ${labelChanges} (dropped ${labelsDropped} garbled)`)
  console.log(`  docs to update: ${docsTouched}`)
  if (!APPLY) console.log('\nDRY-RUN — no writes. Re-run with --apply to persist.')
  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
