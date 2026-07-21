import { createRequire } from 'module'
import { readFileSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')

// Audit every FIRST-CLASS food's macros + serving metrics for accuracy.
// Flags: missing/zero nutrition, Atwater mismatch (calories vs 4P+4C+9F),
// implausible per-100g energy, bad/oversized multipliers, missing bridge,
// arbitrary "100 g" servings. Read-only.

const uri = readFileSync('/tmp/prod_uri.txt', 'utf8').trim()
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
const db = mongoose.connection.db
const foods = await db.collection('foods').find({ isFirstClass: true }).toArray()
console.log('auditing first-class foods:', foods.length)

const issues = []
for (const d of foods) {
  const v = (d.variants || [])[0]
  if (!v) { issues.push([d.name, 'NO variant']); continue }
  const n = v.nutrition || {}
  const cal = Number(n.calories), p = Number(n.protein) || 0, c = Number(n.carbs) || 0, f = Number(n.fats) || 0
  const grams = Number(v.gramsPerServing) || Number(v.mlPerServing) || 0

  if (!(cal >= 0) || Number.isNaN(cal)) issues.push([d.name, `bad calories: ${n.calories}`])
  if ([p, c, f].some(x => x < 0 || Number.isNaN(x))) issues.push([d.name, `bad macro P${p}/C${c}/F${f}`])

  // Atwater consistency (allow fiber not counted + alcohol + rounding): tolerance 30% + 20
  const atw = 4 * p + 4 * c + 9 * f
  if (cal > 5 && Math.abs(atw - cal) > 0.30 * cal + 20)
    issues.push([d.name, `Atwater: ${cal}cal vs ${Math.round(atw)} (P${p}/C${c}/F${f}) in "${v.displayLabel}"`])

  // Plausible per-100 energy (10–900 kcal/100g covers everything from lettuce to oil)
  if (grams > 0 && cal > 0) {
    const per100 = cal / (grams / 100)
    if (per100 < 3 || per100 > 950) issues.push([d.name, `implausible ${Math.round(per100)} kcal/100${v.mlPerServing ? 'ml' : 'g'} (${cal}cal / ${grams})`])
  } else if (cal > 0 && grams === 0) {
    issues.push([d.name, `no gramsPerServing/mlPerServing bridge (can't convert units)`])
  }

  // Alternate servings sane
  for (const a of (v.alternateServings || [])) {
    if (!(Number(a.multiplier) > 0)) issues.push([d.name, `alt "${a.label}" bad multiplier ${a.multiplier}`])
    if (Number(a.multiplier) > 12) issues.push([d.name, `alt "${a.label}" huge multiplier ${a.multiplier}`])
    if (/^\s*100\s*(g|ml)/i.test(a.label)) issues.push([d.name, `alt still has arbitrary "${a.label}"`])
  }
  if (/^\s*100\s*(g|ml)/i.test(v.displayLabel || '')) issues.push([d.name, `primary is arbitrary "${v.displayLabel}"`])
  // provenance clean
  if (d.brand) issues.push([d.name, `stale brand "${d.brand}"`])
  if (d.source !== 'manual') issues.push([d.name, `source=${d.source} (expected manual)`])
}

console.log(`\n=== ${issues.length} issue(s) ===`)
for (const [name, msg] of issues) console.log(` - ${name}: ${msg}`)
if (issues.length === 0) console.log('ALL CLEAN ✓')
await mongoose.disconnect()
