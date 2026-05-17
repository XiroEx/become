import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'

// GET /api/workouts/logs?programId=xxx
// Returns all workout logs for a program — used to build completedDays set on program detail page.
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')

    if (!programId) {
      return NextResponse.json({ error: 'programId is required' }, { status: 400 })
    }

    await dbConnect()

    const userProgress = await UserProgress.findOne({ userId: payload.userId })
      .select('workoutLogs')
      .lean<{ workoutLogs?: Array<{ programId: string; day: string; phase: number; completed: boolean; date: Date; duration?: number }> } | null>()

    const logs = (userProgress?.workoutLogs ?? [])
      .filter((log) => log.programId === programId)
      .map((log) => ({
        day: log.day,
        phase: log.phase,
        completed: log.completed,
        date: new Date(log.date).toISOString(),
        duration: log.duration,
      }))

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Error fetching workout logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
