import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { amount } = body as { amount: number }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    await dbConnect()

    const updated = await MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      { $inc: { xp: amount } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({ xp: updated?.xp ?? 0 })
  } catch (err) {
    console.error('POST /api/mind/progress/xp error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
