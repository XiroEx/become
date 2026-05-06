import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Mission from '@/models/Mission'
import MindProgress from '@/models/MindProgress'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const mission = await Mission.findOne({ userId: auth.userId }).lean()
    return NextResponse.json({ mission: mission ?? null })
  } catch (err) {
    console.error('GET /api/mind/mission error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { purpose, whyItMatters, dailyAction } = body as {
      purpose?: string
      whyItMatters?: string
      dailyAction?: string
    }

    if (!purpose || !whyItMatters || !dailyAction) {
      return NextResponse.json({ error: 'purpose, whyItMatters, and dailyAction are required' }, { status: 400 })
    }

    await dbConnect()

    const existing = await Mission.findOne({ userId: auth.userId }).lean()

    const mission = await Mission.findOneAndUpdate(
      { userId: auth.userId },
      { purpose, whyItMatters, dailyAction },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    // Grant XP on first mission set (fire-and-forget)
    if (!existing) {
      MindProgress.updateOne({ userId: auth.userId }, { $inc: { xp: 25 } }).catch(() => {})
    }

    return NextResponse.json({ mission })
  } catch (err) {
    console.error('PUT /api/mind/mission error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
