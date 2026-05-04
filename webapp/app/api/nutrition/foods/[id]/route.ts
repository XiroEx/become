import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import FoodItem from '@/models/FoodItem'
import { verifyAuth } from '@/lib/auth'

// ---------------------------------------------------------------------------
// DELETE: Remove a custom food item (only by creator or admin)
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

    const food = await FoodItem.findById(id)
    if (!food) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 })
    }

    const isAdmin = authResult.role === 'admin'
    const isOwner = food.createdBy?.toString() === authResult.userId

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await FoodItem.deleteOne({ _id: id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting food item:', error)
    return NextResponse.json({ error: 'Failed to delete food item' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH: Update a custom food item (only by creator or admin)
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

    const food = await FoodItem.findById(id)
    if (!food) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 })
    }

    const isAdmin = authResult.role === 'admin'
    const isOwner = food.createdBy?.toString() === authResult.userId

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Admins can set isVerified and usageCount; regular users cannot
    if (!isAdmin) {
      delete body.isVerified
      delete body.usageCount
      delete body.createdBy
    }

    const updated = await FoodItem.findByIdAndUpdate(id, { $set: body }, { new: true })
    return NextResponse.json({ success: true, food: updated })
  } catch (error) {
    console.error('Error updating food item:', error)
    return NextResponse.json({ error: 'Failed to update food item' }, { status: 500 })
  }
}
