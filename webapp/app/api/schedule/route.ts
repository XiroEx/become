import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Schedule from '@/models/Schedule'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import { generateScheduledWorkouts, regenerateSchedule, type PhaseData } from '@/lib/schedule'
import { readTzOffset, readTzOffsetFromBody, localDateKey, utcMidnightDateKey } from '@/lib/dayWindow'

// GET: Fetch schedule(s) for a user
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { searchParams } = new URL(request.url)
    const programId = searchParams.get('programId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const view = searchParams.get('view') // 'week' | 'month' | 'upcoming' | 'all'
    const tzOffsetMinutes = readTzOffset(searchParams)

    await dbConnect()

    // Build query
    const query: Record<string, unknown> = { userId: payload.userId }
    if (programId) query.programId = programId

    const schedules = await Schedule.find(query).lean()

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ schedules: [] })
    }

    // Determine date range. "Today" is anchored to the caller's LOCAL day
    // and stored at UTC midnight of that day's YYYY-MM-DD — matching how
    // Schedule slot dates are written (always UTC midnight in lib/schedule.ts).
    let fromDate: Date | null = null
    let toDate: Date | null = null
    const now = utcMidnightDateKey(localDateKey(null, tzOffsetMinutes))

    if (from && to) {
      fromDate = new Date(from)
      toDate = new Date(to)
    } else if (view === 'week') {
      fromDate = new Date(now)
      // Start of current week (Sunday)
      fromDate.setDate(fromDate.getDate() - fromDate.getDay())
      toDate = new Date(fromDate)
      toDate.setDate(toDate.getDate() + 7)
    } else if (view === 'upcoming') {
      fromDate = new Date(now)
      toDate = new Date(now)
      toDate.setDate(toDate.getDate() + 7)
    } else if (view === 'month') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    }

    // Get active program statuses for display
    const userProgress = await UserProgress.findOne({ userId: payload.userId }, { activePrograms: 1 }).lean()
    const activePrograms = userProgress?.activePrograms || []
    const programStatusMap = new Map<string, string>()
    for (const p of activePrograms as Array<{ programId: string; status: string }>) {
      programStatusMap.set(p.programId, p.status)
    }

    // Process schedules: compute statuses across the FULL schedule first,
    // then filter to the requested date range for the response.
    //
    // The workout POST handler keeps schedule slot statuses accurate when workouts
    // are logged via the app. We trust the DB directly — no positional log matching —
    // to avoid orphan pre-schedule logs bleeding into future/missed slots.
    const processedSchedules = schedules.map((schedule) => {
      type SW = { date: Date; programId: string; dayLabel: string; status: string; phase: number; workoutTitle: string; completedAt?: Date; notes?: string }
      const allWorkouts: SW[] = schedule.scheduledWorkouts || []

      const statusByDate: Record<string, { status: string; completedAt?: Date }> = {}

      for (const w of allWorkouts) {
        const wDate = new Date(w.date)
        wDate.setUTCHours(0, 0, 0, 0)
        const dateKey = wDate.getTime().toString()

        if (w.status === 'completed' || w.status === 'skipped' || w.status === 'missed') {
          // Trust the DB — these were set by the workout handler or admin correction
          statusByDate[dateKey] = { status: w.status, completedAt: w.completedAt }
        } else if (wDate < now && w.status === 'scheduled') {
          // Past scheduled slot that was never completed — it's missed.
          // `now` is anchored to the caller's local day boundary (see above)
          // so evening users in zones west of UTC don't see today's slot
          // marked missed before their local midnight.
          statusByDate[dateKey] = { status: 'missed' }
        } else {
          // Future scheduled, rest, or any other status — keep as-is
          statusByDate[dateKey] = { status: w.status, completedAt: w.completedAt }
        }
      }

      // Apply computed statuses and filter to the requested date range
      let updatedWorkouts = allWorkouts.map((w) => {
        const wDate = new Date(w.date)
        wDate.setUTCHours(0, 0, 0, 0)
        const result = statusByDate[wDate.getTime().toString()]
        if (!result) return w
        return { ...w, status: result.status, ...(result.completedAt ? { completedAt: result.completedAt } : {}) }
      })

      if (fromDate && toDate) {
        updatedWorkouts = updatedWorkouts.filter((w) => {
          const d = new Date(w.date)
          return d >= fromDate! && d < toDate!
        })
      }

      return {
        _id: schedule._id,
        programId: schedule.programId,
        programName: schedule.programName,
        programStatus: programStatusMap.get(schedule.programId) || 'unknown',
        settings: schedule.settings,
        scheduledWorkouts: updatedWorkouts,
      }
    })

    return NextResponse.json({ schedules: processedSchedules })
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create a schedule for an enrolled program
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const { programId, trainingDays, startDate } = await request.json()

    if (!programId || !trainingDays || !startDate) {
      return NextResponse.json({ error: 'programId, trainingDays, and startDate are required' }, { status: 400 })
    }

    if (!Array.isArray(trainingDays) || trainingDays.length === 0) {
      return NextResponse.json({ error: 'trainingDays must be a non-empty array of day numbers (0-6)' }, { status: 400 })
    }

    await dbConnect()

    // Verify user is enrolled in this program
    const userProgress = await UserProgress.findOne({
      userId: payload.userId,
      'activePrograms.programId': programId,
    }).lean()

    if (!userProgress) {
      return NextResponse.json({ error: 'Not enrolled in this program' }, { status: 400 })
    }

    const activeProgram = userProgress.activePrograms?.find(
      (p: { programId: string; status: string }) =>
        p.programId === programId
    )

    if (!activeProgram) {
      return NextResponse.json({ error: 'Program not found in your active programs' }, { status: 400 })
    }

    // Fetch program to get phases/workouts
    const program = await ProgramModel.findOne({ program_id: programId }).lean()
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    const phases = (program.phases || []) as PhaseData[]
    const scheduledWorkouts = generateScheduledWorkouts(
      phases,
      trainingDays,
      new Date(startDate),
      programId
    )

    // Upsert schedule (replace if exists)
    const schedule = await Schedule.findOneAndUpdate(
      { userId: payload.userId, programId },
      {
        userId: payload.userId,
        programId,
        programName: program.name,
        settings: {
          trainingDays,
          startDate: new Date(startDate),
        },
        scheduledWorkouts,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    // Sync hasSchedule, startDate, totalWorkouts, and reset status if needed
    await UserProgress.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      {
        $set: {
          'activePrograms.$.hasSchedule': true,
          'activePrograms.$.startDate': new Date(startDate),
          'activePrograms.$.totalWorkouts': scheduledWorkouts.length,
          'activePrograms.$.status': 'in-progress',
        },
      }
    )

    return NextResponse.json({
      message: 'Schedule created successfully',
      schedule: {
        _id: schedule._id,
        programId: schedule.programId,
        programName: schedule.programName,
        settings: schedule.settings,
        totalScheduledWorkouts: scheduledWorkouts.length,
        firstWorkout: scheduledWorkouts[0]?.date,
        lastWorkout: scheduledWorkouts[scheduledWorkouts.length - 1]?.date,
      },
    })
  } catch (error) {
    console.error('Error creating schedule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH: Modify schedule entries (reschedule, swap, skip) or program-level actions (shift, pause, resume)
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 })
    }
    const payload = { userId: authResult.userId!, email: authResult.email! }

    const body = await request.json()
    const { programId, action, workoutDate, newDate, swapWithDate, days, resumeDate } = body
    const tzOffsetMinutes = readTzOffsetFromBody(body)

    if (!programId || !action) {
      return NextResponse.json({ error: 'programId and action are required' }, { status: 400 })
    }

    // Program-level actions don't require workoutDate
    const programLevelActions = ['shift', 'pause', 'resume']
    if (!programLevelActions.includes(action) && !workoutDate) {
      return NextResponse.json({ error: 'workoutDate is required for this action' }, { status: 400 })
    }

    await dbConnect()

    // Handle pause (doesn't need a schedule to exist)
    if (action === 'pause') {
      await UserProgress.updateOne(
        { userId: payload.userId, 'activePrograms.programId': programId },
        { $set: { 'activePrograms.$.status': 'paused' } }
      )
      return NextResponse.json({ message: 'Program paused', programId })
    }

    // Handle resume
    if (action === 'resume') {
      const schedule = await Schedule.findOne({ userId: payload.userId, programId })
      if (schedule) {
        const program = await ProgramModel.findOne({ program_id: programId }).lean()
        if (program) {
          const phases = (program.phases || []) as PhaseData[]
          const effectiveDate = resumeDate ? new Date(resumeDate) : new Date()
          const result = regenerateSchedule(
            schedule.scheduledWorkouts,
            phases,
            schedule.settings.trainingDays,
            effectiveDate,
            programId
          )
          schedule.scheduledWorkouts = result.allWorkouts
          await schedule.save()

          await UserProgress.updateOne(
            { userId: payload.userId, 'activePrograms.programId': programId },
            {
              $set: {
                'activePrograms.$.status': 'in-progress',
                'activePrograms.$.totalWorkouts': result.allWorkouts.length,
              },
            }
          )

          return NextResponse.json({
            message: 'Program resumed and schedule regenerated',
            programId,
            totalScheduledWorkouts: result.allWorkouts.length,
            futureWorkouts: result.futureWorkouts.length,
          })
        }
      }

      // No schedule — just resume the status
      await UserProgress.updateOne(
        { userId: payload.userId, 'activePrograms.programId': programId },
        { $set: { 'activePrograms.$.status': 'in-progress' } }
      )
      return NextResponse.json({ message: 'Program resumed', programId })
    }

    // Handle shift (delay/advance all future workouts by N days)
    if (action === 'shift') {
      if (!days || typeof days !== 'number') {
        return NextResponse.json({ error: 'days (number) is required for shift' }, { status: 400 })
      }

      const schedule = await Schedule.findOne({ userId: payload.userId, programId })
      if (!schedule) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
      }

      const program = await ProgramModel.findOne({ program_id: programId }).lean()
      if (!program) {
        return NextResponse.json({ error: 'Program not found' }, { status: 404 })
      }

      // Anchor "today" to the caller's LOCAL day at UTC midnight, matching
      // how Schedule slot dates are stored. Without this, evening users in
      // zones west of UTC would shift today's slot as if it were already
      // past.
      const now = utcMidnightDateKey(localDateKey(null, tzOffsetMinutes))

      // Find the earliest future scheduled workout
      const futureWorkouts = schedule.scheduledWorkouts.filter((w) => {
        const d = new Date(w.date)
        d.setUTCHours(0, 0, 0, 0)
        return d >= now && w.status === 'scheduled'
      })

      if (futureWorkouts.length === 0) {
        return NextResponse.json({ error: 'No future workouts to shift' }, { status: 400 })
      }

      const earliestFuture = new Date(Math.min(...futureWorkouts.map(w => new Date(w.date).getTime())))
      const shiftedStart = new Date(earliestFuture)
      shiftedStart.setUTCDate(shiftedStart.getUTCDate() + days)

      const phases = (program.phases || []) as PhaseData[]
      const result = regenerateSchedule(
        schedule.scheduledWorkouts,
        phases,
        schedule.settings.trainingDays,
        shiftedStart,
        programId
      )

      schedule.scheduledWorkouts = result.allWorkouts
      await schedule.save()

      await UserProgress.updateOne(
        { userId: payload.userId, 'activePrograms.programId': programId },
        { $set: { 'activePrograms.$.totalWorkouts': result.allWorkouts.length } }
      )

      return NextResponse.json({
        message: `Schedule shifted by ${days} day(s)`,
        programId,
        totalScheduledWorkouts: result.allWorkouts.length,
        futureWorkouts: result.futureWorkouts.length,
        nextWorkout: result.futureWorkouts[0]?.date,
      })
    }

    // Per-workout actions below — require workoutDate
    const schedule = await Schedule.findOne({ userId: payload.userId, programId })
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    const targetDate = new Date(workoutDate)
    targetDate.setUTCHours(0, 0, 0, 0)

    const targetIdx = schedule.scheduledWorkouts.findIndex((w) => {
      const d = new Date(w.date)
      d.setUTCHours(0, 0, 0, 0)
      return d.getTime() === targetDate.getTime()
    })

    if (targetIdx === -1) {
      return NextResponse.json({ error: 'No workout found on that date' }, { status: 404 })
    }

    switch (action) {
      case 'skip': {
        schedule.scheduledWorkouts[targetIdx].status = 'skipped'
        break
      }

      case 'reschedule': {
        if (!newDate) {
          return NextResponse.json({ error: 'newDate is required for reschedule' }, { status: 400 })
        }
        const nd = new Date(newDate)
        nd.setUTCHours(0, 0, 0, 0)
        schedule.scheduledWorkouts[targetIdx].date = nd
        // Re-sort by date
        schedule.scheduledWorkouts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        break
      }

      case 'swap': {
        if (!swapWithDate) {
          return NextResponse.json({ error: 'swapWithDate is required for swap' }, { status: 400 })
        }

        const targetWorkout = schedule.scheduledWorkouts[targetIdx]
        if (targetWorkout.status === 'completed' || targetWorkout.status === 'missed') {
          return NextResponse.json({ error: 'Cannot swap a completed or missed workout' }, { status: 400 })
        }

        const swapDate = new Date(swapWithDate)
        swapDate.setUTCHours(0, 0, 0, 0)
        const swapIdx = schedule.scheduledWorkouts.findIndex((w) => {
          const d = new Date(w.date)
          d.setUTCHours(0, 0, 0, 0)
          return d.getTime() === swapDate.getTime()
        })

        if (swapIdx === -1) {
          return NextResponse.json({ error: 'No workout found on swap date' }, { status: 404 })
        }

        const swapWorkout = schedule.scheduledWorkouts[swapIdx]
        if (swapWorkout.status === 'completed' || swapWorkout.status === 'missed') {
          return NextResponse.json({ error: 'Cannot swap with a completed or missed workout' }, { status: 400 })
        }

        // Swap dates
        const tempDate = schedule.scheduledWorkouts[targetIdx].date
        schedule.scheduledWorkouts[targetIdx].date = schedule.scheduledWorkouts[swapIdx].date
        schedule.scheduledWorkouts[swapIdx].date = tempDate
        // Re-sort
        schedule.scheduledWorkouts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        break
      }

      case 'unskip': {
        if (schedule.scheduledWorkouts[targetIdx].status === 'skipped') {
          schedule.scheduledWorkouts[targetIdx].status = 'scheduled'
        }
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid action. Use: skip, reschedule, swap, unskip, shift, pause, resume' }, { status: 400 })
    }

    // ScheduledWorkoutSchema is declared with `_id: false`, which means
    // Mongoose can't always detect direct subdoc mutations like
    // `scheduledWorkouts[i].status = ...`. Force the array to be marked
    // modified so the change actually persists on save().
    schedule.markModified('scheduledWorkouts')
    await schedule.save()

    return NextResponse.json({
      message: `Schedule updated: ${action}`,
      schedule: {
        programId: schedule.programId,
        scheduledWorkouts: schedule.scheduledWorkouts,
      },
    })
  } catch (error) {
    console.error('Error updating schedule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
