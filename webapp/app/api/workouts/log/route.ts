import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'

// GET: Fetch a specific past workout log by programId + date (YYYY-MM-DD)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')
    const dateParam = searchParams.get('date') // YYYY-MM-DD

    if (!programId || !dateParam) {
      return NextResponse.json({ error: 'programId and date are required' }, { status: 400 })
    }

    await dbConnect()

    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()
    if (!userProgress?.workoutLogs) {
      return NextResponse.json({ log: null, exerciseHistory: {} })
    }

    // Find the target day range using UTC (dates stored as UTC midnight)
    const dayStart = new Date(`${dateParam}T00:00:00.000Z`)
    const dayEnd = new Date(`${dateParam}T23:59:59.999Z`)

    type LogEntry = {
      programId: string
      date: Date
      day: string
      phase: number
      completed: boolean
      duration?: number
      exercises: Array<{
        name: string
        exerciseSlug?: string
        sets: Array<{ setNumber: number; reps: number; weight: number; completed: boolean }>
      }>
    }

    const logs = userProgress.workoutLogs as LogEntry[]

    const targetLog = logs.find(
      (log) =>
        log.programId === programId &&
        new Date(log.date) >= dayStart &&
        new Date(log.date) <= dayEnd
    ) ?? null

    // Build exercise history: best completed set per exercise from logs before this date
    const exerciseHistory: Record<string, { weight: number; reps: number; duration?: number; date: string }> = {}
    const pastLogs = logs
      .filter((log) => log.programId === programId && log.completed && new Date(log.date) < dayStart)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    for (const log of pastLogs) {
      for (const exercise of log.exercises ?? []) {
        if (exerciseHistory[exercise.name]) continue
        type AnySet = { completed: boolean; reps?: number; weight?: number; duration?: number }
        const completedSets = (exercise.sets ?? []).filter(
          (s: AnySet) => s.completed && ((s.reps ?? 0) > 0 || (s.duration ?? 0) > 0)
        )
        if (completedSets.length === 0) continue
        const bestSet = completedSets.reduce((best: AnySet, s: AnySet) => {
          const bw = best.weight ?? 0, sw = s.weight ?? 0
          if (sw > bw) return s
          if (sw === bw && (s.reps ?? 0) > (best.reps ?? 0)) return s
          if (sw === bw && (s.reps ?? 0) === (best.reps ?? 0) && (s.duration ?? 0) > (best.duration ?? 0)) return s
          return best
        }, completedSets[0])
        exerciseHistory[exercise.name] = {
          weight: bestSet.weight ?? 0,
          reps: bestSet.reps ?? 0,
          duration: bestSet.duration,
          date: new Date(log.date).toISOString(),
        }
      }
    }

    return NextResponse.json({ log: targetLog, exerciseHistory })
  } catch (error) {
    console.error('Error fetching workout log:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
