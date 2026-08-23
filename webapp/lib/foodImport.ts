import mongoose from 'mongoose'
import Food, { IFood, IFoodVariant, FoodCategory, ServingUnit } from '@/models/Food'
import OpenFoodFact, { IOpenFoodFact } from '@/models/OpenFoodFact'
import { fetchUSDAById, mapUSDAFood, MappedFoodResult, USDAFood, USDAFoodPortion } from '@/lib/usda'
import { baseSlug, generateUniqueFoodSlug } from '@/lib/foodSlug'
import { parseQuantityString, convert, familyOf } from '@/lib/units'
import { baseGroupKey } from '@/lib/foodGrouping'
import { canonicalFoodName } from '@/lib/foodCanonicalName'
import { canAutoMergeAsVariant, type VariantMergeParent, type VariantMergeCandidate } from '@/lib/foodVariantMerge'
import {
  computeAutomaticReviewState,
  isAutomaticReviewOwned,
  type FoodForReview,
} from '@/lib/foodReview'
import { plausibleOffKcal } from '@/lib/offEnergy'
import { assessFoodImportQuality, foodQualityErrorMessage } from '@/lib/nutrition/foodQuality'

const VALID_CATEGORIES: FoodCategory[] = [
  'Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy',
  'Fat', 'Beverage', 'Condiment', 'Snack', 'Other',
]

const VALID_SERVING_UNITS: ServingUnit[] = [
  'g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop', 'serving',
]

export function coerceCategory(c: string | undefined): FoodCategory {
  if (c && (VALID_CATEGORIES as string[]).includes(c)) return c as FoodCategory
  return 'Other'
}

export function coerceServingUnit(u: string | undefined): ServingUnit {
  if (!u) return 'g'
  const lower = u.toLowerCase()
  if ((VALID_SERVING_UNITS as string[]).includes(lower)) return lower as ServingUnit
  // Common synonyms
  if (lower === 'gram' || lower === 'grams' || lower === 'gr') return 'g'
  if (lower === 'ounce' || lower === 'ounces') return 'oz'
  if (lower === 'milliliter' || lower === 'milliliters' || lower === 'mls') return 'ml'
  if (lower === 'tablespoon' || lower === 'tablespoons') return 'tbsp'
  if (lower === 'teaspoon' || lower === 'teaspoons') return 'tsp'
  return 'g'
}

// ---------------------------------------------------------------------------
// Build a single-variant Food doc shape from a MappedFoodResult / external food
// ---------------------------------------------------------------------------

function buildVariantFromMapped(
  mapped: MappedFoodResult,
  variantName: string,
): IFoodVariant {
  return {
    name: variantName,
    isDefault: true,
    servingSize: mapped.servingSize,
    servingUnit: coerceServingUnit(mapped.servingUnit),
    displayLabel: mapped.displayLabel,
    alternateServings: mapped.alternateServings ?? [],
    nutrition: mapped.nutrition,
    gramsPerServing: mapped.gramsPerServing,
    mlPerServing: mapped.mlPerServing,
  }
}

// ---------------------------------------------------------------------------
// Variant-merging helpers
// ---------------------------------------------------------------------------

/**
 * Hard cap on how many variants a single Food doc may carry. Beyond this
 * the picker UI gets unwieldy and the doc gets bloated. New auto-merge
 * candidates falling on a capped parent are written as standalone foods
 * (siblings) instead.
 */
export const MAX_VARIANTS_PER_FOOD = 12

/**
 * Cap on aliases — original USDA descriptions accumulate here when variants
 * are merged into a parent. Without a cap, a popular groupKey (eg "tea")
 * could collect dozens of strings.
 */
const MAX_ALIASES = 30

/**
 * Pull the default variant's macros from a Food doc so the variant-merge
 * helper can compare nutrient profiles. Returns null if no usable shape.
 */
function extractFoodNutritionProfile(food: IFood) {
  const v = Array.isArray(food.variants) ? food.variants.find(x => x.isDefault) ?? food.variants[0] : null
  if (!v?.nutrition) return null
  const n = v.nutrition
  return {
    calories: typeof n.calories === 'number' ? n.calories : null,
    protein: typeof n.protein === 'number' ? n.protein : null,
    carbs: typeof n.carbs === 'number' ? n.carbs : null,
    fats: typeof n.fats === 'number' ? n.fats : null,
  }
}

/**
 * Pull macros from a freshly mapped USDA / OFF result for use as the
 * candidate side of `canAutoMergeAsVariant`.
 */
function extractMappedNutritionProfile(mapped: MappedFoodResult) {
  if (!mapped.nutrition) return null
  const n = mapped.nutrition
  return {
    calories: typeof n.calories === 'number' ? n.calories : null,
    protein: typeof n.protein === 'number' ? n.protein : null,
    carbs: typeof n.carbs === 'number' ? n.carbs : null,
    fats: typeof n.fats === 'number' ? n.fats : null,
  }
}

/**
 * Derive a tidy variant name from a USDA description and the parent food's
 * name. The intent is to put the *qualifier* into the variant name so the
 * picker reads naturally:
 *
 *   parent="Tea", desc="Tea, hot, herbal"    → "Hot, herbal"
 *   parent="Tea", desc="Tea, iced, bottled"  → "Iced, bottled"
 *   parent="Eggs", desc="Eggs, scrambled"    → "Scrambled"
 *
 * If the description doesn't start with the parent name, fall back to using
 * the cleaned description verbatim (capped). If nothing usable remains,
 * returns 'Default' — caller must dedupe.
 */
export function deriveVariantName(description: string, parentName: string): string {
  const desc = (description ?? '').trim()
  const parent = (parentName ?? '').trim()
  if (!desc) return 'Default'

  let work = desc
  // "Tea, hot, herbal" with parent "Tea" → "hot, herbal"
  // "Tea hot, herbal" with parent "Tea"  → "hot, herbal"
  if (parent && desc.toLowerCase().startsWith(parent.toLowerCase())) {
    work = desc.slice(parent.length).trim()
    // Strip leading separator (comma or space)
    work = work.replace(/^[,\s]+/, '').trim()
  }

  // Collapse whitespace + repeated separators
  work = work
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim()

  if (!work) return 'Default'

  // Capitalize the first letter of each comma-separated segment so the
  // picker reads cleanly without going noisy with full title-casing.
  const titled = work
    .split(',')
    .map(s => {
      const t = s.trim()
      if (!t) return ''
      return t.charAt(0).toUpperCase() + t.slice(1)
    })
    .filter(Boolean)
    .join(', ')

  // Cap at 60 chars; ellipsize beyond.
  if (titled.length > 60) return titled.slice(0, 57) + '...'
  return titled
}

/**
 * Ensure `candidateName` doesn't collide with any name in `existingNames`.
 * If it does, suffix " (2)", " (3)", etc. Avoids picker confusion when two
 * distinct USDA entries happen to flatten to the same variant name.
 */
function dedupeVariantName(existingNames: string[], candidateName: string): string {
  const existing = new Set(existingNames.map(n => n.toLowerCase()))
  if (!existing.has(candidateName.toLowerCase())) return candidateName
  for (let n = 2; n < 100; n++) {
    const next = `${candidateName} (${n})`
    if (!existing.has(next.toLowerCase())) return next
  }
  // Pathological — fall back to a uniq suffix.
  return `${candidateName} (${Date.now() % 10000})`
}


// ---------------------------------------------------------------------------
// USDA foodPortions enrichment
// ---------------------------------------------------------------------------

/**
 * Heuristic: identify a portion that describes a household measure (cup,
 * tbsp, slice, piece, medium, etc.) versus a raw gram weight or a metric
 * conversion. We prefer household measures for the primary serving because
 * "1 cup" is more useful to a logger than "240 g".
 */
const HOUSEHOLD_MEASURE_KEYWORDS = [
  'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons',
  'tsp', 'teaspoon', 'teaspoons',
  'piece', 'pieces', 'slice', 'slices',
  'medium', 'large', 'small',
  'serving', 'servings', 'each',
  'fl oz', 'fluid ounce', 'fluid ounces',
  'package', 'container', 'bottle', 'can', 'cookie', 'cookies',
  'bar', 'bars', 'patty', 'patties', 'fillet', 'fillets',
  'wing', 'wings', 'leg', 'thigh', 'breast', 'drumstick',
  'whole', 'half', 'quarter',
  'pint', 'quart', 'gallon',
  'scoop', 'scoops', 'pat', 'pats', 'sheet', 'sheets',
]

function describesHousehold(p: USDAFoodPortion): boolean {
  const text = `${p.modifier ?? ''} ${p.portionDescription ?? ''}`.toLowerCase()
  if (!text.trim()) return false
  return HOUSEHOLD_MEASURE_KEYWORDS.some(kw => text.includes(kw))
}

function portionLabel(p: USDAFoodPortion): string {
  const desc = p.portionDescription?.trim()
  const mod = p.modifier?.trim()
  // "1 medium" + portionDescription "Banana" → "1 medium banana"; but USDA
  // commonly puts the noun in modifier and amount + descriptor in
  // portionDescription. Combine in the way that reads naturally.
  if (desc && /^\d/.test(desc)) {
    // portionDescription already starts with a number — use it verbatim.
    if (mod && !desc.toLowerCase().includes(mod.toLowerCase())) {
      return `${desc} ${mod}`.trim()
    }
    return desc
  }
  const amt = typeof p.amount === 'number' ? p.amount : null
  if (amt != null && mod) return `${formatAmount(amt)} ${mod}`.trim()
  if (amt != null && desc) return `${formatAmount(amt)} ${desc}`.trim()
  if (mod) return mod
  if (desc) return desc
  return `${p.gramWeight} g`
}

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n)
  if (Math.abs(n - 0.5) < 0.001) return '½'
  if (Math.abs(n - 0.25) < 0.001) return '¼'
  if (Math.abs(n - 0.75) < 0.001) return '¾'
  if (Math.abs(n - 1.5) < 0.001) return '1½'
  return String(Math.round(n * 100) / 100)
}

/**
 * Order portions by usefulness for a logger:
 *   1. Household measures (cup, tbsp, slice, medium, etc.) before raw grams.
 *   2. Within those, lowest sequenceNumber first (USDA often orders these
 *      meaningfully — primary household serving is sequenceNumber 1).
 *   3. Ties broken by largest gramWeight (typical "1 cup" > "1 tbsp" — bigger
 *      portion is usually more representative of one logged item).
 */
function rankPortions(portions: USDAFoodPortion[]): USDAFoodPortion[] {
  return [...portions].sort((a, b) => {
    const ah = describesHousehold(a) ? 0 : 1
    const bh = describesHousehold(b) ? 0 : 1
    if (ah !== bh) return ah - bh
    const aSeq = a.sequenceNumber ?? Number.MAX_SAFE_INTEGER
    const bSeq = b.sequenceNumber ?? Number.MAX_SAFE_INTEGER
    if (aSeq !== bSeq) return aSeq - bSeq
    return b.gramWeight - a.gramWeight
  })
}

/**
 * Apply foodPortions data to a MappedFoodResult.
 *
 * For non-Branded foods (Foundation/SR Legacy/Survey) where USDA's serving is
 * generic per-100g, the best portion becomes the primary serving — its
 * displayLabel + gramsPerServing populate the variant. Other portions go to
 * alternateServings (capped at 4).
 *
 * For Branded foods we keep the existing primary (householdServingFullText
 * already gave us a label) and append portions as alternateServings only.
 */
function applyFoodPortionsToMapped(
  mapped: MappedFoodResult,
  food: USDAFood,
): MappedFoodResult {
  const portions = food.foodPortions
  if (!portions || portions.length === 0) return mapped

  const ranked = rankPortions(portions)
  const isBranded = food.dataType === 'Branded'

  if (isBranded) {
    // Keep existing primary; append the top portions as alternates.
    // The existing `mapped.alternateServings` may already include "100 g" — we
    // dedupe by label to avoid clutter.
    const existing = (mapped.alternateServings ?? []).slice()
    const existingLabels = new Set(existing.map(s => s.label.toLowerCase()))
    for (const p of ranked.slice(0, 4)) {
      const label = portionLabel(p)
      if (existingLabels.has(label.toLowerCase())) continue
      const multiplier = p.gramWeight / mapped.servingSize
      if (!Number.isFinite(multiplier) || multiplier <= 0) continue
      existing.push({ label, multiplier })
      existingLabels.add(label.toLowerCase())
    }
    return {
      ...mapped,
      alternateServings: existing.length > 0 ? existing : undefined,
    }
  }

  // Non-Branded: build a primary variant from the best household portion.
  const primary = ranked[0]
  const primaryLabel = `${portionLabel(primary)} (${Math.round(primary.gramWeight)} g)`

  // Storage stays per-100g (servingSize=100, servingUnit='g'), nutrition
  // unchanged. gramsPerServing tells the picker the household weight, and
  // alternateServings get the rest.
  const alternates: { label: string; multiplier: number }[] = []
  // Always keep "100 g" available so the picker can fall back when the user
  // wants raw grams — this matches the old behavior for these data types.
  // (Existing alternateServings from mapUSDAFood already has it for branded;
  // for non-branded servingSize=100 so the existing alts may be empty.)
  for (const alt of mapped.alternateServings ?? []) {
    if (alt.label.toLowerCase() !== primaryLabel.toLowerCase()) alternates.push(alt)
  }

  for (const p of ranked.slice(1, 5)) {
    const label = `${portionLabel(p)} (${Math.round(p.gramWeight)} g)`
    if (label.toLowerCase() === primaryLabel.toLowerCase()) continue
    if (alternates.some(a => a.label.toLowerCase() === label.toLowerCase())) continue
    const multiplier = p.gramWeight / mapped.servingSize
    if (!Number.isFinite(multiplier) || multiplier <= 0) continue
    alternates.push({ label, multiplier })
  }

  return {
    ...mapped,
    displayLabel: primaryLabel,
    gramsPerServing: primary.gramWeight,
    alternateServings: alternates.slice(0, 4),
  }
}

// ---------------------------------------------------------------------------
// USDA → Food
// ---------------------------------------------------------------------------

/**
 * Choose a sensible variant name for a USDA food. Foundation/SR Legacy
 * descriptions often embed prep state (e.g. "Bananas, raw" or "Eggs, scrambled").
 * For Branded foods we fall back to "Default".
 */
function variantNameFromUSDA(food: USDAFood): string {
  const desc = food.description || ''
  // Try to extract trailing qualifier after a comma: "Bananas, raw" → "Raw"
  const m = desc.match(/,\s*([a-z][a-z\s\-/]*)$/i)
  if (m && m[1]) {
    const cleaned = m[1].trim()
    if (cleaned.length > 0 && cleaned.length < 40) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }
  }
  if (food.dataType === 'Branded') return 'Default'
  return 'Default'
}

export async function importFromUSDA(
  fdcId: string,
  createdBy?: mongoose.Types.ObjectId | string,
  /**
   * Optional pre-fetched USDA detail payload. When provided, the function
   * skips the per-id `GET /food/{fdcId}` round-trip. The background-import
   * worker uses this with `fetchUSDAFoodsBatch` to fold up to 20 imports
   * into a single batched HTTP call.
   */
  preFetched?: USDAFood,
): Promise<{ food: IFood; created: boolean }> {
  // Already imported as the primary externalId?
  const existing = await Food.findOne({ source: 'usda', externalId: String(fdcId) })
  if (existing) return { food: existing, created: false }

  // Already merged in as a variant of another USDA food? Re-imports of a
  // variant should return the *parent* doc, not create a duplicate.
  const existingAsVariant = await Food.findOne({
    source: 'usda',
    'variants.externalId': String(fdcId),
  })
  if (existingAsVariant) return { food: existingAsVariant, created: false }

  const usda = preFetched ?? (await fetchUSDAById(String(fdcId)))
  if (!usda) throw new Error(`USDA food not found for fdcId=${fdcId}`)

  const baseMapped = mapUSDAFood(usda)
  if (!baseMapped) throw new Error(`USDA food has no usable nutrition for fdcId=${fdcId}`)

  // Detail-only foodPortions enriches the mapping with household measures.
  // For non-Branded foods this becomes the primary serving; for Branded it
  // adds alternateServings.
  const mapped = applyFoodPortionsToMapped(baseMapped, usda)
  const quality = assessFoodImportQuality({
    name: mapped.name,
    brand: mapped.brand,
    category: mapped.category,
    servingSize: mapped.servingSize,
    servingUnit: mapped.servingUnit,
    gramsPerServing: mapped.gramsPerServing,
    mlPerServing: mapped.mlPerServing,
    nutrition: mapped.nutrition,
  })
  if (!quality.ok) throw new Error(foodQualityErrorMessage(quality))

  // Strip prep qualifier from canonical name so it lives in the variant name
  const baseName = mapped.name.replace(/,\s*[a-z][a-z\s\-/]*$/i, '').trim() || mapped.name
  const groupKey = baseGroupKey(baseName)

  // Merge eligibility is delegated to canAutoMergeAsVariant (source-aware).
  // The groupKey precheck is a cheap short-circuit before the DB lookup.
  // ---------------------------------------------------------------
  const hasUsableGroupKey = !!groupKey && groupKey.length >= 2

  if (hasUsableGroupKey) {
    // Look up a candidate parent with the same source + groupKey. We drop
    // the old externalDataType filter; the helper decides whether the
    // Branded-vs-non-Branded combination is mergeable. For Branded inputs
    // we narrow by brandOwner up-front (otherwise we'd often pick a
    // different-brand candidate and immediately reject it).
    const variantName = deriveVariantName(usda.description, baseName)

    const candidateQuery: Record<string, unknown> = { source: 'usda', groupKey }
    if (usda.dataType === 'Branded') {
      const incomingBrand = usda.brandOwner || usda.brandName
      if (incomingBrand) {
        candidateQuery.externalDataType = 'Branded'
        candidateQuery.brand = incomingBrand
      } else {
        // Branded item with no brand info — helper will reject anyway, skip lookup.
        candidateQuery._id = null
      }
    } else {
      // Non-Branded: stay within non-Branded parents.
      candidateQuery.externalDataType = { $ne: 'Branded' }
    }

    const candidate = await Food.findOne(candidateQuery)

    const candidateParent: VariantMergeParent | null = candidate
      ? {
          source: 'usda',
          externalDataType: candidate.externalDataType,
          groupKey: candidate.groupKey,
          brand: candidate.brand,
          barcode: candidate.barcode,
          isVerified: candidate.isVerified,
          variantsCount: candidate.variants.length,
          nutritionProfile: extractFoodNutritionProfile(candidate),
          name: candidate.name,
        }
      : null

    const incomingCandidate: VariantMergeCandidate = {
      source: 'usda',
      externalDataType: usda.dataType,
      groupKey,
      brand: usda.brandOwner ?? usda.brandName ?? null,
      nutritionProfile: extractMappedNutritionProfile(mapped),
      name: usda.description ?? mapped.name,
    }

    const decision = canAutoMergeAsVariant(candidateParent, incomingCandidate)

    if (candidate && decision.ok) {
      const merged = await tryMergeIntoCandidate({
        candidateId: candidate._id as mongoose.Types.ObjectId,
        candidateCurrentName: candidate.name,
        candidateCurrentAliases: candidate.aliases,
        usdaDescription: usda.description,
        usdaDataType: usda.dataType,
        groupKey,
        mapped,
        variantName,
        fdcId: String(fdcId),
      })

      if (merged) return { food: merged, created: false }
      // Otherwise fall through to creating a fresh standalone Food.
    }
  }

  // ---------------------------------------------------------------
  // No-merge path: create a fresh single-variant Food.
  //
  // When this branch fires because the merge candidate hit the 12-variant
  // cap, the resulting "overflow sibling" Food.name must use the same
  // canonical form as the in-cap parent (e.g. "Cheese Cheddar"), not the
  // raw USDA description ("CHEESE,CHEDDAR,SHARP,BRANDED 1234"). The
  // canonical helper handles both cases; we fall back to baseName only if
  // canonicalization collapses to empty.
  // ---------------------------------------------------------------
  const variantName = variantNameFromUSDA(usda)
  const canonical = canonicalFoodName(usda.description, 'usda')
  const finalName = canonical || baseName
  const slug = await generateUniqueFoodSlug(Food, finalName, mapped.brand)
  const variant = buildVariantFromMapped(mapped, variantName)

  // Stamp the variant with its own externalId/dataType so future merges
  // don't lose track of which USDA entry produced it.
  variant.externalId = String(fdcId)
  variant.externalDataType = usda.dataType

  // Auto-review flag — set if the import produced anything suspect.
  const automaticReview = computeAutomaticReviewState({
    slug,
    variants: [variant],
  } as FoodForReview, { origin: 'import' })

  const food = await Food.create({
    name: finalName,
    slug,
    brand: mapped.brand,
    category: coerceCategory(mapped.category),
    variants: [variant],
    aliases: [],
    source: 'usda',
    externalId: String(fdcId),
    externalDataType: usda.dataType,
    isFirstClass: false,
    isVerified: false,
    barcode: undefined,
    imageUrl: undefined,
    usageCount: 0,
    createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
    needsReview: automaticReview.needsReview,
    reviewFlag: automaticReview.reviewFlag,
    groupKey: baseGroupKey(baseName) || undefined,
  })

  return { food, created: true }
}

/**
 * Atomic merge attempt: try to push a new variant onto an existing parent
 * Food. Returns the updated parent on success, or null if the parent has
 * since been verified, hit the variant cap, or disappeared between the
 * lookup and the update.
 *
 * Uses findOneAndUpdate with a $expr cap-check so concurrent imports of
 * different fdcIds with the same groupKey can't double-push past the cap.
 */
async function tryMergeIntoCandidate(opts: {
  candidateId: mongoose.Types.ObjectId
  candidateCurrentName: string
  candidateCurrentAliases: string[]
  usdaDescription: string
  usdaDataType: string
  groupKey: string
  mapped: MappedFoodResult
  variantName: string
  fdcId: string
}): Promise<IFood | null> {
  const {
    candidateId,
    candidateCurrentName,
    candidateCurrentAliases,
    usdaDescription,
    usdaDataType,
    groupKey,
    mapped,
    variantName,
    fdcId,
  } = opts

  // Dedupe the variant name against the existing parent variants.
  // Read-then-write race accepted — two distinct fdcIds generally produce
  // distinct variant names anyway; a numeric-suffix near-collision (very
  // rare) is cosmetic only.
  const variantNamesDoc = await Food.findById(candidateId)
    .select('variants.name')
    .lean<{ variants: { name: string }[] } | null>()
  const existingNames = variantNamesDoc?.variants?.map(v => v.name) ?? []
  const finalVariantName = dedupeVariantName(existingNames, variantName)

  // Build the new variant. isDefault is always false for merged variants —
  // we never reassign the parent's default.
  const newVariant: IFoodVariant = {
    ...buildVariantFromMapped(mapped, finalVariantName),
    isDefault: false,
    externalId: fdcId,
    externalDataType: usdaDataType,
  }

  // Decide if the parent should be renamed. If the parent's current name is
  // still the original USDA description (i.e. it has comma-qualifiers and
  // matches the cooked baseName equivalent), rename it to the canonical
  // form. Detection is heuristic: parent name contains a comma OR parent
  // name already matches the canonical form; in both cases switching to
  // `canonicalFoodName(usdaDescription, 'usda')` produces a tidier display
  // that matches the overflow-sibling path.
  const canonical = canonicalFoodName(usdaDescription, 'usda')
  const lowerName = candidateCurrentName.toLowerCase().trim()
  const lowerCanonical = canonical.toLowerCase()
  const looksRenamedAlready = lowerName === lowerCanonical || !lowerName.includes(',')

  let newParentName: string | undefined
  let aliasToAdd: string | undefined
  if (!looksRenamedAlready && canonical) {
    newParentName = canonical
    aliasToAdd = candidateCurrentName.trim()
  }
  // Always preserve the new USDA description as an alias too — search needs it.
  const incomingAlias = usdaDescription.trim()

  // Build the $set and $push update.
  // Note: $push with $each can do nothing (we just push one). We use plain $push.
  const setOps: Record<string, unknown> = {}
  if (newParentName && newParentName !== candidateCurrentName) {
    setOps.name = newParentName
  }

  // Aliases: append both `aliasToAdd` (the parent's old name) and
  // `incomingAlias` (the new USDA description), deduped, capped at 30.
  // We do this in JS since the cap requires array slicing — easier to read
  // than fighting MongoDB's $push+$slice semantics.
  const newAliases = [...candidateCurrentAliases]
  const pushIfMissing = (s?: string) => {
    if (!s) return
    if (newAliases.some(a => a.toLowerCase() === s.toLowerCase())) return
    newAliases.push(s)
  }
  if (aliasToAdd) pushIfMissing(aliasToAdd)
  pushIfMissing(incomingAlias)
  while (newAliases.length > MAX_ALIASES) newAliases.shift()
  if (
    newAliases.length !== candidateCurrentAliases.length ||
    newAliases.some((a, i) => a !== candidateCurrentAliases[i])
  ) {
    setOps.aliases = newAliases
  }

  // Atomic update: push variant only if cap not exceeded, parent still
  // unverified, and groupKey unchanged. Re-runs computeReviewIssues after.
  const updated = await Food.findOneAndUpdate(
    {
      _id: candidateId,
      isVerified: { $ne: true },
      // externalDataType filter dropped here intentionally — canAutoMergeAsVariant
      // now decides Branded-vs-non-Branded eligibility upstream. The atomic
      // filter only guards against races on cap/verified/groupKey/fdcId.
      groupKey,
      $expr: { $lt: [{ $size: '$variants' }, MAX_VARIANTS_PER_FOOD] },
      // Don't merge if a variant with this fdcId is already there (race
      // protection; the outer check handled the common case but a concurrent
      // import of the same fdcId could still slip through).
      'variants.externalId': { $ne: fdcId },
    },
    {
      $push: { variants: newVariant },
      ...(Object.keys(setOps).length > 0 ? { $set: setOps } : {}),
    },
    { new: true },
  )

  if (!updated) return null

  // Recompute only when automatic rules own the stored decision. Legacy rows
  // have unknown ownership and explicit admin choices are manual-owned; both
  // must survive an import. updatedAt makes this a compare-and-swap so a
  // concurrent nutrition/admin edit wins over this snapshot.
  if (isAutomaticReviewOwned(updated.reviewFlag)) {
    const automaticReview = computeAutomaticReviewState(
      updated.toObject() as unknown as FoodForReview,
      { origin: 'import' },
    )
    const reviewUpdated = await Food.findOneAndUpdate(
      {
        _id: updated._id,
        'reviewFlag.owner': 'automatic',
        updatedAt: updated.updatedAt,
      },
      {
        $set: {
          needsReview: automaticReview.needsReview,
          reviewFlag: automaticReview.reviewFlag,
        },
      },
      { new: true },
    )
    if (reviewUpdated) return reviewUpdated
  }

  return updated
}

// ---------------------------------------------------------------------------
// OpenFoodFacts → Food
// ---------------------------------------------------------------------------

/**
 * OpenFoodFacts `serving_quantity` is supposed to be the actual serving size
 * in grams/ml, but it's frequently parsed as the leading number from the text
 * (e.g. "1 cup (240 ml)" → 1 instead of 240). When that happens our multiplier
 * comes out 100x too small. Fall back to extracting grams from `serving_size`.
 *
 * Thin wrapper around `parseQuantityString` so OFF and the foods route share
 * one parser. Also tries inner parenthesized substrings for forms like
 * "1 cup (240 g)" since `parseQuantityString` reads a single number+unit.
 */
function extractGramsFromServingSize(text?: string): number | null {
  if (!text) return null
  const tryParse = (s: string): number | null => {
    const parsed = parseQuantityString(s)
    if (!parsed) return null
    if (parsed.unit === 'g' || parsed.unit === 'oz' || parsed.unit === 'lb') {
      return convert(parsed.value, parsed.unit, 'g')
    }
    return null
  }
  const direct = tryParse(text)
  if (direct != null) return direct
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

/**
 * Symmetric to `extractGramsFromServingSize` — extracts a milliliter value
 * from a freeform serving-size string. Returns null when the parsed unit is
 * mass/discrete. Used to set the `mlPerServing` bridge on liquid imports.
 */
function extractMlFromServingSize(text?: string): number | null {
  if (!text) return null
  const tryParse = (s: string): number | null => {
    const parsed = parseQuantityString(s)
    if (!parsed) return null
    if (familyOf(parsed.unit) === 'volume') {
      return convert(parsed.value, parsed.unit, 'ml')
    }
    return null
  }
  const direct = tryParse(text)
  if (direct != null) return direct
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

function mapOffToVariant(off: IOpenFoodFact): IFoodVariant {
  const n = off.nutriments
  const nutrition = {
    calories: plausibleOffKcal(n),
    // Kept exact: these are a per-100 basis that every serving is scaled FROM,
    // so a tenth of a gram lost here is multiplied by every portion after it.
    protein: n.proteins_100g ?? 0,
    carbs: n.carbohydrates_100g ?? 0,
    fats: n.fat_100g ?? 0,
    fiber: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : undefined,
    sugar: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : undefined,
    sodium: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) / 1000 : undefined,
    saturatedFat: n.saturated_fat_100g != null ? Math.round(n.saturated_fat_100g * 10) / 10 : undefined,
  }

  // Prefer parsed grams from the serving_size text (handles "1 cup (240 g)")
  // over serving_quantity, which OFF often sets to the leading "1" not 240.
  // Also: when serving_size text is empty/unparseable but OFF sets
  // serving_quantity with a recognized serving_unit (g/ml/oz/etc.), trust it.
  // The previous >=5 floor was filtering out tea bags, spices, single-bite
  // snacks (often serving_quantity 1 or 2). Drop the floor to >=1 so small-
  // but-real servings persist instead of getting silently rejected.
  const parsedGrams = extractGramsFromServingSize(off.serving_size)
  const offUnitNormalized = (off.serving_unit ?? '').toLowerCase().trim()
  const KNOWN_OFF_UNITS = new Set(['g', 'gram', 'grams', 'ml', 'oz', 'mlt', 'grm'])
  const sqFromText = (off.serving_size ?? '').trim() === ''
    && off.serving_quantity != null
    && KNOWN_OFF_UNITS.has(offUnitNormalized)
    ? off.serving_quantity
    : null

  // Preserve the source unit when it's clearly liquid. ml ≠ g for non-water liquids
  // (oils ~0.92 g/ml, honey ~1.4 g/ml). Detect fl oz / cl / litre too — not just
  // "ml" — so "14 fl oz" is parsed as a 414 ml volume instead of falling through
  // to the gram path (where a count-only serving_quantity would collapse it).
  const isLiquid = off.serving_unit === 'ml'
    || /\bml\b|millilitre|milliliter|\bfl\.?\s*oz\b|fluid\s*ounce|\bcl\b|\blitres?\b|\bliters?\b/i.test(off.serving_size || '')
  const unit: ServingUnit = isLiquid ? 'ml' : 'g'
  const volumeMl = isLiquid ? extractMlFromServingSize(off.serving_size) : null

  // Never let a bare serving_quantity COUNT ("1" from "1 bottle"/"1 portion")
  // become the serving bridge — that scales per-100 nutrition by 1/100 and
  // collapses a 232-cal shake to ~1 cal. Only trust serving_quantity as an amount
  // when it's a plausible serving weight (>=5) or arrived with a known g/ml unit.
  const sqFallback = off.serving_quantity != null && off.serving_quantity >= 5 ? off.serving_quantity : null
  const servingAmount = volumeMl ?? parsedGrams ?? sqFromText ?? sqFallback
  const actualGrams = servingAmount && servingAmount >= 1 ? servingAmount : null

  const alternateServings: { label: string; multiplier: number }[] = []
  if (actualGrams && actualGrams !== 100) {
    const label = off.serving_size || `${Math.round(actualGrams)} ${unit}`
    alternateServings.push({ label, multiplier: actualGrams / 100 })
  }

  // Bridges: the variant's nutrition is per 100 (g or ml). gramsPerServing /
  // mlPerServing describe ONE serving — i.e. `actualGrams` when defined. For
  // liquids it's the parsed volume (ml); for solids it's grams. Never a count.
  let gramsPerServing: number | undefined
  let mlPerServing: number | undefined
  if (actualGrams != null) {
    if (isLiquid) mlPerServing = actualGrams
    else gramsPerServing = actualGrams
  }

  return {
    name: 'Default',
    isDefault: true,
    servingSize: 100,
    servingUnit: unit,
    displayLabel: actualGrams ? off.serving_size || undefined : undefined,
    alternateServings,
    nutrition,
    gramsPerServing,
    mlPerServing,
  }
}

export async function importFromOpenFoodFacts(
  code: string,
  createdBy?: mongoose.Types.ObjectId | string,
): Promise<{ food: IFood; created: boolean }> {
  const existing = await Food.findOne({ source: 'openfoodfacts', externalId: code })
  if (existing) return { food: existing, created: false }

  // If we already have a Food with this barcode (from a prior manual entry), reuse it
  const byBarcode = await Food.findOne({ barcode: code })
  if (byBarcode) return { food: byBarcode, created: false }

  const off = await OpenFoodFact.findOne({ code }).lean<IOpenFoodFact | null>()
  if (!off) throw new Error(`OpenFoodFacts entry not found for code=${code}`)

  const variant = mapOffToVariant(off)
  const quality = assessFoodImportQuality({
    name: off.product_name,
    brand: off.brands,
    category: off.category,
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit,
    gramsPerServing: variant.gramsPerServing,
    mlPerServing: variant.mlPerServing,
    nutrition: variant.nutrition,
  })
  if (!quality.ok) throw new Error(foodQualityErrorMessage(quality))
  const offGroupKey = baseGroupKey(off.product_name)

  // Attempt to merge into an existing OFF parent with the same source +
  // groupKey + brand. The helper decides eligibility (different-brand and
  // conflicting-barcode cases are rejected). If approved, we push the new
  // variant atomically and return the merged parent without creating a
  // standalone Food.
  if (offGroupKey && offGroupKey.length >= 2 && off.brands) {
    const offCandidate = await Food.findOne({
      source: 'openfoodfacts',
      groupKey: offGroupKey,
      brand: off.brands,
    })

    if (offCandidate) {
      const parentSide: VariantMergeParent = {
        source: 'openfoodfacts',
        groupKey: offCandidate.groupKey,
        brand: offCandidate.brand,
        barcode: offCandidate.barcode,
        isVerified: offCandidate.isVerified,
        variantsCount: offCandidate.variants.length,
        nutritionProfile: extractFoodNutritionProfile(offCandidate),
        name: offCandidate.name,
      }
      const candidateSide: VariantMergeCandidate = {
        source: 'openfoodfacts',
        groupKey: offGroupKey,
        brand: off.brands,
        barcode: off.code,
        name: off.product_name,
        nutritionProfile: {
          calories: typeof variant.nutrition?.calories === 'number' ? variant.nutrition.calories : null,
          protein: typeof variant.nutrition?.protein === 'number' ? variant.nutrition.protein : null,
          carbs: typeof variant.nutrition?.carbs === 'number' ? variant.nutrition.carbs : null,
          fats: typeof variant.nutrition?.fats === 'number' ? variant.nutrition.fats : null,
        },
      }
      const decision = canAutoMergeAsVariant(parentSide, candidateSide)
      if (decision.ok) {
        // Atomic push — same race-protection pattern as tryMergeIntoCandidate
        // (cap check via $expr, not verified, groupKey unchanged, externalId
        // not already a variant). We leave parent name + brand untouched.
        const newVariant: IFoodVariant = {
          ...variant,
          isDefault: false,
          externalId: code,
        }
        const pushOps: Record<string, unknown> = { variants: newVariant }
        if (
          off.product_name &&
          (offCandidate.aliases as string[]).every((a: string) => a.toLowerCase() !== off.product_name.toLowerCase())
        ) {
          pushOps.aliases = { $each: [off.product_name], $slice: -MAX_ALIASES }
        }
        const updated = await Food.findOneAndUpdate(
          {
            _id: offCandidate._id,
            isVerified: { $ne: true },
            groupKey: offGroupKey,
            $expr: { $lt: [{ $size: '$variants' }, MAX_VARIANTS_PER_FOOD] },
            'variants.externalId': { $ne: code },
            externalId: { $ne: code },
          },
          { $push: pushOps },
          { new: true },
        )
        if (updated) return { food: updated, created: false }
      }
    }
  }

  const slug = await generateUniqueFoodSlug(Food, off.product_name, off.brands)

  const category = (off.category && (VALID_CATEGORIES as string[]).includes(off.category))
    ? off.category as FoodCategory
    : 'Other'

  const automaticReview = computeAutomaticReviewState({
    slug,
    variants: [variant],
  } as FoodForReview, { origin: 'import' })

  const food = await Food.create({
    name: off.product_name,
    slug,
    brand: off.brands || undefined,
    category,
    variants: [variant],
    aliases: [],
    source: 'openfoodfacts',
    externalId: code,
    externalDataType: undefined,
    isFirstClass: false,
    isVerified: false,
    barcode: off.code,
    imageUrl: off.image_url || undefined,
    usageCount: 0,
    createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
    needsReview: automaticReview.needsReview,
    reviewFlag: automaticReview.reviewFlag,
    groupKey: baseGroupKey(off.product_name) || undefined,
  })

  return { food, created: true }
}

// ---------------------------------------------------------------------------
// Manual create
// ---------------------------------------------------------------------------

export interface ManualFoodInput {
  name: string
  brand?: string
  category?: string
  variants?: Array<{
    name?: string
    isDefault?: boolean
    servingSize: number
    servingUnit: string
    alternateServings?: { label: string; multiplier: number }[]
    gramsPerServing?: number
    mlPerServing?: number
    nutrition: {
      calories: number
      protein: number
      carbs: number
      fats: number
      fiber?: number
      sugar?: number
      sodium?: number
      saturatedFat?: number
    }
  }>
  aliases?: string[]
  barcode?: string
  imageUrl?: string
  // Legacy single-variant shape support — when callers send flat fields
  servingSize?: number
  servingUnit?: string
  alternateServings?: { label: string; multiplier: number }[]
  gramsPerServing?: number
  mlPerServing?: number
  nutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
    saturatedFat?: number
  }
}

export async function importManualFood(
  input: ManualFoodInput,
  createdBy?: mongoose.Types.ObjectId | string,
): Promise<{ food: IFood; created: boolean }> {
  if (!input.name) throw new Error('name is required')

  // If barcode supplied and a Food with that barcode exists, reuse it
  if (input.barcode) {
    const byBarcode = await Food.findOne({ barcode: input.barcode })
    if (byBarcode) return { food: byBarcode, created: false }
  }

  // Dedupe by base slug — manual saves of the same name+brand used to create
  // a fresh Food doc each time (with -2/-3 suffixes), filling the user's
  // saved list with duplicates. baseSlug encodes both name and brand, so an
  // exact base-slug match on a manual food represents the same conceptual
  // item.
  {
    const base = baseSlug(input.name, input.brand)
    const candidate = await Food.findOne({ slug: base, source: 'manual' })
    if (candidate) return { food: candidate, created: false }
  }

  // Build variants — accept either a `variants` array or the flat legacy shape
  let variantsInput = input.variants
  if (!variantsInput || variantsInput.length === 0) {
    if (!input.nutrition || input.servingSize == null) {
      throw new Error('Either variants[] or nutrition+servingSize+servingUnit must be provided')
    }
    variantsInput = [{
      name: 'Default',
      isDefault: true,
      servingSize: input.servingSize,
      servingUnit: input.servingUnit || 'g',
      alternateServings: input.alternateServings ?? [],
      gramsPerServing: input.gramsPerServing,
      mlPerServing: input.mlPerServing,
      nutrition: input.nutrition,
    }]
  }

  const variants: IFoodVariant[] = variantsInput.map((v, idx) => {
    const servingUnit = coerceServingUnit(v.servingUnit)
    // Auto-fill the bridge when the unit is in a known family AND the caller
    // didn't already provide one. This means custom foods created via direct
    // API call (not via the picker) get a sensible bridge for free, without
    // overriding any explicit input.
    let gramsPerServing = v.gramsPerServing
    let mlPerServing = v.mlPerServing
    const family = familyOf(servingUnit)
    if (gramsPerServing == null && family === 'mass') {
      try {
        gramsPerServing = convert(v.servingSize, servingUnit, 'g')
      } catch {
        // unreachable — same family — but keep defensive
      }
    }
    if (mlPerServing == null && family === 'volume') {
      try {
        mlPerServing = convert(v.servingSize, servingUnit, 'ml')
      } catch {
        // unreachable — same family — but keep defensive
      }
    }
    return {
      name: v.name || (idx === 0 ? 'Default' : `Variant ${idx + 1}`),
      isDefault: v.isDefault ?? idx === 0,
      servingSize: v.servingSize,
      servingUnit,
      alternateServings: v.alternateServings ?? [],
      gramsPerServing,
      mlPerServing,
      nutrition: v.nutrition,
    }
  })

  // Ensure exactly one default
  if (!variants.some(v => v.isDefault)) variants[0].isDefault = true

  const slug = await generateUniqueFoodSlug(Food, input.name, input.brand)

  const automaticReview = computeAutomaticReviewState({
    slug,
    variants,
  } as FoodForReview, { origin: 'rules' })

  const food = await Food.create({
    name: input.name,
    slug,
    brand: input.brand,
    category: coerceCategory(input.category),
    variants,
    aliases: input.aliases ?? [],
    source: 'manual',
    externalId: undefined,
    externalDataType: undefined,
    isFirstClass: false,
    isVerified: false,
    barcode: input.barcode,
    imageUrl: input.imageUrl,
    usageCount: 0,
    createdBy: createdBy ? new mongoose.Types.ObjectId(String(createdBy)) : undefined,
    needsReview: automaticReview.needsReview,
    reviewFlag: automaticReview.reviewFlag,
    groupKey: baseGroupKey(input.name) || undefined,
  })

  return { food, created: true }
}

// ---------------------------------------------------------------------------
// Helper: get the default variant of a food (or first variant as fallback)
// ---------------------------------------------------------------------------

export function getDefaultVariant(food: IFood): IFoodVariant {
  return food.variants.find(v => v.isDefault) ?? food.variants[0]
}

/**
 * Flatten a Food doc into the legacy single-variant shape used by search results
 * and the existing frontend. Adds a `variants` array so callers can show a picker.
 */
export function flattenFoodForResponse(food: IFood & { _id: mongoose.Types.ObjectId }) {
  const v = getDefaultVariant(food)
  return {
    _id: food._id,
    name: food.name,
    slug: food.slug,
    brand: food.brand,
    category: food.category,
    servingSize: v.servingSize,
    servingUnit: v.servingUnit,
    displayLabel: v.displayLabel,
    alternateServings: v.alternateServings,
    nutrition: v.nutrition,
    gramsPerServing: v.gramsPerServing,
    mlPerServing: v.mlPerServing,
    barcode: food.barcode,
    imageUrl: food.imageUrl,
    isFirstClass: food.isFirstClass,
    isVerified: food.isVerified,
    usageCount: food.usageCount,
    source: food.source,
    externalId: food.externalId,
    externalDataType: food.externalDataType,
    variants: food.variants,
    aliases: food.aliases,
    createdBy: food.createdBy,
    needsReview: food.needsReview,
    // Never serialize the internal admin identifier stored in updatedBy.
    reviewFlag: food.reviewFlag ? {
      owner: food.reviewFlag.owner,
      issueCodes: food.reviewFlag.issueCodes,
      ruleVersion: food.reviewFlag.ruleVersion,
      origin: food.reviewFlag.origin,
      updatedAt: food.reviewFlag.updatedAt,
    } : undefined,
    groupKey: food.groupKey,
    createdAt: food.createdAt,
    updatedAt: food.updatedAt,
  }
}
