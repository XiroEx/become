// computeGoalProgress — then → now → next for nutrition and training, plus the
// "where to work on next" suggestion for each. Read by /api/goals (Becoming
// page, Settings), by the nudge cron, and (compactly) by the AI grounding.

import { Types } from 'mongoose'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import Schedule from '@/models/Schedule'
import MealLog from '@/models/MealLog'
import DayNutrition from '@/models/DayNutrition'
import NutritionGoal from '@/models/NutritionGoal'
import type { IGoal } from '@/models/Goal'
import { ensureGoals, weightSeriesKg, prSnapshot } from '@/lib/goals/ensure'
import { paceRead, formatEta, kgToUnit, HOLD_BAND_KG, type PaceRead, type Direction } from '@/lib/goals/pace'
import { readAdherence, type AdherenceRead } from '@/lib/goals/adherence'
import { avgWorkoutsPerWeek, liftProgress, suggestLiftTargets, type LiftProgress, type PRSnapshot } from '@/lib/goals/training'
import { suggestNutrition, suggestTraining, type Suggestion } from '@/lib/goals/suggestions'
import { localDateKey, dateKey, localDayWindowForKey } from '@/lib/dayWindow'
import { shiftDay, weekKeyOf, weekdayOf, lostWeeks } from '@/lib/streaks/pillars'

export interface NutritionGoalView {
  unit: 'lbs' | 'kg'
  status: 'none' | 'active' | 'achieved'
  kind: 'weight' | 'maintain' | null
  direction: Direction | null
  startedAt: string | null
  achievedAt: string | null
  /** Where the plan started (goal baseline) — "then". */
  baseline: { weight: number | null; date: string | null }
  /** The very first weigh-in — the journey start, for context. */
  journeyStart: { weight: number | null; date: string | null }
  now: { weight: number | null; date: string | null; fourWeeksAgo: number | null }
  target: { weight: number | null; paceKgPerWeek: number | null; pacePerWeek: number | null; bandKg: number }
  pace: (PaceRead & { eta: string; etaDate: string | null }) | null
  adherence: AdherenceRead | null
  proteinGoal: number | null
  suggestion: Suggestion
}

export interface TrainingGoalView {
  status: 'none' | 'active'
  startedAt: string | null
  target: { daysPerWeek: number | null; programId: string | null }
  thisWeek: { done: number; remaining: number; chancesLeft: number; weekLost: boolean }
  avgLast4: number | null
  weeklyCounts: number[]
  baseline: { daysPerWeek: number | null; date: string | null; prs: PRSnapshot[] }
  lifts: LiftProgress[]
  suggestedLifts: Array<{ slug: string; name: string; baselineE1RM: number; targetE1RM: number }>
  hasLiftTargets: boolean
  suggestion: Suggestion
}

export interface GoalProgress {
  todayKey: string
  nutrition: NutritionGoalView
  training: TrainingGoalView
}

function iso(d: Date | string | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null
}

export async function computeGoalProgress(userId: string, tz: number, now = new Date()): Promise<GoalProgress> {
  const uid = new Types.ObjectId(userId)
  const todayKey = localDateKey(null, tz, now)
  const [{ nutrition: nGoal, nutritionAchieved, training: tGoal }, user, progress, nutritionGoal, schedules] = await Promise.all([
    ensureGoals(userId, now),
    User.findById(userId, 'profile').lean() as Promise<{ profile?: { weightUnit?: 'lbs' | 'kg'; weeklyAvailability?: number } } | null>,
    UserProgress.findOne({ userId }).select('weightHistory exercisePRs workoutLogs activePrograms').lean() as Promise<Record<string, unknown> | null>,
    NutritionGoal.findOne({ userId }).select('protein').lean() as Promise<{ protein?: number } | null>,
    Schedule.find({ userId }, { programId: 1, 'settings.trainingDays': 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(5).lean() as Promise<Array<{ programId: string; settings?: { trainingDays?: number[] } }>>,
  ])
  const unit = user?.profile?.weightUnit === 'kg' ? 'kg' : 'lbs'

  // ── Nutrition ──────────────────────────────────────────────────────────
  const series = weightSeriesKg(progress?.weightHistory as Array<{ date: Date; weight: number; unit?: 'lbs' | 'kg' }> | undefined, unit)
  const latest = series.length ? series[series.length - 1] : null
  const first = series.length ? series[0] : null
  const fourWeeksAgoDate = new Date(now.getTime() - 28 * 86_400_000)
  const fourWeeksAgo = [...series].reverse().find(p => p.date <= fourWeeksAgoDate) ?? null

  // Adherence: last 7 local days from MealLog + quick adds.
  const fromKey = shiftDay(todayKey, -6)
  const { start } = localDayWindowForKey(fromKey, tz)
  const { end } = localDayWindowForKey(todayKey, tz)
  const [mealLogs, dayRows] = await Promise.all([
    MealLog.find({ user: uid, loggedAt: { $gte: start, $lte: end } }, { loggedAt: 1, 'totalNutrition.calories': 1, 'totalNutrition.protein': 1 }).lean() as Promise<Array<{ loggedAt: Date; totalNutrition?: { calories?: number; protein?: number } }>>,
    DayNutrition.find({ userId: uid, date: { $gte: new Date(Date.UTC(Number(fromKey.slice(0, 4)), Number(fromKey.slice(5, 7)) - 1, Number(fromKey.slice(8, 10)))) } }, { date: 1, quickAdds: 1 }).lean() as Promise<Array<{ date: Date; quickAdds?: Array<{ calories?: number; protein?: number }> }>>,
  ])
  const byDay = new Map<string, { calories: number; protein: number; meals: number }>()
  for (let k = fromKey; k <= todayKey; k = shiftDay(k, 1)) byDay.set(k, { calories: 0, protein: 0, meals: 0 })
  for (const m of mealLogs) {
    const k = dateKey(new Date(m.loggedAt), tz); const d = byDay.get(k); if (!d) continue
    d.calories += m.totalNutrition?.calories ?? 0; d.protein += m.totalNutrition?.protein ?? 0; d.meals += 1
  }
  for (const r of dayRows) {
    const k = dateKey(new Date(r.date), 0); const d = byDay.get(k); if (!d) continue
    for (const q of r.quickAdds ?? []) { d.calories += q.calories ?? 0; d.protein += q.protein ?? 0; d.meals += 1 }
  }
  const adherenceDays = [...byDay.entries()].map(([date, v]) => ({ date, calories: v.calories, protein: v.protein, hasData: v.meals > 0, mealCount: v.meals }))
  const proteinGoal = nutritionGoal?.protein && nutritionGoal.protein > 0 ? nutritionGoal.protein : null

  const activeN = nGoal ?? null
  const shownN: IGoal | null = activeN ?? nutritionAchieved ?? null
  const adherence = readAdherence(adherenceDays, proteinGoal, shownN?.adherence ?? { logDaysPerWeek: 5, proteinDaysPerWeek: 5 })
  const targetKg = shownN?.target?.weightKg ?? null
  const direction = (shownN?.target?.direction ?? null) as Direction | null
  const paceKg = shownN?.target?.paceKgPerWeek ?? null
  let pace: NutritionGoalView['pace'] = null
  if (shownN && targetKg && latest && direction && shownN.baseline?.weightKg && shownN.baseline?.date) {
    const r = paceRead({
      baselineKg: shownN.baseline.weightKg, baselineDate: new Date(shownN.baseline.date),
      latestKg: latest.kg, latestDate: latest.date, targetKg, paceKg: paceKg ?? 0, direction, now,
    })
    pace = { ...r, eta: formatEta(r.etaWeeks), etaDate: r.etaWeeks != null && r.etaWeeks > 0 ? new Date(now.getTime() + r.etaWeeks * 7 * 86_400_000).toISOString() : null }
  }
  const nutritionView: NutritionGoalView = {
    unit,
    status: activeN ? 'active' : nutritionAchieved ? 'achieved' : 'none',
    kind: (shownN?.kind as 'weight' | 'maintain' | undefined) ?? null,
    direction,
    startedAt: iso(shownN?.startedAt),
    achievedAt: iso(nutritionAchieved?.achievedAt),
    baseline: { weight: shownN?.baseline?.weightKg ? kgToUnit(shownN.baseline.weightKg, unit) : null, date: iso(shownN?.baseline?.date) },
    journeyStart: { weight: first ? kgToUnit(first.kg, unit) : null, date: iso(first?.date) },
    now: { weight: latest ? kgToUnit(latest.kg, unit) : null, date: iso(latest?.date), fourWeeksAgo: fourWeeksAgo ? kgToUnit(fourWeeksAgo.kg, unit) : null },
    target: { weight: targetKg ? kgToUnit(targetKg, unit) : null, paceKgPerWeek: paceKg, pacePerWeek: paceKg ? kgToUnit(paceKg, unit) : null, bandKg: shownN?.target?.bandKg ?? HOLD_BAND_KG },
    pace,
    adherence,
    proteinGoal,
    suggestion: suggestNutrition({ hasTarget: !!targetKg, direction, pace, adherence, unit, achieved: !activeN && !!nutritionAchieved }),
  }

  // ── Training ───────────────────────────────────────────────────────────
  type WLog = { date: Date | string; completed?: boolean }
  const workoutDays = new Set(((progress?.workoutLogs as WLog[] | undefined) ?? []).filter(l => l.completed === true).map(l => dateKey(new Date(l.date), tz)))
  const target = tGoal?.target?.daysPerWeek ?? user?.profile?.weeklyAvailability ?? null
  const activeProgramId = ((progress?.activePrograms as Array<{ programId: string; status: string }> | undefined) ?? []).find(p => p.status === 'in-progress' || p.status === 'active')?.programId ?? null
  const sched = schedules.find(s => s.programId === activeProgramId) ?? schedules[0] ?? null
  const trainingWeekdays = sched?.settings?.trainingDays?.length ? sched.settings.trainingDays : null
  const thisWeekKey = weekKeyOf(todayKey)
  const done = [...workoutDays].filter(k => k >= thisWeekKey && k <= todayKey).length
  let chancesLeft = 0
  for (let d = todayKey; weekKeyOf(d) === thisWeekKey; d = shiftDay(d, 1)) {
    if (d === todayKey && workoutDays.has(d)) continue
    if (!trainingWeekdays || trainingWeekdays.includes(weekdayOf(d))) chancesLeft += 1
  }
  const lost = target ? lostWeeks(workoutDays, target, todayKey, trainingWeekdays) : new Set<string>()
  const avg = avgWorkoutsPerWeek(workoutDays, todayKey, 4)
  const currentPRs = prSnapshot(progress?.exercisePRs as Parameters<typeof prSnapshot>[0])
  const baselinePRs = (tGoal?.baseline?.prs ?? []) as PRSnapshot[]
  const liftTargets = tGoal?.target?.lifts ?? []
  const lifts = liftProgress(baselinePRs.length ? baselinePRs : currentPRs, currentPRs, liftTargets, 5)
  const trainingView: TrainingGoalView = {
    status: tGoal ? 'active' : 'none',
    startedAt: iso(tGoal?.startedAt),
    target: { daysPerWeek: target, programId: tGoal?.target?.programId ?? activeProgramId },
    thisWeek: { done, remaining: target ? Math.max(0, target - done) : 0, chancesLeft, weekLost: lost.has(thisWeekKey) },
    avgLast4: avg.weeks ? avg.avg : null,
    weeklyCounts: avg.counts,
    baseline: { daysPerWeek: tGoal?.baseline?.daysPerWeek ?? null, date: iso(tGoal?.baseline?.date), prs: baselinePRs },
    lifts,
    suggestedLifts: liftTargets.length ? [] : suggestLiftTargets(currentPRs),
    hasLiftTargets: liftTargets.length > 0,
    suggestion: suggestTraining({
      target, thisWeek: done, remainingThisWeek: target ? Math.max(0, target - done) : 0, chancesLeft,
      weekLost: lost.has(thisWeekKey), avgLast4: avg.weeks ? avg.avg : null, lifts,
    }),
  }

  return { todayKey, nutrition: nutritionView, training: trainingView }
}
