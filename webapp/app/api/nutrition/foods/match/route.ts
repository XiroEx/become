// POST /api/nutrition/foods/match — reconcile a list of loosely-named items
// (e.g. AI vision plate estimates) against what we ALREADY have: the Food DB
// (generic + branded + imported), the user's Meals, and the user's Recipes.
// Returns the best confident match per item (aligned by index) or null.
//
// This is what stops the vision flow from inventing a brand-new ad-hoc item for
// something we already know — and lets the UI label each row "in your foods /
// recipe / meal" vs "new (AI estimate)".

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food, { IFood } from '@/models/Food'
import Meal from '@/models/Meal'
import Recipe from '@/models/Recipe'
import { verifyAuth } from '@/lib/auth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import { stemMatch, words, contentWords, coverage } from '@/lib/nutrition/foodMatch'

type Kind = 'food' | 'meal' | 'recipe'

interface MatchNutrition {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber?: number
  sugar?: number
  sodium?: number
  saturatedFat?: number
}

interface MatchResult {
  kind: Kind
  id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  nutrition: MatchNutrition
  source: string
  confidence: number
  /** The user's own saved item (own food / meal / recipe) — ranked first so
   *  "use my saved foods" beats a generic global-catalog match. */
  owned?: boolean
  // Cross-unit bridges + friendly label so the plate reconcile can align an AI
  // quantity (e.g. "150 g", "1 cup") to the food's real serving instead of
  // back-calculating from calories. Only populated for `food` matches.
  gramsPerServing?: number
  mlPerServing?: number
  displayLabel?: string
}

// Text helpers (stemMatch/words/STOP/PREP/contentWords/coverage) are shared with
// the food-search ranking — see lib/nutrition/foodMatch.

type FoodLean = IFood & { _id: mongoose.Types.ObjectId }

// ── Per-item matcher ───────────────────────────────────────────────────────────

async function matchOne(
  rawName: string,
  rawBrand: string | undefined,
  userId: string,
): Promise<MatchResult | null> {
  const name = (rawName || '').trim()
  if (!name) return null
  const brand = (rawBrand || '').trim()
  const content = contentWords(name)
  if (content.length === 0) return null
  const fullQueryWords = words(`${name} ${brand}`)
  const q = `${name} ${brand}`.trim()
  // Haystack = name + brand content words. The AI often splits a saved item's
  // distinctive words across name AND brand (e.g. name "Mild Roast Coffee",
  // brand "Everyday Dose"), so candidate discovery + subset matching must look
  // at BOTH — otherwise the user's "Everyday Dose Coffee" recipe never surfaces.
  const haystack = contentWords(`${name} ${brand}`)

  // Candidate pools — text search + a regex fallback on ANY content word (name
  // or brand), so we don't miss a candidate the text index ranked out and a
  // saved item is found even when the description carries extra/split words.
  // Owner-scope meals/recipes to the user (or public ones).
  const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const anyWord = haystack.map(escapeRe).filter(Boolean).join('|') || escapeRe(name)
  const ownerOr = [{ createdBy: new mongoose.Types.ObjectId(userId) }, { isPublic: true }]

  const [foodText, foodRegex, meals, recipes] = await Promise.all([
    Food.find({ $text: { $search: q } }).limit(20).lean<FoodLean[]>().catch(() => []),
    Food.find({ $or: [
      { name: { $regex: anyWord, $options: 'i' } },
      { brand: { $regex: anyWord, $options: 'i' } },
      { aliases: { $regex: anyWord, $options: 'i' } },
    ] }).limit(20).lean<FoodLean[]>().catch(() => []),
    Meal.find({ $and: [{ $or: ownerOr }, { name: { $regex: anyWord, $options: 'i' } }] })
      .limit(20).lean<Array<Record<string, unknown>>>().catch(() => []),
    Recipe.find({ $and: [{ $or: ownerOr }, { name: { $regex: anyWord, $options: 'i' } }] })
      .limit(20).lean<Array<Record<string, unknown>>>().catch(() => []),
  ])

  // "Subset" match: the saved item's whole name appears in the query name+brand
  // (e.g. saved "Everyday Dose Coffee" inside name "Mild Roast Coffee" + brand
  // "Everyday Dose"). Lets the user's own saved items win even when the AI splits
  // or adds words.
  const subsetMatch = (candName: string): boolean => {
    const cc = contentWords(candName)
    return cc.length > 0 && coverage(cc, haystack) >= 1
  }

  // Dedupe foods by id.
  const foodById = new Map<string, FoodLean>()
  for (const f of [...foodText, ...foodRegex]) foodById.set(String(f._id), f)

  const candidates: MatchResult[] = []

  // Foods
  for (const f of foodById.values()) {
    const candWords = words(`${f.name} ${f.brand ?? ''} ${(f.aliases ?? []).join(' ')}`)
    const cov = coverage(content, candWords)
    // Full coverage for any food; OR a subset match for the user's OWN saved
    // food (so "everyday coffee" finds their custom "Coffee" — but we don't
    // loosen against the giant global catalog).
    const isOwn = !!f.createdBy && String(f.createdBy) === userId
    if (cov < 1 && !(isOwn && subsetMatch(f.name))) continue

    // Don't slap an unrequested brand or extra ingredients onto a plain
    // description. "chicken breast" must not silently become "HEB Chicken
    // Breast In Basil Pesto Sauce" just because that branded import happens to
    // contain the words "chicken" and "breast". These guards only apply to the
    // global catalog — the user's OWN saved foods keep the looser subset match
    // (they chose that name/brand themselves).
    if (!isOwn) {
      // (a) Brand evidence: only adopt a brand the query actually names.
      const brandWords = words(f.brand ?? '')
      const brandRequested = brandWords.length > 0
        && brandWords.some((bw) => fullQueryWords.some((qw) => stemMatch(bw, qw)))
      if (brandWords.length > 0 && !brandRequested) continue
      // (b) No unmentioned identity: reject a candidate whose own identity words
      //     (e.g. "basil pesto sauce") aren't mostly explained by the query.
      const candIdentity = contentWords(`${f.name} ${f.brand ?? ''}`)
      if (coverage(candIdentity, content) < 0.6) continue
    }

    const flat = flattenFoodForResponse(f)
    // Brand + full-phrase agreement raise confidence (and ranking).
    const brandHit = brand ? words(brand).every((bw) => candWords.some((cw) => stemMatch(bw, cw))) : false
    const fullCov = coverage(fullQueryWords, candWords)
    candidates.push({
      kind: 'food',
      id: String(f._id),
      name: flat.name,
      brand: flat.brand,
      servingSize: flat.servingSize ?? 1,
      servingUnit: flat.servingUnit ?? 'serving',
      nutrition: flat.nutrition as MatchNutrition,
      source: f.source || 'manual',
      confidence: Math.min(1, 0.6 + 0.3 * fullCov + (brandHit ? 0.1 : 0)),
      owned: isOwn,
      gramsPerServing: flat.gramsPerServing,
      mlPerServing: flat.mlPerServing,
      displayLabel: flat.displayLabel,
    })
  }

  // Meals (whole meal = one serving)
  for (const m of meals) {
    const candWords = words(String(m.name ?? ''))
    if (coverage(content, candWords) < 1 && !subsetMatch(String(m.name ?? ''))) continue
    const tn = (m.totalNutrition as MatchNutrition) || ({} as MatchNutrition)
    candidates.push({
      kind: 'meal',
      id: String(m._id),
      name: String(m.name ?? 'Meal'),
      servingSize: 1,
      servingUnit: 'meal',
      nutrition: tn,
      source: 'meal',
      confidence: 0.8,
      owned: !!m.createdBy && String(m.createdBy) === userId,
    })
  }

  // Recipes (recipe nutrition is per serving)
  for (const r of recipes) {
    const candWords = words(String(r.name ?? ''))
    if (coverage(content, candWords) < 1 && !subsetMatch(String(r.name ?? ''))) continue
    // Recipe macros live on `totalsPerServing` (per serving) — NOT `nutrition`.
    // Reading the wrong field made matched recipes adopt empty macros.
    candidates.push({
      kind: 'recipe',
      id: String(r._id),
      name: String(r.name ?? 'Recipe'),
      servingSize: 1,
      servingUnit: 'serving',
      nutrition: (r.totalsPerServing as MatchNutrition) || ({} as MatchNutrition),
      source: 'recipe',
      confidence: 0.8,
      owned: !!r.createdBy && String(r.createdBy) === userId,
    })
  }

  if (candidates.length === 0) return null

  // Best match: highest confidence, then kind priority (food > meal > recipe),
  // then shorter name (the simplest representative).
  const kindRank: Record<Kind, number> = { food: 0, meal: 1, recipe: 2 }
  candidates.sort((a, b) =>
    (Number(b.owned) - Number(a.owned)) ||   // the user's own saved items win
    b.confidence - a.confidence ||
    kindRank[a.kind] - kindRank[b.kind] ||
    a.name.length - b.name.length,
  )
  return candidates[0]
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    const items = Array.isArray(body?.items) ? body.items : null
    if (!items) {
      return NextResponse.json({ error: 'items[] is required' }, { status: 400 })
    }
    await dbConnect()

    // Cap the batch so a huge list can't hammer the DB.
    const capped = items.slice(0, 25) as Array<{ name?: string; brand?: string }>
    const matches = await Promise.all(
      capped.map((it) =>
        matchOne(String(it?.name ?? ''), it?.brand ? String(it.brand) : undefined, auth.userId!).catch(() => null),
      ),
    )

    return NextResponse.json({ matches })
  } catch (error) {
    console.error('Error matching foods:', error)
    return NextResponse.json({ error: 'Failed to match foods' }, { status: 500 })
  }
}
