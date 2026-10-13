import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Meal from '@/models/Meal'
import MealPlan from '@/models/MealPlan'
import { verifyAuth } from '@/lib/auth'
import { isVerifiedAdmin } from '@/lib/adminAuth'
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
    // Confirmed against the database, not read off the token claim: a demoted
    // admin must stop seeing other members' private meals immediately. Costs an
    // extra read only for a caller whose token actually claims admin.
    const isAdmin = isOwner ? false : await isVerifiedAdmin(authResult)
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

    await dbConnect()

    const { id } = await params
    const meal = await Meal.findById(id)
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === gate.userId
    // gate.role comes from loadUserEntitlement(), which reads the User row — it
    // is already database truth, so there is nothing to re-confirm here. Using
    // it directly (rather than through a hand-rolled `authResult` shim) keeps
    // `authResult.role === 'admin'` out of the tree entirely, which is what the
    // regression grep in tests/unit/security/admin-revocation.test.ts keys on.
    const isAdmin = gate.role === 'admin'
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

    // How many ACTIVE meal-plan slots were created from this meal? The client
    // uses this to offer "update the planned copies too?" after an edit.
    const plannedCount = await MealPlan.countDocuments({
      mealId: meal._id,
      user: gate.userId,
      status: 'active',
    })

    return NextResponse.json({ success: true, meal, plannedCount })
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
    // Deleting someone else's meal is admin-only, so the claim is confirmed
    // against the database before it can authorise the delete.
    const isAdmin = isOwner ? false : await isVerifiedAdmin(authResult)
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
