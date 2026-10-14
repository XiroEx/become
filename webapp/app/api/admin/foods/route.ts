// ---------------------------------------------------------------------------
// Admin Foods API — list endpoint.
//
//   GET /api/admin/foods
//     ?q=...            full-text + name/brand regex search
//     &flagged=1        return only needsReview foods
//     &source=manual    filter by source (manual | usda | openfoodfacts)
//     &issue=...        filter by issue code(s), comma-separated
//     &origin=...       filter by reviewFlag origin
//     &excludeLegacy=1  exclude legacy flags with no provenance
//     &sortBy=recent    recent (default) | usage | name
//     &offset=0
//     &limit=50
//
// Response: { foods: [...], total, offset, limit, flaggedCount, issueCounts, legacyCount }
//
// Each food in the list is a `flattenFoodForResponse`-shaped object so the
// admin UI can reuse the same field names as the public foods endpoints.
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { handleAdminFoodsList } from '@/lib/adminFoods'

export async function GET(request: NextRequest) {
  return handleAdminFoodsList(request)
}
