/**
 * One-off: correct nutrition for specific foods whose macros were 0/null and
 * could NOT be recovered from OpenFoodFacts (live OFF also lacked macros). Values
 * below are web-researched from manufacturer labels / USDA, expressed PER 100
 * (g or ml) to match each food's stored canonical variant. Calories that were
 * already correct on the record are preserved; obviously-wrong ones are replaced.
 *
 * Run from webapp/:
 *   DRY  : PROD_MONGODB_URI="<uri>" npx tsx scripts/fix-food-nutrition.ts --prod
 *   APPLY: PROD_MONGODB_URI="<uri>" npx tsx scripts/fix-food-nutrition.ts --prod --apply
 *
 * Updates the DEFAULT variant's nutrition and clears needsReview. Idempotent.
 */

import mongoose from 'mongoose'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const isProd = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
const MONGODB_URI = isProd
  ? (process.env.PROD_MONGODB_URI || process.env.MONGODB_URI_PROD || process.env.MONGODB_URI)
  : process.env.MONGODB_URI
if (!MONGODB_URI) { console.error('Missing Mongo URI'); process.exit(1) }

interface NutFix { calories: number; protein: number; carbs: number; fats: number; fiber?: number; sugar?: number }
interface Fix { id: string; label: string; source: string; nutrition: NutFix }

// PER 100 g (or ml for the rum). Sourced June 2026.
const FIXES: Fix[] = [
  // USDA — raw asparagus.
  { id: '6a370d144f568afbbed3b200', label: 'Asparagus (Crystal Valley)', source: 'USDA', nutrition: { calories: 20, protein: 2.2, carbs: 3.9, fats: 0.1, fiber: 2.1, sugar: 1.9 } },
  // davidprotein.com — 150 cal/bar, P28 C12 F2; bar ≈62 g → kept cal 242/100g, macros scaled.
  { id: '6a3451a7a602f49c0e0eb370', label: 'Blueberry Pie Bar (David)', source: 'davidprotein.com', nutrition: { calories: 242, protein: 45, carbs: 19, fats: 3, sugar: 0 } },
  // Redcon1.com — 120 cal/serving, P26 C1 F2; serving ≈31.5 g → kept cal 381/100g.
  { id: '6a32b4cb4915d2afdfa0b7b4', label: 'MRE Lite (Redcon1)', source: 'redcon1.com', nutrition: { calories: 381, protein: 82, carbs: 3, fats: 6 } },
  // Orgain — 150 cal/46 g serving, P21 C15 F4 → per 100g, kept cal 326.
  { id: '6a33eae5336012482de55d64', label: 'Organic Protein Powder (Orgain)', source: 'orgain.com', nutrition: { calories: 326, protein: 46, carbs: 33, fats: 9, fiber: 15 } },
  // theproteinworks.com — 111 cal/30 g, P22 C2.1 F<1.4 → per 100g (record's 14 cal was wrong).
  { id: '6a0ba4ec26edb933a6333497', label: 'Whey Protein (protein Works)', source: 'theproteinworks.com', nutrition: { calories: 370, protein: 73, carbs: 7, fats: 4 } },
  // youfoodz care page — per 100g (record's 187 cal was wrong).
  { id: '6a38a1e36663f1e2daa6a00d', label: 'Smokey Alabama Chicken (YouFoodz)', source: 'youfoodz.com', nutrition: { calories: 105, protein: 6.6, carbs: 9, fats: 4 } },
  // CalorieKing/MyNetDiary — 236 cal/58 g donut → per 100g (record's 438 cal slightly high).
  { id: '6a2c116b2535b3d24a95ae8d', label: 'Strawberry Donuts (Woolworths)', source: 'calorieking.com.au', nutrition: { calories: 407, protein: 5, carbs: 40, fats: 26, sugar: 23 } },
  // eatthismuch/fatsecret — Goya Sofrito Tomato Base, ~100% carbs; kept cal 100/100g.
  { id: '6a39dd5e2971dc283318453f', label: 'Tomato Cooking Base (Goya)', source: 'fatsecret.com', nutrition: { calories: 100, protein: 0, carbs: 25, fats: 0 } },
  // Captain Morgan Original Spiced Rum — ~194 cal/100 ml from alcohol; macros ~0 (manual record was 0 cal).
  { id: '6a2513a9a75ea6fbd168de67', label: 'Captain Morgan', source: 'recipal/eatthismuch', nutrition: { calories: 194, protein: 0, carbs: 0, fats: 0 } },
  // --- 2026-06-24: new broken OFF imports OFF couldn't supply macros for ---
  // USDA cheddar per 100g (OFF had macros null).
  { id: '6a3b3f7dff7e93c00c7d14bf', label: 'Everyday Cheddar cheese (Woolworths)', source: 'myfooddata/USDA', nutrition: { calories: 403, protein: 23, carbs: 3.1, fats: 33.3 } },
  // Pure matcha green tea powder per 100g (OFF had macros null). Generic proxy.
  { id: '6a3b3f7dff7e93c00c7d14b5', label: 'Everyday Matcha', source: 'recipal/nutritionvalue', nutrition: { calories: 347, protein: 27.4, carbs: 44.7, fats: 6.5, fiber: 38 } },
]

const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)

async function main() {
  console.log(`\n== Fix food nutrition ==  (${isProd ? 'PROD' : 'DEV'}, ${apply ? 'APPLY' : 'DRY-RUN'})\n`)
  await mongoose.connect(MONGODB_URI as string)
  const Foods = mongoose.connection.collection('foods')

  let done = 0, missing = 0
  for (const fx of FIXES) {
    let _id: mongoose.Types.ObjectId
    try { _id = new mongoose.Types.ObjectId(fx.id) } catch { console.log(`  ! bad id ${fx.id}`); continue }
    const food = await Foods.findOne({ _id }) as { variants?: Array<{ isDefault?: boolean; servingSize?: number; servingUnit?: string; nutrition?: NutFix }> } | null
    if (!food) { console.log(`  ! NOT FOUND: ${fx.label} (${fx.id})`); missing++; continue }
    const vs = food.variants ?? []
    let idx = vs.findIndex((v) => v.isDefault)
    if (idx < 0) idx = 0
    const cur = vs[idx]?.nutrition || {} as NutFix
    const serving = `${vs[idx]?.servingSize ?? '?'} ${vs[idx]?.servingUnit ?? ''}`.trim()
    console.log(`  ${fx.label}  [${serving}]  (src: ${fx.source})`)
    console.log(`     ${n(cur.calories)}cal P${n(cur.protein)} C${n(cur.carbs)} F${n(cur.fats)}  →  ${fx.nutrition.calories}cal P${fx.nutrition.protein} C${fx.nutrition.carbs} F${fx.nutrition.fats}`)
    if (apply) {
      await Foods.updateOne({ _id }, { $set: { [`variants.${idx}.nutrition`]: fx.nutrition, needsReview: false } })
    }
    done++
  }

  console.log(`\n${apply ? 'Updated' : 'Would update'}: ${done}   Not found: ${missing}`)
  if (!apply) console.log('(dry-run — re-run with --apply to write)')
  await mongoose.disconnect()
  console.log('Done.')
}

main().catch((e) => { console.error(e); process.exit(1) })
