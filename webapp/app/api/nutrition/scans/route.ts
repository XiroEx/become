// GET  /api/nutrition/scans   — list the user's saved AI scans (recent first).
// POST /api/nutrition/scans   — save a scan (called when a plate is logged).
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import PlateScan, { IPlateScanItem } from '@/models/PlateScan'
import { computeTotalNutrition } from '@/models/Meal'
import type { IMealItem } from '@/models/Meal'
import { verifyAuth } from '@/lib/auth'
import { coerceItem } from '@/lib/plateScanCoerce'

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
    // Accept a small inline thumbnail only — reject anything that isn't a data
    // image or is too big to store inline (~200KB of base64).
    const thumb = typeof body?.thumb === 'string'
      && body.thumb.startsWith('data:image/')
      && body.thumb.length <= 200_000
      ? body.thumb : undefined
    // Full-res image lives in blob storage; only accept our own same-origin blob
    // path (uploaded via /api/nutrition/scans/image), never an arbitrary URL.
    const imageUrl = typeof body?.imageUrl === 'string' && body.imageUrl.startsWith('/api/blob/')
      ? body.imageUrl.slice(0, 512) : undefined
    const scan = await PlateScan.create({
      user: new mongoose.Types.ObjectId(auth.userId),
      source: body?.source === 'describe' ? 'describe' : 'photo',
      note: typeof body?.note === 'string' ? body.note.slice(0, 500) : undefined,
      tag: typeof body?.tag === 'string' ? body.tag : undefined,
      thumb,
      imageUrl,
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
