// ---------------------------------------------------------------------------
// foodCanonicalName — derive the canonical display name for a Food doc from
// an upstream description.
//
// Previously, the canonical-name logic was inlined in two places in
// foodImport.ts:
//   1. The merge path renamed the parent Food to `prettifyGroupKey(groupKey)`.
//   2. The no-merge / overflow-sibling path used `baseName` (a minimally
//      cleaned form of the USDA description), which preserved ALL-CAPS
//      input, internal commas, and brand-code tails.
//
// That divergence meant a USDA group that overflowed the 12-variant cap
// produced an overflow sibling named e.g. "CHEESE,CHEDDAR,SHARP,BRANDED 1234"
// while the in-cap sibling for the same group displayed as "Cheese Cheddar".
// Centralising the rule here keeps both sites consistent.
// ---------------------------------------------------------------------------

import { baseGroupKey, prettifyGroupKey } from '@/lib/foodGrouping'

export type FoodNameSource = 'usda' | 'openfoodfacts' | 'manual'

/**
 * Title-case a comma-separated description segment by segment.
 *
 *   "CHEESE,CHEDDAR,SHARP"  →  "Cheese, Cheddar, Sharp"
 *   "greek yogurt"          →  "Greek Yogurt"
 *
 * Used as a fallback when groupKey-based normalization yields nothing.
 */
function titleCaseDescription(s: string): string {
  return s
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part =>
      part
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' '),
    )
    .join(', ')
}

/**
 * True when a string is uppercase-dominant (has uppercase letters, no
 * lowercase letters). Used to detect ALL-CAPS upstream descriptions that
 * should be title-cased before display.
 */
function isAllCaps(s: string): boolean {
  return /[A-Z]/.test(s) && !/[a-z]/.test(s)
}

/**
 * Build the canonical Food.name from a raw upstream description.
 *
 * For USDA: we run the same `baseGroupKey` → `prettifyGroupKey` pipeline
 * the in-cap merge path uses, so an overflow sibling produces the same
 * name as a sibling that fit inside the cap. When the group key collapses
 * to empty (very short or atypical descriptions), we fall back to a
 * title-cased comma-stripped form of the description so the result is
 * still presentable.
 *
 * For OpenFoodFacts and manual sources: near-passthrough. We only adjust
 * when the input is ALL-CAPS (common for some OFF branded entries) — in
 * that case we title-case it. Otherwise the upstream form is treated as
 * already canonical.
 *
 * Empty / null / undefined input returns ''.
 *
 * Pure: no IO, no globals, no mutation.
 */
export function canonicalFoodName(
  rawDescription: string | null | undefined,
  source: FoodNameSource = 'usda',
): string {
  const raw = (rawDescription ?? '').trim()
  if (!raw) return ''

  if (source === 'usda') {
    // Strip a trailing prep qualifier the same way importFromUSDA's
    // baseName derivation does: any "comma + lowercase-only tail" at end.
    // Case-insensitive so ALL-CAPS USDA descriptions also collapse.
    const stripped = raw.replace(/,\s*[a-z][a-z\s\-/]*$/i, '').trim() || raw
    const groupKey = baseGroupKey(stripped)
    if (groupKey) {
      const pretty = prettifyGroupKey(groupKey)
      if (pretty) return pretty
    }
    // Fallback: title-case the stripped description.
    return titleCaseDescription(stripped) || titleCaseDescription(raw)
  }

  // Non-USDA: pass through unless ALL-CAPS, in which case title-case.
  if (isAllCaps(raw)) return titleCaseDescription(raw)
  return raw
}
