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

/** Parse phase weeks string like "1-4" to get number of weeks the split repeats */
function parsePhaseWeeks(weeksStr: string): number {
  const match = weeksStr.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (match) return parseInt(match[2]) - parseInt(match[1]) + 1
  const single = weeksStr.match(/^(\d+)$/)
  if (single) return 1
  return 1
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

    // Count how many times each phase+dayLabel was completed
    const completedCounts = new Map<string, number>()
    for (const w of pastWorkouts) {
      if (w.status === 'completed') {
        const key = `${w.phase}-${w.dayLabel}`
        completedCounts.set(key, (completedCounts.get(key) || 0) + 1)
      }
    }

    // Collect remaining workouts from program, subtracting already-completed occurrences
    const phases = (program.phases || []) as Phase[]
    const remainingWorkouts: { phase: number; dayLabel: string; title: string }[] = []
    const usedCounts = new Map<string, number>()
    for (let i = 0; i < phases.length; i++) {
      const workouts = normalizeWorkouts(phases[i].workouts)
      const numWeeks = parsePhaseWeeks(phases[i].weeks || '1')
      for (let week = 0; week < numWeeks; week++) {
        for (const w of workouts) {
          const key = `${i + 1}-${w.day}`
          const used = usedCounts.get(key) || 0
          const completed = completedCounts.get(key) || 0
          if (used < completed) {
            // This occurrence was already completed, skip it
            usedCounts.set(key, used + 1)
          } else {
            remainingWorkouts.push({ phase: i + 1, dayLabel: w.day, title: w.title })
          }
        }
      }
    }

    // Generate new schedule dates for remaining workouts
    const sortedDays = [...trainingDays].sort((a, b) => a - b)
    const effectiveStart = startDate ? new Date(startDate) : now
    effectiveStart.setUTCHours(0, 0, 0, 0)

    const newScheduled: typeof schedule.scheduledWorkouts = []
    const current = new Date(effectiveStart)
    let widx = 0

    const maxDate = new Date(current)
    maxDate.setFullYear(maxDate.getFullYear() + 1)

    while (widx < remainingWorkouts.length && current < maxDate) {
      if (sortedDays.includes(current.getUTCDay())) {
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
      current.setUTCDate(current.getUTCDate() + 1)
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
