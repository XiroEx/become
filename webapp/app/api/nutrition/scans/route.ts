// GET  /api/nutrition/scans   — list the user's saved AI scans (recent first).
// POST /api/nutrition/scans   — save a scan (called when a plate is logged).
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import PlateScan, { IPlateScanItem } from '@/models/PlateScan'
import { computeTotalNutrition } from '@/models/Meal'
import type { IMealItem, IMealNutrition } from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'

function num(v: unknown, d = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : d
}

function coerceItem(raw: Record<string, unknown>): IPlateScanItem | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const n = (raw.nutrition ?? {}) as Record<string, unknown>
  const nutrition: IMealNutrition = {
    calories: num(n.calories), protein: num(n.protein), carbs: num(n.carbs), fats: num(n.fats),
  }
  const foodId = typeof raw.foodId === 'string' && mongoose.Types.ObjectId.isValid(raw.foodId)
    ? new mongoose.Types.ObjectId(raw.foodId) : undefined
  const matchKind = raw.matchKind === 'food' || raw.matchKind === 'meal' || raw.matchKind === 'recipe'
    ? raw.matchKind : undefined
  return {
    foodId,
    name: name.slice(0, 200),
    brand: typeof raw.brand === 'string' ? raw.brand.slice(0, 120) : undefined,
    estimatedServing: typeof raw.estimatedServing === 'string' ? raw.estimatedServing.slice(0, 80) : undefined,
    servingSize: num(raw.servingSize, 1),
    servingUnit: typeof raw.servingUnit === 'string' && raw.servingUnit ? raw.servingUnit : 'serving',
    servings: num(raw.servings, 1),
    nutrition,
    confidence: raw.confidence != null ? num(raw.confidence) : undefined,
    matchKind,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '40', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const userId = new mongoose.Types.ObjectId(auth.userId)
    const [scans, total] = await Promise.all([
      PlateScan.find({ user: userId }).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      PlateScan.countDocuments({ user: userId }),
    ])
    return NextResponse.json({ scans, total, offset, limit })
  } catch (error) {
    console.error('Error listing scans:', error)
    return NextResponse.json({ error: 'Failed to list scans' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => null)
    const rawItems = Array.isArray(body?.items) ? body.items : null
    if (!rawItems) return NextResponse.json({ error: 'items[] is required' }, { status: 400 })
    const items = rawItems.slice(0, 40).map((r: Record<string, unknown>) => coerceItem(r)).filter(Boolean) as IPlateScanItem[]
    if (items.length === 0) return NextResponse.json({ error: 'No valid items' }, { status: 400 })

    await dbConnect()
    // Total honors per-serving × servings (same convention as meal logs).
    const totalNutrition = computeTotalNutrition(items as unknown as IMealItem[])
    const scan = await PlateScan.create({
      user: new mongoose.Types.ObjectId(auth.userId),
      source: body?.source === 'describe' ? 'describe' : 'photo',
      note: typeof body?.note === 'string' ? body.note.slice(0, 500) : undefined,
      tag: typeof body?.tag === 'string' ? body.tag : undefined,
      items,
      totalNutrition,
      loggedAt: body?.loggedAt ? new Date(body.loggedAt) : new Date(),
      mealLogId: typeof body?.mealLogId === 'string' && mongoose.Types.ObjectId.isValid(body.mealLogId)
        ? new mongoose.Types.ObjectId(body.mealLogId) : undefined,
    })
    return NextResponse.json({ scan }, { status: 201 })
  } catch (error) {
    console.error('Error saving scan:', error)
    return NextResponse.json({ error: 'Failed to save scan' }, { status: 500 })
  }
}
