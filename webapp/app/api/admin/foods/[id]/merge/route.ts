// ---------------------------------------------------------------------------
// Admin Foods merge — move all variants from one Food into another, then
// delete the source.
//
// POST /api/admin/foods/[id]/merge   { targetId: "..." }
//
// Both source and target must be USDA non-Branded foods of the same source.
// Cap: target.variants.length + source.variants.length must not exceed
// MAX_VARIANTS_PER_FOOD (12). Source's externalId is preserved on its
// primary variant before the move so re-imports stay idempotent.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food, { IFoodVariant } from '@/models/Food'
import { verifyAdmin } from '@/lib/adminAuth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import { computeReviewIssues, type FoodForReview } from '@/lib/foodReview'

const MAX_VARIANTS_PER_FOOD = 12
const MAX_ALIASES = 30

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

    const body = (await request.json()) as { targetId?: string }
    const targetId = body.targetId
    if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
      return NextResponse.json({ error: 'Invalid targetId' }, { status: 400 })
    }
    if (id === targetId) {
      return NextResponse.json({ error: 'Cannot merge a food into itself' }, { status: 400 })
    }

    await dbConnect()

    const [source, target] = await Promise.all([
      Food.findById(id),
      Food.findById(targetId),
    ])
    if (!source) return NextResponse.json({ error: 'Source food not found' }, { status: 404 })
    if (!target) return NextResponse.json({ error: 'Target food not found' }, { status: 404 })

    if (source.source !== target.source) {
      return NextResponse.json(
        { error: `Cannot merge across sources (source=${source.source}, target=${target.source})` },
        { status: 400 },
      )
    }

    // Branded products are inherently distinct SKUs — never merge them
    // automatically. An admin can still force merge via direct DB if truly
    // needed.
    if (source.source === 'usda') {
      if (source.externalDataType === 'Branded' || target.externalDataType === 'Branded') {
        return NextResponse.json(
          { error: 'Cannot merge Branded USDA foods' },
          { status: 400 },
        )
      }
    }

    if (source.variants.length + target.variants.length > MAX_VARIANTS_PER_FOOD) {
      return NextResponse.json(
        {
          error: `Merged variant count (${source.variants.length + target.variants.length}) exceeds max (${MAX_VARIANTS_PER_FOOD})`,
        },
        { status: 400 },
      )
    }

    // Move source variants onto target. Preserve each variant's externalId
    // / externalDataType. The source's *primary* variant — the one without
    // a variant.externalId because it owned the top-level externalId — gets
    // its externalId stamped on at this moment.
    const existingTargetNames = target.variants.map((v: IFoodVariant) => v.name.toLowerCase())
    const movedVariants: IFoodVariant[] = []
    for (let i = 0; i < source.variants.length; i++) {
      const sv: IFoodVariant = source.variants[i]
      const isPrimary = !sv.externalId && i === source.variants.findIndex((v: IFoodVariant) => v.isDefault)
      const externalId = sv.externalId ?? (isPrimary ? source.externalId : undefined)
      const externalDataType = sv.externalDataType ?? (isPrimary ? source.externalDataType : undefined)

      // Dedupe variant name against the (growing) target list.
      let candidateName = sv.name
      if (existingTargetNames.includes(candidateName.toLowerCase())) {
        for (let n = 2; n < 100; n++) {
          const next = `${sv.name} (${n})`
          if (!existingTargetNames.includes(next.toLowerCase())) {
            candidateName = next
            break
          }
        }
      }
      existingTargetNames.push(candidateName.toLowerCase())

      movedVariants.push({
        name: candidateName,
        isDefault: false, // never reassign target's default
        servingSize: sv.servingSize,
        servingUnit: sv.servingUnit,
        displayLabel: sv.displayLabel,
        alternateServings: sv.alternateServings ?? [],
        nutrition: sv.nutrition,
        gramsPerServing: sv.gramsPerServing,
        mlPerServing: sv.mlPerServing,
        externalId,
        externalDataType,
      })
    }
    target.variants.push(...movedVariants)

    // Append source.name + source.aliases to target.aliases (deduped, capped).
    const aliasesLower = new Set(target.aliases.map((a: string) => a.toLowerCase()))
    const pushAlias = (s?: string) => {
      const t = (s ?? '').trim()
      if (!t) return
      if (aliasesLower.has(t.toLowerCase())) return
      target.aliases.push(t)
      aliasesLower.add(t.toLowerCase())
    }
    pushAlias(source.name)
    for (const a of source.aliases) pushAlias(a)
    while (target.aliases.length > MAX_ALIASES) target.aliases.shift()

    // Re-evaluate needsReview against the merged target.
    target.needsReview = computeReviewIssues(target.toObject() as unknown as FoodForReview).length > 0

    await target.save()
    await Food.deleteOne({ _id: source._id })

    const fresh = await Food.findById(target._id)
      .lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
    if (!fresh) {
      return NextResponse.json({ error: 'Target disappeared after merge' }, { status: 500 })
    }
    const issues = computeReviewIssues(fresh as unknown as FoodForReview)
    return NextResponse.json({
      food: flattenFoodForResponse(fresh),
      issues,
    })
  } catch (error) {
    console.error('Admin food merge error:', error)
    return NextResponse.json({ error: 'Failed to merge foods' }, { status: 500 })
  }
}
