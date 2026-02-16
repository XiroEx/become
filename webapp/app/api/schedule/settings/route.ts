import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Schedule from '@/models/Schedule'
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

// PUT: Update training day preferences and regenerate future workouts
export async function PUT(request: NextRequest) {
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

    const now = new Date()
    now.setHours(0, 0, 0, 0)

    // Preserve completed/missed/skipped workouts in the past
    const pastWorkouts = schedule.scheduledWorkouts.filter((w) => {
      const d = new Date(w.date)
      d.setHours(0, 0, 0, 0)
      return d < now && (w.status === 'completed' || w.status === 'missed' || w.status === 'skipped')
    })

    // Determine which workout day labels have already been completed
    const completedLabels = new Set(
      pastWorkouts
        .filter((w) => w.status === 'completed')
        .map((w) => `${w.phase}-${w.dayLabel}`)
    )

    // Collect remaining workouts from program that haven't been completed
    const phases = (program.phases || []) as Phase[]
    const remainingWorkouts: { phase: number; dayLabel: string; title: string }[] = []
    for (let i = 0; i < phases.length; i++) {
      const workouts = normalizeWorkouts(phases[i].workouts)
      for (const w of workouts) {
        const key = `${i + 1}-${w.day}`
        if (!completedLabels.has(key)) {
          remainingWorkouts.push({ phase: i + 1, dayLabel: w.day, title: w.title })
        }
      }
    }

    // Generate new schedule dates for remaining workouts
    const sortedDays = [...trainingDays].sort((a, b) => a - b)
    const effectiveStart = startDate ? new Date(startDate) : now
    effectiveStart.setHours(0, 0, 0, 0)

    const newScheduled: typeof schedule.scheduledWorkouts = []
    const current = new Date(effectiveStart)
    let widx = 0

    const maxDate = new Date(current)
    maxDate.setFullYear(maxDate.getFullYear() + 1)

    while (widx < remainingWorkouts.length && current < maxDate) {
      if (sortedDays.includes(current.getDay())) {
        const w = remainingWorkouts[widx]
        newScheduled.push({
          date: new Date(current),
          programId,
          phase: w.phase,
          dayLabel: w.dayLabel,
          workoutTitle: w.title,
          status: 'scheduled',
        })
        widx++
      }
      current.setDate(current.getDate() + 1)
    }

    // Merge: past completed + new future
    schedule.scheduledWorkouts = [...pastWorkouts, ...newScheduled]
    schedule.settings.trainingDays = trainingDays
    if (startDate) {
      schedule.settings.startDate = new Date(startDate)
    }

    await schedule.save()

    return NextResponse.json({
      message: 'Schedule settings updated and future workouts regenerated',
      schedule: {
        programId: schedule.programId,
        settings: schedule.settings,
        totalScheduledWorkouts: schedule.scheduledWorkouts.length,
        pastWorkouts: pastWorkouts.length,
        futureWorkouts: newScheduled.length,
      },
    })
  } catch (error) {
    console.error('Error updating schedule settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
