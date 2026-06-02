// Admin-only Mind progress controls (acts on the calling admin's OWN account)
// for retesting the Mind journey.
//   GET   → current { chapter, xp }
//   POST  → { chapter?, xp?, reset? }
//           reset:true → chapter 1, xp 0, fresh history, delete MindSession docs
//           (so the daily session replays + streak resets)

import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import { requireAdmin } from '@/lib/adminAuth'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  await dbConnect()
  const p = await MindProgress.findOne({ userId: gate.userId }).lean<{ chapter?: number; xp?: number } | null>()
  return NextResponse.json({ chapter: p?.chapter ?? 1, xp: p?.xp ?? 0 })
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  let body: { chapter?: number; xp?: number; reset?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body ok */
  }

  await dbConnect()

  if (body.reset) {
    await MindProgress.findOneAndUpdate(
      { userId: gate.userId },
      {
        $set: {
          chapter: 1,
          xp: 0,
          chapterHistory: [{ chapter: 1, unlockedAt: new Date() }],
          selfDeclaredChapters: [],
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    )
    await MindSession.deleteMany({ userId: gate.userId })
    return NextResponse.json({ chapter: 1, xp: 0, reset: true })
  }

  const set: Record<string, number> = {}
  if (typeof body.chapter === 'number') set.chapter = Math.max(1, Math.min(5, Math.round(body.chapter)))
  if (typeof body.xp === 'number') set.xp = Math.max(0, Math.round(body.xp))
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: 'Provide chapter, xp, or reset' }, { status: 400 })
  }

  const updated = await MindProgress.findOneAndUpdate(
    { userId: gate.userId },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<{ chapter?: number; xp?: number } | null>()

  return NextResponse.json({ chapter: updated?.chapter ?? 1, xp: updated?.xp ?? 0 })
}
