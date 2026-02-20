import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Schedule from '@/models/Schedule'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'

interface Workout {
  day: string
  title: string
  exercises: unknown[]
}

interface Phase {
  phase: string
  weeks: string
  focus: string
  workouts: Workout[] | Record<string, Omit<Workout, 'day'>>
}

function normalizeWorkouts(workouts: Workout[] | Record<string, Omit<Workout, 'day'>> | undefined | null): Workout[] {
  if (!workouts) return []
  if (Array.isArray(workouts)) return workouts
  return Object.entries(workouts).map(([day, workout]) => ({ day, ...workout }))
}

/** Parse phase weeks string like "1-4" to get number of weeks the split repeats */
function parsePhaseWeeks(weeksStr: string): number {
  const match = weeksStr.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (match) return parseInt(match[2]) - parseInt(match[1]) + 1
  const single = weeksStr.match(/^(\d+)$/)
  if (single) return 1
  return 1
}

/** Generate scheduled workouts from program phases mapped to calendar dates */
function generateScheduledWorkouts(
  phases: Phase[],
  trainingDays: number[],
  startDate: Date,
  programId: string
): Array<{
  date: Date
  programId: string
  phase: number
  dayLabel: string
  workoutTitle: string
  status: 'scheduled'
}> {
  // Collect all workouts across all phases in order, repeating each phase's split for its duration
  const allWorkouts: { phase: number; dayLabel: string; title: string }[] = []
  for (let i = 0; i < phases.length; i++) {
    const workouts = normalizeWorkouts(phases[i].workouts)
    const numWeeks = parsePhaseWeeks(phases[i].weeks || '1')
    for (let week = 0; week < numWeeks; week++) {
      for (const w of workouts) {
        allWorkouts.push({
          phase: i + 1,
          dayLabel: w.day,
          title: w.title,
        })
      }
    }
  }

  if (allWorkouts.length === 0 || trainingDays.length === 0) return []

  // Sort training days for consistent iteration
  const sortedDays = [...trainingDays].sort((a, b) => a - b)

  const scheduled: Array<{
    date: Date
    programId: string
    phase: number
    dayLabel: string
    workoutTitle: string
    status: 'scheduled'
  }> = []

  // Start from the startDate and walk forward, assigning workouts to training days
  const current = new Date(startDate)
  current.setHours(0, 0, 0, 0)
  let workoutIndex = 0

  // Safety limit: don't generate more than 365 days out
  const maxDate = new Date(current)
  maxDate.setFullYear(maxDate.getFullYear() + 1)

  while (workoutIndex < allWorkouts.length && current < maxDate) {
    const dayOfWeek = current.getDay()
    if (sortedDays.includes(dayOfWeek)) {
      const workout = allWorkouts[workoutIndex]
      scheduled.push({
        date: new Date(current),
        programId,
        phase: workout.phase,
        dayLabel: workout.dayLabel,
        workoutTitle: workout.title,
        status: 'scheduled',
      })
      workoutIndex++
    }
    current.setDate(current.getDate() + 1)
  }

  return scheduled
}

// GET: Fetch schedule(s) for a user
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
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const view = searchParams.get('view') // 'week' | 'month' | 'upcoming' | 'all'

    await dbConnect()

    // Build query
    const query: Record<string, unknown> = { userId: payload.userId }
    if (programId) query.programId = programId

    const schedules = await Schedule.find(query).lean()

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ schedules: [] })
    }

    // Determine date range
    let fromDate: Date | null = null
    let toDate: Date | null = null
    const now = new Date()
    now.setHours(0, 0, 0, 0)

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

    // Get workout logs to cross-reference completion status
    const userProgress = await UserProgress.findOne({ userId: payload.userId }).lean()
    const workoutLogs = userProgress?.workoutLogs || []

    // Process schedules: filter by date range and update statuses
    const processedSchedules = schedules.map((schedule) => {
      let workouts = schedule.scheduledWorkouts || []

      // Filter by date range if specified
      if (fromDate && toDate) {
        workouts = workouts.filter((w: { date: Date }) => {
          const d = new Date(w.date)
          return d >= fromDate! && d < toDate!
        })
      }

      // Update statuses based on workout logs
      const updatedWorkouts = workouts.map((w: { date: Date; programId: string; dayLabel: string; status: string; phase: number; workoutTitle: string; completedAt?: Date; notes?: string }) => {
        const wDate = new Date(w.date)
        wDate.setHours(0, 0, 0, 0)

        // Check if completed in workout logs
        const matchingLog = workoutLogs.find((log: { programId: string; day: string; date: Date; completed: boolean }) => {
          const logDate = new Date(log.date)
          logDate.setHours(0, 0, 0, 0)
          return log.programId === w.programId &&
                 log.day === w.dayLabel &&
                 logDate.getTime() === wDate.getTime() &&
                 log.completed
        })

        if (matchingLog) {
          return { ...w, status: 'completed', completedAt: matchingLog.date }
        }

        // Mark as missed if in the past and not completed/skipped
        if (wDate < now && w.status === 'scheduled') {
          return { ...w, status: 'missed' }
        }

        return w
      })

      return {
        _id: schedule._id,
        programId: schedule.programId,
        programName: schedule.programName,
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
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

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

    const phases = (program.phases || []) as Phase[]
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
          autoAdvance: true,
        },
        scheduledWorkouts,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    // Set hasSchedule flag on the active program
    await UserProgress.updateOne(
      { userId: payload.userId, 'activePrograms.programId': programId },
      { $set: { 'activePrograms.$.hasSchedule': true } }
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

// PATCH: Modify schedule entries (reschedule, swap, skip)
export async function PATCH(request: NextRequest) {
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

    const { programId, action, workoutDate, newDate, swapWithDate } = await request.json()

    if (!programId || !action || !workoutDate) {
      return NextResponse.json({ error: 'programId, action, and workoutDate are required' }, { status: 400 })
    }

    await dbConnect()

    const schedule = await Schedule.findOne({ userId: payload.userId, programId })
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    const targetDate = new Date(workoutDate)
    targetDate.setHours(0, 0, 0, 0)

    const targetIdx = schedule.scheduledWorkouts.findIndex((w) => {
      const d = new Date(w.date)
      d.setHours(0, 0, 0, 0)
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
        nd.setHours(0, 0, 0, 0)
        schedule.scheduledWorkouts[targetIdx].date = nd
        // Re-sort by date
        schedule.scheduledWorkouts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        break
      }

      case 'swap': {
        if (!swapWithDate) {
          return NextResponse.json({ error: 'swapWithDate is required for swap' }, { status: 400 })
        }
        const swapDate = new Date(swapWithDate)
        swapDate.setHours(0, 0, 0, 0)
        const swapIdx = schedule.scheduledWorkouts.findIndex((w) => {
          const d = new Date(w.date)
          d.setHours(0, 0, 0, 0)
          return d.getTime() === swapDate.getTime()
        })

        if (swapIdx === -1) {
          return NextResponse.json({ error: 'No workout found on swap date' }, { status: 404 })
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
        return NextResponse.json({ error: 'Invalid action. Use: skip, reschedule, swap, unskip' }, { status: 400 })
    }

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
