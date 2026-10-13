/**
 * Evidence gathering for food verification.
 *
 * Deliberately DETERMINISTIC — no model runs here. This step only collects what
 * independent sources say about a product; deciding who is right is the review
 * step's job, and keeping the two apart is the point. A single agent asked to
 * "verify this food" will reach for whatever confirms the record in front of
 * it. An agent handed three sources and asked which one the evidence supports
 * has something to actually reason about.
 *
 * Why this matters concretely: Sipping Bone Broth had a wrong kcal with correct
 * macros, Wonderful Pistachios had a correct kcal with macros on the wrong
 * basis. Identical internal signature, opposite answers. Nothing inside a single
 * record can separate them — only a second opinion can.
 */

import { lookupUSDAByBarcode } from '@/lib/usda'
import { plausibleOffKcal, detectOffEnergyConflict, offKjPer100 } from '@/lib/offEnergy'

const OFF_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'
const UA = 'BecomeApp/1.0 (nutrition verification)'

export type EvidenceSource = 'openfoodfacts' | 'usda' | 'user-photo' | 'stored'

export interface EvidenceValues {
  /** Per 100 g/ml, so every source is directly comparable. */
  caloriesPer100?: number
  proteinPer100?: number
  carbsPer100?: number
  fatsPer100?: number
  /**
   * Fiber per 100. Carried because Atwater is wrong without it.
   *
   * Total carbs at 4 cal/g double-counts fiber, which the body largely does not
   * absorb. On an ordinary food the error is small; on a "zero net carb"
   * product, where fiber IS the carbohydrate, the estimate comes out roughly
   * double the true figure and a perfectly correct record reads as internally
   * inconsistent. That is not hypothetical: it is what made the reviewer call
   * a correct Mission tortilla record broken on 2026-08-11.
   */
  fiberPer100?: number
  /**
   * The rest of the panel. A label is a single coherent object, and the parts
   * we ignore are the parts that catch the errors the macros hide: sodium and
   * saturated fat scale with the serving basis exactly like everything else, so
   * a source that agrees on protein but is 3x out on sodium is describing a
   * different serving, not a different opinion about protein.
   */
  sugarPer100?: number
  sodiumPer100?: number
  saturatedFatPer100?: number
  /** The serving the source describes, when it states one. */
  servingGrams?: number
  servingLabel?: string
  /**
   * Identity signals beyond the name. Servings per container multiplied by the
   * serving weight gives the package size, which is a strong and independent
   * check that two sources describe the same physical product.
   */
  servingsPerContainer?: number
  packageGrams?: number
}

export interface EvidenceItem {
  source: EvidenceSource
  url?: string
  /**
   * HOW this source was identified as the product in front of us. Distinct from
   * how good its numbers are, and far more important for deciding whether it
   * describes the same thing.
   *
   * `barcode` means it was resolved from the exact UPC the member scanned, so
   * its identity is not in question. `photo` is the package they were holding.
   * `name` is a text match, which is the weakest: brands ship many lines whose
   * names differ by one word.
   *
   * The gap this closes is real. A UPC-resolved OpenFoodFacts entry had a
   * member's package exactly right — correct serving basis, macros matching the
   * printed label to the decimal — and lost to two retailer pages found by NAME,
   * because the reviewer was only told to rank sources by data quality and
   * ranked "user-submitted database" below "retailer".
   */
  matchedBy?: 'barcode' | 'photo' | 'name'
  values: EvidenceValues
  /**
   * For a user photo: does the product IDENTITY on the packaging match the
   * record being verified? Undefined when we could not read a name off it.
   *
   * This is the difference between a claim and a source. A panel photo has no
   * inherent link to the food it was attached to — someone can photograph a
   * cereal box while reporting a tortilla, maliciously or by simple mistake,
   * and the numbers on it will be perfectly self-consistent. Atwater cannot
   * catch that; only reading the NAME off the package can.
   */
  identityMatch?: boolean
  identityRead?: string
  /** Anything the source says about itself that the reviewer should weigh —
   *  notably OFF records that contradict their own kJ field. */
  caveat?: string
  at: string
}

export interface EvidenceBundle {
  barcode?: string
  items: EvidenceItem[]
  /**
   * True when at least one source is independent of the one we imported from
   * AND trustworthy enough to weigh. Without this the "evidence" is just our
   * own record echoed back.
   *
   * A user photo only counts once its product identity is confirmed against
   * the record. Unconfirmed, it is a strong PRIORITY signal — someone bothered
   * to report and photograph — but it cannot by itself justify a catalogue
   * write, because we cannot tell a mis-attached panel from a correct one.
   */
  hasIndependentSource: boolean
}

const round = (n: number | undefined, dp = 2): number | undefined =>
  n == null || !isFinite(n) ? undefined : Math.round(n * 10 ** dp) / 10 ** dp

/**
 * Does a product name read off a photo plausibly refer to the record?
 *
 * Deliberately a token-overlap test rather than an exact match: labels carry
 * marketing text ("Mission Original Zero Net Carbs Tortillas") that a record
 * name ("Original Zero") never will. Requires a real content word in common,
 * so "Cheerios" against "Original Zero" fails while a wordier variant of the
 * same product passes.
 *
 * Returns undefined when nothing was read — unknown is NOT the same as
 * mismatched, and it must not be treated as either a pass or a rejection.
 */
export function matchesRecord(
  photoIdentity: string | undefined,
  recordName: string | undefined,
  recordBrand?: string,
): boolean | undefined {
  if (!photoIdentity || !photoIdentity.trim() || !recordName) return undefined

  const STOP = new Set(['the', 'and', 'with', 'of', 'a', 'net', 'carbs', 'original', 'flavor', 'flavour'])
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOP.has(t)),
    )

  const photo = tokens(photoIdentity)
  const name = tokens(recordName)
  const brand = tokens(recordBrand ?? '')
  if (photo.size === 0) return undefined

  const shares = (a: Set<string>) => {
    for (const t of a) if (photo.has(t)) return true
    return false
  }

  // The distinguishing part of the product NAME is present: same product.
  if (name.size > 0 && shares(name)) return true

  // Right brand, none of the name. A brand ships many lines, so this is
  // positive evidence of a DIFFERENT one rather than a weak match — "Mission
  // Carb Balance" against a record for "Mission Zero Net Carbs" is two
  // products, and treating the shared brand token as a match invited the
  // reviewer to rewrite one line's macros with the other's.
  if (brand.size > 0 && shares(brand)) return false

  // Nothing in common at all. Only call that a mismatch when the read is
  // specific enough to be an identity: a single generic word like "Tortillas"
  // means we failed to read a brand, not that the reporter photographed the
  // wrong thing, and accusing them on that basis makes the pipeline ignore a
  // perfectly good panel.
  return photo.size >= 2 ? false : undefined
}

/**
 * Atwater estimate — the free cross-check every source gets measured against.
 *
 * Uses NET carbs when fiber is known. Fiber is counted in total carbohydrate on
 * a label but contributes little or no energy, so charging it 4 cal/g inflates
 * the estimate. On most foods that is noise. On a high-fiber product it is the
 * difference between "this record is fine" and "this record is twice what it
 * should be" — see fiberPer100 above.
 *
 * Fiber is valued at 0, matching how these products compute net carbs. The FDA
 * permits 2 cal/g for soluble fiber, so on a very high-fiber food the true
 * figure sits between this estimate and this estimate plus 2x fiber. The
 * reviewer is told to treat it as a band rather than a point.
 */
export function atwater(v: EvidenceValues): number | undefined {
  const p = v.proteinPer100
  const c = v.carbsPer100
  const f = v.fatsPer100
  if (p == null && c == null && f == null) return undefined
  // Never let a bad fiber figure push carbs negative.
  const netCarbs = Math.max(0, (c ?? 0) - (v.fiberPer100 ?? 0))
  return round(4 * (p ?? 0) + 4 * netCarbs + 9 * (f ?? 0), 1)
}

/** The upper end of the band: fiber charged at the FDA's 2 cal/g for soluble. */
export function atwaterUpper(v: EvidenceValues): number | undefined {
  const base = atwater(v)
  if (base == null) return undefined
  return round(base + 2 * (v.fiberPer100 ?? 0), 1)
}

async function fromOpenFoodFacts(barcode: string): Promise<EvidenceItem | null> {
  try {
    const res = await fetch(`${OFF_ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=nutriments,serving_size,serving_quantity`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      status?: number
      product?: { nutriments?: Record<string, unknown>; serving_size?: string; serving_quantity?: number }
    }
    // v2 omits `status` when the field list is narrow, so presence of the
    // payload is the real signal — checking status alone reports every hit as
    // a miss.
    if (data.status != null && data.status !== 1) return null
    const n = data.product?.nutriments
    if (!n) return null

    const shaped = {
      energy_kcal_100g: Number(n['energy-kcal_100g'] ?? n['energy_kcal_100g']) || undefined,
      energy_kj_100g: offKjPer100(n),
      proteins_100g: Number(n['proteins_100g']) || undefined,
      carbohydrates_100g: Number(n['carbohydrates_100g']) || undefined,
      fat_100g: Number(n['fat_100g']) || undefined,
      fiber_100g: Number(n['fiber_100g']) || undefined,
      alcohol_100g: Number(n['alcohol_100g']) || undefined,
      sugars_100g: Number(n['sugars_100g']) || undefined,
      sodium_100g: Number(n['sodium_100g']) || undefined,
      saturated_fat_100g: Number(n['saturated-fat_100g'] ?? n['saturated_fat_100g']) || undefined,
    }
    const conflict = detectOffEnergyConflict(shaped)

    return {
      source: 'openfoodfacts',
      matchedBy: 'barcode',
      url: `https://world.openfoodfacts.org/product/${barcode}`,
      values: {
        caloriesPer100: round(plausibleOffKcal(shaped), 1),
        proteinPer100: round(shaped.proteins_100g),
        carbsPer100: round(shaped.carbohydrates_100g),
        fatsPer100: round(shaped.fat_100g),
        fiberPer100: round(shaped.fiber_100g),
        sugarPer100: round(shaped.sugars_100g),
        sodiumPer100: round(shaped.sodium_100g, 3),
        saturatedFatPer100: round(shaped.saturated_fat_100g),
        servingGrams: round(data.product?.serving_quantity),
        servingLabel: data.product?.serving_size,
      },
      // Surfaced, not resolved. A source that disagrees with itself is exactly
      // what the reviewer needs to know before trusting it.
      caveat: conflict ? conflict.reason : undefined,
      at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/** USDA results carry their fdcId in a prefixed `_id` ("usda-123456"). */
function fdcUrl(id: string | undefined): string | undefined {
  const fdcId = typeof id === 'string' && id.startsWith('usda-') ? id.slice('usda-'.length) : undefined
  return fdcId ? `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients` : undefined
}

async function fromUSDA(barcode: string): Promise<EvidenceItem | null> {
  try {
    const hit = await lookupUSDAByBarcode(barcode)
    if (!hit) return null
    const size = hit.servingSize && hit.servingSize > 0 ? hit.servingSize : 100
    const scale = 100 / size
    return {
      source: 'usda',
      matchedBy: 'barcode',
      url: fdcUrl(hit._id),
      values: {
        caloriesPer100: round((hit.nutrition?.calories ?? 0) * scale, 1),
        proteinPer100: round((hit.nutrition?.protein ?? 0) * scale),
        carbsPer100: round((hit.nutrition?.carbs ?? 0) * scale),
        fatsPer100: round((hit.nutrition?.fats ?? 0) * scale),
        fiberPer100: hit.nutrition?.fiber != null ? round(hit.nutrition.fiber * scale) : undefined,
        sugarPer100: hit.nutrition?.sugar != null ? round(hit.nutrition.sugar * scale) : undefined,
        sodiumPer100: hit.nutrition?.sodium != null ? round(hit.nutrition.sodium * scale, 3) : undefined,
        saturatedFatPer100:
          hit.nutrition?.saturatedFat != null ? round(hit.nutrition.saturatedFat * scale) : undefined,
        servingGrams: round(hit.gramsPerServing ?? undefined),
        servingLabel: hit.displayLabel,
      },
      at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export interface GatherInput {
  barcode?: string
  /** What we currently store, normalised per 100. Always included so the
   *  reviewer can see what it is being asked about. */
  stored: EvidenceValues
  /** Values a user read off the label, when they submitted a report. */
  userClaim?: EvidenceValues
  userPhotoUrl?: string
  /** Product name read off the user's photo by the vision pass, if any. */
  userPhotoIdentity?: string
  /** The record's own name/brand, to check that identity against. */
  recordName?: string
  recordBrand?: string
}

/**
 * Collect what every reachable source says. Never decides anything.
 *
 * A bundle with no independent source is not evidence — it is our own record
 * quoted back at us — so `hasIndependentSource` is reported honestly and the
 * caller is expected to treat its absence as "insufficient" rather than
 * pushing on.
 */
export async function gatherEvidence(input: GatherInput): Promise<EvidenceBundle> {
  const items: EvidenceItem[] = [
    { source: 'stored', values: input.stored, at: new Date().toISOString() },
  ]

  if (input.userClaim) {
    const identityMatch = matchesRecord(input.userPhotoIdentity, input.recordName, input.recordBrand)
    items.push({
      source: 'user-photo',
      matchedBy: 'photo',
      url: input.userPhotoUrl,
      values: input.userClaim,
      identityMatch,
      identityRead: input.userPhotoIdentity,
      at: new Date().toISOString(),
    })
  }

  if (input.barcode) {
    const [off, usda] = await Promise.all([
      fromOpenFoodFacts(input.barcode),
      fromUSDA(input.barcode),
    ])
    if (off) items.push(off)
    if (usda) items.push(usda)
  }

  const hasIndependentSource = items.some((i) => {
    if (i.source === 'usda' || i.source === 'openfoodfacts') return true
    // A photo counts ONLY when we confirmed it is the same product.
    if (i.source === 'user-photo') return i.identityMatch === true
    return false
  })

  return { barcode: input.barcode, items, hasIndependentSource }
}
