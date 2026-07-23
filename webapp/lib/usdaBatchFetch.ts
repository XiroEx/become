// ---------------------------------------------------------------------------
// usdaBatchFetch — batch USDA FoodData Central detail fetches.
//
// The single-id endpoint (`GET /v1/food/{fdcId}`) costs one round-trip per
// item, which adds up when the background-import worker queues up to N
// foods at the end of a search. USDA also exposes a batch endpoint
// (`POST /v1/foods?api_key=…` with `{ fdcIds: [...] }`) that returns up to
// 20 detail records in a single request — same payload shape per item.
//
// This module wraps that endpoint with explicit per-batch chunking,
// response-shape normalisation (matching what `fetchUSDAById` produces),
// and error-per-id passthrough so a single bad item never poisons the
// whole batch.
// ---------------------------------------------------------------------------

import type { USDAFood, USDAFoodPortion } from '@/lib/usda'
import { normalizeNutrients, type USDADetailNutrient } from '@/lib/usda'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

const API_BASE = 'https://api.nal.usda.gov/fdc/v1'

/**
 * USDA's documented per-request cap on the `/foods` batch endpoint.
 * Exposed for tests; do not mutate at runtime.
 */
export const MAX_PER_BATCH = 20

export type BatchResult = Map<string, USDAFood | Error>

export interface BatchFetchOptions {
  apiKey?: string
  signalTimeoutMs?: number
  /** Override for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch
}

function normalizeFoodPortions(raw: unknown): USDAFoodPortion[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: USDAFoodPortion[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const portion = p as Record<string, unknown>
    const gw = portion.gramWeight
    if (typeof gw !== 'number' || gw <= 0) continue
    out.push({
      id: typeof portion.id === 'number' ? portion.id : undefined,
      amount: typeof portion.amount === 'number' ? portion.amount : undefined,
      modifier: typeof portion.modifier === 'string' ? portion.modifier : undefined,
      gramWeight: gw,
      portionDescription:
        typeof portion.portionDescription === 'string' ? portion.portionDescription : undefined,
      sequenceNumber: typeof portion.sequenceNumber === 'number' ? portion.sequenceNumber : undefined,
      dataPoints: typeof portion.dataPoints === 'number' ? portion.dataPoints : undefined,
    })
  }
  return out.length > 0 ? out : undefined
}

function normalizeBatchItem(raw: Record<string, unknown>): USDAFood | null {
  const fdcId = raw.fdcId
  if (typeof fdcId !== 'number') return null
  return {
    ...(raw as unknown as USDAFood),
    foodNutrients: normalizeNutrients(raw.foodNutrients as USDADetailNutrient[] | undefined),
    foodPortions: normalizeFoodPortions(raw.foodPortions),
  }
}

/**
 * Fetch detail records for an arbitrary list of USDA fdcIds in batches of
 * `MAX_PER_BATCH` (20). Duplicates in the input are deduped while
 * preserving first-seen order.
 *
 * The returned `Map` is keyed by fdcId (as a string). On success the value
 * is the normalised `USDAFood`. On per-id failure (missing from response,
 * malformed item) or per-chunk failure (HTTP non-2xx, network error,
 * timeout, malformed JSON) the value is an `Error` — letting the caller
 * decide whether to skip, retry, or log. No single failure aborts other
 * chunks.
 *
 * Empty input is a no-op (returns an empty map; no fetch call is made).
 */
export async function fetchUSDAFoodsBatch(
  fdcIds: string[],
  options?: BatchFetchOptions,
): Promise<BatchResult> {
  const result: BatchResult = new Map()
  if (!Array.isArray(fdcIds) || fdcIds.length === 0) return result

  // Dedupe + stringify, preserving first-seen order.
  const uniqueIds: string[] = []
  const seen = new Set<string>()
  for (const id of fdcIds) {
    const s = String(id ?? '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    uniqueIds.push(s)
  }

  const apiKey = options?.apiKey ?? (await getRuntimeConfig()).external.usdaApiKey ?? 'DEMO_KEY'
  const timeoutMs = options?.signalTimeoutMs ?? 15000
  const fetchImpl = options?.fetchImpl ?? fetch

  for (let i = 0; i < uniqueIds.length; i += MAX_PER_BATCH) {
    const chunk = uniqueIds.slice(i, i + MAX_PER_BATCH)
    try {
      const res = await fetchImpl(`${API_BASE}/foods?api_key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fdcIds: chunk }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      })

      if (!res.ok) {
        const err = new Error(`USDA batch fetch failed: ${res.status} ${res.statusText}`)
        for (const id of chunk) result.set(id, err)
        continue
      }

      const data = await res.json()
      if (!Array.isArray(data)) {
        const err = new Error('USDA batch response was not an array')
        for (const id of chunk) result.set(id, err)
        continue
      }

      // Build a quick lookup of returned fdcIds.
      const returned = new Map<string, Record<string, unknown>>()
      for (const item of data) {
        if (!item || typeof item !== 'object') continue
        const fdcId = (item as { fdcId?: unknown }).fdcId
        if (typeof fdcId !== 'number') continue
        returned.set(String(fdcId), item as Record<string, unknown>)
      }

      for (const id of chunk) {
        const raw = returned.get(id)
        if (!raw) {
          result.set(id, new Error(`USDA fdcId ${id} not found in batch response`))
          continue
        }
        const normalized = normalizeBatchItem(raw)
        if (!normalized) {
          result.set(id, new Error(`USDA fdcId ${id} returned malformed payload`))
          continue
        }
        result.set(id, normalized)
      }
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err))
      for (const id of chunk) {
        // Don't overwrite a per-id success from an earlier chunk.
        if (!result.has(id)) result.set(id, wrapped)
      }
    }
  }

  return result
}
