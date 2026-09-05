import { NextRequest, NextResponse, after } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food, { IFood } from '@/models/Food'
import User from '@/models/User'
import { verifyAuth } from '@/lib/auth'
import { requireQuota } from '@/lib/entitlementGuards'
import { isVerifiedAdmin } from '@/lib/adminAuth'
import { searchUSDA } from '@/lib/usda'
import { stemMatch } from '@/lib/nutrition/foodMatch'
import {
  foodSearchIrrelevancePenalty,
  shouldSkipBackgroundImportForQuery,
  stripFoodQualifiers,
} from '@/lib/nutrition/foodQuality'
import type { IOpenFoodFact } from '@/models/OpenFoodFact'
import {
  flattenFoodForResponse,
  importManualFood,
  importFromUSDA,
  importFromOpenFoodFacts,
} from '@/lib/foodImport'
import { parseQuantityString, convert } from '@/lib/units'
import { plausibleOffKcal } from '@/lib/offEnergy'
import { synthMergeUsdaResults } from '@/lib/usdaSynthMerge'
import { dedupeBySource, type CustomFoodForDedupe } from '@/lib/foodSearchDedupe'
import { groupServingPenalty } from '@/lib/foodSearchServingWeight'
import { fetchUSDAFoodsBatch } from '@/lib/usdaBatchFetch'

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
    calories: plausibleOffKcal(n),
    protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
    carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
    fats: Math.round((n.fat_100g ?? 0) * 10) / 10,
    fiber: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : undefined,
    sugar: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : undefined,
    sodium: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) / 1000 : undefined,
    saturatedFat: n.saturated_fat_100g != null ? Math.round(n.saturated_fat_100g * 10) / 10 : undefined
  }

  // OFF's serving_quantity is unreliable — often parses "1" from "1 cup (240 ml)".
  // Prefer extracting actual grams from the serving_size text. When that text
  // is empty/unparseable but OFF set a serving_quantity + recognized
  // serving_unit, trust the quantity. Floor relaxed from 5g to 1g — the >=5
  // gate was filtering out tea bags, spices, single-bite snacks.
  const parsedGrams = extractGramsFromOffServing(off.serving_size)
  const offUnitNormalized = (off.serving_unit ?? '').toLowerCase().trim()
  const KNOWN_OFF_UNITS = new Set(['g', 'gram', 'grams', 'ml', 'oz', 'mlt', 'grm'])
  const sqFromText = (off.serving_size ?? '').trim() === ''
    && off.serving_quantity != null
    && KNOWN_OFF_UNITS.has(offUnitNormalized)
    ? off.serving_quantity
    : null
  const candidateGrams = parsedGrams ?? sqFromText ?? off.serving_quantity
  const actualGrams = candidateGrams && candidateGrams >= 1 ? candidateGrams : null

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
    // "Verified" = a food WE curated, not one mirrored from USDA/OpenFoodFacts.
    // Those upstream records are where the bad servings and self-contradicting
    // calories come from, so this is the escape hatch to a trusted subset.
    const verifiedOnly = searchParams.get('verifiedOnly') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Exclude foods explicitly hidden from search — a narrow flag set only on
    // entries with physically-impossible, unrecoverable source data (e.g. a
    // per-100 of 18000 cal) so a serving change can't expose the garbage value.
    // NOT the same as `needsReview`, which is a broad import-quality queue flag
    // on thousands of otherwise-fine foods. Spread into every query via baseFilter.
    const baseFilter: Record<string, unknown> = { hiddenFromSearch: { $ne: true } }
    if (category) baseFilter.category = category
    if (verifiedOnly) baseFilter.isVerified = true

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
        .sort({ isFirstClass: -1, usageCount: -1, _id: 1 })
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

    // Pull a generous candidate pool from our DB. The final ordering is decided
    // by the relevance/coverage ranking below — NOT by this fetch — so we must
    // surface enough candidates that a brand match (e.g. a "Fairlife" shake)
    // isn't crowded out of the top-N by high-usageCount generic foods before
    // ranking even runs. Was 5; that cap was dropping on-brand DB matches.
    const customLimit = 25

    const textFilter = { ...baseFilter, $text: { $search: q } }
    const textResults = await Food.find(textFilter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, isFirstClass: -1, usageCount: -1, _id: 1 })
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
      .sort({ isFirstClass: -1, usageCount: -1, _id: 1 })
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
    // Skipped entirely under verifiedOnly — nothing upstream is ours, so
    // querying it would only cost latency and then be filtered away.

    const usdaResults = verifiedOnly ? [] : await searchUSDA(q, 15)

    // --- 3. Open Food Facts (supplemental for packaged goods) ---

    let offFoods: ReturnType<typeof mapOffToFoodResult>[] = []
    if (!verifiedOnly) {
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
    }

    // Combine: our DB → USDA → OFF
    // Ranking: word coverage (across name + brand) wins first, then name simplicity,
    // then whole-food type as tiebreaker.
    //   "blueberries"        → "Blueberries, raw" beats "Blueberry Pancakes"
    //   "blueberries pancakes" → "Blueberry Pancakes" beats "Blueberries, raw"
    //   "jimmy dean english muffin" → coverage matches across name+brand so it surfaces
    const qLower = q.toLowerCase().trim()
    const qWords = qLower.split(/\s+/)

    // Stem match (shared with the vision reconcile) — see lib/nutrition/foodMatch.

    // How many of the query's words this result matches across name + brand.
    // Drives both the coverage ranking and the precision filter below.
    // "fairlife protein shake" → a Fairlife shake covers 3/3; a Quest shake
    // covers 2/3 (no "fairlife"), so it ranks (and filters) lower.
    function coveredCount(name: string, brand?: string): number {
      const searchableWords = ((name ?? '').toLowerCase() + ' ' + (brand ?? '').toLowerCase())
        .split(/[\s,]+/)
        .filter(Boolean)
      return qWords.filter(qw => searchableWords.some(sw => stemMatch(qw, sw))).length
    }

    // Whole-food data types get a small bonus over branded junk — tiebreaker between
    // equally-relevant external items only. Does NOT override our curated isFirstClass entries.
    const USDA_TYPE_BONUS: Record<string, number> = {
      'Foundation': -10,
      'SR Legacy': -5,
      'Survey (FNDDS)': 0,
      'Branded': 0,
    }

    function relevanceScore(name: string, brand?: string, dataType?: string): number {
      const nameLower = name.toLowerCase()
      const strippedLower = stripFoodQualifiers(nameLower).toLowerCase()
      const qualityPenalty = foodSearchIrrelevancePenalty(name, brand, qLower)

      // Exact match against the stripped name ("Apples, raw" → "apples" matches "apples"),
      // BUT only for non-Branded sources. Otherwise junk Branded entries like "KIWI"
      // or "APPLES" with no real product info would beat Foundation whole foods.
      // Tiebreak with full word count so "Bananas, raw" beats "Bananas, overripe, raw".
      if (dataType !== 'Branded' && strippedLower === qLower) {
        const fullWordCount = nameLower.split(/[\s,]+/).filter(Boolean).length
        return -1000 + (USDA_TYPE_BONUS[dataType ?? ''] ?? 0) + fullWordCount + qualityPenalty
      }

      // Coverage searches name + brand combined so "jimmy dean" matches Jimmy Dean
      // products even when "Jimmy Dean" only appears in the brand field.
      const covered = coveredCount(name, brand)
      const coverageScore = (qWords.length - covered) * 100

      // Length is computed on stripped name only (qualifiers removed) so
      // "Bananas, raw" doesn't get penalized for the ", raw" suffix.
      const lengthScore = strippedLower.split(/[\s,]+/).filter(Boolean).length

      const typeScore = USDA_TYPE_BONUS[dataType ?? ''] ?? 0
      return coverageScore + lengthScore + typeScore + qualityPenalty
    }

    // Tag external sources as never-saved so the frontend can render the bookmark
    // state uniformly. (Saved external foods would have been imported into our DB
    // and surface via customFoods above with isSaved:true.)
    //
    // Merged-variant dedup: USDA / OFF results whose external id matches any
    // *parent or variant* externalId on a Food we've already imported are
    // already represented in our DB — the parent owns them. Drop those from
    // the live external list so we don't show e.g. "Tea" + "Tea, hot, herbal"
    // + "Tea, hot, leaf, black" as three separate hits.
    //
    // We must seed the seen-set from the *full* match pool — not just the
    // top-N customFoods that fit on the displayed page — or a USDA dup whose
    // owning customFood ranks past the page cap will still leak through.
    // Light projection keeps this cheap; cap at 200 as a sanity guard.
    const DEDUPE_POOL_LIMIT = 200
    const dedupePool = await Food.find(regexFilter)
      .select('source externalId variants.externalId')
      .limit(DEDUPE_POOL_LIMIT)
      .lean<CustomFoodForDedupe[]>()

    // Always include the customFoods we already surfaced (saved-food splice
    // can push them past the pool's regex match in edge cases).
    const dedupeInput: CustomFoodForDedupe[] = [...customFoods, ...dedupePool]

    // Synthetic-merge the live USDA results before sending. This collapses
    // same-`groupKey` non-Branded entries (e.g. 10 separate "Beverages,
    // coffee, *" rows) into one consolidated synthetic entry with multiple
    // variants. The shape mirrors what the background-import + auto-merge
    // will produce server-side, so first-time searches don't show fragmented
    // lists. `additionalFdcIds` are the secondary members folded into a
    // synthetic primary — passed to the background queue so every member
    // gets imported (and merged into the same parent via importFromUSDA's
    // groupKey logic).
    //
    // synthMergeUsdaResults still needs the bare USDA-id set (it treats it
    // as "owned fdcIds we shouldn't fold into a synthetic primary"), so we
    // derive a flat fdcId set from the seenKeys returned by dedupeBySource.
    const { usda: dedupedUsda, off: dedupedOff, seenKeys } = dedupeBySource(
      dedupeInput,
      // Synth-merge happens AFTER initial filter; pass full USDA list with
      // synthetic _id placeholders. We re-filter the synth output below.
      usdaResults,
      offFoods,
    )
    const knownUsdaFdcIds = new Set<string>()
    for (const key of seenKeys) {
      if (key.startsWith('usda:')) knownUsdaFdcIds.add(key.slice('usda:'.length))
    }
    // Synthetic merge over the already-deduped USDA list, then re-dedupe in
    // case synth picked an fdcId we own as the primary. dedupedOff is final.
    const synth = synthMergeUsdaResults(dedupedUsda, knownUsdaFdcIds)
    const usdaWithFlag = synth.entries
      .filter(r => {
        const fdcId = typeof r._id === 'string' && r._id.startsWith('usda-')
          ? r._id.slice('usda-'.length)
          : ''
        if (!fdcId) return true
        return !knownUsdaFdcIds.has(fdcId)
      })
      .map(r => ({ ...r, isSaved: false }))
    const offWithFlag = dedupedOff.map(r => ({ ...r, isSaved: false }))

    const combined = [...customFoods, ...usdaWithFlag, ...offWithFlag]

    // "From our DB" test — saved/curated foods and anything already imported
    // (ObjectId _id, not a synthetic "usda-"/"off-" id). Used only as a
    // tie-breaker now, NOT the primary sort key.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function fromOurDb(x: any): boolean {
      return x.source !== 'usda' && x.source !== 'openfoodfacts'
        ? true
        : typeof x._id !== 'string' || (!x._id.startsWith?.('usda-') && !x._id.startsWith?.('off-'))
    }

    // Score once: how many query words each result covers, its full relevance
    // (coverage + name simplicity + whole-food bonus), and a source rank used
    // only to break ties between equally-relevant results.
    //
    // isFirstClass items (our admin-curated essentials) get a large negative bonus
    // so they always surface above any USDA / OFF external result for the same query.
    // Without this, USDA Foundation/SR-Legacy type bonuses (-10/-5) make items like
    // "Fat, beef tallow" rank above "Ground Beef 85/15" for a "beef" search.
    // groupServingPenalty softly demotes bulk/group servings (a 2 L bottle, a
    // family-size bag) so a normal individual serving of the same food wins the
    // top slot / Best Match. Capped well under a coverage step so relevance still
    // dominates and normal foods stay at 0.
    const scored = combined.map(item => ({
      item,
      covered: coveredCount(item.name, item.brand),
      // Hard tier, ABOVE relevance: a food we curated and verified outranks any
      // mirrored USDA/OFF record, always. The old `src` rank expressed this
      // intent but only as a tie-break on EXACT relevance equality, which a
      // continuous score essentially never produces — so in practice an
      // upstream record with a shorter name beat our own entry every time
      // ("Chicken" over "Chicken Breast"). The -500 isFirstClass bonus had the
      // same weakness: a bonus competes with relevance, a tier does not.
      //
      // Safe because the precision filter runs FIRST: when the query fully
      // matches something, non-matching results are already gone, so this can
      // only reorder genuine candidates. It never lifts an unrelated verified
      // food above a precise brand match.
      // Saved ("My Foods") outranks even verified, per user: a food you
      // deliberately saved is the one you meant, so it belongs at the top of
      // YOUR results. Verified is the floor under everything else.
      tier: item.isSaved === true ? 0 : item.isVerified === true ? 1 : 2,
      rel: relevanceScore(item.name, item.brand, item.dataType)
        - (item.isFirstClass ? 500 : 0)
        + groupServingPenalty(item),
      src: item.isSaved ? -1 : fromOurDb(item) ? 0 : item.source === 'usda' ? 1 : 2,
    }))

    // Precision filter (the MyFitnessPal behavior): when the query names a
    // specific food and at least one result matches ALL its words, hide the
    // results that don't. So "Fairlife protein shake" returns Fairlife shakes —
    // not every protein shake in the catalog. This only triggers on a full
    // match (maxCovered === every query word); a typo or partial query that
    // matches nothing fully falls back to best-effort ranking instead of an
    // empty list. Source no longer lets a generic in-DB food outrank a more
    // relevant external brand match.
    let kept = scored
    // True when the query fully matches at least one result — drives both the
    // precision filter and the "Best Match" badge (we only crown a top result
    // when we're confident it IS the food searched for, not a fuzzy fallback).
    let hasFullMatch = false
    if (qWords.length >= 1 && combined.length > 0) {
      const maxCovered = scored.reduce((m, s) => Math.max(m, s.covered), 0)
      if (maxCovered === qWords.length && maxCovered > 0) {
        hasFullMatch = true
        const precise = scored.filter(s => s.covered === maxCovered)
        if (precise.length > 0) kept = precise
      }
    }

    // Saved first, then verified, then relevance-dominant ordering within each
    // tier, with
    // source (saved → our DB → USDA → OFF) breaking remaining ties.
    //
    // The last two keys exist because relevance does NOT separate a set of
    // equally-shaped names: "Chicken Breast", "Chicken Thigh", "Chicken
    // Nuggets" and "Fried Chicken" all cover the query "chicken" with the same
    // word count, so they scored identically and the order came out ARBITRARY —
    // literally a different chicken on top between two runs of the same query.
    // Falling through to usage and then to the name makes it deterministic, and
    // prefers the food people actually log over an incidental one.
    kept.sort((a, b) =>
      a.tier !== b.tier
        ? a.tier - b.tier
        : a.rel !== b.rel
          ? a.rel - b.rel
          : a.src !== b.src
            ? a.src - b.src
            : (b.item.usageCount ?? 0) !== (a.item.usageCount ?? 0)
              ? (b.item.usageCount ?? 0) - (a.item.usageCount ?? 0)
              : String(a.item.name ?? '').localeCompare(String(b.item.name ?? '')),
    )

    const sortedFoods = kept.map(s => s.item)
    const paged = sortedFoods.slice(offset, offset + limit)

    // Best Match: crown the single top result on the first page when the query
    // confidently matches it (the frontend renders a "Best Match" badge).
    // Because we dedupe + rank across our DB + USDA + OFF first, this points at
    // the best single representative of the food across all sources.
    if (q && offset === 0 && hasFullMatch && paged.length > 0) {
      paged[0] = { ...paged[0], isBestMatch: true }
    }

    // Background auto-import: every external result returned to the client
    // that's not already in our DB gets persisted asynchronously via
    // `after()`. The user gets the response immediately; the import runs
    // after the response is sent. Idempotent — `importFromUSDA` /
    // `importFromOpenFoodFacts` short-circuit on `findOne({ source,
    // externalId })`, so re-running the same query is a no-op DB-wise.
    //
    // We also queue `synth.additionalFdcIds` — the secondary members folded
    // into synthetic primaries. Without this, only the synthetic primary's
    // fdcId would be imported and the persisted Food doc wouldn't end up
    // with the same variant set the user just saw. importFromUSDA's
    // groupKey-based merge logic ensures these all land on the same parent.
    const extraFdcIds = synth.additionalFdcIds
    after(() => backgroundImportExternals(paged, authResult.userId, extraFdcIds, q))

    return NextResponse.json({ foods: paged, total: sortedFoods.length, offset, limit })
  } catch (error) {
    console.error('Error searching foods:', error)
    return NextResponse.json({ error: 'Failed to search foods' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Background auto-import — promise-pool concurrency cap of 5
// ---------------------------------------------------------------------------

/** Concurrency cap for background import work. Avoids hammering USDA + OFF
 * from a single user search; 5 is enough to clear a 30-result page in 2-3
 * batched waves. */
const BG_IMPORT_CONCURRENCY = 5

interface BackgroundImportItem {
  _id?: unknown
  source?: string
  name?: string
  brand?: string
  barcode?: string
}

/**
 * Schedule background imports for external (`usda-XXX` / `off-XXX`) results.
 * Runs after the response has been sent. All errors are swallowed and
 * logged — a failed import must NOT cause the user-facing search to fail.
 *
 * Notes:
 *  - USDA imports are pre-fetched in a single batched `POST /v1/foods` call
 *    (chunked at 20 per USDA's documented cap) via `fetchUSDAFoodsBatch`.
 *    Each `importFromUSDA` then runs with the cached detail payload — zero
 *    additional HTTP round-trips. Previously this loop fired one
 *    `GET /v1/food/{id}` per fdcId (up to ~10 per typical search).
 *  - Items already imported (their `_id` is an ObjectId, not a synthetic
 *    string) are skipped here.
 *  - `extraFdcIds` are USDA fdcIds NOT directly returned to the client —
 *    typically the secondary members folded into a synth-merged entry.
 *    importFromUSDA's groupKey logic merges them onto the same parent the
 *    user saw, so the persisted shape matches the response shape.
 */
async function backgroundImportExternals(
  results: BackgroundImportItem[],
  userId?: string,
  extraFdcIds: string[] = [],
  query = '',
): Promise<void> {
  // Collect every USDA fdcId we need to import; one set so the batch fetch
  // covers both primary results and synth-merge secondaries with no dup
  // HTTP work.
  const usdaFdcIds: string[] = []
  const offCodes: string[] = []
  const seenFdcIds = new Set<string>()

  for (const r of results) {
    const id = typeof r._id === 'string' ? r._id : ''
    if (!id) continue
    if (id.startsWith('usda-')) {
      if (shouldSkipBackgroundImportForQuery(r, query)) continue
      const fdcId = id.slice('usda-'.length)
      if (!fdcId || seenFdcIds.has(fdcId)) continue
      seenFdcIds.add(fdcId)
      usdaFdcIds.push(fdcId)
    } else if (id.startsWith('off-')) {
      if (shouldSkipBackgroundImportForQuery(r, query)) continue
      const code = id.slice('off-'.length)
      if (!code) continue
      offCodes.push(code)
    }
  }
  for (const fdcId of extraFdcIds) {
    if (!fdcId || seenFdcIds.has(fdcId)) continue
    seenFdcIds.add(fdcId)
    usdaFdcIds.push(fdcId)
  }

  // Batched USDA detail fetch — one POST per ≤20 fdcIds (vs N GETs before).
  // Errors per id are passed through in the result map; importFromUSDA is
  // skipped for those (logged below).
  const usdaBatch = usdaFdcIds.length > 0
    ? await fetchUSDAFoodsBatch(usdaFdcIds)
    : new Map()

  const queue: Array<() => Promise<void>> = []

  for (const fdcId of usdaFdcIds) {
    const entry = usdaBatch.get(fdcId)
    if (entry instanceof Error) {
      console.warn(`bg-import USDA fdcId=${fdcId} batch-fetch failed: ${entry.message}`)
      continue
    }
    if (!entry) continue
    queue.push(async () => {
      try {
        await importFromUSDA(fdcId, userId, entry)
      } catch (err) {
        console.warn(`bg-import USDA fdcId=${fdcId} failed:`, err instanceof Error ? err.message : String(err))
      }
    })
  }

  for (const code of offCodes) {
    queue.push(async () => {
      try {
        await importFromOpenFoodFacts(code, userId)
      } catch (err) {
        console.warn(`bg-import OFF code=${code} failed:`, err instanceof Error ? err.message : String(err))
      }
    })
  }

  if (queue.length === 0) return

  // Simple promise pool — N workers each pull tasks off the shared queue.
  // No external dep, no fancy backpressure; we just want a hard cap on
  // concurrent external HTTP calls.
  let cursor = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= queue.length) return
      await queue[i]()
    }
  }
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(BG_IMPORT_CONCURRENCY, queue.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------
// POST: Create a custom food in our DB
//
// Quota-gated (free tier: 3 authored foods, counted live). The count reads
// `Food.authoredBy`, which ONLY the gated create surfaces stamp — this route
// and the two save-as-food routes.
//
// It cannot read `{ source: 'manual', createdBy }` instead: POST
// /api/nutrition/foods/import also accepts `source: 'manual'`, and it plus the
// barcode scanner's live-OpenFoodFacts path materialise a search hit through
// importManualFood so it can be LOGGED. Both must stay ungated or free members
// lose food logging entirely, so both would otherwise be a way around this
// quota AND a way to burn it on rows the member never authored.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const quota = await requireQuota(request, 'custom-foods')
    if (!quota.ok) return quota.response

    const body = await request.json()

    if (!body.name || !body.category) {
      return NextResponse.json({ error: 'Missing required fields: name, category' }, { status: 400 })
    }

    await dbConnect()

    // Confirmed against the database: the token claim alone would let a demoted
    // admin keep minting first-class catalog rows for the life of their
    // session. Resolved before the import because it also decides whether
    // `body.barcode` is honoured.
    const isAdmin = await isVerifiedAdmin(authResult)

    // `authored: true` is what makes the row count against the quota checked
    // above. It is passed here, never read from `body` — a client that could
    // omit it would create uncounted foods forever.
    //
    // `trustedBarcode` is the same idea for `body.barcode`: the barcode is a
    // unique global key that GET /api/nutrition/foods/barcode resolves ahead of
    // OpenFoodFacts and USDA, so a member who could set it here would own every
    // scan of that real product. Dropped for members, kept for admins.
    const { food, created } = await importManualFood(body, authResult.userId, {
      authored: true,
      trustedBarcode: isAdmin,
    })

    // Admins may upgrade isVerified / isFirstClass / usageCount.
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
