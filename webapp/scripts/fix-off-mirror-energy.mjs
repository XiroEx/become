import { createRequire } from 'module'; import { readFileSync } from 'fs'
const require = createRequire(import.meta.url); const mongoose = require('mongoose')

// The raw `openfoodfacts` mirror (supplemental search source, read by
// mapOffToFoodResult) stores energy_kcal_100g — and ~188 docs carry a
// physically-impossible value (e.g. Hotdog bun = 18000). Those surface in
// supplemental search AND get re-imported into `foods` when logged, which is why
// the 18000 hotdog bun kept reappearing after we deleted it. The mirror has no
// kJ field to recover from, but it does have protein/carb/fat — so we recompute
// energy via Atwater (4P + 4C + 9F). If macros can't produce a plausible value,
// the doc is unusable garbage → delete it. Read-only unless --apply.

const APPLY = process.argv.includes('--apply')
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : 0))

await mongoose.connect(readFileSync('/tmp/prod_uri.txt', 'utf8').trim(), { serverSelectionTimeoutMS: 20000 })
const db = mongoose.connection.db
const off = db.collection('openfoodfacts')
const rows = await off.find({ 'nutriments.energy_kcal_100g': { $gt: 950 } }).toArray()
console.log(`impossible mirror docs (energy_kcal_100g > 950): ${rows.length}\n`)

let recomputed = 0, deleted = 0
const setOps = [], delIds = []
for (const d of rows) {
  const n = d.nutriments || {}
  const p = num(n.proteins_100g), c = num(n.carbohydrates_100g), f = num(n.fat_100g)
  const atw = 4 * p + 4 * c + 9 * f
  if (atw > 0 && atw <= 950 && p <= 100 && c <= 100 && f <= 100) {
    if (recomputed < 15) console.log(`  ${Math.round(n.energy_kcal_100g)} → ${Math.round(atw)} kcal  "${d.product_name}" (P${p} C${c} F${f})`)
    recomputed++
    setOps.push({ updateOne: { filter: { _id: d._id }, update: { $set: { 'nutriments.energy_kcal_100g': Math.round(atw) } } } })
  } else {
    if (deleted < 10) console.log(`  DELETE (no usable macros) ${Math.round(n.energy_kcal_100g)} "${d.product_name}"`)
    deleted++
    delIds.push(d._id)
  }
}
console.log(`\nrecompute via Atwater: ${recomputed} | delete (unusable): ${deleted}`)
if (APPLY) {
  if (setOps.length) { const r = await off.bulkWrite(setOps); console.log(`recomputed applied: ${r.modifiedCount}`) }
  if (delIds.length) { const r = await off.deleteMany({ _id: { $in: delIds } }); console.log(`deleted: ${r.deletedCount}`) }
} else console.log('(dry-run — re-run with --apply)')
await mongoose.disconnect()
