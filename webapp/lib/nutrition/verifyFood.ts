/**
 * The verification pipeline for one food: gather → search → review → apply.
 *
 * Four stages, deliberately separated because collapsing them is how a
 * verification system starts confirming its own mistakes:
 *
 *   1. gatherEvidence()  — deterministic. OpenFoodFacts, USDA by barcode, the
 *                          reporter's photo. No model runs.
 *   2. the searcher      — grounded web search for the label. GATHERS ONLY; it
 *                          is prompted never to reach a verdict.
 *   3. the reviewer      — no internet. Weighs the bundle and decides.
 *   4. apply()           — writes the catalogue, but only through the gate
 *                          below.
 *
 * An agent asked to "verify this food" in one pass reaches for whatever
 * confirms the record in front of it. An agent handed several independent
 * sources and asked which one the arithmetic supports has something to actually
 * reason about — and a reviewer that never saw a search engine cannot quietly
 * go and find agreement with itself.
 *
 * The USER never writes the catalogue. A report is evidence; this is the only
 * writer.
 */

import Food from '@/models/Food'
import FoodFlag from '@/models/FoodFlag'
import { gatherEvidence, type EvidenceBundle, type EvidenceValues } from './evidence'
import { runStructuredTask } from '@/lib/ai/becomeGraph'
import { getBlobStore } from '@/lib/blobStorage'

/**
 * Below this, a correction is recorded but NOT written to the shared record.
 *
 * Asymmetric on purpose: leaving a food unverified costs one stale row, while a
 * confident wrong correction costs every user who logs it afterwards, silently.
 * The reviewer is told to reserve this band for a manufacturer-grade source
 * backing a coherent arithmetic story.
 */
export const WRITE_CONFIDENCE_FLOOR = 0.85

/** Grounded search is the metered cost in this pipeline — bound the wait. */
const SEARCH_TIMEOUT_MS = 120_000
const REVIEW_TIMEOUT_MS = 90_000
const VISION_TIMEOUT_MS = 90_000

export interface SearchSource {
  sourceDomain?: string
  publisher?: string
  isManufacturerSite?: boolean
  servingLabel?: string
  servingGrams?: number
  caloriesPer100?: number
  proteinPer100?: number
  carbsPer100?: number
  fatsPer100?: number
  variantMatch?: 'exact' | 'uncertain' | 'different'
  nameMatchesRecord?: boolean
  confidence?: number
}

export interface SearchResult {
  found: boolean
  productName?: string
  sources?: SearchSource[]
  notes?: string
}

export interface ReviewVerdict {
  verdict: 'confirmed' | 'corrected' | 'insufficient' | 'conflicted'
  problem: string
  confidence: number
  reasoning?: string
  leanedOn?: string[]
  correction?: {
    caloriesPer100?: number
    proteinPer100?: number
    carbsPer100?: number
    fatsPer100?: number
    servingGrams?: number
    servingLabel?: string
  } | null
}

export interface VerificationOutcome {
  foodId: string
  verdict: ReviewVerdict['verdict'] | 'skipped'
  problem?: string
  confidence?: number
  /** True only when the shared record actually changed. */
  written: boolean
  reason?: string
  bundle?: EvidenceBundle
  search?: SearchResult
  review?: ReviewVerdict
}

/** One product as either vision shape describes it. */
interface LabelCandidate {
  name?: string
  brand?: string
  servingSize?: number
  servingUnit?: string
  /** Plate-scan shape states the serving in prose, e.g. "3 tortillas (54g)". */
  estimatedServing?: string
  nutrition?: { calories?: number; protein?: number; carbs?: number; fats?: number; fiber?: number }
}

interface FoodLike {
  _id: unknown
  name?: string
  brand?: string
  barcode?: string
  variants?: {
    isDefault?: boolean
    servingSize?: number
    gramsPerServing?: number
    displayLabel?: string
    nutrition?: { calories?: number; protein?: number; carbs?: number; fats?: number; fiber?: number }
  }[]
}

/** Normalise the default variant to per-100, the only basis the pipeline compares on. */
export function storedPer100(food: FoodLike): EvidenceValues | null {
  const v = food.variants?.find((x) => x.isDefault) ?? food.variants?.[0]
  if (!v?.nutrition) return null
  // Prefer a real gram weight; servingSize alone is meaningless for each/slice.
  const grams = v.gramsPerServing ?? (v.servingSize && v.servingSize > 0 ? v.servingSize : undefined)
  if (!grams || grams <= 0) return null
  const k = 100 / grams
  const n = v.nutrition
  const round = (x: number | undefined) =>
    x == null ? undefined : Math.round(x * k * 100) / 100
  return {
    caloriesPer100: round(n.calories),
    proteinPer100: round(n.protein),
    carbsPer100: round(n.carbs),
    fatsPer100: round(n.fats),
    // Carried so the reviewer's Atwater check uses NET carbs. Without it a
    // high-fiber food reads as internally inconsistent when it is fine.
    fiberPer100: round(n.fiber),
    servingGrams: grams,
    servingLabel: v.displayLabel,
  }
}

/**
 * Is this bundle allowed to justify a WRITE?
 *
 * Separate from the reviewer's own confidence on purpose: a model can be
 * talked into certainty, but it cannot manufacture a source that is not in the
 * bundle. Both gates must pass.
 */
export function canWrite(
  bundle: EvidenceBundle,
  search: SearchResult | null,
  review: ReviewVerdict,
): { ok: boolean; reason?: string } {
  if (review.verdict !== 'corrected') return { ok: false, reason: review.verdict }
  if (!review.correction) return { ok: false, reason: 'no_correction_supplied' }
  if (review.confidence < WRITE_CONFIDENCE_FLOOR) {
    return { ok: false, reason: `below_confidence_floor_${review.confidence}` }
  }
  // A search hit counts as independent; so does OFF/USDA/an identity-confirmed
  // photo (gatherEvidence already reports that honestly).
  const searchIsIndependent = !!search?.found && (search.sources?.length ?? 0) > 0
  if (!bundle.hasIndependentSource && !searchIsIndependent) {
    return { ok: false, reason: 'no_independent_source' }
  }
  // Identity beats numbers: never rewrite macros onto what may be a different
  // product. That is a mislabelled record for a human to resolve.
  const anySourceDisownsName = (search?.sources ?? []).some(
    (s) => s.nameMatchesRecord === false,
  )
  if (anySourceDisownsName) return { ok: false, reason: 'name_mismatch_needs_human' }
  return { ok: true }
}

/**
 * Grams (or ml) out of a serving phrase like "3 tortillas (54g)".
 *
 * The vision runner describes the serving in prose, so the weight has to be
 * recovered from the text. Prefer a figure in parentheses — that is where a
 * label puts the real weight — and fall back to any mass figure in the string.
 * Returns undefined rather than guessing: an unconvertible serving must not
 * become a per-100 basis that is wrong by an unknown factor.
 */
export function gramsFromServingText(text: string | undefined): number | undefined {
  if (!text) return undefined
  const paren = text.match(/\((\d+(?:\.\d+)?)\s*(g|ml)\b[^)]*\)/i)
  const any = paren ?? text.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i)
  if (!any) return undefined
  const n = Number(any[1])
  return isFinite(n) && n > 0 ? n : undefined
}

interface LabelRead {
  identity?: string
  values?: EvidenceValues
}

/**
 * Read the panel the reporter photographed.
 *
 * Without this the photo is stored, shown to nobody, and passed to nothing: the
 * bundle only carried a user-photo entry when the reporter ALSO typed the
 * numbers by hand, so the single strongest piece of evidence we can collect was
 * being dropped for everyone who did the obvious thing and just took a picture.
 *
 * TWO RESPONSE SHAPES. The vision graph node pins its own structuredOutput
 * schema — the plate-scan one, `{ items:[{ name, estimatedServing, nutrition }] }`
 * — and ignores the per-task schema, so nutrition.productFind comes back shaped
 * like a plate estimate rather than as `{ matches: [...] }`. Reading only
 * `matches` silently found nothing and threw away a perfectly good read of the
 * label. Accept both, and let the node keep its schema.
 *
 * What comes back is still a CLAIM, not a source. gatherEvidence checks the
 * name read off the packaging against the record before any of it counts —
 * a panel photo has no inherent link to the food it was attached to.
 */
async function readLabelPhoto(photoUrl: string): Promise<LabelRead | null> {
  try {
    // Same-origin path issued by our upload route: /api/blob/<key>
    const key = photoUrl.replace(/^\/api\/blob\//, '')
    if (!key || key === photoUrl) return null

    const blob = await getBlobStore().get(key)
    if (!blob?.body) return null
    const buf = Buffer.from(await new Response(blob.body).arrayBuffer())
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null

    const read = await runStructuredTask<{
      matches?: LabelCandidate[]
      items?: LabelCandidate[]
    }>(
      'nutrition.productFind',
      { text: 'Read the nutrition panel exactly as printed.' },
      { image: buf.toString('base64'), timeoutMs: VISION_TIMEOUT_MS },
    )

    const m = read?.matches?.[0] ?? read?.items?.[0]
    if (!m) return null

    const identity = [m.brand, m.name].filter(Boolean).join(' ').trim() || undefined

    // A gram weight can arrive as structured fields or inside the serving text.
    const unit = (m.servingUnit ?? '').toLowerCase()
    const grams =
      unit === 'g' || unit === 'ml'
        ? m.servingSize
        : gramsFromServingText(m.estimatedServing)

    if (!grams || grams <= 0 || !m.nutrition) return { identity }

    const k = 100 / grams
    const r = (x: number | undefined) => (x == null ? undefined : Math.round(x * k * 100) / 100)
    return {
      identity,
      values: {
        caloriesPer100: r(m.nutrition.calories),
        proteinPer100: r(m.nutrition.protein),
        carbsPer100: r(m.nutrition.carbs),
        fatsPer100: r(m.nutrition.fats),
        fiberPer100: r(m.nutrition.fiber),
        servingGrams: grams,
        servingLabel: m.estimatedServing,
      },
    }
  } catch (err) {
    // Best effort: a photo we cannot read must not sink the whole run.
    console.error('readLabelPhoto failed:', err)
    return null
  }
}

/**
 * Run the whole pipeline for one food.
 *
 * Never throws: a verification failure must not take down the caller (a flag
 * route or a batch sweep). Every exit releases the claim.
 */
export async function verifyFood(
  foodId: string,
  opts: {
    userClaim?: EvidenceValues
    userPhotoUrl?: string
    userPhotoIdentity?: string
    /** What the reporter actually ticked, and what they wrote. */
    reportedKinds?: string[]
    reportedNote?: string
  } = {},
): Promise<VerificationOutcome> {
  const food = await Food.findById(foodId)
    .select('name brand barcode variants verification')
    .lean<FoodLike | null>()
  if (!food) return { foodId, verdict: 'skipped', written: false, reason: 'not_found' }

  const stored = storedPer100(food)
  if (!stored) {
    await releaseClaim(foodId, 'skipped_no_basis')
    return { foodId, verdict: 'skipped', written: false, reason: 'no_comparable_basis' }
  }

  try {
    await Food.updateOne({ _id: foodId }, { $set: { 'verification.state': 'running' } })

    // 0. Read the reporter's photo, if they sent one. Typed values still win:
    //    someone who bothered to enter the numbers read them off the same
    //    package, and their transcription beats ours.
    const label = opts.userPhotoUrl ? await readLabelPhoto(opts.userPhotoUrl) : null

    // 1. Deterministic.
    const bundle = await gatherEvidence({
      barcode: food.barcode,
      stored,
      userClaim: opts.userClaim ?? label?.values,
      userPhotoUrl: opts.userPhotoUrl,
      userPhotoIdentity: opts.userPhotoIdentity ?? label?.identity,
      recordName: food.name,
      recordBrand: food.brand,
    })

    // 2. Grounded search. Best-effort: the deterministic sources alone can
    //    still carry a verdict, so a search failure degrades rather than aborts.
    const search = await runStructuredTask<SearchResult>(
      'nutritionFoodEvidence',
      {
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        storedPer100: stored,
        storedServing: stored.servingLabel,
      },
      { timeoutMs: SEARCH_TIMEOUT_MS },
    )

    // 3. Review. No internet — it sees only what stages 1 and 2 collected.
    const review = await runStructuredTask<ReviewVerdict>(
      'nutritionFoodReview',
      {
        record: { name: food.name, brand: food.brand, storedPer100: stored },
        sources: bundle.items.map((i) => ({
          source: i.source,
          ...i.values,
          identityMatch: i.identityMatch,
          identityRead: i.identityRead,
          caveat: i.caveat,
        })),
        webSources: search?.found ? search.sources : [],
        webNotes: search?.notes,
        // Present even when the panel numbers were not legible: knowing WHICH
        // product the reporter photographed is worth something on its own.
        photoIdentityRead: label?.identity,
        // What a human standing in front of the package said looks wrong.
        // This is a POINTER, not a source: it tells the reviewer where to
        // look, and the write gate still requires independent corroboration,
        // so a bad report cannot become a catalogue edit on its own.
        report: opts.reportedKinds?.length
          ? { looksWrong: opts.reportedKinds, note: opts.reportedNote }
          : undefined,
      },
      { timeoutMs: REVIEW_TIMEOUT_MS },
    )

    if (!review?.verdict) {
      await releaseClaim(foodId, 'review_unavailable')
      return { foodId, verdict: 'skipped', written: false, reason: 'review_unavailable', bundle }
    }

    // 4. Apply, through both gates.
    const gate = canWrite(bundle, search, review)
    const written = gate.ok && (await applyCorrection(foodId, food, review))

    await Food.updateOne(
      { _id: foodId },
      {
        $set: {
          'verification.state': review.verdict === 'insufficient' ? 'insufficient' : 'verified',
          'verification.verifiedAt': new Date(),
          'verification.lastOutcome': written ? `corrected:${review.problem}` : review.verdict,
          'verification.evidence': bundle.items.slice(0, 8).map((i) => ({
            url: i.url,
            source: i.source,
            extractedValues: i.values,
            at: new Date(i.at),
          })),
        },
        $unset: { 'verification.claimedAt': '' },
      },
    )

    // Tell the reporter what actually happened. "corrected" is claimed ONLY
    // when the shared record really changed: a verdict of corrected that the
    // write gate refused is, from their side, still an unresolved report, and
    // saying otherwise would be a lie they cannot check.
    await FoodFlag.updateMany(
      { foodId, status: { $in: ['open', 'attached'] } },
      {
        $set: {
          status: flagStatusFor(review.verdict, written),
          resolvedAt: new Date(),
          resolution: (review.reasoning ?? review.verdict).slice(0, 500),
        },
      },
    )

    return {
      foodId,
      verdict: review.verdict,
      problem: review.problem,
      confidence: review.confidence,
      written,
      reason: gate.ok ? undefined : gate.reason,
      bundle,
      search: search ?? undefined,
      review,
    }
  } catch (err) {
    console.error('verifyFood failed:', err)
    await releaseClaim(foodId, 'error')
    return { foodId, verdict: 'skipped', written: false, reason: 'error' }
  }
}

/**
 * Map a verdict onto the FoodFlag status enum.
 *
 * `conflicted` has no status of its own: nothing was changed and we could not
 * settle it, which from the reporter's side is the same as insufficient. The
 * reasoning string carries the distinction.
 */
export function flagStatusFor(
  verdict: ReviewVerdict['verdict'],
  written: boolean,
): 'corrected' | 'confirmed' | 'insufficient' {
  if (verdict === 'corrected') return written ? 'corrected' : 'insufficient'
  if (verdict === 'confirmed') return 'confirmed'
  return 'insufficient'
}

/**
 * Write the correction onto the default variant, converting per-100 back to the
 * variant's own basis so the serving the user sees is untouched.
 */
async function applyCorrection(
  foodId: string,
  food: FoodLike,
  review: ReviewVerdict,
): Promise<boolean> {
  const c = review.correction
  if (!c) return false
  const idx = Math.max(
    0,
    (food.variants ?? []).findIndex((v) => v.isDefault),
  )
  const v = food.variants?.[idx]
  const grams = c.servingGrams ?? v?.gramsPerServing ?? v?.servingSize
  if (!grams || grams <= 0) return false
  const k = grams / 100

  const set: Record<string, number | string> = {}
  const put = (field: string, per100: number | undefined) => {
    if (per100 == null || !isFinite(per100)) return
    set[`variants.${idx}.nutrition.${field}`] = Math.round(per100 * k * 100) / 100
  }
  put('calories', c.caloriesPer100)
  put('protein', c.proteinPer100)
  put('carbs', c.carbsPer100)
  put('fats', c.fatsPer100)
  if (Object.keys(set).length === 0) return false

  set['verification.tier'] = 'corroborated'
  await Food.updateOne({ _id: foodId }, { $set: set })
  return true
}

/** Always release the claim, or the food is wedged as unverifiable until the TTL. */
async function releaseClaim(foodId: string, outcome: string): Promise<void> {
  await Food.updateOne(
    { _id: foodId },
    {
      $set: { 'verification.state': 'unverified', 'verification.lastOutcome': outcome },
      $unset: { 'verification.claimedAt': '' },
    },
  ).catch(() => {})
}
