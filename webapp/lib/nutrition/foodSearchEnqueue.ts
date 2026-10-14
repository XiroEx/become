/**
 * Fire-and-forget enqueueing of unverified foods surfaced by search.
 *
 * Runs after the search response is sent via `after()`.
 * Bounded per request, idempotent, and respects verification.expiresAt.
 */

import Food from '@/models/Food'
import {
  canEnqueue,
  enqueueFilter,
  enqueueUpdate,
  DEFAULT_SEARCH_ENQUEUE_LIMIT,
} from './flagPolicy'

export interface EnqueueSearchFoodsOptions {
  /** Maximum number of foods to enqueue in this run (default: DEFAULT_SEARCH_ENQUEUE_LIMIT). */
  limit?: number
  /** Clock time for expiry and claim calculations (default: now). */
  now?: Date | number
  /** Optional custom collection for testing without a database. */
  collection?: {
    updateOne(
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
    ): Promise<{ modifiedCount: number; matchedCount?: number }>
  }
}

export interface EnqueueSearchFoodsResult {
  enqueuedCount: number
  enqueuedIds: string[]
  skippedCount: number
}

/**
 * Enqueue unverified foods returned by member search.
 *
 *  - Bounded per request by `options.limit` (default 5).
 *  - Only considers foods that satisfy `canEnqueue()`.
 *  - Idempotent: already-queued/running foods are no-ops.
 *  - Atomic: uses `enqueueFilter` to prevent racing with the drain.
 *  - Fire-and-forget: swallows internal errors so search callers never fail.
 */
export async function enqueueUnverifiedFoodsFromSearch(
  foods: unknown[],
  options: EnqueueSearchFoodsOptions = {},
): Promise<EnqueueSearchFoodsResult> {
  const limit = options.limit ?? DEFAULT_SEARCH_ENQUEUE_LIMIT
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())
  const nowMs = now.getTime()

  if (!Array.isArray(foods) || foods.length === 0 || limit <= 0) {
    return { enqueuedCount: 0, enqueuedIds: [], skippedCount: 0 }
  }

  const eligible: Array<{ _id: unknown; idStr: string }> = []
  let skipped = 0

  for (const item of foods) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const id = candidate._id
    if (!id) continue

    // Skip external synthetic IDs (usda-*, off-*) that are not in our DB
    if (typeof id === 'string' && (id.startsWith('usda-') || id.startsWith('off-'))) {
      continue
    }

    const idStr = String(id)

    if (canEnqueue(candidate, nowMs)) {
      eligible.push({ _id: id, idStr })
    } else {
      skipped++
    }
  }

  // Rate-limited per run
  const toEnqueue = eligible.slice(0, limit)
  if (eligible.length > limit) {
    skipped += eligible.length - limit
  }

  if (toEnqueue.length === 0) {
    return { enqueuedCount: 0, enqueuedIds: [], skippedCount: skipped }
  }

  const enqueuedIds: string[] = []
  const col = options.collection ?? Food

  for (const { _id, idStr } of toEnqueue) {
    try {
      const filter = enqueueFilter(_id, now)
      const update = enqueueUpdate()
      const res = await col.updateOne(filter, update)
      if (res.modifiedCount > 0) {
        enqueuedIds.push(idStr)
      }
    } catch (err) {
      console.warn(`[search-enqueue] Failed to enqueue food ${idStr}:`, err)
    }
  }

  return {
    enqueuedCount: enqueuedIds.length,
    enqueuedIds,
    skippedCount: skipped,
  }
}

export const enqueueSearchFoods = enqueueUnverifiedFoodsFromSearch
export const enqueueFoodsFromSearch = enqueueUnverifiedFoodsFromSearch
