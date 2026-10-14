// ---------------------------------------------------------------------------
// Admin Foods Service
//
// Query handling, validation, filtering, and aggregation for admin foods listing.
// Separated from the API route to comply with Next.js App Router route export
// constraints and to keep foodReview.ts free of database/server imports.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import type mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food, { IFood } from '@/models/Food'
import { verifyAdmin } from '@/lib/adminAuth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import {
  validateAdminFoodQueryParams,
  buildAdminFoodsFilter,
  buildAdminFoodsReviewFacet,
  parseAdminFoodsReviewFacetResult,
  REVIEW_ISSUE_CODES,
  FOOD_REVIEW_ORIGINS,
  type ReviewIssueCode,
  type FoodReviewOrigin,
  type AdminFoodQueryParamsValidation,
  type BuildAdminFoodsFilterOptions,
} from './foodReview'

export {
  validateAdminFoodQueryParams,
  buildAdminFoodsFilter,
  buildAdminFoodsReviewFacet,
  parseAdminFoodsReviewFacetResult,
  REVIEW_ISSUE_CODES,
  FOOD_REVIEW_ORIGINS,
}
export type {
  ReviewIssueCode,
  FoodReviewOrigin,
  AdminFoodQueryParamsValidation,
  BuildAdminFoodsFilterOptions,
}

export async function handleAdminFoodsList(
  request: NextRequest,
  options?: { skipAuth?: boolean },
) {
  try {
    const { searchParams } = new URL(request.url)
    const validation = validateAdminFoodQueryParams(searchParams)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    if (!options?.skipAuth) {
      const adminResult = await verifyAdmin(request)
      if (!adminResult.success) {
        return NextResponse.json(
          { error: adminResult.error },
          { status: adminResult.status ?? 401 },
        )
      }
    }

    await dbConnect()

    const q = (searchParams.get('q') ?? '').trim()
    const flagged = searchParams.get('flagged') === '1' || searchParams.get('flagged') === 'true'
    const source = (searchParams.get('source') ?? '').trim()
    const sortBy = (searchParams.get('sortBy') ?? 'recent').trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

    const filter = buildAdminFoodsFilter({
      q,
      flagged,
      source,
      issues: validation.issues,
      origins: validation.origins,
      excludeLegacy: validation.excludeLegacy,
    })

    const sort: Record<string, 1 | -1> = sortBy === 'usage'
      ? { usageCount: -1, updatedAt: -1 }
      : sortBy === 'name'
        ? { name: 1 }
        : { updatedAt: -1, createdAt: -1 } // 'recent' default

    type FoodLean = IFood & { _id: mongoose.Types.ObjectId }

    const [foods, total, facetResult] = await Promise.all([
      Food.find(filter).sort(sort).skip(offset).limit(limit).lean<FoodLean[]>(),
      Food.countDocuments(filter),
      Food.aggregate([
        { $match: { needsReview: true } },
        { $facet: buildAdminFoodsReviewFacet() } as unknown as mongoose.PipelineStage,
      ]),
    ])

    const { flaggedCount, legacyCount, issueCounts } =
      parseAdminFoodsReviewFacetResult(facetResult[0])

    return NextResponse.json({
      foods: foods.map(f => ({
        ...flattenFoodForResponse(f),
        source: f.source || 'manual',
      })),
      total,
      offset,
      limit,
      flaggedCount,
      issueCounts,
      legacyCount,
    })
  } catch (error) {
    console.error('Admin foods list error:', error)
    return NextResponse.json({ error: 'Failed to list foods' }, { status: 500 })
  }
}
