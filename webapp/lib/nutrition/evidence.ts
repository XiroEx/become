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
  /** The serving the source describes, when it states one. */
  servingGrams?: number
  servingLabel?: string
}

export interface EvidenceItem {
  source: EvidenceSource
  url?: string
  values: EvidenceValues
  /** Anything the source says about itself that the reviewer should weigh —
   *  notably OFF records that contradict their own kJ field. */
  caveat?: string
  at: string
}

export interface EvidenceBundle {
  barcode?: string
  items: EvidenceItem[]
  /** True when at least one source is independent of the one we imported from.
   *  Without this the "evidence" is just our own record echoed back. */
  hasIndependentSource: boolean
}

const round = (n: number | undefined, dp = 2): number | undefined =>
  n == null || !isFinite(n) ? undefined : Math.round(n * 10 ** dp) / 10 ** dp

/** Atwater estimate — the free cross-check every source gets measured against. */
export function atwater(v: EvidenceValues): number | undefined {
  const p = v.proteinPer100
  const c = v.carbsPer100
  const f = v.fatsPer100
  if (p == null && c == null && f == null) return undefined
  return round(4 * (p ?? 0) + 4 * (c ?? 0) + 9 * (f ?? 0), 1)
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
    }
    const conflict = detectOffEnergyConflict(shaped)

    return {
      source: 'openfoodfacts',
      url: `https://world.openfoodfacts.org/product/${barcode}`,
      values: {
        caloriesPer100: round(plausibleOffKcal(shaped), 1),
        proteinPer100: round(shaped.proteins_100g),
        carbsPer100: round(shaped.carbohydrates_100g),
        fatsPer100: round(shaped.fat_100g),
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
      url: fdcUrl(hit._id),
      values: {
        caloriesPer100: round((hit.nutrition?.calories ?? 0) * scale, 1),
        proteinPer100: round((hit.nutrition?.protein ?? 0) * scale),
        carbsPer100: round((hit.nutrition?.carbs ?? 0) * scale),
        fatsPer100: round((hit.nutrition?.fats ?? 0) * scale),
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
    items.push({
      source: 'user-photo',
      url: input.userPhotoUrl,
      values: input.userClaim,
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

  const hasIndependentSource = items.some(
    (i) => i.source === 'usda' || i.source === 'user-photo' || i.source === 'openfoodfacts',
  )

  return { barcode: input.barcode, items, hasIndependentSource }
}
