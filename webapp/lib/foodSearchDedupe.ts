/**
 * Pure helpers for deduping external food-search results (USDA / Open Food
 * Facts) against the user's existing customFoods (foods already present in
 * our Foods collection).
 *
 * Why this lives here: previously the search route built the seen-set inline
 * by iterating only the top-N customFoods that made it into the displayed
 * page. Any matching customFood ranked past N would leak its USDA fdcId /
 * OFF barcode through as a "live" external hit even though our DB already
 * owns it. This module centralises the seen-key construction so the route
 * can feed it the full match-pool (not just the displayed top-N) and so the
 * logic is unit-testable without spinning up Mongo.
 */

export type DedupeSource = 'usda' | 'openfoodfacts'

/**
 * Source-prefixed dedupe key. Prefixing prevents accidental collisions when
 * a USDA fdcId happens to share a numeric value with an OFF barcode.
 */
export function externalKey(source: DedupeSource, id: string): string {
  return `${source}:${id}`
}

/**
 * Shape we need from a customFood for dedupe. We only look at source +
 * externalId at parent and variant level — nutrition / serving / etc. are
 * irrelevant here.
 */
export interface CustomFoodForDedupe {
  source?: string | null
  externalId?: string | null
  variants?: Array<{ externalId?: string | null }> | null
}

/**
 * External search result shape we need for dedupe. Only `_id` matters —
 * `usda-<fdcId>` or `off-<code>`. Anything else passes through unfiltered.
 */
export interface ExternalResultForDedupe {
  _id?: unknown
}

function isDedupeSource(s: string | null | undefined): s is DedupeSource {
  return s === 'usda' || s === 'openfoodfacts'
}

/**
 * Build the source-prefixed seen-key set from a customFoods array. Iterates
 * EVERY customFood passed in (no slicing) — caller decides how wide the
 * pool is. Both the parent externalId and any per-variant externalIds are
 * added under the parent's source. Manual-source foods contribute no keys
 * (no upstream id to match against).
 */
export function buildSeenKeys(customFoods: CustomFoodForDedupe[]): Set<string> {
  const seen = new Set<string>()
  for (const f of customFoods) {
    const src = f.source
    if (!isDedupeSource(src)) continue

    if (typeof f.externalId === 'string' && f.externalId) {
      seen.add(externalKey(src, f.externalId))
    }
    const variants = Array.isArray(f.variants) ? f.variants : []
    for (const v of variants) {
      if (v && typeof v.externalId === 'string' && v.externalId) {
        seen.add(externalKey(src, v.externalId))
      }
    }
  }
  return seen
}

function fdcIdFromUsdaResultId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  if (!id.startsWith('usda-')) return null
  const rest = id.slice('usda-'.length)
  return rest || null
}

function codeFromOffResultId(id: unknown): string | null {
  if (typeof id !== 'string') return null
  if (!id.startsWith('off-')) return null
  const rest = id.slice('off-'.length)
  return rest || null
}

/**
 * Drop USDA + OFF results whose external id is already represented by some
 * customFood in our DB. The customFoods pool MUST be the full match-set —
 * not just the top-N displayed — or duplicates will slip through.
 *
 * Pure: no IO, no globals, no mutation of inputs.
 */
export function dedupeBySource<
  U extends ExternalResultForDedupe,
  O extends ExternalResultForDedupe,
>(
  customFoods: CustomFoodForDedupe[],
  usdaResults: U[],
  offResults: O[],
): { usda: U[]; off: O[]; seenKeys: Set<string> } {
  const seen = buildSeenKeys(customFoods)
  const usda = usdaResults.filter(r => {
    const fdcId = fdcIdFromUsdaResultId(r._id)
    if (!fdcId) return true
    return !seen.has(externalKey('usda', fdcId))
  })
  const off = offResults.filter(r => {
    const code = codeFromOffResultId(r._id)
    if (!code) return true
    return !seen.has(externalKey('openfoodfacts', code))
  })
  return { usda, off, seenKeys: seen }
}
