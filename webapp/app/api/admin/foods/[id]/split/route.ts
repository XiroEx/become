// ---------------------------------------------------------------------------
// Admin Foods split — pop a single variant off a Food into its own new Food.
//
// POST /api/admin/foods/[id]/split   { variantId: "..." }
//
// Use case: an admin sees a merged food has a variant that doesn't actually
// belong (or wants to curate it separately). The variant becomes a fresh
// Food doc; the source loses it.
//
// Cannot split if the source has only one variant (would leave it empty).
// The new Food inherits source/category/etc from the original.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food, { IFoodVariant } from '@/models/Food'
import { verifyAdmin } from '@/lib/adminAuth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import { generateUniqueFoodSlug } from '@/lib/foodSlug'
import { baseGroupKey } from '@/lib/foodGrouping'
import { computeReviewIssues, type FoodForReview } from '@/lib/foodReview'

export async function POST(
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
      return NextResponse.json({ error: 'Invalid source food ID' }, { status: 400 })
    }

    const body = (await request.json()) as { variantId?: string }
    const variantId = body.variantId
    if (!variantId) {
      return NextResponse.json({ error: 'Missing variantId' }, { status: 400 })
    }

    await dbConnect()
    const source = await Food.findById(id)
    if (!source) return NextResponse.json({ error: 'Source food not found' }, { status: 404 })

    if (source.variants.length <= 1) {
      return NextResponse.json(
        { error: 'Cannot split — food has only one variant' },
        { status: 400 },
      )
    }

    const variantIdx = source.variants.findIndex((v: IFoodVariant) => String(v._id) === variantId)
    if (variantIdx < 0) {
      return NextResponse.json({ error: 'Variant not found on this food' }, { status: 404 })
    }

    const variant = source.variants[variantIdx]
    const wasDefault = variant.isDefault

    // Build the new standalone food. The new Food inherits source +
    // category from the original. Its primary variant is the popped one,
    // marked default. If the variant carried its own externalId/dataType,
    // those become the new Food's top-level externalId/dataType (and we
    // clear them on the variant since the top-level field carries the same
    // info redundantly for primaries — matches the post-merge convention).
    const newVariant: IFoodVariant = {
      name: variant.name,
      isDefault: true,
      servingSize: variant.servingSize,
      servingUnit: variant.servingUnit,
      displayLabel: variant.displayLabel,
      alternateServings: variant.alternateServings ?? [],
      nutrition: variant.nutrition,
      gramsPerServing: variant.gramsPerServing,
      mlPerServing: variant.mlPerServing,
      // Drop variant-level externalId since it's about to live as the
      // top-level externalId on the new Food doc.
      externalId: undefined,
      externalDataType: undefined,
    }

    const newName = (source.aliases ?? []).find((a: string) => a.toLowerCase().includes(variant.name.toLowerCase()))
      || `${source.name} — ${variant.name}`
    const newSlug = await generateUniqueFoodSlug(Food, newName, source.brand)

    const newExternalId = variant.externalId ?? (
      // Fall back to the source's top-level externalId only when the popped
      // variant was the primary (no variant.externalId was stamped) AND it's
      // the source's only "primary"-flavored variant. We avoid copying the
      // source's externalId when other variants still need to identify as
      // primary on the source.
      wasDefault ? source.externalId : undefined
    )
    const newExternalDataType = variant.externalDataType ?? (
      wasDefault ? source.externalDataType : undefined
    )

    // If the new food would conflict with the source on (source, externalId)
    // (unique sparse index), null it out — we'd rather have an unidentified
    // standalone than a unique-index violation.
    let safeExternalId = newExternalId
    if (safeExternalId && safeExternalId === source.externalId) {
      // Source is keeping its top-level externalId; the new doc can't share it.
      safeExternalId = undefined
    }

    const newFood = await Food.create({
      name: newName,
      slug: newSlug,
      brand: source.brand,
      category: source.category,
      variants: [newVariant],
      aliases: [],
      source: source.source,
      externalId: safeExternalId,
      externalDataType: newExternalDataType,
      isFirstClass: false,
      isVerified: false,
      barcode: undefined,
      imageUrl: source.imageUrl,
      usageCount: 0,
      createdBy: source.createdBy,
      groupKey: baseGroupKey(newName) || undefined,
      needsReview: computeReviewIssues({
        slug: newSlug,
        variants: [newVariant],
      } as FoodForReview).length > 0,
    })

    // Remove the popped variant from the source.
    source.variants.splice(variantIdx, 1)
    // If we removed the default, promote the first remaining variant.
    if (wasDefault && source.variants.length > 0) {
      source.variants[0].isDefault = true
    }
    source.needsReview = computeReviewIssues(source.toObject() as unknown as FoodForReview).length > 0
    await source.save()

    const freshSource = await Food.findById(source._id)
      .lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
    const freshNew = await Food.findById(newFood._id)
      .lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
    if (!freshSource || !freshNew) {
      return NextResponse.json({ error: 'Failed to load split result' }, { status: 500 })
    }

    return NextResponse.json({
      food: flattenFoodForResponse(freshNew),
      sourceId: String(source._id),
      source: flattenFoodForResponse(freshSource),
    })
  } catch (error) {
    console.error('Admin food split error:', error)
    return NextResponse.json({ error: 'Failed to split food' }, { status: 500 })
  }
}
