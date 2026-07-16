import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import { readTzOffset, readTzOffsetFromBody, localDateKey } from '@/lib/dayWindow'

const DAY_MS = 86_400_000

// "Vision alignment" — how in-line the user's days have been with the future they
// described. The daily-return hook: a 1–5 check that lands in alignmentHistory.
function alignmentView(
  history: Array<{ date: string; score: number }> | undefined,
  tz: number,
) {
  const today = localDateKey(null, tz)
  const cutoff = localDateKey(null, tz, new Date(Date.now() - 6 * DAY_MS)) // 7-day window (inclusive)
  const recent = (history ?? []).filter((h) => h.date >= cutoff)
  const avg7 = recent.length ? Math.round((recent.reduce((s, h) => s + h.score, 0) / recent.length) * 10) / 10 : 0
  const todayEntry = (history ?? []).find((h) => h.date === today)
  return { avg7, entries7: recent.length, todayScore: todayEntry?.score ?? null, checkedToday: !!todayEntry }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await dbConnect()

    const tz = readTzOffset(new URL(request.url).searchParams)
    const progress = await MindProgress.findOne({ userId: auth.userId }).lean()
    const vision = progress?.vision ?? null
    return NextResponse.json({ vision, alignment: alignmentView(vision?.alignmentHistory, tz) })
  } catch (err) {
    console.error('GET /api/mind/vision error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH { action: 'align', score, tz } — record today's alignment (1–5),
// idempotent per local day (replaces today's entry). Keeps a 90-day trail.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    if (body.action !== 'align') {
      return NextResponse.json({ error: 'action must be "align"' }, { status: 400 })
    }
    const score = Math.round(Number(body.score))
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return NextResponse.json({ error: 'score must be 1–5' }, { status: 400 })
    }
    const tz = readTzOffsetFromBody(body)

    await dbConnect()
    const doc = await MindProgress.findOne({ userId: auth.userId })
    if (!doc?.vision) return NextResponse.json({ error: 'Set your vision first' }, { status: 404 })

    const today = localDateKey(null, tz)
    const hist = (doc.vision.alignmentHistory ?? []).filter((h) => h.date !== today)
    hist.push({ date: today, score })
    hist.sort((a, b) => a.date.localeCompare(b.date))
    doc.vision.alignmentHistory = hist.slice(-90) // keep a rolling 90 days
    await doc.save()

    return NextResponse.json({ alignment: alignmentView(doc.vision.alignmentHistory, tz) })
  } catch (err) {
    console.error('PATCH /api/mind/vision error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { habits, mind, body: bodyText, relationships, environment, identityStatement } = body as {
      habits?: string
      mind?: string
      body?: string
      relationships?: string
      environment?: string
      identityStatement?: string
    }

    await dbConnect()

    // Check if this is a first-time vision (grant more XP)
    const existing = await MindProgress.findOne({ userId: auth.userId }).lean()
    const isFirstVision = !existing?.vision?.completedAt

    const now = new Date()
    const visionUpdate: Record<string, unknown> = { 'vision.updatedAt': now }

    if (habits !== undefined) visionUpdate['vision.habits'] = habits.trim()
    if (mind !== undefined) visionUpdate['vision.mind'] = mind.trim()
    if (bodyText !== undefined) visionUpdate['vision.body'] = bodyText.trim()
    if (relationships !== undefined) visionUpdate['vision.relationships'] = relationships.trim()
    if (environment !== undefined) visionUpdate['vision.environment'] = environment.trim()
    if (identityStatement !== undefined) visionUpdate['vision.identityStatement'] = identityStatement.trim()

    // Mark as completed if all fields present
    const allFields = [habits, mind, bodyText, relationships, environment, identityStatement]
    const isComplete = allFields.every(f => f && f.trim().length > 0)
    if (isComplete && isFirstVision) {
      visionUpdate['vision.completedAt'] = now
    }

    // Grant XP: 75 first time, 15 for updates
    const xpGrant = isFirstVision && isComplete ? 75 : 15

    const updated = await MindProgress.findOneAndUpdate(
      { userId: auth.userId },
      {
        $set: visionUpdate,
        $inc: { xp: xpGrant },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({
      vision: updated?.vision ?? null,
      xpGained: xpGrant,
      xp: updated?.xp ?? 0,
    })
  } catch (err) {
    console.error('POST /api/mind/vision error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
