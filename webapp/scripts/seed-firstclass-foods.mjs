import { createRequire } from 'module'
import { readFileSync, existsSync, readdirSync } from 'fs'
const require = createRequire(import.meta.url)
const mongoose = require('mongoose')

// Seed curated FIRST-CLASS common foods from /tmp/foods_[A-D].json (produced by the
// data-gen agents). Dry-run by default; pass --apply to write.
// Each input food: { name, category, aliases[], liquid, per100:{calories,protein,carbs,
// fats,fiber,sugar,sodium_mg,saturatedFat}, servings:[{label,unit,count,grams|ml}] } (first = default).

const APPLY = process.argv.includes('--apply')
const CATEGORIES = new Set(['Protein','Grain','Fruit','Vegetable','Dairy','Fat','Beverage','Condiment','Snack','Other'])
const UNITS = new Set(['g','oz','cup','each','ml','tbsp','tsp','slice','scoop','serving'])

function slugify(s){ return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') }
function r1(n){ return Math.round((Number(n)||0)*10)/10 }
function r3(n){ return Math.round((Number(n)||0)*1000)/1000 }
const FL_OZ_ML = 29.5735
// "1/2" → 0.5, "1 1/2" → 1.5, "1.55" → 1.55, "3" → 3
function parseNum(t){ t=String(t).trim(); let m
  if((m=t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) return (+m[1])+((+m[2])/(+m[3]))
  if((m=t.match(/^(\d+)\s*\/\s*(\d+)$/))) return (+m[1])/(+m[2])
  const n=parseFloat(t); return Number.isFinite(n)?n:1 }
function normUnit(u){ u=String(u).toLowerCase().replace(/\s+/g,' ').trim().replace(/s$/,'')
  if(/^fl ?o/.test(u)) return 'fl_oz'
  return ({gram:'g',ounce:'oz',milliliter:'ml',tablespoon:'tbsp',teaspoon:'tsp'})[u] || u }
// Derive servingSize + servingUnit that match the quantity the picker parses from
// displayLabel, so the default choice resolves to exactly 1× (see caller note).
function deriveServing(label, def, isLiquid, defM){
  const s = String(label||'')
  // Leading "<qty> <unit>" — the food's real named metric ("3 oz", "1/2 cup").
  const lead = s.match(/^\s*(\d+(?:\s+\d+\s*\/\s*\d+|\s*\.\s*\d+|\s*\/\s*\d+)?)\s*(fl\s*oz|grams?|milliliters?|ounces?|tablespoons?|teaspoons?|cups?|tbsp|tsp|oz|ml|g|slices?)?\b/i)
  const num = lead ? parseNum(lead[1]) : (Number(def.count)||1)
  const u = lead && lead[2] ? normUnit(lead[2]) : null
  if(u === 'fl_oz') return { size: Math.round(num*FL_OZ_ML*100)/100, unit: 'ml' }
  if(u && UNITS.has(u)) return { size: num, unit: u }
  // No measurable leading unit (discrete "1 medium"/"1 bar", or liquid "1 can").
  if(isLiquid){
    // Prefer a volume measure anywhere (e.g. paren "12 fl oz") — matches the picker.
    const vol = s.match(/(\d+(?:\.\d+|\s*\/\s*\d+)?)\s*(fl\s*oz|cups?|tbsp|tsp|ml)\b/i)
    if(vol){ const q=parseNum(vol[1]), vu=normUnit(vol[2])
      if(vu==='fl_oz') return { size: Math.round(q*FL_OZ_ML*100)/100, unit: 'ml' }
      if(UNITS.has(vu)) return { size: q, unit: vu } }
    return { size: defM, unit: 'ml' }
  }
  const du = UNITS.has(def.unit) && def.unit!=='serving' ? def.unit : (/slice/i.test(s) ? 'slice' : 'each')
  return { size: (Number.isFinite(num) && num>0 ? num : (Number(def.count)||1)) || 1, unit: du }
}

const files = readdirSync('/tmp').filter(f=>/^foods_[A-Z]\.json$/.test(f)).sort().map(f=>`/tmp/${f}`)
console.log('batch files:', files.map(f=>f.replace('/tmp/','')).join(', '))
let raw = []
for (const f of files){
  if (!existsSync(f)) { console.log('MISSING', f); continue }
  try { const arr = JSON.parse(readFileSync(f,'utf8')); if (Array.isArray(arr)) raw.push(...arr); else console.log('not an array:', f) }
  catch(e){ console.log('PARSE FAIL', f, e.message) }
}
console.log('loaded foods:', raw.length)

const bySlug = new Map()
const warnings = []
const docs = []
for (const food of raw){
  const name = String(food?.name||'').trim()
  if (!name) { warnings.push('no name: '+JSON.stringify(food).slice(0,60)); continue }
  const slug = slugify(name)
  if (bySlug.has(slug)) { warnings.push('dup slug skipped: '+name); continue }
  const cat = CATEGORIES.has(food.category) ? food.category : 'Other'
  if (!CATEGORIES.has(food.category)) warnings.push(`${name}: bad category "${food.category}" → Other`)
  const p = food.per100 || {}
  if (!(Number(p.calories)>0)) { warnings.push(`${name}: no per100 calories — SKIP`); continue }
  const isLiquid = !!food.liquid
  const measure = (s)=> isLiquid ? Number(s.ml)||Number(s.grams) : Number(s.grams)||Number(s.ml)
  const allServings = Array.isArray(food.servings) ? food.servings.filter(s=>s && (Number(s.grams)>0||Number(s.ml)>0)) : []
  if (allServings.length === 0) { warnings.push(`${name}: no valid servings — SKIP`); continue }
  // "100 g"/"100 ml" is arbitrary — nobody eats exactly 100 of anything. Drop it
  // UNLESS it's the only serving (grams can still be entered via the weight unit).
  const is100 = (s)=> /^\s*100\s*(g|ml)\b/i.test(String(s.label||'')) || (measure(s)===100 && /^(g|ml)$/.test(String(s.unit)))
  let servings = allServings.filter(s=>!is100(s))
  if (servings.length === 0) servings = allServings
  const def = servings[0]
  const defM = measure(def)
  if (!(defM>0)) { warnings.push(`${name}: default serving has no weight — SKIP`); continue }

  // Atwater sanity on per-100
  const atw = 4*(Number(p.protein)||0) + 4*(Number(p.carbs)||0) + 9*(Number(p.fats)||0)
  if (Number(p.calories)>5 && Math.abs(atw - p.calories) > 0.35*p.calories + 15)
    warnings.push(`${name}: kcal ${p.calories} vs Atwater ${Math.round(atw)} (per100) — check`)

  const scale = defM/100
  const nutrition = {
    calories: Math.round((Number(p.calories)||0)*scale),
    protein: r1((Number(p.protein)||0)*scale),
    carbs: r1((Number(p.carbs)||0)*scale),
    fats: r1((Number(p.fats)||0)*scale),
    fiber: r1((Number(p.fiber)||0)*scale),
    sugar: r1((Number(p.sugar)||0)*scale),
    sodium: r3(((Number(p.sodium_mg)||0)*scale)/1000),
    saturatedFat: r1((Number(p.saturatedFat)||0)*scale),
  }
  const wu = isLiquid?'ml':'g'
  const lbl = (label, m) => (/\d\s*(g|ml)\b/i.test(label) || /\(/.test(label)) ? label : `${label} (${m} ${wu})`
  // Derive servingSize + servingUnit so they MATCH the quantity the picker parses
  // out of displayLabel. The picker's default choice = parse(displayLabel), and
  // scalingFactor = parsedQty / servingSize — so if servingSize ≠ the label's
  // leading quantity the default renders a wrong fraction/multiple (e.g. "1/2 cup"
  // or "12 fl oz" with servingSize 1 computed 2×/30× the macros). fl_oz is not in
  // the unit enum, so it maps to ml via the same 29.5735 factor the picker uses.
  // NOTE: scripts/fix-serving-scale.ts is the authoritative post-seed verifier —
  // run it after every seed to catch any label the picker parses differently.
  const { size: servingSize, unit } = deriveServing(lbl(def.label, defM), def, isLiquid, defM)
  const variant = {
    name: 'Default', isDefault: true,
    servingSize,
    servingUnit: unit,
    displayLabel: lbl(def.label, defM),
    alternateServings: servings.slice(1).map(s=>({
      label: lbl(s.label, measure(s)),
      multiplier: Math.round((measure(s)/defM)*10000)/10000,
    })),
    nutrition,
    ...(isLiquid ? { mlPerServing: defM } : { gramsPerServing: defM }),
    _id: new mongoose.Types.ObjectId(),
  }
  const aliases = Array.isArray(food.aliases) ? [...new Set(food.aliases.map(a=>String(a).toLowerCase().trim()).filter(Boolean))] : [name.toLowerCase()]
  const doc = {
    name, slug, category: cat, aliases,
    source: 'manual', isFirstClass: true, isVerified: true, needsReview: false,
    variants: [variant], groupKey: name.toLowerCase().trim(),
    usageCount: 0, __v: 0,
  }
  bySlug.set(slug, doc); docs.push(doc)
}

console.log('\n=== validation warnings ('+warnings.length+') ===')
warnings.forEach(w=>console.log(' -', w))
const catCount = {}; docs.forEach(d=>catCount[d.category]=(catCount[d.category]||0)+1)
console.log('\n=== ready to seed:', docs.length, '| by category:', JSON.stringify(catCount))
console.log('sample:', JSON.stringify(docs[0], null, 1))
console.log('sample2:', JSON.stringify(docs.find(d=>d.variants[0].mlPerServing) || docs[1], null, 1))

if (!APPLY){ console.log('\nDRY RUN — pass --apply to insert'); process.exit(0) }

const uri = readFileSync('/tmp/prod_uri.txt','utf8').trim()
await mongoose.connect(uri,{serverSelectionTimeoutMS:10000})
const coll = mongoose.connection.db.collection('foods')
let inserted=0, updated=0, skipped=0
for (const d of docs){
  // slug is globally-unique. If a food already owns this slug, promote it in place
  // (auto-imported usda/off foods → curated first-class). Preserve a real user's
  // custom food (source manual + createdBy + not first-class) — never clobber it.
  const existing = await coll.findOne({ slug: d.slug })
  if (existing){
    const isUserFood = existing.source === 'manual' && existing.createdBy && !existing.isFirstClass
    if (isUserFood){ skipped++; console.log('  skip user food:', d.slug); continue }
    const set = { ...d }; delete set._id
    // Strip stale external provenance so a promoted usda/off import renders as a
    // clean curated food (no green/blue globe, no leftover brand subtitle).
    await coll.updateOne({ _id: existing._id }, {
      $set: { ...set, updatedAt: new Date() },
      $unset: { brand: '', externalId: '', externalDataType: '', nutriscore_grade: '', imageUrl: '' },
    })
    updated++
  } else {
    await coll.insertOne({ ...d, createdAt: new Date(), updatedAt: new Date() })
    inserted++
  }
}
console.log(`\n✓ inserted ${inserted} | updated ${updated} | skipped ${skipped}`)
await mongoose.disconnect()
