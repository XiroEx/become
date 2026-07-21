import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { buildServingChoiceGroups } from '@/lib/nutrition/servingOptions'
import { nutritionForQuantity } from '@/lib/foodMath'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')

// Make each first-class food's DEFAULT serving compute to exactly its stored
// per-serving calories. The picker's default choice = parse(displayLabel); if
// servingSize doesn't match that parsed quantity (e.g. "1/2 cup" or "12 fl oz"
// with servingSize 1), the default shows a wrong fraction/multiple. Since
// scalingFactor ∝ 1/servingSize, set servingSize *= (computed / stored) so the
// default resolves to 1× exactly. Pass --apply to write.

const APPLY = process.argv.includes('--apply')

async function main() {
  const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db
  const foods = await db.collection('foods').find({ isFirstClass: true }).toArray()
  let fixed = 0, ok = 0
  for (const d of foods) {
    const v: any = (d.variants || [])[0]
    if (!v || !(v.nutrition?.calories >= 0)) continue
    let g: any
    try { g = buildServingChoiceGroups(v) } catch { continue }
    const def = g.servings[0]
    if (!def) continue
    const stored = v.nutrition.calories
    const computed = nutritionForQuantity(v as any, def.quantity, def.unit).calories
    if (stored <= 0) { ok++; continue }
    const factor = computed / stored
    if (Math.abs(computed - stored) <= 1) { ok++; continue }
    if (!(factor > 0) || !Number.isFinite(factor)) { console.log('SKIP', d.name, 'bad factor', factor); continue }
    const newSize = Math.round((v.servingSize * factor) * 100000) / 100000
    // verify
    const test = { ...v, servingSize: newSize }
    const check = nutritionForQuantity(test as any, def.quantity, def.unit).calories
    const status = Math.abs(check - stored) <= 1 ? 'OK' : `STILL-OFF(${Math.round(check)})`
    console.log(`${d.name} [${v.servingUnit}] "${def.label}"×${def.quantity}${def.unit}: size ${v.servingSize} → ${newSize} | ${Math.round(computed)}→${Math.round(check)} (want ${stored}) ${status}`)
    if (APPLY && status === 'OK') {
      await db.collection('foods').updateOne({ _id: d._id }, { $set: { 'variants.0.servingSize': newSize, updatedAt: new Date() } })
      fixed++
    }
  }
  console.log(`\n${ok} already OK | ${fixed} ${APPLY ? 'fixed' : 'to fix (dry-run)'}`)
  await mongoose.disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
