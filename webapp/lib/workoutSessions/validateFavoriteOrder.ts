// Pure validator + normalizer for the PATCH /api/workouts/favorite-order
// request body. Extracted so we can unit-test the rules without HTTP.

export type ValidateFavoriteOrderResult =
  | { ok: true; order: string[] }
  | { ok: false; error: string }

const MAX_FAVORITES = 200

export function validateFavoriteOrderPayload(
  body: unknown,
): ValidateFavoriteOrderResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be an object with order' }
  }
  const raw = (body as { order?: unknown }).order
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'order must be an array' }
  }
  if (raw.length > MAX_FAVORITES) {
    return { ok: false, error: `order may not exceed ${MAX_FAVORITES} entries` }
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'order entries must be strings' }
    }
    const trimmed = item.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue // dedup silently — preserves first occurrence
    seen.add(trimmed)
    out.push(trimmed)
  }
  return { ok: true, order: out }
}
