// GET /api/streaks?tz=  — every streak the member is running, per pillar.
//
//   overall    the existing "day streak" (any activity; freezes, milestones)
//   workout    WEEKS in a row hitting the weekly target (workouts aren't daily)
//   nutrition  days in a row with food logged
//   mindset    days in a row with a mood check-in, a mind check-in, a session
//              or a journal entry
//   super      days in a row with all three: food logged + mindset + trained
//              (a scheduled rest day counts as trained)
//
// Windowed to the last LOOKBACK_DAYS so "best" is best-in-window; that keeps
// the query bounded for members with years of meal logs.

import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import UserProgress from '@/models/UserProgress'
import User from '@/models/User'
import Schedule from '@/models/Schedule'
import MealLog from '@/models/MealLog'
import DayNutrition from '@/models/DayNutrition'
import StateLog from '@/models/StateLog'
import MindSession from '@/models/MindSession'
import MindJournal from '@/models/MindJournal'
import { STREAK_MILESTONES } from '@/lib/streakConstants'
import { readTzOffset, localDateKey, dateKey } from '@/lib/dayWindow'
import {
  dayStreak, weekStreak, workoutOrRestDays, dayRange, intersectDays,
  STREAK_VISIBLE_MIN, shiftDay,
} from '@/lib/streaks/pillars'

const LOOKBACK_DAYS = 365

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await dbConnect()

    const tz = readTzOffset(request.nextUrl.searchParams)
    const todayKey = localDateKey(null, tz)
    const fromKey = shiftDay(todayKey, -LOOKBACK_DAYS)
    const since = new Date(Date.UTC(
      Number(fromKey.slice(0, 4)), Number(fromKey.slice(5, 7)) - 1, Number(fromKey.slice(8, 10)),
    ) + tz * 60_000)
    const uid = new Types.ObjectId(auth.userId)

    const [progress, user, schedules, mealLogs, dayNutrition, stateLogs, sessions, journals] = await Promise.all([
      UserProgress.findOne({ userId: auth.userId }).lean() as Promise<Record<string, unknown> | null>,
      User.findById(auth.userId, 'profile.weeklyAvailability').lean() as Promise<{ profile?: { weeklyAvailability?: number } } | null>,
      Schedule.find({ userId: auth.userId }, { programId: 1, 'settings.trainingDays': 1, updatedAt: 1 })
        .sort({ updatedAt: -1 }).limit(5).lean() as Promise<Array<{ programId: string; settings?: { trainingDays?: number[] } }>>,
      MealLog.find({ user: uid, loggedAt: { $gte: since } }, { loggedAt: 1 }).lean() as Promise<Array<{ loggedAt: Date }>>,
      DayNutrition.find({ userId: uid, date: { $gte: since }, 'quickAdds.0': { $exists: true } }, { date: 1 }).lean() as Promise<Array<{ date: Date }>>,
      StateLog.find({ userId: uid, timestamp: { $gte: since } }, { timestamp: 1 }).lean() as Promise<Array<{ timestamp: Date }>>,
      MindSession.find({ userId: uid, completedAt: { $gte: since } }, { dateKey: 1 }).lean() as Promise<Array<{ dateKey: string }>>,
      MindJournal.find({ userId: uid, createdAt: { $gte: since } }, { createdAt: 1 }).lean() as Promise<Array<{ createdAt: Date }>>,
    ])

    // ── Workout days (completed only) ─────────────────────────────────────
    type WLog = { date: Date | string; completed?: boolean; programId?: string }
    const wLogs = ((progress?.workoutLogs as WLog[] | undefined) ?? [])
      .filter(l => l.completed === true && new Date(l.date) >= since)
    const workoutDays = new Set(wLogs.map(l => dateKey(new Date(l.date), tz)))

    // ── Nutrition days ────────────────────────────────────────────────────
    const nutritionDays = new Set<string>()
    for (const m of mealLogs) nutritionDays.add(dateKey(new Date(m.loggedAt), tz))
    // DayNutrition.date is a UTC-midnight DAY MARKER — read the key back with no offset.
    for (const d of dayNutrition) nutritionDays.add(dateKey(new Date(d.date), 0))

    // ── Mindset days ──────────────────────────────────────────────────────
    const mindDays = new Set<string>()
    type MoodEntry = { date: Date | string; mood?: number }
    for (const m of ((progress?.moodHistory as MoodEntry[] | undefined) ?? [])) {
      // Day markers too (utcMidnightDateKey) — see /api/mood.
      const d = new Date(m.date)
      if (d >= since) mindDays.add(dateKey(d, 0))
    }
    for (const s of stateLogs) mindDays.add(dateKey(new Date(s.timestamp), tz))
    for (const s of sessions) if (s.dateKey) mindDays.add(s.dateKey)
    for (const j of journals) mindDays.add(dateKey(new Date(j.createdAt), tz))

    // ── Weekly target ─────────────────────────────────────────────────────
    // Profile first (what they told us at onboarding), else the most recent
    // schedule's training days, else none — in which case the workout streak
    // is not computable and the page says so.
    const activeProgramId = (() => {
      const aps = (progress?.activePrograms as Array<{ programId: string; status: string }> | undefined) ?? []
      return aps.find(p => p.status === 'in-progress' || p.status === 'active')?.programId ?? null
    })()
    const activeSchedule = schedules.find(s => s.programId === activeProgramId) ?? schedules[0] ?? null
    const trainingWeekdays = activeSchedule?.settings?.trainingDays?.length ? activeSchedule.settings.trainingDays : null
    const weeklyTarget = user?.profile?.weeklyAvailability
      || (trainingWeekdays ? trainingWeekdays.length : 0)
      || null

    // ── Compute ───────────────────────────────────────────────────────────
    const nutrition = dayStreak(nutritionDays, todayKey)
    const mindset = dayStreak(mindDays, todayKey)
    const workout = weeklyTarget ? weekStreak(workoutDays, weeklyTarget, todayKey) : null
    const allDays = dayRange(fromKey, todayKey)
    const trainedOrRest = workoutOrRestDays(workoutDays, allDays, trainingWeekdays)
    const superDays = intersectDays(nutritionDays, mindDays, trainedOrRest)
    const superStreak = dayStreak(superDays, todayKey)

    // ── Overall (the existing engine) ─────────────────────────────────────
    const streakDays = (progress?.streakDays as number | undefined) ?? 0
    const lastActivity = progress?.lastActivityDate ? new Date(progress.lastActivityDate as Date) : null
    const overall = {
      current: streakDays,
      best: (progress?.longestStreak as number | undefined) ?? streakDays,
      freezes: (progress?.streakFreezes as number | undefined) ?? 1,
      milestonesReached: (progress?.milestonesReached as number[] | undefined) ?? [],
      nextMilestone: STREAK_MILESTONES.find(m => m > streakDays) ?? null,
      activeToday: lastActivity ? dateKey(lastActivity, tz) === todayKey || dateKey(lastActivity, 0) === todayKey : false,
    }

    return NextResponse.json({
      todayKey,
      minVisible: STREAK_VISIBLE_MIN,
      overall,
      pillars: {
        workout: workout
          ? { unit: 'weeks', current: workout.current, best: workout.best, thisWeek: workout.thisWeekCount, target: workout.target, metThisWeek: workout.metThisWeek }
          : { unit: 'weeks', current: 0, best: 0, thisWeek: workoutDays.size ? [...workoutDays].filter(k => k >= shiftDay(todayKey, -6)).length : 0, target: null, metThisWeek: false },
        nutrition: { unit: 'days', current: nutrition.current, best: nutrition.best, activeToday: nutrition.activeToday },
        mindset: { unit: 'days', current: mindset.current, best: mindset.best, activeToday: mindset.activeToday },
        super: {
          unit: 'days', current: superStreak.current, best: superStreak.best, activeToday: superStreak.activeToday,
          // What is still missing TODAY, so the page can say "log a meal to keep it".
          today: {
            nutrition: nutritionDays.has(todayKey),
            mindset: mindDays.has(todayKey),
            trained: trainedOrRest.has(todayKey),
            restDay: !!trainingWeekdays && !trainingWeekdays.includes(new Date(Date.UTC(
              Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)) - 1, Number(todayKey.slice(8, 10)))).getUTCDay()),
          },
        },
      },
    })
  } catch (error) {
    console.error('Error computing streaks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
