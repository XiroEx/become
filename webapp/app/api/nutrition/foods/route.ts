import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food, { IFood } from '@/models/Food'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { searchUSDA } from '@/lib/usda'
import type { IOpenFoodFact } from '@/models/OpenFoodFact'
import { flattenFoodForResponse, importManualFood } from '@/lib/foodImport'
import { parseQuantityString, convert } from '@/lib/units'

// ---------------------------------------------------------------------------
// Map an OpenFoodFact document to the same shape as a flattened Food
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around `parseQuantityString` — extracts a gram value from a
 * freeform OFF `serving_size` string ("240 g", "1 cup (240 g)", "8 oz").
 * Returns null when the parsed unit is volume/discrete (no honest g equivalent
 * without a density bridge). Behavior is at least as permissive as the
 * previous regex implementation.
 *
 * `parseQuantityString` only sees a single number+unit, so for parenthesized
 * forms ("1 cup (240 g)") we also try the inner-paren substring as a fallback.
 */
function extractGramsFromOffServing(text?: string): number | null {
  if (!text) return null
  const tryParse = (s: string): number | null => {
    const parsed = parseQuantityString(s)
    if (!parsed) return null
    if (parsed.unit === 'g' || parsed.unit === 'oz' || parsed.unit === 'lb') {
      return convert(parsed.value, parsed.unit, 'g')
    }
    return null
  }
  // Direct: "240 g", "8 oz"
  const direct = tryParse(text)
  if (direct != null) return direct
  // Parenthesized: "1 cup (240 g)" → try the contents of any parens.
  const parenMatches = text.match(/\(([^)]+)\)/g)
  if (parenMatches) {
    for (const p of parenMatches) {
      const inner = p.slice(1, -1).trim()
      const v = tryParse(inner)
      if (v != null) return v
    }
  }
  return null
}

function mapOffToFoodResult(off: IOpenFoodFact & { _id: mongoose.Types.ObjectId }) {
  const n = off.nutriments

  const nutrition = {
    calories: Math.round(n.energy_kcal_100g) || 0,
    protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
    fats: Math.round((n.fat_100g ?? 0) * 10) / 10,
    fiber: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : undefined,
    sugar: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : undefined,
    sodium: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) / 1000 : undefined,
    saturatedFat: n.saturated_fat_100g != null ? Math.round(n.saturated_fat_100g * 10) / 10 : undefined
  }

  // OFF's serving_quantity is unreliable — often parses "1" from "1 cup (240 ml)".
  // Prefer extracting actual grams from the serving_size text.
  const parsedGrams = extractGramsFromOffServing(off.serving_size)
  const candidateGrams = parsedGrams ?? off.serving_quantity
  const actualGrams = candidateGrams && candidateGrams >= 5 ? candidateGrams : null

  // Preserve the source unit when liquid — ml ≠ g (oils ~0.92, honey ~1.4).
  const isLiquid = off.serving_unit === 'ml' || /\bml\b|millilitre/i.test(off.serving_size || '')
  const unit: 'g' | 'ml' = isLiquid ? 'ml' : 'g'

  const alternateServings: { label: string; multiplier: number }[] = []
  if (actualGrams && actualGrams !== 100) {
    const label = off.serving_size || `${Math.round(actualGrams)} ${unit}`
    alternateServings.push({ label, multiplier: actualGrams / 100 })
  }

  return {
    _id: `off-${off.code}`,
    name: off.product_name,
    brand: off.brands || undefined,
    category: off.category || 'Other',
    servingSize: 100,
    servingUnit: unit,
    displayLabel: actualGrams ? off.serving_size || undefined : undefined,
    alternateServings,
    nutrition,
    barcode: off.code,
    source: 'openfoodfacts' as const,
    image_url: off.image_url || undefined,
    nutriscore_grade: off.nutriscore_grade || undefined
  }
}

type FoodLean = IFood & { _id: mongoose.Types.ObjectId }

// ---------------------------------------------------------------------------
// GET: Search foods — our DB first, then USDA + OFF (external sources)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const category = searchParams.get('category')
    const customOnly = searchParams.get('custom') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const baseFilter: Record<string, unknown> = {}
    if (category) baseFilter.category = category

    // Fetch the user's saved-food id set once per request — used to flag results
    // and to bump them above other "from our DB" foods in the combined ranking.
    const savedFoodIdSet = new Set<string>()
    try {
      const userDoc = await User.findById(authResult.userId)
        .select('savedFoods')
        .lean<{ savedFoods?: { foodId: mongoose.Types.ObjectId; savedAt: Date }[] } | null>()
      for (const s of userDoc?.savedFoods ?? []) {
        if (s?.foodId) savedFoodIdSet.add(s.foodId.toString())
      }
    } catch {
      // Saved-food lookup is best-effort — search still works without it.
    }

    if (!q) {
      const foods = await Food.find(baseFilter)
        .sort({ isFirstClass: -1, usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean<FoodLean[]>()

      const total = await Food.countDocuments(baseFilter)
      return NextResponse.json({
        foods: foods.map(f => ({
          ...flattenFoodForResponse(f),
          source: f.source || 'manual',
          isSaved: savedFoodIdSet.has(f._id.toString()),
        })),
        total,
        offset,
        limit,
      })
    }

    // --- 1. Our DB foods (always first) ---

    const customLimit = 5

    const textFilter = { ...baseFilter, $text: { $search: q } }
    const textResults = await Food.find(textFilter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, isFirstClass: -1, usageCount: -1 })
      .limit(customLimit)
      .lean<FoodLean[]>()

    const regexFilter = {
      ...baseFilter,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } },
        { aliases: { $regex: q, $options: 'i' } },
      ],
    }
    const regexResults = await Food.find(regexFilter)
      .sort({ isFirstClass: -1, usageCount: -1 })
      .limit(customLimit)
      .lean<FoodLean[]>()

    const seenIds = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customFoods: any[] = []

    for (const item of textResults) {
      const id = item._id.toString()
      if (!seenIds.has(id)) {
        seenIds.add(id)
        customFoods.push({
          ...flattenFoodForResponse(item),
          source: item.source || 'manual',
          isSaved: savedFoodIdSet.has(id),
        })
      }
    }
    for (const item of regexResults) {
      const id = item._id.toString()
      if (!seenIds.has(id) && customFoods.length < customLimit) {
        seenIds.add(id)
        customFoods.push({
          ...flattenFoodForResponse(item),
          source: item.source || 'manual',
          isSaved: savedFoodIdSet.has(id),
        })
      }
    }

    // Pull in any of the user's saved foods that match the query but didn't
    // surface in the top-N text/regex results. Saved foods always belong above
    // the fold for relevance — we splice them in even outside the customLimit.
    if (savedFoodIdSet.size > 0) {
      const savedFilter: Record<string, unknown> = {
        ...baseFilter,
        _id: { $in: Array.from(savedFoodIdSet).map(s => new mongoose.Types.ObjectId(s)) },
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { brand: { $regex: q, $options: 'i' } },
          { aliases: { $regex: q, $options: 'i' } },
        ],
      }
      const savedMatches = await Food.find(savedFilter).lean<FoodLean[]>()
      for (const item of savedMatches) {
        const id = item._id.toString()
        if (!seenIds.has(id)) {
          seenIds.add(id)
          customFoods.push({
            ...flattenFoodForResponse(item),
            source: item.source || 'manual',
            isSaved: true,
          })
        }
      }
    }

    if (customOnly) {
      return NextResponse.json({ foods: customFoods, total: customFoods.length, offset, limit })
    }

    // --- 2. USDA (primary external source) ---

    const usdaResults = await searchUSDA(q, 15)

    // --- 3. Open Food Facts (supplemental for packaged goods) ---

    let offFoods: ReturnType<typeof mapOffToFoodResult>[] = []
    try {
      const offCollection = mongoose.connection.db!.collection('openfoodfacts')
      const offFilter: Record<string, unknown> = { $text: { $search: q } }
      if (category) offFilter.category = category

      const offResults = await offCollection
        .find(offFilter, { projection: { score: { $meta: 'textScore' } } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(15)
        .toArray() as unknown as (IOpenFoodFact & { _id: mongoose.Types.ObjectId })[]

      offFoods = offResults.map(mapOffToFoodResult)
    } catch {
      // OFF collection might not exist — fail gracefully
    }

    // Combine: our DB → USDA → OFF
    // Ranking: word coverage (across name + brand) wins first, then name simplicity,
    // then whole-food type as tiebreaker.
    //   "blueberries"        → "Blueberries, raw" beats "Blueberry Pancakes"
    //   "blueberries pancakes" → "Blueberry Pancakes" beats "Blueberries, raw"
    //   "jimmy dean english muffin" → coverage matches across name+brand so it surfaces
    const qLower = q.toLowerCase().trim()
    const qWords = qLower.split(/\s+/)

    // Stem match: share a common prefix of up to 5 chars (handles plurals, conjugations)
    function stemMatch(qw: string, nw: string): boolean {
      const len = Math.min(qw.length, nw.length, 5)
      if (len < 3) return qw === nw
      return qw.slice(0, len) === nw.slice(0, len)
    }

    // Strip trailing prep/state qualifiers ("Bananas, raw" → "Bananas") for length scoring.
    // Display name is unaffected — this only counts words for ranking.
    const QUALIFIER_PATTERN = /,\s*(raw|cooked|boiled|roasted|baked|grilled|fried|steamed|sauteed|shelled|peeled|whole|fresh|dried|canned|frozen|with skin|without skin|with salt|without salt|unsweetened|sweetened|enriched|unenriched|fortified)\b.*$/i
    function stripQualifiers(name: string): string {
      return name.replace(QUALIFIER_PATTERN, '').trim()
    }

    // Whole-food data types get a small bonus — tiebreaker, not overriding coverage
    const USDA_TYPE_BONUS: Record<string, number> = {
      'Foundation': -10,
      'SR Legacy': -5,
      'Survey (FNDDS)': 0,
      'Branded': 0,
    }

    function relevanceScore(name: string, brand?: string, dataType?: string): number {
      const nameLower = name.toLowerCase()
      const strippedLower = stripQualifiers(nameLower).toLowerCase()

      // Exact match against the stripped name ("Apples, raw" → "apples" matches "apples"),
      // BUT only for non-Branded sources. Otherwise junk Branded entries like "KIWI"
      // or "APPLES" with no real product info would beat Foundation whole foods.
      // Tiebreak with full word count so "Bananas, raw" beats "Bananas, overripe, raw".
      if (dataType !== 'Branded' && strippedLower === qLower) {
        const fullWordCount = nameLower.split(/[\s,]+/).filter(Boolean).length
        return -1000 + (USDA_TYPE_BONUS[dataType ?? ''] ?? 0) + fullWordCount
      }

      // Coverage searches name + brand combined so "jimmy dean" matches Jimmy Dean
      // products even when "Jimmy Dean" only appears in the brand field.
      const searchableWords = (nameLower + ' ' + (brand ?? '').toLowerCase())
        .split(/[\s,]+/)
        .filter(Boolean)
      const covered = qWords.filter(qw => searchableWords.some(sw => stemMatch(qw, sw))).length
      const coverageScore = (qWords.length - covered) * 100

      // Length is computed on stripped name only (qualifiers removed) so
      // "Bananas, raw" doesn't get penalized for the ", raw" suffix.
      const lengthScore = strippedLower.split(/[\s,]+/).filter(Boolean).length

      const typeScore = USDA_TYPE_BONUS[dataType ?? ''] ?? 0
      return coverageScore + lengthScore + typeScore
    }

    // Tag external sources as never-saved so the frontend can render the bookmark
    // state uniformly. (Saved external foods would have been imported into our DB
    // and surface via customFoods above with isSaved:true.)
    const usdaWithFlag = usdaResults.map(r => ({ ...r, isSaved: false }))
    const offWithFlag = offFoods.map(r => ({ ...r, isSaved: false }))

    const combined = [...customFoods, ...usdaWithFlag, ...offWithFlag]
    combined.sort((a, b) => {
      // Source priority: saved (-1) > our DB (0) > usda (1) > off (2)
      // Anything sourced from our Food collection (manual/usda/off-imported) ranks first.
      const aFromOurDb = a.source !== 'usda' && a.source !== 'openfoodfacts'
        ? true
        // Imported foods that came from our DB will have an ObjectId _id (not "usda-..." / "off-...")
        : typeof a._id !== 'string' || (!a._id.startsWith?.('usda-') && !a._id.startsWith?.('off-'))
      const bFromOurDb = b.source !== 'usda' && b.source !== 'openfoodfacts'
        ? true
        : typeof b._id !== 'string' || (!b._id.startsWith?.('usda-') && !b._id.startsWith?.('off-'))

      const srcA = a.isSaved ? -1 : aFromOurDb ? 0 : a.source === 'usda' ? 1 : 2
      const srcB = b.isSaved ? -1 : bFromOurDb ? 0 : b.source === 'usda' ? 1 : 2
      if (srcA !== srcB) return srcA - srcB
      return relevanceScore(a.name, a.brand, a.dataType) - relevanceScore(b.name, b.brand, b.dataType)
    })

    const paged = combined.slice(offset, offset + limit)

    return NextResponse.json({ foods: paged, total: combined.length, offset, limit })
  } catch (error) {
    console.error('Error searching foods:', error)
    return NextResponse.json({ error: 'Failed to search foods' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST: Create a custom food in our DB
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.name || !body.category) {
      return NextResponse.json({ error: 'Missing required fields: name, category' }, { status: 400 })
    }

    await dbConnect()

    const { food, created } = await importManualFood(body, authResult.userId)

    // Admins may upgrade isVerified / isFirstClass / usageCount
    const isAdmin = authResult.role === 'admin'
    if (isAdmin) {
      const updates: Record<string, unknown> = {}
      if (typeof body.isVerified === 'boolean') updates.isVerified = body.isVerified
      if (typeof body.isFirstClass === 'boolean') updates.isFirstClass = body.isFirstClass
      if (typeof body.usageCount === 'number') updates.usageCount = body.usageCount
      if (Object.keys(updates).length > 0) {
        await Food.updateOne({ _id: food._id }, { $set: updates })
      }
    }

    return NextResponse.json({ success: true, food, created }, { status: created ? 201 : 200 })
  } catch (error) {
    console.error('Error creating food item:', error)
    const msg = error instanceof Error ? error.message : 'Failed to create food'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
