import { createRequire } from 'module'; import { readFileSync } from 'fs'
const require = createRequire(import.meta.url); const mongoose = require('mongoose')

// Fix foods whose macros are physically impossible: per-100 > 920 cal, or a
// displayed per-serving > 1500 cal from a corrupt gram bridge (Berries N Kale
// 21,780 etc). OFF's `energy-kcal_100g` field is often garbage while `energy_100g`
// (kJ) is correct, so we re-fetch OFF and recover a plausible per-100, dropping the
// bad bridge so the food reads at an accurate per-100. Unrecoverable → needsReview.
// USDA foods (no OFF barcode) with a garbage bridge: drop the bridge (per-100 stays).
// Read-only unless --apply.

const APPLY = process.argv.includes('--apply')
const UA = 'BecomeNutrition/1.0 (george@redbtn.io)'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : 0))
const r1 = (v) => Math.round((Number(v)||0)*10)/10
const MASS = { g:1, oz:28.3495, lb:453.592, kg:1000 }, VOL = new Set(['ml','cup','tbsp','tsp','fl_oz','pint','quart','liter'])
function basisG(v){ const u=(v.servingUnit||'').toLowerCase(), size=Number(v.servingSize)||0
  if(MASS[u]&&size>0) return size*MASS[u]
  if(VOL.has(u)){ if(Number(v.mlPerServing)>0) return Number(v.mlPerServing); if(u==='ml'&&size>0) return size }
  if(Number(v.gramsPerServing)>0) return Number(v.gramsPerServing)
  if(Number(v.mlPerServing)>0) return Number(v.mlPerServing)
  return null }
function per100cal(v){ const g=basisG(v); if(!g) return null; return (Number(v?.nutrition?.calories)||0)*(100/g) }
function rowCal(v){ const per=Number(v?.nutrition?.calories)||0,size=Number(v?.servingSize)||0;let s=1
  if(v?.servingUnit==='g'&&Number(v.gramsPerServing)>0&&size>0&&Math.abs(v.gramsPerServing-size)>0.001)s=v.gramsPerServing/size
  else if(v?.servingUnit==='ml'&&Number(v.mlPerServing)>0&&size>0&&Math.abs(v.mlPerServing-size)>0.001)s=v.mlPerServing/size
  return per*s }
const plausible = (m) => m.cal>0 && m.cal<=920 && m.p<=100 && m.c<=100 && m.f<=100
const atwOk = (m) => { const a=4*m.p+4*m.c+9*m.f; return Math.abs(a-m.cal) <= 0.30*m.cal+30 }

async function fetchOff(code){
  const url=`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=nutriments,serving_size`
  for(let i=0;i<4;i++){ try{ const res=await fetch(url,{headers:{'User-Agent':UA}})
    if(res.status===429||res.status>=500){ await sleep(2000*(i+1)); continue }
    if(!res.ok) return null
    const j=await res.json().catch(()=>null); if(!j||j.status===0||!j.product?.nutriments) return {missing:true}
    return { n:j.product.nutriments } } catch { await sleep(2000*(i+1)) } }
  return null
}
// Recover a plausible per-100 from OFF nutriments: prefer energy-kcal_100g when
// sane, else energy_100g (kJ) / 4.184; macros straight from *_100g.
function offPer100(n){
  const p=num(n['proteins_100g']), c=num(n['carbohydrates_100g']), f=num(n['fat_100g'])
  const kcalField=num(n['energy-kcal_100g'])
  const kjField=num(n['energy_100g'])
  let cal = kcalField>0 && kcalField<=920 ? kcalField : (kjField>0 ? kjField/4.184 : 0)
  return { cal, p, c, f }
}

async function main(){
  await mongoose.connect(readFileSync('/tmp/prod_uri.txt','utf8').trim(), { serverSelectionTimeoutMS: 12000 })
  const db = mongoose.connection.db
  const all = await db.collection('foods').find({ source:{$in:['openfoodfacts','usda']} }, { projection:{name:1,source:1,barcode:1,externalId:1,variants:1} }).toArray()
  const problems = all.filter(d=>{ const v=(d.variants||[])[0]; if(!v||!(Number(v?.nutrition?.calories)>0)) return false
    const p=per100cal(v), r=rowCal(v); return (p!=null&&p>920) || r>1500 })
  console.log(`Scanning ${all.length} → ${problems.length} broken (impossible per-100 or garbage displayed)\n`)
  let fixedOff=0, fixedUsda=0, flagged=0, ok=0
  const ops=[]
  for(const d of problems){
    const v=(d.variants||[])[0]
    const code=(d.barcode||'').trim() || (String(d.externalId||'').replace(/^off:/i,'').match(/^\d{6,}$/)?String(d.externalId).replace(/^off:/i,''):'')
    let action='', set=null
    if(d.source==='openfoodfacts' && code){
      const off=await fetchOff(code); await sleep(1100)
      if(off && !off.missing){
        const m=offPer100(off.n)
        if(plausible(m) && atwOk(m)){
          set={ 'variants.0.nutrition':{ calories:Math.round(m.cal), protein:r1(m.p), carbs:r1(m.c), fats:r1(m.f) }, 'variants.0.servingSize':100, 'variants.0.servingUnit':(v.servingUnit==='ml'?'ml':'g') }
          action=`OFF→ per100 ${Math.round(m.cal)}cal P${r1(m.p)} C${r1(m.c)} F${r1(m.f)} + drop bridge`; fixedOff++
        }
      }
    }
    if(!set){
      // USDA (or OFF unrecoverable): if per-100 itself is plausible, the bridge is the
      // problem — drop it. Else flag for review.
      const p=per100cal(v)
      if(p!=null && p<=920 && (Number(v.gramsPerServing)>0 || Number(v.mlPerServing)>0)){
        action=`drop garbage bridge (per-100 ${Math.round(p)} stays)`; set={ _dropBridge:true }; fixedUsda++
      } else { action='FLAG needsReview (unrecoverable)'; set={ needsReview:true }; flagged++ }
    }
    console.log(`${Math.round(per100cal(v)||0)}/100 row${Math.round(rowCal(v))} "${d.name}" [${d.source}] → ${action}`)
    if(APPLY){
      const upd={ $set:{ updatedAt:new Date() } }
      if(set._dropBridge){ upd.$unset={ 'variants.0.gramsPerServing':'', 'variants.0.mlPerServing':'' } }
      else if(set.needsReview){ upd.$set.needsReview=true }
      else { for(const [k,val] of Object.entries(set)) upd.$set[k]=val; upd.$unset={ 'variants.0.gramsPerServing':'', 'variants.0.mlPerServing':'' } }
      ops.push({ updateOne:{ filter:{_id:d._id}, update:upd } })
    }
  }
  console.log(`\nfixed via OFF: ${fixedOff} | dropped bridge: ${fixedUsda} | flagged review: ${flagged}`)
  if(APPLY && ops.length){ const res=await db.collection('foods').bulkWrite(ops); console.log(`APPLIED: ${res.modifiedCount} modified`) }
  else if(!APPLY) console.log('(dry-run — re-run with --apply)')
  await mongoose.disconnect()
}
main().catch(e=>{console.error(e);process.exit(1)})
