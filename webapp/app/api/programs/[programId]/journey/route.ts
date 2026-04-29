import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import { verifyAuth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { programId } = await params
    await dbConnect()

    const [progress, program] = await Promise.all([
      UserProgress.findOne({ userId: authResult.userId }).lean(),
      ProgramModel.findOne({ program_id: programId }).lean() as Promise<{
        name?: string; duration_weeks?: number; goal?: string
      } | null>,
    ])

    if (!progress || !program) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    type AnySet = { completed?: boolean; weight?: number; reps?: number; duration?: number }
    type AnyExercise = { name: string; exerciseSlug?: string; sets?: AnySet[] }
    type AnyLog = {
      programId: string; completed: boolean; date: Date; day?: string; duration?: number
      exercises?: AnyExercise[]
    }

    const allLogs = (progress.workoutLogs || []) as AnyLog[]
    const programLogs = allLogs
      .filter((l) => l.programId === programId && l.completed)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    if (programLogs.length === 0) {
      return NextResponse.json({
        programName: program.name || 'Program',
        durationWeeks: program.duration_weeks || 0,
        totalSessions: 0,
        totalVolumeLbs: 0,
        weightChange: null,
        topPRs: [],
        startDate: null,
        endDate: null,
      })
    }

    // Total sessions and volume
    let totalVolumeLbs = 0
    const prMap: Record<string, { name: string; weight: number; reps: number; date: string }> = {}

    for (const log of programLogs) {
      for (const exercise of (log.exercises || [])) {
        for (const set of (exercise.sets || [])) {
          if (!set.completed || !set.weight || !set.reps) continue
          totalVolumeLbs += set.weight * set.reps
          const key = exercise.exerciseSlug || exercise.name
          const existing = prMap[key]
          const w = set.weight, r = set.reps
          if (!existing || w > existing.weight || (w === existing.weight && r > existing.reps)) {
            prMap[key] = {
              name: exercise.name,
              weight: w,
              reps: r,
              date: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            }
          }
        }
      }
    }

    const startDate = new Date(programLogs[0].date)
    const endDate = new Date(programLogs[programLogs.length - 1].date)

    // Weight change: closest weight entry to start vs end of program
    type WeightEntry = { date: Date; weight: number; unit?: string }
    const weightHistory = ((progress as { weightHistory?: WeightEntry[] }).weightHistory || [])
      .filter((w: WeightEntry) => w.weight > 0)
      .sort((a: WeightEntry, b: WeightEntry) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let weightChange: { startLbs: number; endLbs: number; change: number } | null = null
    if (weightHistory.length >= 2) {
      // First entry at or before program start; last entry at or after program end
      const beforeStart = weightHistory.filter((w: WeightEntry) => new Date(w.date) <= startDate)
      const afterEnd = weightHistory.filter((w: WeightEntry) => new Date(w.date) >= endDate)
      const startEntry = beforeStart[beforeStart.length - 1] || weightHistory[0]
      const endEntry = afterEnd[afterEnd.length - 1] || weightHistory[weightHistory.length - 1]

      if (startEntry && endEntry && startEntry !== endEntry) {
        // UserProgress stores weight in lbs (see IWeightEntry comment in models/UserProgress.ts).
        // The unit field is not stored in the schema; treat absent/unknown unit as lbs.
        const toLbs = (w: WeightEntry) => w.unit === 'kg' ? w.weight * 2.20462 : w.weight
        const startLbs = Math.round(toLbs(startEntry) * 10) / 10
        const endLbs = Math.round(toLbs(endEntry) * 10) / 10
        weightChange = { startLbs, endLbs, change: Math.round((endLbs - startLbs) * 10) / 10 }
      }
    }

    const topPRs = Object.values(prMap)
      .filter((p) => p.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)

    return NextResponse.json({
      programName: program.name || 'Program',
      durationWeeks: program.duration_weeks || 0,
      goal: program.goal || null,
      totalSessions: programLogs.length,
      totalVolumeLbs: Math.round(totalVolumeLbs),
      weightChange,
      topPRs,
      startDate: startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      endDate: endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    })
  } catch (error) {
    console.error('Journey API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
