import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import ProgramModel from '@/models/Program'
import { regenerateSchedule, type PhaseData } from '@/lib/schedule'

// PUT: Update the start date of an enrolled program and regenerate its schedule
export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { programId, startDate } = await request.json()

    if (!programId || !startDate) {
      return NextResponse.json({ error: 'programId and startDate are required' }, { status: 400 })
    }

    await dbConnect()

    const newStartDate = new Date(startDate + 'T00:00:00.000Z')

    // Update the activeProgram's startDate
    const result = await UserProgress.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      { $set: { 'activePrograms.$.startDate': newStartDate } }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Program not found in your active programs' }, { status: 404 })
    }

    // If a schedule exists, regenerate it from the new start date
    const schedule = await Schedule.findOne({ userId: payload.userId, programId })
    if (schedule) {
      const program = await ProgramModel.findOne({ program_id: programId }).lean()
      if (program) {
        const phases = (program.phases || []) as PhaseData[]
        const regen = regenerateSchedule(
          schedule.scheduledWorkouts,
          phases,
          schedule.settings.trainingDays,
          newStartDate,
          programId
        )

        schedule.settings.startDate = newStartDate
        schedule.scheduledWorkouts = regen.allWorkouts
        await schedule.save()

        // Sync totalWorkouts back to UserProgress
        await UserProgress.updateOne(
          { userId: payload.userId, 'activePrograms.programId': programId },
          { $set: { 'activePrograms.$.totalWorkouts': regen.allWorkouts.length } }
        )

        return NextResponse.json({
          message: 'Start date updated and schedule regenerated',
          startDate: newStartDate,
          totalScheduledWorkouts: regen.allWorkouts.length,
          futureWorkouts: regen.futureWorkouts.length,
          nextWorkout: regen.futureWorkouts[0]?.date,
        })
      } else {
        // Program not found in DB but schedule exists — just update the date
        schedule.settings.startDate = newStartDate
        await schedule.save()
      }
    }

    return NextResponse.json({
      message: 'Start date updated',
      startDate: newStartDate,
    })
  } catch (error) {
    console.error('Error updating start date:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
