import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealLog from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'
import { bustTilesCache } from '@/lib/redis'
import { normalizeMealLogTag, replaceMealLogTag } from '@/lib/nutrition/moveMealLogItem'
import mongoose from 'mongoose'

function findItemIndex(log: { items: { _id?: mongoose.Types.ObjectId }[] }, itemId: string): number {
  return log.items.findIndex(it => it._id?.toString() === itemId)
}

// PATCH: update one item. A tag change moves only this item: if its source log
// contains other foods, the updated item is split into a new log so those other
// foods stay in their existing section.
// Body: { servings?, nutrition?, servingSize?, servingUnit?, name?, brand?,
//         variantName?, servingLabel?, tag?, fromTag?, loggedAt?, untimed? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id, itemId } = await params
    const log = await MealLog.findById(id)
    if (!log) {
      return NextResponse.json({ error: 'Meal log not found' }, { status: 404 })
    }
    if (log.user.toString() !== authResult.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const idx = findItemIndex(log, itemId)
    if (idx === -1) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const body = await request.json()
    const item = log.items[idx]

    let nextLoggedAt = log.loggedAt
    if (body.loggedAt !== undefined) {
      if (typeof body.loggedAt !== 'string') {
        return NextResponse.json({ error: 'loggedAt must be an ISO date string' }, { status: 400 })
      }
      const parsed = new Date(body.loggedAt)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Invalid loggedAt' }, { status: 400 })
      }
      nextLoggedAt = parsed
    }
    if (body.untimed !== undefined && typeof body.untimed !== 'boolean') {
      return NextResponse.json({ error: 'untimed must be a boolean' }, { status: 400 })
    }
    const nextUntimed = typeof body.untimed === 'boolean' ? body.untimed : log.untimed

    let nextTags: string[] | null = null
    let tagChanged = false
    if (body.tag !== undefined) {
      const targetTag = normalizeMealLogTag(body.tag)
      if (!targetTag) {
        return NextResponse.json({ error: 'tag must be a non-empty string' }, { status: 400 })
      }
      nextTags = replaceMealLogTag(log.tags, body.fromTag, targetTag)
      if (!nextTags) {
        return NextResponse.json(
          { error: 'That meal tag changed. Refresh and try again.' },
          { status: 409 },
        )
      }
      const currentTags = Array.from(new Set(
        Array.from(log.tags ?? [], (tag: unknown) => normalizeMealLogTag(tag)).filter(Boolean),
      ))
      tagChanged =
        currentTags.length !== nextTags.length ||
        currentTags.some((tag: string, index: number) => tag !== nextTags![index])
    }

    if (body.servings !== undefined && typeof body.servings === 'number') {
      if (!Number.isFinite(body.servings) || body.servings < 0) {
        return NextResponse.json({ error: 'servings must be a non-negative number' }, { status: 400 })
      }
      item.servings = body.servings
    }
    if (body.servingSize !== undefined && typeof body.servingSize === 'number') {
      if (!Number.isFinite(body.servingSize) || body.servingSize <= 0) {
        return NextResponse.json({ error: 'servingSize must be a positive number' }, { status: 400 })
      }
      item.servingSize = body.servingSize
    }
    if (typeof body.servingUnit === 'string') item.servingUnit = body.servingUnit
    if (typeof body.name === 'string') item.name = body.name
    if (body.brand !== undefined) item.brand = body.brand
    if (body.variantName !== undefined) item.variantName = body.variantName
    // The "Fix it for this entry" panel's serving-size/label correction. An
    // empty string is a deliberate reset back to the computed
    // loggedQuantity+loggedUnit fallback (see EditFoodModal's `portion.label`).
    if (typeof body.servingLabel === 'string') item.servingLabel = body.servingLabel

    // PR 4 provenance: persist the user's actual entered quantity + unit when
    // the client supplies them. Old clients that PATCH only `servings` keep
    // working — the legacy multiplier is still the canonical scaling factor
    // for back-compat reads.
    if (typeof body.loggedQuantity === 'number') {
      item.loggedQuantity = body.loggedQuantity
    }
    if (typeof body.loggedUnit === 'string') {
      item.loggedUnit = body.loggedUnit
    }
    if (typeof body.loggedGramsPerServing === 'number') {
      item.loggedGramsPerServing = body.loggedGramsPerServing
    }
    if (typeof body.loggedMlPerServing === 'number') {
      item.loggedMlPerServing = body.loggedMlPerServing
    }

    if (body.nutrition && typeof body.nutrition === 'object') {
      // Replace nutrition wholesale to keep semantics simple — caller passes
      // the new per-serving nutrition.
      item.nutrition = {
        calories: body.nutrition.calories ?? item.nutrition.calories,
        protein:  body.nutrition.protein  ?? item.nutrition.protein,
        carbs:    body.nutrition.carbs    ?? item.nutrition.carbs,
        fats:     body.nutrition.fats     ?? item.nutrition.fats,
        fiber:        body.nutrition.fiber        ?? item.nutrition.fiber,
        sugar:        body.nutrition.sugar        ?? item.nutrition.sugar,
        sodium:       body.nutrition.sodium       ?? item.nutrition.sodium,
        saturatedFat: body.nutrition.saturatedFat ?? item.nutrition.saturatedFat,
      }
    }

    // A MealLog can hold a whole meal. Retagging one row must not drag its
    // siblings to the new section, so split the updated item into a new log.
    // Write the copy first (avoids data loss), then remove the source row. If
    // the source save fails, best-effort delete the copy before surfacing the
    // error, avoiding a duplicate in the ordinary failure case.
    let responseLog = log
    let sourceLog
    if (tagChanged && nextTags && log.items.length > 1) {
      const movedItem = typeof item.toObject === 'function'
        ? item.toObject()
        : { ...item }
      delete movedItem._id

      const movedLog = await MealLog.create({
        user: log.user,
        loggedAt: nextLoggedAt,
        untimed: nextUntimed,
        items: [movedItem],
        source: log.source,
        tags: nextTags,
      })

      log.items.splice(idx, 1)
      log.markModified('items')
      try {
        await log.save()
      } catch (saveError) {
        await MealLog.deleteOne({ _id: movedLog._id }).catch(() => null)
        throw saveError
      }
      responseLog = movedLog
      sourceLog = log
    } else {
      if (tagChanged && nextTags) log.tags = nextTags
      log.loggedAt = nextLoggedAt
      log.untimed = nextUntimed
      log.markModified('items')
      await log.save()
    }

    // Meal logs feed dashboard tiles — invalidate so they show immediately.
    await bustTilesCache(authResult.userId!)

    return NextResponse.json({
      success: true,
      log: responseLog,
      ...(sourceLog ? { sourceLog, moved: true } : {}),
    })
  } catch (error) {
    console.error('Error updating meal log item:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}

// DELETE: remove one item from the log
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id, itemId } = await params
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    // Atomic $pull by sub-document _id — avoids the read-modify-write race when
    // several items are deleted in quick succession (which previously made one
    // delete "fail" because a concurrent save had already changed the array).
    const updated = await MealLog.findOneAndUpdate(
      { _id: id, user: authResult.userId },
      { $pull: { items: { _id: new mongoose.Types.ObjectId(itemId) } } },
      { new: true },
    )

    // Idempotent: if the log (or item) is already gone, the user's goal — that
    // entry removed — is achieved. Return success rather than a 404 that surfaces
    // as "Failed to delete entry" on a double-tap / concurrent delete.
    if (!updated) {
      return NextResponse.json({ success: true, deleted: true })
    }

    // No items left → remove the whole log.
    if (updated.items.length === 0) {
      await MealLog.deleteOne({ _id: id })
      await bustTilesCache(authResult.userId!)
      return NextResponse.json({ success: true, deleted: true })
    }

    // Recompute totals (the pre-save hook reruns computeTotalNutrition on save).
    await updated.save()

    // Meal logs feed dashboard tiles — invalidate so they show immediately.
    await bustTilesCache(authResult.userId!)

    return NextResponse.json({ success: true, log: updated })
  } catch (error) {
    console.error('Error deleting meal log item:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
