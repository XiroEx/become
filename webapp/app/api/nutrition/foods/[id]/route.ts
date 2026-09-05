import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { isVerifiedAdmin } from '@/lib/adminAuth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import { clearFoodReferences } from '@/lib/nutrition/foodReferenceCleanup'
import { pickFoodFields } from '@/lib/nutrition/foodFields'
import { isFoodOwner } from '@/lib/nutrition/foodOwnership'

// ---------------------------------------------------------------------------
// GET: Fetch a single Food by id (or slug). Returns full doc + variants.
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    await dbConnect()

    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { slug: id }

    const food = await Food.findOne(filter).lean<(import('@/models/Food').IFood & { _id: mongoose.Types.ObjectId }) | null>()
    if (!food) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 })
    }

    return NextResponse.json({ food: flattenFoodForResponse(food) })
  } catch (error) {
    console.error('Error fetching food:', error)
    return NextResponse.json({ error: 'Failed to fetch food' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE: Remove a Food (only by its owner or an admin — see foodOwnership)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid food ID' }, { status: 400 })
    }

    await dbConnect()

    const food = await Food.findById(id)
    if (!food) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 })
    }

    // The admin claim on the token is confirmed against the database — a
    // demoted admin must lose this immediately, not when their token expires.
    const isAdmin = await isVerifiedAdmin(authResult)
    // See lib/nutrition/foodOwnership.ts. `authoredBy` (the id the custom-foods
    // slot is charged on) OR `createdBy` on a `source: 'manual'` row. NOT
    // `createdBy` on its own: the food search route's background import stamps
    // it with whoever's search pulled a USDA/OpenFoodFacts row in, which would
    // hand that member edit and delete on shared catalogue data — and DELETE
    // here runs clearFoodReferences over every member's logs.
    const isOwner = isFoodOwner(food, authResult.userId)

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await clearFoodReferences(food._id as mongoose.Types.ObjectId)
    await Food.deleteOne({ _id: id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting food:', error)
    return NextResponse.json({ error: 'Failed to delete food' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH: Update a Food (only by its owner or an admin — see foodOwnership)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid food ID' }, { status: 400 })
    }

    await dbConnect()

    const food = await Food.findById(id)
    if (!food) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 })
    }

    // The admin claim on the token is confirmed against the database — a
    // demoted admin must lose this immediately, not when their token expires.
    const isAdmin = await isVerifiedAdmin(authResult)
    // See lib/nutrition/foodOwnership.ts. `authoredBy` (the id the custom-foods
    // slot is charged on) OR `createdBy` on a `source: 'manual'` row. NOT
    // `createdBy` on its own: the food search route's background import stamps
    // it with whoever's search pulled a USDA/OpenFoodFacts row in, which would
    // hand that member edit and delete on shared catalogue data — and DELETE
    // here runs clearFoodReferences over every member's logs.
    const isOwner = isFoodOwner(food, authResult.userId)

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // ALLOWLIST, not a deny-list — see lib/nutrition/foodFields.ts. The
    // deny-list this replaces never learned about `authoredBy`, which is the
    // live count behind the free custom-foods allowance, so an owner could
    // clear it off their own row and mint an extra slot on demand.
    const update = pickFoodFields(body, isAdmin)
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    const updated = await Food.findByIdAndUpdate(id, { $set: update }, { new: true })
    return NextResponse.json({ success: true, food: updated })
  } catch (error) {
    console.error('Error updating food:', error)
    return NextResponse.json({ error: 'Failed to update food' }, { status: 500 })
  }
}
