import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import DailyContentLog from '@/models/DailyContentLog'

function todayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// GET — return today's content log if it exists
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const log = await DailyContentLog.findOne({
      userId: auth.userId,
      date: todayUTC(),
    }).lean()

    return NextResponse.json({ log: log ?? null })
  } catch (err) {
    console.error('GET /api/mind/content/daily error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST — create today's log (check-in) or mark CTA clicked
// Body: { state, contentId }          → initial check-in
// Body: { ctaClicked: true }          → mark CTA tapped
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { state, contentId, ctaClicked } = body as {
      state?: string
      contentId?: string
      ctaClicked?: boolean
    }

    await dbConnect()

    const today = todayUTC()

    if (ctaClicked === true) {
      // Just mark CTA clicked on whatever log exists today
      await DailyContentLog.updateOne(
        { userId: auth.userId, date: today },
        { $set: { ctaClicked: true } }
      )
      return NextResponse.json({ ok: true })
    }

    if (!state || !contentId) {
      return NextResponse.json({ error: 'state and contentId required' }, { status: 400 })
    }

    const log = await DailyContentLog.findOneAndUpdate(
      { userId: auth.userId, date: today },
      { $setOnInsert: { userId: auth.userId, date: today, state, contentId, ctaClicked: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({ log })
  } catch (err) {
    console.error('POST /api/mind/content/daily error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
