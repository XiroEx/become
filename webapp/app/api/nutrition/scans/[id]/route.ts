// DELETE /api/nutrition/scans/[id] — remove one of the user's saved scans.
// PATCH  /api/nutrition/scans/[id] — update a saved estimate in place (used when
//   a generated estimate is later edited, corrected, or logged — so we keep ONE
//   history record per estimate instead of creating duplicates).
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import PlateScan, { IPlateScanItem } from '@/models/PlateScan'
import { computeTotalNutrition } from '@/models/Meal'
import type { IMealItem } from '@/models/Meal'
import { coerceItem } from '@/lib/plateScanCoerce'
import { verifyAuth } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    await dbConnect()
    const scan = await PlateScan.findOne({ _id: id, user: new mongoose.Types.ObjectId(auth.userId) }).lean()
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ scan })
  } catch (error) {
    console.error('Error fetching scan:', error)
    return NextResponse.json({ error: 'Failed to fetch scan' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })
    await dbConnect()

    const update: Record<string, unknown> = {}
    if (Array.isArray(body.items)) {
      const items = body.items.slice(0, 40).map((r: Record<string, unknown>) => coerceItem(r)).filter(Boolean) as IPlateScanItem[]
      if (items.length > 0) {
        update.items = items
        update.totalNutrition = computeTotalNutrition(items as unknown as IMealItem[])
      }
    }
    if (typeof body.tag === 'string') update.tag = body.tag
    if (typeof body.note === 'string') update.note = body.note.slice(0, 500)
    if (typeof body.thumb === 'string' && body.thumb.startsWith('data:image/') && body.thumb.length <= 200_000) update.thumb = body.thumb
    if (typeof body.imageUrl === 'string' && body.imageUrl.startsWith('/api/blob/')) update.imageUrl = body.imageUrl.slice(0, 512)
    if (typeof body.mealLogId === 'string' && mongoose.Types.ObjectId.isValid(body.mealLogId)) {
      update.mealLogId = new mongoose.Types.ObjectId(body.mealLogId)
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    const scan = await PlateScan.findOneAndUpdate(
      { _id: id, user: new mongoose.Types.ObjectId(auth.userId) },
      { $set: update },
      { new: true },
    ).lean()
    if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ scan })
  } catch (error) {
    console.error('Error updating scan:', error)
    return NextResponse.json({ error: 'Failed to update scan' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    await dbConnect()
    const res = await PlateScan.deleteOne({ _id: id, user: new mongoose.Types.ObjectId(auth.userId) })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting scan:', error)
    return NextResponse.json({ error: 'Failed to delete scan' }, { status: 500 })
  }
}
