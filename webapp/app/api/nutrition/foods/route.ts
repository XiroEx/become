import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import FoodItem from '@/models/FoodItem'
import { verifyAuth } from '@/lib/auth'

// GET: Search foods
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    const category = searchParams.get('category')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Build base filter
    const baseFilter: Record<string, unknown> = {}
    if (category) {
      baseFilter.category = category
    }

    if (!q) {
      // No search query — return popular foods
      const foods = await FoodItem.find(baseFilter)
        .sort({ usageCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()

      const total = await FoodItem.countDocuments(baseFilter)
      return NextResponse.json({ foods, total, offset, limit })
    }

    // Text search for full-word matches
    const textFilter = { ...baseFilter, $text: { $search: q } }
    const textResults = await FoodItem.find(textFilter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, usageCount: -1 })
      .limit(limit)
      .lean()

    // Regex fallback for partial matches
    const regexFilter = {
      ...baseFilter,
      name: { $regex: q, $options: 'i' }
    }
    const regexResults = await FoodItem.find(regexFilter)
      .sort({ usageCount: -1 })
      .limit(limit)
      .lean()

    // Combine and deduplicate
    const seenIds = new Set<string>()
    const combined = []

    for (const item of textResults) {
      const id = item._id.toString()
      if (!seenIds.has(id)) {
        seenIds.add(id)
        combined.push(item)
      }
    }

    for (const item of regexResults) {
      const id = item._id.toString()
      if (!seenIds.has(id)) {
        seenIds.add(id)
        combined.push(item)
      }
    }

    // Apply offset and limit to combined results
    const paged = combined.slice(offset, offset + limit)

    return NextResponse.json({ foods: paged, total: combined.length, offset, limit })
  } catch (error) {
    console.error('Error searching foods:', error)
    return NextResponse.json({ error: 'Failed to search foods' }, { status: 500 })
  }
}

// POST: Create a custom food item
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.name || !body.category || !body.nutrition) {
      return NextResponse.json({ error: 'Missing required fields: name, category, nutrition' }, { status: 400 })
    }

    await dbConnect()

    const foodItem = await FoodItem.create({
      ...body,
      createdBy: authResult.userId,
      isVerified: false,
      usageCount: 0
    })

    return NextResponse.json({ success: true, food: foodItem }, { status: 201 })
  } catch (error) {
    console.error('Error creating food item:', error)
    return NextResponse.json({ error: 'Failed to create food item' }, { status: 500 })
  }
}
