import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'
import { requireFeature } from '@/lib/entitlements'
import { resolveItemsFromInput, MealItemInput } from '@/lib/mealItems'

// GET: single meal with full items + recipe
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const meal = await Meal.findById(id).lean()

    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!meal.isPublic && !meal.isVerified && !isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    return NextResponse.json({ meal })
  } catch (error) {
    console.error('Error fetching meal:', error)
    return NextResponse.json({ error: 'Failed to fetch meal' }, { status: 500 })
  }
}

// PATCH: update meal (owner or admin). Admins can set isVerified.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireFeature(request, 'custom-meals')
    if (!gate.ok) return gate.response
    const authResult = { success: true as const, userId: gate.userId, role: gate.role }

    await dbConnect()

    const { id } = await params
    const meal = await Meal.findById(id)
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to update this meal' }, { status: 403 })
    }

    const body = await request.json()

    if (typeof body.name === 'string') meal.name = body.name
    if (body.description !== undefined) meal.description = body.description
    if (body.imageUrl !== undefined) meal.imageUrl = body.imageUrl
    if (Array.isArray(body.tags)) meal.tags = body.tags
    if (body.defaultTag !== undefined) meal.defaultTag = typeof body.defaultTag === 'string' && body.defaultTag ? body.defaultTag.toLowerCase() : undefined
    if (body.recipe !== undefined) meal.recipe = body.recipe
    if (body.isPublic !== undefined) meal.isPublic = !!body.isPublic
    if (isAdmin && body.isVerified !== undefined) meal.isVerified = !!body.isVerified

    if (Array.isArray(body.items)) {
      const items = await resolveItemsFromInput(body.items as MealItemInput[])
      meal.items = items
    }

    await meal.save()

    return NextResponse.json({ success: true, meal })
  } catch (error) {
    console.error('Error updating meal:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update meal' }, { status: 500 })
  }
}

// DELETE: owner or admin
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const meal = await Meal.findById(id)
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to delete this meal' }, { status: 403 })
    }

    await Meal.deleteOne({ _id: id })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting meal:', error)
    return NextResponse.json({ error: 'Failed to delete meal' }, { status: 500 })
  }
}
