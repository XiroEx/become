// DELETE /api/nutrition/scans/[id] — remove one of the user's saved scans.
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import PlateScan from '@/models/PlateScan'
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
