// ---------------------------------------------------------------------------
// Admin Foods detail API — GET / PATCH / DELETE for a single Food.
//
// PATCH accepts a sparse body — only fields present are updated. Allowed:
//   name, brand, category, isVerified, isFirstClass, needsReview,
//   variants (full replacement), aliases (full replacement)
//
// PATCH also supports an action mode for re-importing from USDA:
//   { action: 'reimport-usda' }
// — re-fetches the source by externalId and overwrites the variant. Only
// works when source === 'usda' and externalId is set.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food, { IFoodVariant } from '@/models/Food'
import { verifyAdmin } from '@/lib/adminAuth'
import { flattenFoodForResponse, coerceServingUnit } from '@/lib/foodImport'
import { fetchUSDAById, mapUSDAFood } from '@/lib/usda'
import {
  computeAutomaticReviewState,
  computeReviewIssues,
  isAutomaticReviewOwned,
  manualReviewState,
  type FoodForReview,
} from '@/lib/foodReview'
import { baseGroupKey } from '@/lib/foodGrouping'

// Field whitelist — anything outside this set is silently ignored on PATCH.
// We deliberately do NOT allow editing slug, source, externalId, externalDataType,
// usageCount, createdBy via this endpoint. Those are bookkeeping fields.
const ALLOWED_FIELDS = new Set([
  'name', 'brand', 'category',
  'isVerified', 'isFirstClass', 'needsReview',
  'variants', 'aliases', 'imageUrl', 'barcode',
])

const VALID_CATEGORIES = new Set([
  'Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy',
  'Fat', 'Beverage', 'Condiment', 'Snack', 'Other',
])

interface VariantInput {
  _id?: string
  name?: string
  isDefault?: boolean
  servingSize?: number
  servingUnit?: string
  displayLabel?: string
  alternateServings?: { label: string; multiplier: number }[]
  gramsPerServing?: number | null
  mlPerServing?: number | null
  nutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
    saturatedFat?: number
  }
}

function sanitizeVariants(input: unknown): IFoodVariant[] | null {
  if (!Array.isArray(input)) return null
  const out: IFoodVariant[] = []
  for (const v of input as VariantInput[]) {
    if (!v || typeof v !== 'object') continue
    if (typeof v.servingSize !== 'number' || !v.nutrition) continue
    out.push({
      name: typeof v.name === 'string' && v.name.trim() ? v.name.trim() : 'Default',
      isDefault: Boolean(v.isDefault),
      servingSize: v.servingSize,
      servingUnit: coerceServingUnit(v.servingUnit ?? 'g'),
      displayLabel: typeof v.displayLabel === 'string' ? v.displayLabel : undefined,
      alternateServings: Array.isArray(v.alternateServings)
        ? v.alternateServings
            .filter(a => a && typeof a.label === 'string' && typeof a.multiplier === 'number' && a.multiplier > 0)
            .map(a => ({ label: a.label, multiplier: a.multiplier }))
        : [],
      nutrition: {
        calories: Number(v.nutrition.calories) || 0,
        protein: Number(v.nutrition.protein) || 0,
        carbs: Number(v.nutrition.carbs) || 0,
        fats: Number(v.nutrition.fats) || 0,
        fiber: v.nutrition.fiber != null ? Number(v.nutrition.fiber) : undefined,
        sugar: v.nutrition.sugar != null ? Number(v.nutrition.sugar) : undefined,
        sodium: v.nutrition.sodium != null ? Number(v.nutrition.sodium) : undefined,
        saturatedFat: v.nutrition.saturatedFat != null ? Number(v.nutrition.saturatedFat) : undefined,
      },
      gramsPerServing: v.gramsPerServing == null ? undefined : Number(v.gramsPerServing) || undefined,
      mlPerServing: v.mlPerServing == null ? undefined : Number(v.mlPerServing) || undefined,
    })
  }
  if (out.length === 0) return null
  if (!out.some(v => v.isDefault)) out[0].isDefault = true
  return out
}

// ---------------------------------------------------------------------------
// GET /api/admin/foods/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status ?? 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid food ID' }, { status: 400 })
    }

    await dbConnect()
    const food = await Food.findById(id).lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
    if (!food) return NextResponse.json({ error: 'Food not found' }, { status: 404 })

    // Compute live review issues so the admin sees the current reasons.
    const issues = computeReviewIssues(food as unknown as FoodForReview)

    return NextResponse.json({
      food: flattenFoodForResponse(food),
      issues,
    })
  } catch (error) {
    console.error('Admin food detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch food' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/foods/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status ?? 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid food ID' }, { status: 400 })
    }

    const body = (await request.json()) as Record<string, unknown>

    await dbConnect()
    const food = await Food.findById(id)
    if (!food) return NextResponse.json({ error: 'Food not found' }, { status: 404 })

    // Action: re-import from USDA. We treat this as a separate operation
    // because it's a destructive overwrite of the variant data.
    if (body.action === 'reimport-usda') {
      if (food.source !== 'usda' || !food.externalId) {
        return NextResponse.json(
          { error: 'Food is not USDA-sourced or has no externalId' },
          { status: 400 },
        )
      }
      const usda = await fetchUSDAById(food.externalId)
      if (!usda) {
        return NextResponse.json({ error: 'USDA fetch failed' }, { status: 502 })
      }
      const baseMapped = mapUSDAFood(usda)
      if (!baseMapped) {
        return NextResponse.json({ error: 'USDA food has no usable nutrition' }, { status: 502 })
      }
      // Overwrite the default variant in place; preserve _id so picker
      // referrers (loggedVariantId) keep working.
      const defaultIdx = food.variants.findIndex((v: IFoodVariant) => v.isDefault)
      const idx = defaultIdx >= 0 ? defaultIdx : 0
      const replacement: IFoodVariant = {
        _id: food.variants[idx]?._id,
        name: food.variants[idx]?.name ?? 'Default',
        isDefault: true,
        servingSize: baseMapped.servingSize,
        servingUnit: coerceServingUnit(baseMapped.servingUnit),
        displayLabel: baseMapped.displayLabel,
        alternateServings: baseMapped.alternateServings ?? [],
        nutrition: baseMapped.nutrition,
        gramsPerServing: baseMapped.gramsPerServing,
        mlPerServing: baseMapped.mlPerServing,
      }
      food.variants[idx] = replacement
      // Re-evaluate only an automatic-owned decision. Explicit admin choices
      // and legacy/unknown ownership survive the import unchanged.
      if (isAutomaticReviewOwned(food.reviewFlag)) {
        const automaticReview = computeAutomaticReviewState(
          food.toObject() as unknown as FoodForReview,
          { origin: 'import' },
        )
        food.needsReview = automaticReview.needsReview
        food.reviewFlag = automaticReview.reviewFlag
      }
      await food.save()
      const fresh = await Food.findById(id).lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
      const issues = fresh ? computeReviewIssues(fresh as unknown as FoodForReview) : []
      return NextResponse.json({
        food: fresh ? flattenFoodForResponse(fresh) : null,
        issues,
      })
    }

    // Build the update — only fields explicitly in the body, only those
    // in the allow list.
    const update: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue
      if (key === 'variants') {
        const variants = sanitizeVariants(body.variants)
        if (variants == null) continue
        update.variants = variants
      } else if (key === 'aliases') {
        if (Array.isArray(body.aliases)) {
          update.aliases = (body.aliases as unknown[]).filter((a): a is string => typeof a === 'string')
        }
      } else if (key === 'category') {
        if (typeof body.category === 'string' && VALID_CATEGORIES.has(body.category)) {
          update.category = body.category
        }
      } else if (key === 'name') {
        if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
      } else if (key === 'brand') {
        if (typeof body.brand === 'string') update.brand = body.brand.trim() || undefined
      } else if (key === 'isVerified' || key === 'isFirstClass' || key === 'needsReview') {
        if (typeof body[key] === 'boolean') update[key] = body[key]
      } else if (key === 'imageUrl') {
        if (typeof body.imageUrl === 'string') update.imageUrl = body.imageUrl.trim() || undefined
      } else if (key === 'barcode') {
        if (typeof body.barcode === 'string') update.barcode = body.barcode.trim() || undefined
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // If name changed, re-derive groupKey too.
    if (typeof update.name === 'string') {
      update.groupKey = baseGroupKey(update.name as string) || undefined
    }

    // The toggle is an explicit admin decision, including when false. Store
    // the value and its ownership atomically so rules cannot later undo it.
    if (typeof body.needsReview === 'boolean') {
      Object.assign(update, manualReviewState(body.needsReview, {
        updatedBy: adminResult.userId,
      }))
    }

    await Food.updateOne({ _id: id }, { $set: update })

    // If variants changed without an explicit decision, refresh only an
    // automatic-owned flag. Manual and legacy/unknown values are preserved.
    if (update.variants && body.needsReview === undefined) {
      const fresh = await Food.findById(id).lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
      if (fresh && isAutomaticReviewOwned(fresh.reviewFlag)) {
        const automaticReview = computeAutomaticReviewState(
          fresh as unknown as FoodForReview,
          { origin: 'rules' },
        )
        await Food.updateOne(
          {
            _id: id,
            'reviewFlag.owner': 'automatic',
            updatedAt: fresh.updatedAt,
          },
          {
            $set: {
              needsReview: automaticReview.needsReview,
              reviewFlag: automaticReview.reviewFlag,
            },
          },
        )
      }
    }

    const fresh = await Food.findById(id).lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
    const issues = fresh ? computeReviewIssues(fresh as unknown as FoodForReview) : []
    return NextResponse.json({
      food: fresh ? flattenFoodForResponse(fresh) : null,
      issues,
    })
  } catch (error) {
    console.error('Admin food patch error:', error)
    return NextResponse.json({ error: 'Failed to update food' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/foods/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminResult = await verifyAdmin(request)
    if (!adminResult.success) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status ?? 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid food ID' }, { status: 400 })
    }

    await dbConnect()
    const result = await Food.deleteOne({ _id: id })
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin food delete error:', error)
    return NextResponse.json({ error: 'Failed to delete food' }, { status: 500 })
  }
}
