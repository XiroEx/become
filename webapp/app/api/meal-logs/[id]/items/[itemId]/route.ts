import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import MealLog from '@/models/MealLog'
import { verifyAuth } from '@/lib/auth'
import mongoose from 'mongoose'

function findItemIndex(log: { items: { _id?: mongoose.Types.ObjectId }[] }, itemId: string): number {
  return log.items.findIndex(it => it._id?.toString() === itemId)
}

// PATCH: update servings or replace nutrition for one item.
// Body: { servings?, nutrition?, servingSize?, servingUnit?, name?, brand?, variantName? }
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

    if (body.servings !== undefined && typeof body.servings === 'number') {
      item.servings = body.servings
    }
    if (body.servingSize !== undefined && typeof body.servingSize === 'number') {
      item.servingSize = body.servingSize
    }
    if (typeof body.servingUnit === 'string') item.servingUnit = body.servingUnit
    if (typeof body.name === 'string') item.name = body.name
    if (body.brand !== undefined) item.brand = body.brand
    if (body.variantName !== undefined) item.variantName = body.variantName

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

    log.markModified('items')
    await log.save()

    return NextResponse.json({ success: true, log })
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

    log.items.splice(idx, 1)

    // If no items left, delete the log entirely.
    if (log.items.length === 0) {
      await MealLog.deleteOne({ _id: id })
      return NextResponse.json({ success: true, deleted: true })
    }

    await log.save()
    return NextResponse.json({ success: true, log })
  } catch (error) {
    console.error('Error deleting meal log item:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
