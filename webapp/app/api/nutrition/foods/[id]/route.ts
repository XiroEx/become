import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import Food from '@/models/Food'
import { verifyAuth } from '@/lib/auth'
import { flattenFoodForResponse } from '@/lib/foodImport'
import { clearFoodReferences } from '@/lib/nutrition/foodReferenceCleanup'

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
// DELETE: Remove a Food (only by creator or admin)
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

    const isAdmin = authResult.role === 'admin'
    const isOwner = food.createdBy?.toString() === authResult.userId

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
// PATCH: Update a Food (only by creator or admin)
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

    const isAdmin = authResult.role === 'admin'
    const isOwner = food.createdBy?.toString() === authResult.userId

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Admins can set verification/usage flags; regular users cannot
    if (!isAdmin) {
      delete body.isVerified
      delete body.isFirstClass
      delete body.usageCount
      delete body.createdBy
      delete body.source
      delete body.externalId
      delete body.externalDataType
      delete body.slug
    }

    const updated = await Food.findByIdAndUpdate(id, { $set: body }, { new: true })
    return NextResponse.json({ success: true, food: updated })
  } catch (error) {
    console.error('Error updating food:', error)
    return NextResponse.json({ error: 'Failed to update food' }, { status: 500 })
  }
}
