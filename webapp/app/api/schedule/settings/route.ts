import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Schedule from '@/models/Schedule'
import ProgramModel from '@/models/Program'
import { regenerateSchedule, type PhaseData } from '@/lib/schedule'
import { readTzOffsetFromBody, localDateKey, utcMidnightDateKey } from '@/lib/dayWindow'

// PUT: Update training day preferences and regenerate future workouts
export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const body = await request.json()
    const { programId, trainingDays, startDate } = body
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (!programId || !trainingDays) {
      return NextResponse.json({ error: 'programId and trainingDays are required' }, { status: 400 })
    }

    await dbConnect()

    const schedule = await Schedule.findOne({ userId: payload.userId, programId })
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    const program = await ProgramModel.findOne({ program_id: programId }).lean()
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    const phases = (program.phases || []) as PhaseData[]
    // Default "now" to the caller's LOCAL today (at UTC midnight, matching
    // how slot dates are stored). Without tz awareness, evening users in
    // zones west of UTC would regenerate as if it were tomorrow already.
    const effectiveStart = startDate
      ? new Date(startDate)
      : utcMidnightDateKey(localDateKey(null, tzOffsetMinutes))
    const result = regenerateSchedule(
      schedule.scheduledWorkouts,
      phases,
      trainingDays,
      effectiveStart,
      programId
    )

    schedule.scheduledWorkouts = result.allWorkouts
    schedule.settings.trainingDays = trainingDays

    const completedCount = result.allWorkouts.filter((w) => w.status === 'completed').length
    const syncUpdate: Record<string, unknown> = {
      'activePrograms.$.totalWorkouts': result.allWorkouts.length,
      'activePrograms.$.completedWorkouts': completedCount,
    }
    if (startDate) {
      schedule.settings.startDate = new Date(startDate)
      syncUpdate['activePrograms.$.startDate'] = new Date(startDate)
    }

    // Sync totalWorkouts (and startDate if changed) on the active program
    const UserProgressModel = (await import('@/models/UserProgress')).default
    await UserProgressModel.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      { $set: syncUpdate }
    )

    // If the program was marked completed due to old totalWorkouts, reactivate it
    await UserProgressModel.updateOne(
      {
        userId: payload.userId,
        'activePrograms.programId': programId,
        'activePrograms.status': 'completed',
      },
      { $set: { 'activePrograms.$.status': 'in-progress' } }
    )

    await schedule.save()

    return NextResponse.json({
      message: 'Schedule settings updated and future workouts regenerated',
      schedule: {
        programId: schedule.programId,
        settings: schedule.settings,
        totalScheduledWorkouts: result.allWorkouts.length,
        pastWorkouts: result.pastWorkouts.length,
        futureWorkouts: result.futureWorkouts.length,
      },
    })
  } catch (error) {
    console.error('Error updating schedule settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
