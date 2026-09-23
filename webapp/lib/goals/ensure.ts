// ensureGoals — make sure a member has the Goal documents their profile
// implies, and keep them honest as the profile and the scale move.
//
//   • profile.targetWeightKg set, no active nutrition goal → create one.
//     Baseline = the LATEST weigh-in and today's date. profile.currentWeightKg
//     is not the onboarding weight (every weigh-in overwrites it), so a
//     migrated goal starts its plan line from today rather than inventing a
//     history. New goals from onboarding get the same treatment — the first
//     weigh-in IS today's.
//   • target weight changed → the old goal is 'replaced' (final numbers kept),
//     a new one starts from today's weight; pace and adherence carry over.
//   • inside the finish band for the whole of the last 7 days (≥2 weigh-ins)
//     → 'achieved'.
//   • a weigh-in logged after that which lands clearly back outside the band
//     → the same goal re-opens as 'active'. Achieving is not a one-way door:
//     the app describes where the member IS, so 205 two weeks ago and 209
//     since is a goal to work on again, not a goal still reached.
//
// Both of those last two rules are judged in whole CALENDAR DAYS. Weigh-in rows
// are day-keyed — /api/weight writes utcMidnightDateKey(localToday) — while the
// `achievedAt` stamp and `now` passed in here are instants, so comparing them
// directly is the day-shift lib/dayWindow.ts warns about: for a member west of
// UTC weighing in of an evening, the stamp lands on the NEXT UTC day and the
// following morning's 209 sorts before its own achievement. See utcDayIndex in
// lib/goals/pace.ts.
//   • profile.weeklyAvailability set, no active training goal → create one with
//     a PR snapshot as the strength baseline; days/week changes update in place.

import { Types } from 'mongoose'
import User from '@/models/User'
import UserProgress from '@/models/UserProgress'
import Goal, { type IGoal, type GoalDirection } from '@/models/Goal'
import { directionForGoal } from '@/lib/nutrition/tdee'
import { defaultPaceKg, directionFromWeights, driftedSinceAchieved, holdConfirmed, HOLD_BAND_KG, unitToKg } from '@/lib/goals/pace'
import { topLifts, type PRSnapshot } from '@/lib/goals/training'

export interface WeightPoint { kg: number; date: Date }

type ProfileLite = {
  fitnessGoal?: string
  nutritionDirection?: GoalDirection
  targetWeightKg?: number
  currentWeightKg?: number
  weeklyAvailability?: number
  weightUnit?: 'lbs' | 'kg'
}

/** Weight history in kg, oldest → newest. Entries carry their own unit; older ones fall back to the profile unit. */
export function weightSeriesKg(
  history: Array<{ date: Date | string; weight: number; unit?: 'lbs' | 'kg' }> | undefined,
  profileUnit: 'lbs' | 'kg',
): WeightPoint[] {
  return (history ?? [])
    .filter(e => typeof e.weight === 'number' && e.weight > 0)
    .map(e => ({ kg: unitToKg(e.weight, e.unit ?? profileUnit), date: new Date(e.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function prSnapshot(prs: Array<{ exerciseSlug: string; exerciseName: string; maxE1RM?: { e1rm?: number; weight: number; reps: number } | null }> | undefined): PRSnapshot[] {
  return (prs ?? [])
    .filter(p => p.maxE1RM && (p.maxE1RM.e1rm ?? 0) > 0)
    .map(p => ({ slug: p.exerciseSlug, name: p.exerciseName, e1RM: Math.round(p.maxE1RM!.e1rm!), weight: p.maxE1RM!.weight, reps: p.maxE1RM!.reps }))
}

export function resolveDirection(profile: ProfileLite, latestKg: number | null): GoalDirection {
  if (profile.nutritionDirection) return profile.nutritionDirection
  const derived = directionFromWeights(latestKg, profile.targetWeightKg)
  if (derived) return derived
  return directionForGoal(profile.fitnessGoal as Parameters<typeof directionForGoal>[0])
}

export interface EnsureResult {
  nutrition: IGoal | null
  /** The most recent achieved nutrition goal, when there is no active one. */
  nutritionAchieved: IGoal | null
  training: IGoal | null
}

export async function ensureGoals(userId: string, now = new Date()): Promise<EnsureResult> {
  const uid = new Types.ObjectId(userId)
  const [user, progress, goals] = await Promise.all([
    User.findById(userId, 'profile createdAt').lean() as Promise<{ profile?: ProfileLite; createdAt?: Date } | null>,
    UserProgress.findOne({ userId }).select('weightHistory exercisePRs workoutLogs activePrograms').lean() as Promise<Record<string, unknown> | null>,
    Goal.find({ userId: uid }).sort({ createdAt: -1 }).lean() as Promise<IGoal[]>,
  ])
  const profile: ProfileLite = user?.profile ?? {}
  const unit = profile.weightUnit === 'kg' ? 'kg' : 'lbs'
  const series = weightSeriesKg(progress?.weightHistory as Array<{ date: Date; weight: number; unit?: 'lbs' | 'kg' }> | undefined, unit)
  const latest = series.length ? series[series.length - 1] : null
  const latestKg = latest?.kg ?? profile.currentWeightKg ?? null

  let nutrition = goals.find(g => g.pillar === 'nutrition' && g.status === 'active') ?? null
  let nutritionAchieved = goals.find(g => g.pillar === 'nutrition' && g.status === 'achieved') ?? null
  let training = goals.find(g => g.pillar === 'training' && g.status === 'active') ?? null

  // ── Nutrition ──────────────────────────────────────────────────────────
  const targetKg = profile.targetWeightKg && profile.targetWeightKg > 0 ? profile.targetWeightKg : null
  if (targetKg) {
    const direction = resolveDirection(profile, latestKg)
    const targetChanged = (g: IGoal | null) => !!g && Math.abs((g.target?.weightKg ?? 0) - targetKg) > 0.05
    // The last achieved goal still matches this target → nothing to (re)create.
    const achievedMatches = nutritionAchieved && !targetChanged(nutritionAchieved)

    if (nutrition && targetChanged(nutrition)) {
      await Goal.updateOne({ _id: nutrition._id }, { $set: { status: 'replaced', replacedAt: now, final: { weightKg: latestKg ?? undefined, date: now } } })
      const carry = nutrition
      nutrition = null
      nutrition = await Goal.create({
        userId: uid, pillar: 'nutrition', status: 'active',
        kind: direction === 'maintain' ? 'maintain' : 'weight',
        startedAt: now,
        baseline: { weightKg: latestKg ?? undefined, date: now },
        target: { weightKg: targetKg, direction, paceKgPerWeek: carry.target?.paceKgPerWeek ?? defaultPaceKg(direction), bandKg: HOLD_BAND_KG },
        adherence: carry.adherence ?? { logDaysPerWeek: 5, proteinDaysPerWeek: 5 },
      })
    } else if (!nutrition && !achievedMatches) {
      nutrition = await Goal.create({
        userId: uid, pillar: 'nutrition', status: 'active',
        kind: direction === 'maintain' ? 'maintain' : 'weight',
        startedAt: now,
        baseline: { weightKg: latestKg ?? undefined, date: now },
        target: { weightKg: targetKg, direction, paceKgPerWeek: defaultPaceKg(direction), bandKg: HOLD_BAND_KG },
        adherence: { logDaysPerWeek: 5, proteinDaysPerWeek: 5 },
      })
      nutritionAchieved = null
    } else if (nutrition && nutrition.target?.direction !== direction && nutrition.kind !== 'maintain') {
      // Direction flipped in Settings without the target moving (rare) — keep in step.
      await Goal.updateOne({ _id: nutrition._id }, { $set: { 'target.direction': direction, kind: direction === 'maintain' ? 'maintain' : 'weight' } })
      nutrition = { ...nutrition, target: { ...nutrition.target, direction }, kind: direction === 'maintain' ? 'maintain' : 'weight' } as IGoal
    }

    // Drifted back out? 'achieved' is a statement about where the member is,
    // not a trophy they keep. It used to be a one-way flip — hold the band for
    // a week and every surface read "Reached ✓" from then on, through the 209s
    // and 206s that came after. A weigh-in logged SINCE the achievement that
    // sits clearly outside the band (band + REOPEN_MARGIN_KG, so a scale
    // wobbling on the edge doesn't flap it) re-opens that same goal: the plan,
    // its baseline and its pace carry on from where they were, and the pace
    // read goes back to telling the truth about the gap. `reachedTargetAt` is
    // cleared with it, so crossing the line again congratulates again.
    if (nutrition == null && nutritionAchieved && nutritionAchieved.kind === 'weight' && !targetChanged(nutritionAchieved)) {
      const band = nutritionAchieved.target?.bandKg ?? HOLD_BAND_KG
      const stamp = nutritionAchieved.achievedAt ? new Date(nutritionAchieved.achievedAt) : null
      if (driftedSinceAchieved(series, targetKg, band, stamp)) {
        await Goal.updateOne(
          { _id: nutritionAchieved._id },
          { $set: { status: 'active' }, $unset: { achievedAt: '', final: '', reachedTargetAt: '' } },
        )
        nutrition = { ...nutritionAchieved, status: 'active', achievedAt: undefined, final: undefined, reachedTargetAt: undefined } as IGoal
        nutritionAchieved = null
      }
    }

    // Achieved? Every weigh-in in the last 7 days inside the band, at least two of them.
    if (nutrition && latestKg != null && nutrition.kind === 'weight') {
      if (holdConfirmed(series, targetKg, nutrition.target?.bandKg ?? HOLD_BAND_KG, now)) {
        await Goal.updateOne({ _id: nutrition._id }, { $set: { status: 'achieved', achievedAt: now, final: { weightKg: latestKg, date: now } } })
        nutritionAchieved = { ...nutrition, status: 'achieved', achievedAt: now } as IGoal
        nutrition = null
      }
    }
  } else if (nutrition) {
    // Target removed → close the goal.
    await Goal.updateOne({ _id: nutrition._id }, { $set: { status: 'replaced', replacedAt: now, final: { weightKg: latestKg ?? undefined, date: now } } })
    nutrition = null
  }

  // ── Training ───────────────────────────────────────────────────────────
  const days = profile.weeklyAvailability && profile.weeklyAvailability > 0 ? Math.round(profile.weeklyAvailability) : null
  if (days) {
    const activeProgramId = ((progress?.activePrograms as Array<{ programId: string; status: string }> | undefined) ?? [])
      .find(p => p.status === 'in-progress' || p.status === 'active')?.programId
    if (!training) {
      const prs = topLifts(prSnapshot(progress?.exercisePRs as Parameters<typeof prSnapshot>[0]), 5)
      training = await Goal.create({
        userId: uid, pillar: 'training', status: 'active', kind: 'consistency',
        startedAt: now,
        baseline: { daysPerWeek: undefined, prs, date: now },
        target: { daysPerWeek: days, programId: activeProgramId },
        adherence: { logDaysPerWeek: 5, proteinDaysPerWeek: 5 },
      })
    } else if ((training.target?.daysPerWeek ?? 0) !== days || (activeProgramId && training.target?.programId !== activeProgramId)) {
      await Goal.updateOne({ _id: training._id }, { $set: { 'target.daysPerWeek': days, ...(activeProgramId ? { 'target.programId': activeProgramId } : {}) } })
      training = { ...training, target: { ...training.target, daysPerWeek: days, programId: activeProgramId ?? training.target?.programId } } as IGoal
    }
  }

  return { nutrition, nutritionAchieved, training }
}
