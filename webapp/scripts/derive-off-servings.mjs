import { createRequire } from 'module'; import { readFileSync } from 'fs'
const require = createRequire(import.meta.url); const mongoose = require('mongoose')

// Give OFF foods that currently show a bare "100 g / 100 ml" serving a REAL
// portion. Their per-100 macros are already correct — the problem is the picker
// defaults to "100 g", so a food eaten in a 30 g portion logs as 250 cal when it
// should be ~75. We re-fetch OFF's serving_size text, parse a real gram/ml
// portion, and set the gramsPerServing/mlPerServing bridge + a displayLabel so
// the picker offers the true serving. per-100 nutrition is untouched.
// Read-only unless --apply.  --limit N caps the batch (for sampling).

const APPLY = process.argv.includes('--apply')
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? parseInt(process.argv[i+1],10) : Infinity })()
const UA = 'BecomeNutrition/1.0 (george@redbtn.io)'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const G = { g:1, gram:1, gr:1, oz:28.3495, ounce:28.3495, lb:453.592, pound:453.592, kg:1000 }
const ML = { ml:1, milliliter:1, millilitre:1, cc:1, cl:10, dl:100, l:1000, litre:1000, liter:1000,
  'fl oz':29.5735, floz:29.5735, tbsp:14.7868, tablespoon:14.7868, tbs:14.7868, tsp:4.92892, teaspoon:4.92892, cup:240 }

// Pull every "<number> <unit>" token; keep the largest plausible mass and volume.
// OFF text like "1 slice (28 g)" or "1 cup (240 ml)" yields both a bare count
// (skipped — no mass/vol unit) and the real portion inside the parens.
function parsePortion(text) {
  if (!text) return null
  let bestG = null, bestMl = null
  const re = /(\d+(?:[.,]\d+)?)\s*(fl\s*oz|floz|milliliters?|millilitres?|ml\b|cc\b|cl\b|dl\b|liters?|litres?|l\b|grams?|gr\b|g\b|kg\b|ounces?|oz\b|pounds?|lb\b|tablespoons?|tbsp\b|tbs\b|teaspoons?|tsp\b|cups?)/gi
  let m
  while ((m = re.exec(text))) {
    const val = parseFloat(m[1].replace(',', '.'))
    if (!isFinite(val) || val <= 0) continue
    let u = m[2].toLowerCase().replace(/\s+/g, ' ').trim()
    u = u.replace(/s$/, '') // plural → singular (grams→gram, cups→cup, ounces→ounce)
    if (u === 'fl oz' || u === 'floz') u = 'fl oz'
    if (G[u] != null) { const g = val * G[u]; if (bestG == null || g > bestG) bestG = g }
    else if (ML[u] != null) { const ml = val * ML[u]; if (bestMl == null || ml > bestMl) bestMl = ml }
  }
  return { grams: bestG, ml: bestMl }
}

async function fetchOff(code) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=serving_size,serving_quantity,serving_quantity_unit`
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue }
      if (!res.ok) return null
      const j = await res.json().catch(() => null)
      if (!j || j.status === 0 || !j.product) return { missing: true }
      return { p: j.product }
    } catch { await sleep(2000 * (i + 1)) }
  }
  return null
}

function is100(v) {
  const u = (v.servingUnit || '').toLowerCase()
  return (u === 'g' || u === 'ml') && Number(v.servingSize) === 100 &&
    !(Number(v.gramsPerServing) > 0) && !(Number(v.mlPerServing) > 0)
}

async function main() {
  await mongoose.connect(readFileSync('/tmp/prod_uri.txt', 'utf8').trim(), { serverSelectionTimeoutMS: 12000 })
  const db = mongoose.connection.db
  // First pass excludes the admin review-queue foods; --include-review does the
  // rest (they're still user-visible as "100 g", so they need real servings too).
  const q = { source: 'openfoodfacts' }
  if (!process.argv.includes('--include-review')) q.needsReview = { $ne: true }
  else q.needsReview = true
  const all = await db.collection('foods').find(
    q,
    { projection: { name: 1, barcode: 1, externalId: 1, variants: { $slice: 1 } } }
  ).toArray()
  const targets = all.filter(d => { const v = (d.variants || [])[0]; return v && is100(v) }).slice(0, LIMIT)
  console.log(`OFF foods showing bare "100 g/ml": ${targets.length}${LIMIT !== Infinity ? ` (capped ${LIMIT})` : ''}\n`)

  let set = 0, noCode = 0, noText = 0, unparsable = 0, missing = 0, sameAs100 = 0
  const ops = []
  // Pace under OFF's ~100 req/min product-API limit. Concurrency >1 gets us 429'd
  // straight into exponential backoff, which is slower than just going serial.
  const CONC = 1
  const batches = []
  for (let i = 0; i < targets.length; i += CONC) batches.push(targets.slice(i, i + CONC))

  for (const batch of batches) {
    const fetched = await Promise.all(batch.map(async (d) => {
      const code = (d.barcode || '').trim() ||
        (String(d.externalId || '').replace(/^off:/i, '').match(/^\d{6,}$/) ? String(d.externalId).replace(/^off:/i, '') : '')
      if (!code) return { d, noCode: true }
      const off = await fetchOff(code)
      return { d, off }
    }))
    await sleep(700)

  for (const item of fetched) {
    const d = item.d
    const v = (d.variants || [])[0]
    const liquid = (v.servingUnit || '').toLowerCase() === 'ml'
    if (item.noCode) { noCode++; continue }
    const off = item.off
    if (!off) { missing++; continue }
    if (off.missing) { missing++; continue }
    const text = (off.p.serving_size || '').trim()
    const parsed = parsePortion(text)
    // Prefer a parsed portion; else trust serving_quantity when it carries a real unit.
    let grams = parsed?.grams ?? null, ml = parsed?.ml ?? null
    const sq = Number(off.p.serving_quantity)
    const squ = (off.p.serving_quantity_unit || '').toLowerCase()
    if (grams == null && ml == null && sq >= 5) {
      if (squ === 'ml' || liquid) ml = sq; else grams = sq
    }
    const portion = liquid ? (ml ?? grams) : (grams ?? ml)
    if (portion == null) { if (!text) noText++; else unparsable++; continue }
    if (!(portion >= 3 && portion <= 3000)) { unparsable++; continue }
    if (Math.abs(portion - 100) < 0.5) { sameAs100++; continue } // already effectively "100 g"

    const label = text || `${Math.round(portion)} ${liquid ? 'ml' : 'g'}`
    const bridgeKey = liquid ? 'variants.0.mlPerServing' : 'variants.0.gramsPerServing'
    console.log(`"${d.name}" ← "${text || '(sq '+sq+squ+')'}" → ${Math.round(portion)} ${liquid ? 'ml' : 'g'}`)
    set++
    if (APPLY) {
      ops.push({ updateOne: { filter: { _id: d._id }, update: {
        $set: { [bridgeKey]: Math.round(portion * 10) / 10, 'variants.0.displayLabel': label, updatedAt: new Date() }
      } } })
      // Flush incrementally so a mid-run death can't discard everything (the old
      // single end-of-loop bulkWrite lost all 21 derived servings when the process
      // was torn down before the loop finished).
      if (ops.length >= 20) { const res = await db.collection('foods').bulkWrite(ops.splice(0)); console.log(`  …flushed ${res.modifiedCount}`) }
    }
  }
  } // end batch loop
  console.log(`\nreal serving set: ${set} | no barcode: ${noCode} | no serving text: ${noText} | unparsable: ${unparsable} | =100: ${sameAs100} | missing on OFF: ${missing}`)
  if (APPLY && ops.length) { const res = await db.collection('foods').bulkWrite(ops); console.log(`APPLIED: ${res.modifiedCount} modified`) }
  else if (!APPLY) console.log('(dry-run — re-run with --apply)')
  await mongoose.disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
