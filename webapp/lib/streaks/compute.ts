// The streak computation, shared by /api/streaks (the member's own view) and
// /api/admin/streaks (the same numbers for a chosen member, plus credits).
//
//   overall    the stored "day streak" (any activity; freezes, milestones)
//   workout    DAYS in a row your training week stayed on track. Workouts are
//              not a daily habit, so counting days you trained would break on
//              every rest day; counting WEEKS made the card unreadable beside
//              three day-based pillars and needed three perfect weeks before it
//              showed anything at all. A day counts while the week can still
//              hit (or has hit) its target — rest days included.
//   nutrition  days in a row with food logged
//   mindset    days in a row with a mood check-in, a mind check-in, a session
//              or a journal entry
//   super      days in a row with all three: food logged + mindset + trained
//              (a scheduled rest day counts) — AND the workout week on track:
//              a week that missed the target, or can no longer hit it, drops
//              out. A super streak on rest days with the workout week already
//              blown is not super.
//
// Admin credits (StreakCredit) union into the pillar day sets. Windowed to
// LOOKBACK_DAYS so "best" is best-in-window and the queries stay bounded.

import { Types } from 'mongoose'
import UserProgress from '@/models/UserProgress'
import User from '@/models/User'
import Schedule from '@/models/Schedule'
import MealLog from '@/models/MealLog'
import DayNutrition from '@/models/DayNutrition'
import StateLog from '@/models/StateLog'
import MindSession from '@/models/MindSession'
import MindJournal from '@/models/MindJournal'
import StreakCredit, { type CreditPillar } from '@/models/StreakCredit'
import { STREAK_MILESTONES } from '@/lib/streakConstants'
import { localDateKey, dateKey } from '@/lib/dayWindow'
import {
  dayStreak, weekStreak, workoutOrRestDays, dayRange, intersectDays,
  STREAK_VISIBLE_MIN, shiftDay, lostWeeks, withoutLostWeeks, onTrackDays, weekdayOf,
} from '@/lib/streaks/pillars'
import { applyFreezes, freezeAvailable, freezeReturnsOn } from '@/lib/streaks/freeze'

export const LOOKBACK_DAYS = 365

export interface StreakCreditRow {
  id: string
  pillar: CreditPillar
  dayKey: string
  reason: string
  createdBy: string
  createdAt: string
}

export interface StreaksPayload {
  todayKey: string
  minVisible: number
  overall: {
    current: number
    best: number
    freezes: number
    milestonesReached: number[]
    nextMilestone: number | null
    activeToday: boolean
    lastActivityDate: string | null
  }
  pillars: {
    workout: {
      unit: 'days'; current: number; best: number
      thisWeek: number; target: number | null; metThisWeek: boolean; weekLost: boolean
      /** Secondary stat: consecutive weeks that hit the target. */
      weeksOnTarget: number
      /** Sessions still needed this week (0 once the target is hit). */
      remainingThisWeek: number
    }
    nutrition: { unit: 'days'; current: number; best: number; activeToday: boolean }
    mindset: { unit: 'days'; current: number; best: number; activeToday: boolean }
    super: {
      unit: 'days'; current: number; best: number; activeToday: boolean
      today: { nutrition: boolean; mindset: boolean; trained: boolean; restDay: boolean; weekOnTrack: boolean }
      /** The one freeze: whether it is in hand, and what it has covered. */
      freeze: {
        available: boolean
        /** The day it comes back, when it is spent. */
        returnsOn: string | null
        usedDays: string[]
        frozenToday: boolean
      }
    }
  }
  /** Credited days per pillar, so a UI can show what is real and what was granted. */
  credits: Record<CreditPillar, string[]>
}

export async function computeStreaks(userId: string, tz: number, now = new Date()): Promise<StreaksPayload> {
  const todayKey = localDateKey(null, tz, now)
  const fromKey = shiftDay(todayKey, -LOOKBACK_DAYS)
  const since = new Date(Date.UTC(
    Number(fromKey.slice(0, 4)), Number(fromKey.slice(5, 7)) - 1, Number(fromKey.slice(8, 10)),
  ) + tz * 60_000)
  const uid = new Types.ObjectId(userId)

  const [progress, user, schedules, mealLogs, dayNutrition, stateLogs, sessions, journals, creditDocs] = await Promise.all([
    UserProgress.findOne({ userId }).lean() as Promise<Record<string, unknown> | null>,
    User.findById(userId, 'profile.weeklyAvailability').lean() as Promise<{ profile?: { weeklyAvailability?: number } } | null>,
    Schedule.find({ userId }, { programId: 1, 'settings.trainingDays': 1, updatedAt: 1 })
      .sort({ updatedAt: -1 }).limit(5).lean() as Promise<Array<{ programId: string; settings?: { trainingDays?: number[] } }>>,
    MealLog.find({ user: uid, loggedAt: { $gte: since } }, { loggedAt: 1 }).lean() as Promise<Array<{ loggedAt: Date }>>,
    DayNutrition.find({ userId: uid, date: { $gte: since }, 'quickAdds.0': { $exists: true } }, { date: 1 }).lean() as Promise<Array<{ date: Date }>>,
    StateLog.find({ userId: uid, timestamp: { $gte: since } }, { timestamp: 1 }).lean() as Promise<Array<{ timestamp: Date }>>,
    MindSession.find({ userId: uid, completedAt: { $gte: since } }, { dateKey: 1 }).lean() as Promise<Array<{ dateKey: string }>>,
    MindJournal.find({ userId: uid, createdAt: { $gte: since } }, { createdAt: 1 }).lean() as Promise<Array<{ createdAt: Date }>>,
    StreakCredit.find({ userId: uid, kind: 'credit', dayKey: { $gte: fromKey } }, { pillar: 1, dayKey: 1 }).lean() as Promise<Array<{ pillar: CreditPillar; dayKey: string }>>,
  ])

  const credits: Record<CreditPillar, string[]> = { workout: [], nutrition: [], mindset: [] }
  for (const c of creditDocs) if (credits[c.pillar]) credits[c.pillar].push(c.dayKey)
  for (const k of Object.keys(credits) as CreditPillar[]) credits[k].sort()

  // ── Workout days (completed only) + credits ────────────────────────────
  type WLog = { date: Date | string; completed?: boolean }
  const wLogs = ((progress?.workoutLogs as WLog[] | undefined) ?? [])
    .filter(l => l.completed === true && new Date(l.date) >= since)
  const workoutDays = new Set(wLogs.map(l => dateKey(new Date(l.date), tz)))
  for (const k of credits.workout) workoutDays.add(k)

  // ── Nutrition days + credits ───────────────────────────────────────────
  const nutritionDays = new Set<string>()
  for (const m of mealLogs) nutritionDays.add(dateKey(new Date(m.loggedAt), tz))
  for (const d of dayNutrition) nutritionDays.add(dateKey(new Date(d.date), 0)) // day marker
  for (const k of credits.nutrition) nutritionDays.add(k)

  // ── Mindset days + credits ─────────────────────────────────────────────
  const mindDays = new Set<string>()
  type MoodEntry = { date: Date | string; mood?: number }
  for (const m of ((progress?.moodHistory as MoodEntry[] | undefined) ?? [])) {
    const d = new Date(m.date)
    if (d >= since) mindDays.add(dateKey(d, 0)) // day marker
  }
  for (const s of stateLogs) mindDays.add(dateKey(new Date(s.timestamp), tz))
  for (const s of sessions) if (s.dateKey) mindDays.add(s.dateKey)
  for (const j of journals) mindDays.add(dateKey(new Date(j.createdAt), tz))
  for (const k of credits.mindset) mindDays.add(k)

  // ── Weekly target ──────────────────────────────────────────────────────
  const activeProgramId = (() => {
    const aps = (progress?.activePrograms as Array<{ programId: string; status: string }> | undefined) ?? []
    return aps.find(p => p.status === 'in-progress' || p.status === 'active')?.programId ?? null
  })()
  const activeSchedule = schedules.find(s => s.programId === activeProgramId) ?? schedules[0] ?? null
  const trainingWeekdays = activeSchedule?.settings?.trainingDays?.length ? activeSchedule.settings.trainingDays : null
  const weeklyTarget = user?.profile?.weeklyAvailability
    || (trainingWeekdays ? trainingWeekdays.length : 0)
    || null

  // ── Compute ────────────────────────────────────────────────────────────
  const nutrition = dayStreak(nutritionDays, todayKey)
  const mindset = dayStreak(mindDays, todayKey)
  const workout = weeklyTarget ? weekStreak(workoutDays, weeklyTarget, todayKey) : null
  const allDays = dayRange(fromKey, todayKey)
  const trainedOrRest = workoutOrRestDays(workoutDays, allDays, trainingWeekdays, weeklyTarget)
  const lost = weeklyTarget ? lostWeeks(workoutDays, weeklyTarget, todayKey, trainingWeekdays) : new Set<string>()
  const workoutHalf = withoutLostWeeks(trainedOrRest, lost)
  // Workout streak: days whose training week is on track (rest days included).
  const workoutStreak = weeklyTarget ? dayStreak(onTrackDays(allDays, lost), todayKey) : null
  // A day the member spent their freeze on counts as a super day. Life happens;
  // the streak survives it once.
  const freezeDays = ((progress?.superFreezeDays as string[] | undefined) ?? []).filter(Boolean)
  const superDays = applyFreezes(intersectDays(nutritionDays, mindDays, workoutHalf), freezeDays)
  const superStreak = dayStreak(superDays, todayKey)
  const thisWeekKey = shiftDay(todayKey, -weekdayOf(todayKey))
  const weekOnTrack = !lost.has(thisWeekKey)

  // ── Overall (the stored engine) ────────────────────────────────────────
  const streakDays = (progress?.streakDays as number | undefined) ?? 0
  const lastActivity = progress?.lastActivityDate ? new Date(progress.lastActivityDate as Date) : null
  const overall = {
    current: streakDays,
    best: (progress?.longestStreak as number | undefined) ?? streakDays,
    freezes: (progress?.streakFreezes as number | undefined) ?? 1,
    milestonesReached: (progress?.milestonesReached as number[] | undefined) ?? [],
    nextMilestone: STREAK_MILESTONES.find(m => m > streakDays) ?? null,
    activeToday: lastActivity ? dateKey(lastActivity, tz) === todayKey || dateKey(lastActivity, 0) === todayKey : false,
    lastActivityDate: lastActivity ? lastActivity.toISOString() : null,
  }

  return {
    todayKey,
    minVisible: STREAK_VISIBLE_MIN,
    overall,
    pillars: {
      workout: workout && workoutStreak
        ? {
            unit: 'days',
            current: workoutStreak.current,
            best: workoutStreak.best,
            thisWeek: workout.thisWeekCount,
            target: workout.target,
            metThisWeek: workout.metThisWeek,
            weekLost: !weekOnTrack,
            weeksOnTarget: workout.current,
            remainingThisWeek: Math.max(0, workout.target - workout.thisWeekCount),
          }
        : {
            unit: 'days', current: 0, best: 0,
            thisWeek: [...workoutDays].filter(k => k >= thisWeekKey).length,
            target: null, metThisWeek: false, weekLost: false, weeksOnTarget: 0, remainingThisWeek: 0,
          },
      nutrition: { unit: 'days', current: nutrition.current, best: nutrition.best, activeToday: nutrition.activeToday },
      mindset: { unit: 'days', current: mindset.current, best: mindset.best, activeToday: mindset.activeToday },
      super: {
        unit: 'days', current: superStreak.current, best: superStreak.best, activeToday: superStreak.activeToday,
        today: {
          nutrition: nutritionDays.has(todayKey),
          mindset: mindDays.has(todayKey),
          trained: trainedOrRest.has(todayKey),
          restDay: !!trainingWeekdays && !trainingWeekdays.includes(weekdayOf(todayKey)),
          weekOnTrack,
        },
        freeze: {
          available: freezeAvailable(freezeDays, todayKey),
          returnsOn: freezeReturnsOn(freezeDays, todayKey),
          usedDays: [...freezeDays].sort(),
          frozenToday: freezeDays.includes(todayKey),
        },
      },
    },
    credits,
  }
}
