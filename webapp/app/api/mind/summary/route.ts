// GET /api/mind/summary?tz=  — the little the dashboard's Mindset card needs.
//
// Read-only and light on purpose. /api/mind/progress runs migrations and
// upserts on every call; the dashboard should not do that just to render a
// card. This answers: what level/chapter am I, did I do today's session, what
// did I say I was feeling most recently, and how many mood check-ins this week.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import MindProgress from '@/models/MindProgress'
import MindSession from '@/models/MindSession'
import StateLog from '@/models/StateLog'
import UserProgress from '@/models/UserProgress'
import { readTzOffset, localDateKey, dateKey } from '@/lib/dayWindow'
import {
  CHAPTERS, getLevelProgress, chapterFromSessions, sessionsIntoChapter, mainSessionAvailable,
  SESSIONS_PER_CHAPTER,
} from '@/lib/mindXP'
import { shiftDay } from '@/lib/streaks/pillars'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()

    const tz = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tz)
    const weekAgoKey = shiftDay(todayKey, -6)

    const [prog, todaySession, lastState, up, sessions7] = await Promise.all([
      MindProgress.findOne({ userId: auth.userId })
        .select('chapter levelXp xp xpBank mainSessionCount lastMainSessionAt')
        .lean<{ chapter?: number; levelXp?: number; xp?: number; xpBank?: number; mainSessionCount?: number; lastMainSessionAt?: Date } | null>(),
      MindSession.findOne({ userId: auth.userId, dateKey: todayKey }).select('_id').lean(),
      StateLog.findOne({ userId: auth.userId }).sort({ timestamp: -1 }).select('state feeling timestamp').lean<{ state: string; feeling?: string; timestamp: Date } | null>(),
      UserProgress.findOne({ userId: auth.userId }).select('moodHistory').lean<{ moodHistory?: Array<{ date: Date; mood: number }> } | null>(),
      MindSession.countDocuments({ userId: auth.userId, dateKey: { $gte: weekAgoKey, $lte: todayKey } }),
    ])

    // Same derivations /api/mind/progress uses, without its writes.
    const storedChapter = prog?.chapter ?? 1
    const levelXp = (prog?.levelXp ?? 0) > 0 ? prog!.levelXp! : (prog?.xp ?? 0) + (prog?.xpBank ?? 0)
    const mainSessionCount = Math.max(prog?.mainSessionCount ?? 0, (storedChapter - 1) * SESSIONS_PER_CHAPTER)
    const chapter = Math.max(storedChapter, chapterFromSessions(mainSessionCount))
    const level = getLevelProgress(levelXp)
    const into = sessionsIntoChapter(mainSessionCount)

    // Mood check-ins in the last 7 local days. moodHistory.date is a UTC-midnight
    // day marker, so read its key back with no offset.
    const moods = (up?.moodHistory ?? []).filter(m => {
      const k = dateKey(new Date(m.date), 0)
      return k >= weekAgoKey && k <= todayKey
    })
    const todayMood = moods.find(m => dateKey(new Date(m.date), 0) === todayKey)?.mood ?? null

    return NextResponse.json({
      todayKey,
      level: level.level,
      levelPct: level.pct,
      chapter,
      chapterName: CHAPTERS[chapter - 1]?.name ?? null,
      sessionsIntoChapter: into.done,
      sessionsPerChapter: into.needed,
      sessionDoneToday: !!todaySession,
      mainSessionAvailable: mainSessionAvailable(prog?.lastMainSessionAt),
      sessionsLast7Days: sessions7,
      moodCheckinsLast7Days: moods.length,
      todayMood,
      lastState: lastState
        ? { state: lastState.state, feeling: lastState.feeling ?? null, at: new Date(lastState.timestamp).getTime() }
        : null,
    })
  } catch (error) {
    console.error('Error building mind summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
