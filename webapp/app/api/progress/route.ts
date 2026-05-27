import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import ProgramModel from '@/models/Program'
import Schedule from '@/models/Schedule'
import { formatProgressData, calculateNextWorkout } from '@/lib/data/userProgress'
import { verifyAuth } from '@/lib/auth'
import { readTzOffset, localDateKey, localDayWindowForKey, utcMidnightDateKey, dateKey } from '@/lib/dayWindow'
import { formatPRsForProgressDetail, type IExercisePR } from '@/lib/exercisePRs'

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request)
    
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    // Fetch user progress
    const progress = await UserProgress.findOne({ userId: authResult.userId }).lean()

    if (!progress) {
      // New user — return empty progress (no mock program that could 404)
      return NextResponse.json({
        weightData: [],
        bmiData: [],
        moodData: [],
        currentProgram: null,
        stats: { streakDays: 0, totalWorkouts: 0, thisWeekWorkouts: 0, goalProgress: 0 }
      })
    }

    // Find the most recent active program
    let programName = 'BECOME — 12 Week Fat-Loss Foundation'
    let nextWorkout = 'Day 1 - Start Training'
    let activeProgram = null
    let programDetails = null

    // First check activePrograms array for the most recent in-progress program
    if (progress.activePrograms && progress.activePrograms.length > 0) {
      // Find the most recent active program by lastWorkoutDate or startDate
      const inProgressPrograms = progress.activePrograms.filter(
        (p: { status: string }) => p.status === 'in-progress' || p.status === 'active'
      )
      
      if (inProgressPrograms.length > 0) {
        // Sort by lastWorkoutDate (most recent first), fallback to startDate
        activeProgram = inProgressPrograms.sort((a: { lastWorkoutDate?: Date; startDate: Date }, b: { lastWorkoutDate?: Date; startDate: Date }) => {
          const dateA = a.lastWorkoutDate ? new Date(a.lastWorkoutDate) : new Date(a.startDate)
          const dateB = b.lastWorkoutDate ? new Date(b.lastWorkoutDate) : new Date(b.startDate)
          return dateB.getTime() - dateA.getTime()
        })[0]
        
        programName = activeProgram.programName
        
        // Fetch the program to get workout titles
        programDetails = await ProgramModel.findOne({ 
          program_id: activeProgram.programId 
        }).lean()
        
        if (programDetails) {
          nextWorkout = calculateNextWorkout(activeProgram, programDetails, progress.workoutLogs || [])
        }
      }
    }
    
    // Fallback to legacy currentProgram field
    if (!activeProgram && progress.currentProgram?.programId) {
      programDetails = await ProgramModel.findOne({ 
        program_id: progress.currentProgram.programId 
      }).lean()
      if (programDetails) {
        programName = programDetails.name
        // Calculate next workout from workoutLogs
        const lastLog = progress.workoutLogs?.slice().reverse().find(
          (log: { programId: string }) => log.programId === progress.currentProgram.programId
        )
        if (lastLog && programDetails.phases) {
          const phaseIdx = (lastLog.phase || 1) - 1
          const phase = programDetails.phases[phaseIdx]
          if (phase?.workouts) {
            const workouts = Array.isArray(phase.workouts) 
              ? phase.workouts 
              : Object.entries(phase.workouts).map(([day, w]: [string, unknown]) => ({ day, ...(w as object) }))
            const currentDayIdx = workouts.findIndex((w: { day: string }) => w.day === lastLog.day)
            const nextDayIdx = (currentDayIdx + 1) % workouts.length
            const nextWorkoutData = workouts[nextDayIdx] as { day: string; title?: string }
            nextWorkout = `${nextWorkoutData.day} - ${nextWorkoutData.title || 'Training'}`
          }
        }
      }
    }

    // Self-heal: if no in-progress program found, check for 'completed' programs that still have
    // remaining scheduled sessions (indicates they were incorrectly auto-completed)
    if (!activeProgram && progress.activePrograms) {
      const completedPrograms = (progress.activePrograms as Array<{ programId: string; programName: string; status: string; startDate: Date; currentPhase?: number; currentDay?: string; completedWorkouts?: number; totalWorkouts?: number; lastWorkoutDate?: Date }>).filter(p => p.status === 'completed')
      for (const cp of completedPrograms) {
        const sched = await Schedule.findOne(
          { userId: authResult.userId, programId: cp.programId },
          { 'scheduledWorkouts.status': 1 }
        ).lean<{ scheduledWorkouts: { status: string }[] }>()
        if (!sched) continue
        const remaining = sched.scheduledWorkouts.filter(w => w.status === 'scheduled').length
        if (remaining > 0) {
          // Reactivate: update DB status back to in-progress
          UserProgress.updateOne(
            { userId: authResult.userId, 'activePrograms.programId': cp.programId },
            { $set: { 'activePrograms.$.status': 'in-progress' } }
          ).catch(() => {})
          activeProgram = { ...cp, status: 'in-progress' }
          programName = cp.programName
          programDetails = await ProgramModel.findOne({ program_id: cp.programId }).lean()
          break
        }
      }
    }

    // Enrich with Schedule data so Current Program card and NextWorkoutCard use the same source
    let scheduleNextWorkoutDay: string | undefined
    let scheduleTotalWeeks: number | undefined
    let scheduleCurrentWeek: number | undefined

    if (activeProgram) {
      const schedule = await Schedule.findOne({
        userId: authResult.userId,
        programId: activeProgram.programId,
      }).lean()

      if (schedule) {
        // Mirror NextWorkoutCard logic: first upcoming status=scheduled entry
        const tz = readTzOffset(request.nextUrl.searchParams)
        const todayStr = localDateKey(null, tz)

        const nextScheduled = (schedule.scheduledWorkouts || [])
          .filter(w => {
            const d = new Date(w.date).toISOString().split('T')[0]
            return w.status === 'scheduled' && d >= todayStr
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]

        if (nextScheduled) {
          scheduleNextWorkoutDay = nextScheduled.dayLabel
          nextWorkout = `${nextScheduled.dayLabel} - ${nextScheduled.workoutTitle}`
        }

        // currentWeek: derive from schedule + workout logs (reconciles historical completions).
        // Greedy chronological matching handles repeating day labels in multi-week programs.
        // Use program's designed days-per-week so "Week X of Y" reflects program cycles,
        // not calendar training frequency (they diverge when e.g. a 4-day split is run 5x/week)
        const daysPerWeek = (programDetails as { training_days_per_week?: number } | null)?.training_days_per_week
          || schedule.settings?.trainingDays?.length
          || 4
        type ProgressLog = { programId: string; day: string; completed: boolean }
        const wLogs = (progress.workoutLogs || []) as ProgressLog[]
        const sessions = (schedule.scheduledWorkouts || []).filter(
          (w: { status: string }) => w.status !== 'rest'
        ) as Array<{ status: string; dayLabel: string; date: Date }>
        const availableLogs = new Map<string, number>()
        for (const log of wLogs) {
          if (log.programId === activeProgram.programId && log.completed) {
            availableLogs.set(log.day, (availableLogs.get(log.day) || 0) + 1)
          }
        }
        const reconciledCompleted = [...sessions]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .filter((w) => {
            if (w.status === 'completed') return true
            if (w.status === 'skipped') return false
            const n = availableLogs.get(w.dayLabel) || 0
            if (n > 0) { availableLogs.set(w.dayLabel, n - 1); return true }
            return false
          }).length
        scheduleCurrentWeek = Math.max(1, Math.ceil(reconciledCompleted / daysPerWeek))
      }

      // totalWeeks from the real program data
      if (programDetails && 'duration_weeks' in programDetails) {
        scheduleTotalWeeks = (programDetails as { duration_weeks: number }).duration_weeks
      }
    }

    // Build current program from real data only (never use mock programId)
    const currentProgramData = activeProgram ? {
      programId: activeProgram.programId,
      startDate: activeProgram.startDate,
      currentPhase: activeProgram.currentPhase || 1,
      currentWeek: scheduleCurrentWeek ?? (activeProgram.completedWorkouts ? Math.ceil(activeProgram.completedWorkouts / 4) : 1)
    } : progress.currentProgram?.programId ? progress.currentProgram : null

    // Format and return progress data
    const formattedData = formatProgressData(
      {
        height: progress.height || 70,
        weightHistory: progress.weightHistory || [],
        moodHistory: progress.moodHistory || [],
        workoutLogs: progress.workoutLogs || [],
        currentProgram: currentProgramData,
        streakDays: progress.streakDays || 0,
        totalWorkouts: progress.totalWorkouts || 0
      },
      programName,
      nextWorkout,
      { totalWeeks: scheduleTotalWeeks, nextWorkoutDay: scheduleNextWorkoutDay }
    )

    const detailed = request.nextUrl.searchParams.get('detailed') === '1'
    if (!detailed) return NextResponse.json(formattedData)

    // ── Detailed extras: PBs, recent workouts, profile data ──────────────────
    // Personal bests — read from the persisted `exercisePRs` subdoc populated
    // by the POST /api/workouts save path. No on-the-fly recomputation.
    const pbsRaw = formatPRsForProgressDetail((progress as { exercisePRs?: IExercisePR[] }).exercisePRs)
    const pbs: Record<string, { name: string; weight: number; reps: number; date: string }> = {}
    for (const [key, rec] of Object.entries(pbsRaw)) {
      pbs[key] = {
        name: rec.name,
        weight: rec.weight,
        reps: rec.reps,
        date: new Date(rec.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
    }

    // Typed workout log for detailed processing
    type RawLogDetailed = {
      completed: boolean; date: Date; programId: string; day: string; duration?: number; notes?: string
      exercises?: Array<{ name: string; exerciseSlug?: string; sets?: Array<{ completed: boolean; weight?: number; reps?: number }> }>
    }
    const allLogs = (progress.workoutLogs || []) as RawLogDetailed[]

    // Recent workouts — last 7 completed, newest first (kept for backward compat)
    const recentWorkouts = allLogs
      .filter((l) => l.completed)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7)
      .map((l) => ({
        date: new Date(l.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        programId: l.programId,
        day: l.day,
        duration: l.duration,
        exerciseCount: l.exercises?.length ?? 0,
      }))

    // Detailed workouts — last 20 with full exercise data (for Training Log view)
    const detailedWorkouts = allLogs
      .filter((l) => l.completed)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20)
      .map((l) => {
        let totalVol = 0
        const exercises = (l.exercises || []).map((ex) => {
          let exVol = 0
          let bestSet: { weight: number; reps: number } | null = null
          for (const set of (ex.sets || [])) {
            if (!set.completed || !set.weight || !set.reps) continue
            exVol += set.weight * set.reps
            totalVol += set.weight * set.reps
            if (!bestSet || set.weight > bestSet.weight || (set.weight === bestSet.weight && set.reps > bestSet.reps)) {
              bestSet = { weight: set.weight, reps: set.reps }
            }
          }
          const key = ex.exerciseSlug || ex.name
          const pb = pbs[key]
          const isPR = !!(pb && bestSet && (bestSet as { weight: number; reps: number }).weight >= pb.weight)
          return { name: ex.name, slug: ex.exerciseSlug, bestSet, volume: Math.round(exVol), isPR }
        }).filter((ex) => ex.volume > 0 || ex.bestSet !== null)
        return {
          date: new Date(l.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          rawDate: (l.date as Date).toISOString(),
          programId: l.programId,
          day: l.day,
          duration: l.duration,
          notes: l.notes,
          totalVolume: Math.round(totalVol),
          exercises,
        }
      })

    // Weekly volume — last 12 weeks (for bar chart)
    const tz = readTzOffset(request.nextUrl.searchParams)
    let totalVolumeLbs = 0
    const weekMap = new Map<string, { volume: number; workouts: number; display: string }>()
    for (const l of allLogs) {
      if (!l.completed) continue
      const d = new Date(l.date)
      const localKey = dateKey(d, tz)
      const [ly, lm, ld] = localKey.split('-').map(Number)
      const dow = new Date(Date.UTC(ly, lm - 1, ld)).getUTCDay() // 0=Sun
      const daysFromMon = dow === 0 ? 6 : dow - 1
      const monday = new Date(Date.UTC(ly, lm - 1, ld - daysFromMon))
      const key = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`
      const display = utcMidnightDateKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      let vol = 0
      for (const ex of (l.exercises || [])) {
        for (const set of (ex.sets || [])) {
          if (set.completed && set.weight && set.reps) {
            vol += set.weight * set.reps
            totalVolumeLbs += set.weight * set.reps
          }
        }
      }
      const existing = weekMap.get(key)
      weekMap.set(key, { volume: (existing?.volume || 0) + Math.round(vol), workouts: (existing?.workouts || 0) + 1, display })
    }
    const weeklyVolume = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, data]) => ({ week: data.display, volume: data.volume, workouts: data.workouts }))
    totalVolumeLbs = Math.round(totalVolumeLbs)

    // Profile — target weight and weekly availability
    const UserModel = (await import('@/models/User')).default
    const user = await UserModel.findById(authResult.userId, 'profile').lean() as { profile?: { targetWeightKg?: number; weeklyAvailability?: number } } | null
    const targetWeightKg = user?.profile?.targetWeightKg
    const targetWeightLbs = targetWeightKg ? Math.round(targetWeightKg * 2.20462) : null
    const weeklyAvailability = user?.profile?.weeklyAvailability ?? null

    return NextResponse.json({
      ...formattedData,
      longestStreak: (progress.longestStreak as number) || 0,
      pbs: Object.values(pbs).sort((a, b) => b.weight - a.weight),
      recentWorkouts,
      detailedWorkouts,
      weeklyVolume,
      totalVolumeLbs,
      targetWeightLbs,
      weeklyAvailability,
    })
  } catch (error) {
    console.error('Error fetching progress:', error)
    return NextResponse.json({
      weightData: [],
      bmiData: [],
      moodData: [],
      currentProgram: null,
      stats: { streakDays: 0, totalWorkouts: 0, thisWeekWorkouts: 0, goalProgress: 0 }
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()
    const { type, data } = body

    const progress = await UserProgress.findOne({ userId: authResult.userId })

    if (!progress) {
      // Create new progress record
      const newProgress = await UserProgress.create({
        userId: authResult.userId,
        ...data
      })
      return NextResponse.json({ success: true, progress: newProgress })
    }

    // Update based on type
    switch (type) {
      case 'weight':
        progress.weightHistory.push({
          date: new Date(),
          weight: data.weight,
          bodyFat: data.bodyFat
        })
        break
      
      case 'workout':
        progress.workoutLogs.push(data)
        progress.totalWorkouts += 1
        break

      case 'program':
        progress.currentProgram = data
        break

      default:
        return NextResponse.json({ error: 'Invalid update type' }, { status: 400 })
    }

    await progress.save()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating progress:', error)
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
  }
}
