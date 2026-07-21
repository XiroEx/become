import { createRequire } from 'module'; import { readFileSync } from 'fs'
const require = createRequire(import.meta.url); const mongoose = require('mongoose')

// Fix OpenFoodFacts foods whose per-serving calories collapse to ~1 cal. Cause: the
// import put a bogus tiny bridge (gramsPerServing:1 from "1 bottle/portion") on a
// per-100 variant, so rowCalories scales 56/100g by 1/100 → ~1 cal. Fix: derive the
// real serving amount from the label (e.g. "14 fl oz" → 414 ml, "(414 ml)", "60 g")
// and set the correct bridge; if the label has no usable amount, drop the bogus
// bridge so the food falls back to an accurate per-100 figure (never worse than 1 cal).
// Read-only unless --apply. The import root cause is fixed in lib/foodImport.ts.

const APPLY = process.argv.includes('--apply')
const FL_OZ_ML = 29.5735

function rowCal(v){
  const per = Number(v?.nutrition?.calories)||0, size=Number(v?.servingSize)||0
  let scale=1
  if(v?.servingUnit==='g' && Number(v.gramsPerServing)>0 && size>0 && Math.abs(v.gramsPerServing-size)>0.001) scale=v.gramsPerServing/size
  else if(v?.servingUnit==='ml' && Number(v.mlPerServing)>0 && size>0 && Math.abs(v.mlPerServing-size)>0.001) scale=v.mlPerServing/size
  return per*scale
}

// Pull a real single-serving amount (ml or g) out of the label/alternates.
function deriveServing(v){
  const texts = [v.displayLabel, ...(v.alternateServings||[]).map(a=>a?.label)].filter(Boolean).map(String)
  for (const t of texts) {
    let m
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*ml\b/i))) return { unit:'ml', amount: +m[1] }
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*fl\s*oz\b/i))) return { unit:'ml', amount: Math.round(+m[1]*FL_OZ_ML*10)/10 }
    if ((m = t.match(/(\d+(?:\.\d+)?)\s*g\b/i))) return { unit:'g', amount: +m[1] }
  }
  return null
}

async function main(){
  await mongoose.connect(readFileSync('/tmp/prod_uri.txt','utf8').trim(), { serverSelectionTimeoutMS: 10000 })
  const db = mongoose.connection.db
  const cur = db.collection('foods').find({ source:'openfoodfacts' }, { projection:{ name:1, variants:{ $slice:1 } } })
  let fixedBridge=0, droppedBridge=0, scanned=0
  const ops=[]
  for await (const d of cur){
    const v=(d.variants||[])[0]; if(!v||!(Number(v?.nutrition?.calories)>0)) continue
    const per100 = Number(v.nutrition.calories)
    if (!(rowCal(v) < 5 && per100 >= 20)) continue    // only the collapsed ones
    scanned++
    const size = Number(v.servingSize)||100
    const serv = deriveServing(v)
    let set={}, how=''
    if (serv && serv.amount > size) {
      if (serv.unit==='ml') { set={ 'variants.0.servingUnit':'ml', 'variants.0.mlPerServing': serv.amount }, set['variants.0.gramsPerServing']=undefined }
      else { set={ 'variants.0.servingUnit':'g', 'variants.0.gramsPerServing': serv.amount }, set['variants.0.mlPerServing']=undefined }
      how = `→ ${serv.amount}${serv.unit} bridge (${Math.round(per100*serv.amount/size)} cal/serv)`
      fixedBridge++
    } else {
      how = `→ drop bogus bridge (per-100 = ${per100} cal)`
      droppedBridge++
    }
    console.log(`${String(Math.round(rowCal(v))).padStart(3)}cal  "${d.name}" [${v.servingUnit} size=${size} gPS=${v.gramsPerServing||'-'} mlPS=${v.mlPerServing||'-'} per=${per100}]  ${how}`)
    if (APPLY) {
      const $set={}, $unset={}
      for (const [k,val] of Object.entries(set)) { if (val===undefined) $unset[k]=''; else $set[k]=val }
      if (!(serv && serv.amount > size)) { $unset['variants.0.gramsPerServing']=''; $unset['variants.0.mlPerServing']='' }
      const update={}; if(Object.keys($set).length) update.$set=$set; if(Object.keys($unset).length) update.$unset=$unset
      update.$set = { ...(update.$set||{}), updatedAt: new Date() }
      ops.push({ updateOne:{ filter:{_id:d._id}, update } })
    }
  }
  console.log(`\nscanned ${scanned} collapsed foods | bridge-repaired ${fixedBridge} | bogus-bridge-dropped ${droppedBridge}`)
  if (APPLY && ops.length) { const r = await db.collection('foods').bulkWrite(ops); console.log(`APPLIED: ${r.modifiedCount} modified`) }
  else if (!APPLY) console.log('(dry-run — re-run with --apply to write)')
  await mongoose.disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
