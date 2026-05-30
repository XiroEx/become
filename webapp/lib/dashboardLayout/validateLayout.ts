// Validator for the PATCH /api/dashboard/layout request body.
//
// The body shape is { layout: DashboardTile[] }. Delegates the per-tile and
// max-count rules to parseDashboardLayout in ./types (single source of truth),
// wrapping the throw/return into a {ok}-discriminated result so the route can
// branch without try/catch. Pure + node-safe (no React/DOM/Mongoose).

import {
  parseDashboardLayout,
  DashboardLayoutError,
  type DashboardLayout,
} from './types'

export type ValidateLayoutResult =
  | { ok: true; layout: DashboardLayout }
  | { ok: false; error: string }

export function validateLayoutPayload(body: unknown): ValidateLayoutResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body must be an object with a layout array' }
  }
  const raw = (body as { layout?: unknown }).layout
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'layout must be an array' }
  }
  try {
    return { ok: true, layout: parseDashboardLayout(raw) }
  } catch (err) {
    if (err instanceof DashboardLayoutError) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: 'invalid layout' }
  }
}
