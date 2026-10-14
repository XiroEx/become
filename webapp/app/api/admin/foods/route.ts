// ---------------------------------------------------------------------------
// Admin Foods API — list endpoint.
//
//   GET /api/admin/foods
//     ?q=...            full-text + name/brand regex search
//     &flagged=1        return only needsReview foods
//     &issue=...        filter by issue code(s) (comma-separated, validated)
//     &origin=...       filter by flag origin (comma-separated, validated)
//     &excludeLegacy=1  exclude legacy/no-provenance flags
//     &source=manual    filter by source (manual | usda | openfoodfacts)
//     &sortBy=recent    recent (default) | usage | name
//     &offset=0
//     &limit=50
//
// Response: {
//   foods: [...],
//   total: number,
//   offset,
//   limit,
//   flaggedCount,
//   issueCounts,
//   legacyCount,
//   legacyFlaggedCount
// }
//
// Each food in the list is a `flattenFoodForResponse`-shaped object so the
// admin UI can reuse the same field names as the public foods endpoints.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Food, { IFood } from '@/models/Food'
import { verifyAdmin } from '@/lib/adminAuth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import {
  parseReviewIssueCodes,
  parseReviewOrigins,
  buildFoodAdminFilter,
  FOOD_REVIEW_FACET_PIPELINE,
  parseFoodReviewFacetResult,
  type ReviewIssueCode,
  type FoodReviewOrigin,
} from '@/lib/foodReview'
import type mongoose from 'mongoose'

type FoodLean = IFood & { _id: mongoose.Types.ObjectId }

interface FacetRawResult {
  total?: Array<{ count: number }>
  byIssue?: Array<{ _id: string; count: number }>
  legacy?: Array<{ count: number }>
}

export async function handleAdminFoodsList(
  request: NextRequest,
  options: { skipAuth?: boolean } = {},
) {
  try {
    if (!options.skipAuth) {
      const adminResult = await verifyAdmin(request)
      if (!adminResult.success) {
        return NextResponse.json(
          { error: adminResult.error },
          { status: adminResult.status ?? 401 },
        )
      }

      await dbConnect()
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') ?? '').trim()
    const flagged = searchParams.get('flagged') === '1' || searchParams.get('flagged') === 'true'
    const source = (searchParams.get('source') ?? '').trim()
    const sortBy = (searchParams.get('sortBy') ?? 'recent').trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

    const issueParam = searchParams.get('issue')
    let parsedIssues: ReviewIssueCode[] | undefined
    if (issueParam && issueParam.trim()) {
      const parsed = parseReviewIssueCodes(issueParam)
      if (!parsed.valid) {
        return NextResponse.json(
          { error: `Invalid issue code: ${parsed.invalid}` },
          { status: 400 },
        )
      }
      parsedIssues = parsed.codes
    }

    const originParam = searchParams.get('origin')
    let parsedOrigins: FoodReviewOrigin[] | undefined
    if (originParam && originParam.trim()) {
      const parsed = parseReviewOrigins(originParam)
      if (!parsed.valid) {
        return NextResponse.json(
          { error: `Invalid origin: ${parsed.invalid}` },
          { status: 400 },
        )
      }
      parsedOrigins = parsed.origins
    }

    const excludeLegacyParam = searchParams.get('excludeLegacy') ?? searchParams.get('exclude_legacy')
    const excludeLegacy = excludeLegacyParam === '1' || excludeLegacyParam === 'true'

    const filter = buildFoodAdminFilter({
      q,
      flagged,
      source,
      issues: parsedIssues,
      origins: parsedOrigins,
      excludeLegacy,
    })

    const sort: Record<string, 1 | -1> = sortBy === 'usage'
      ? { usageCount: -1, updatedAt: -1 }
      : sortBy === 'name'
        ? { name: 1 }
        : { updatedAt: -1, createdAt: -1 } // 'recent' default

    const [foods, total, aggregateResults] = await Promise.all([
      Food.find(filter).sort(sort).skip(offset).limit(limit).lean<FoodLean[]>(),
      Food.countDocuments(filter),
      Food.aggregate<FacetRawResult>(FOOD_REVIEW_FACET_PIPELINE),
    ])

    const counts = parseFoodReviewFacetResult(aggregateResults[0])

    return NextResponse.json({
      foods: foods.map(f => ({
        ...flattenFoodForResponse(f),
        source: f.source || 'manual',
      })),
      total,
      offset,
      limit,
      flaggedCount: counts.flaggedCount,
      issueCounts: counts.issueCounts,
      legacyCount: counts.legacyCount,
      legacyFlaggedCount: counts.legacyFlaggedCount,
    })
  } catch (error) {
    console.error('Admin foods list error:', error)
    return NextResponse.json({ error: 'Failed to list foods' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleAdminFoodsList(request)
}
