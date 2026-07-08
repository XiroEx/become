import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { buildServingChoiceGroups } from '@/lib/nutrition/servingOptions'
import { nutritionForQuantity } from '@/lib/foodMath'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')

// Drive the REAL picker serving logic over every first-class food: the default
// choice must be the food's own named serving (right unit + quantity), its
// calories must equal the stored per-serving calories, and switching to grams
// must recompute consistently. Read-only.

async function main(){
const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db
const foods = await db.collection('foods').find({ isFirstClass: true }).toArray()

let pass = 0
const fails: string[] = []
for (const d of foods) {
  const v: any = (d.variants || [])[0]
  if (!v) { fails.push(`${d.name}: no variant`); continue }
  let g: any
  try { g = buildServingChoiceGroups(v) } catch (e: any) { fails.push(`${d.name}: buildServingChoiceGroups threw ${e.message}`); continue }
  const def = g.servings[0]
  if (!def) { fails.push(`${d.name}: NO default serving`); continue }

  const problems: string[] = []
  // 1) default must NOT be an abstract 'serving' unit and NOT a bare "100 g"
  if (def.unit === 'serving') problems.push(`default unit is 'serving' (should be real metric)`)
  if (/^\s*100\s*(g|ml)\b/i.test(def.label)) problems.push(`default is "100 g" arbitrary`)
  // 2) default should be the food's own primary label (the real serving), not an alternate
  const prim = (v.displayLabel || '').trim()
  if (prim && def.label.trim() !== prim) problems.push(`default "${def.label}" != primary "${prim}"`)
  // 3) calories at the default choice must equal the stored per-serving calories
  const calAtDefault = nutritionForQuantity(v as any, def.quantity, def.unit).calories
  if (Math.abs(calAtDefault - (v.nutrition?.calories || 0)) > 1)
    problems.push(`default cal ${Math.round(calAtDefault)} != stored ${v.nutrition?.calories}`)
  // 4) a weight/volume unit choice must exist so users can switch metric
  const canSwitch = (g.weight?.length || 0) + (g.volume?.length || 0) > 0
  if (!canSwitch) problems.push(`no weight/volume unit to switch to`)
  // 5) switching to grams must recompute ~ per-100 * grams
  const gramChoice = (g.weight || []).find((c: any) => c.unit === 'g')
  if (gramChoice && v.gramsPerServing > 0) {
    const per100 = (v.nutrition.calories) / (v.gramsPerServing / 100)
    const cal100g = nutritionForQuantity(v as any, 100, 'g').calories
    if (Math.abs(cal100g - per100) > Math.max(3, per100 * 0.05))
      problems.push(`100 g recompute ${Math.round(cal100g)} != expected ${Math.round(per100)}`)
  }

  if (problems.length) fails.push(`${d.name} [${v.servingUnit}] "${def.label}"×${def.quantity}${def.unit}: ${problems.join('; ')}`)
  else pass++
}

console.log(`audited ${foods.length} first-class foods → ${pass} PASS, ${fails.length} FAIL`)
for (const f of fails.slice(0, 60)) console.log(' ✗', f)
await mongoose.disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
