/**
 * Find stored foods whose macros cannot produce their calories, and queue the
 * bad ones for the verification pipeline.
 *
 *   node scripts/audit-food-coherence.mjs            # report only
 *   node scripts/audit-food-coherence.mjs --apply    # repair + queue
 *
 * Why this is not a bulk "recompute calories from macros":
 *
 * The first instinct is to trust the macros and rewrite the calorie field. On
 * this catalogue that is catastrophically wrong. The worst drifting row was a
 * mini cucumber stored at 12 cal with 50 g of FAT — recomputing would have made
 * it 598 cal. In the overwhelming majority of drifting rows it is the MACROS
 * that are corrupt (bad import data), and the calorie figure is the sane one.
 *
 * So this only auto-repairs the ONE unambiguous shape:
 *
 *   calories == 0 while macros are present
 *
 * There, nothing is lost by deriving calories from macros, because zero is not a
 * competing claim — it is an absence. Everything else is queued for the real
 * reviewer, which has a barcode, web search and a vision read, rather than being
 * guessed at here.
 */

import { MongoClient } from 'mongodb'
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const DRIFT_THRESHOLD = 0.25

/** Atwater with NET carbs — fibre contributes ~0, which is how the app treats it. */
function atwater(n) {
  return 4 * (n.protein ?? 0) + 4 * Math.max(0, (n.carbs ?? 0) - (n.fiber ?? 0)) + 9 * (n.fats ?? 0)
}

function readEnvUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) throw new Error('MONGODB_URI not set and no .env.local found')
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find(l => l.startsWith('MONGODB_URI='))
  if (!line) throw new Error('MONGODB_URI missing from .env.local')
  return line.slice('MONGODB_URI='.length).replace(/^["']|["']$/g, '').trim()
}

const client = new MongoClient(readEnvUri())
await client.connect()
const db = client.db(process.env.MONGODB_DB || 'jondonfitdb')

const foods = await db.collection('foods')
  .find({}, { projection: { name: 1, brand: 1, barcode: 1, variants: 1, source: 1, usageCount: 1, verification: 1 } })
  .toArray()

const lostCalories = []   // calories 0, macros present — safe to derive
const drifting = []       // macros and calories disagree — needs a real review
const impossible = []     // macro grams exceed the serving weight

for (const f of foods) {
  const v = f.variants?.find(x => x.isDefault) ?? f.variants?.[0]
  const n = v?.nutrition
  if (!n) continue

  const cal = n.calories ?? 0
  const macroSum = (n.protein ?? 0) + (n.carbs ?? 0) + (n.fats ?? 0)
  const expected = atwater(n)

  if (cal === 0 && macroSum > 0) {
    lostCalories.push({ f, v, n, expected })
    continue
  }

  // Physically impossible: the macros cannot outweigh the amount they describe.
  //
  // The basis is servingSize + servingUnit (e.g. "per 100 g"), NOT
  // gramsPerServing — that is the weight of one PORTION, which is a different
  // number entirely. Comparing per-100 g macros against a 30 g portion flagged
  // a quarter of the catalogue as impossible on the first run of this script.
  const basisGrams = (v.servingUnit === 'g' || v.servingUnit === 'ml') ? v.servingSize : null
  if (basisGrams && macroSum > basisGrams * 1.05) {
    impossible.push({ f, n, basisGrams, macroSum })
  }

  if (cal > 0 && expected > 0) {
    const drift = Math.abs(expected - cal) / cal
    if (drift > DRIFT_THRESHOLD) drifting.push({ f, n, cal, expected, drift })
  }
}

const inUse = drifting.filter(d => (d.f.usageCount ?? 0) > 0)

console.log(`foods scanned            : ${foods.length}`)
console.log(`calories lost (auto-fix) : ${lostCalories.length}`)
console.log(`drifting > ${DRIFT_THRESHOLD * 100}%          : ${drifting.length}  (${inUse.length} of them actually logged by someone)`)
console.log(`physically impossible    : ${impossible.length}`)

if (!APPLY) {
  console.log('\nreport only — pass --apply to repair and queue')
  for (const l of lostCalories) {
    console.log(`  WOULD FIX  ${l.f.name} — calories 0 -> ${Math.round(l.expected * 10) / 10}`)
  }
  for (const d of [...inUse].sort((a, b) => b.drift - a.drift).slice(0, 15)) {
    console.log(`  WOULD QUEUE ${Math.round(d.drift * 100)}%  ${d.f.name} (logged ${d.f.usageCount}x) cal=${d.cal} macros imply ${Math.round(d.expected)}`)
  }
  await client.close()
  process.exit(0)
}

let fixed = 0
for (const l of lostCalories) {
  const idx = l.f.variants.findIndex(x => x === l.v)
  await db.collection('foods').updateOne(
    { _id: l.f._id },
    { $set: { [`variants.${idx}.nutrition.calories`]: Math.round(l.expected * 10) / 10 } },
  )
  console.log(`fixed ${l.f.name}: calories 0 -> ${Math.round(l.expected * 10) / 10}`)
  fixed++
}

// Queue the rest for the reviewer instead of guessing. Prioritise the ones
// members actually log — a wrong row nobody eats costs nothing today.
const toQueue = [...new Set([...inUse.map(d => d.f._id), ...impossible.map(i => i.f._id)])]
const queued = await db.collection('foods').updateMany(
  { _id: { $in: toQueue }, 'verification.state': { $in: ['unverified', null] } },
  { $set: { 'verification.state': 'queued', 'verification.recheckRequested': true } },
)

console.log(`\nrepaired: ${fixed}`)
console.log(`queued for review: ${queued.modifiedCount} of ${toQueue.length} candidates`)
await client.close()
