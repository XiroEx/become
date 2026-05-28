// Pure validator + normalizer for the PATCH /api/dashboard/pinned-tiles
// request body. Extracted so we can unit-test the rules without HTTP.

export type ValidatePinnedTilesResult =
  | { ok: true; pinnedTiles: string[] }
  | { ok: false; error: string }

const MAX_PINS = 20

export function validatePinnedTilesPayload(
  body: unknown,
): ValidatePinnedTilesResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be an object with pinnedTiles' }
  }
  const raw = (body as { pinnedTiles?: unknown }).pinnedTiles
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'pinnedTiles must be an array' }
  }
  if (raw.length > MAX_PINS) {
    return { ok: false, error: `pinnedTiles may not exceed ${MAX_PINS} entries` }
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'pinnedTiles entries must be strings' }
    }
    const trimmed = item.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue // dedup silently — preserves first occurrence
    seen.add(trimmed)
    out.push(trimmed)
  }
  return { ok: true, pinnedTiles: out }
}
