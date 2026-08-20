// checkGoalReached — the moment a weigh-in first lands inside the nutrition
// weight goal's finish band, so the app can congratulate the member right
// then. ensureGoals's own achieved-detection (lib/goals/ensure.ts) is
// deliberately slower — it waits for the band to hold across a week of
// weigh-ins before flipping Goal.status to 'achieved', so a fluke low reading
// doesn't retire a goal early. That's the right call for "is this goal DONE",
// but it means the exact day a member hits their number, everything reads
// "On pace" / "At target" instead of congratulating them — which is the
// lackluster experience this fixes. Goal.reachedTargetAt tracks the crossing
// separately and fires the congratulations screen once, on the first cross.

import Goal from '@/models/Goal'
import { ensureGoals } from '@/lib/goals/ensure'
import { paceRead, kgToUnit, type Direction } from '@/lib/goals/pace'

export interface GoalReached {
  pillar: 'nutrition'
  direction: Exclude<Direction, 'maintain'>
  unit: 'lbs' | 'kg'
  targetWeight: number
  startWeight: number
  currentWeight: number
  /** Always positive — how much moved from baseline to now, in `unit`. */
  totalChange: number
  /** Days since the goal's plan started. */
  days: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export async function checkGoalReached(
  userId: string,
  latestKg: number,
  unit: 'lbs' | 'kg',
  now = new Date(),
): Promise<GoalReached | null> {
  const { nutrition } = await ensureGoals(userId, now)
  if (!nutrition || nutrition.kind !== 'weight' || nutrition.reachedTargetAt) return null

  const { target, baseline } = nutrition
  if (!target?.weightKg || !target.direction || target.direction === 'maintain') return null
  if (!baseline?.weightKg || !baseline?.date) return null

  const pace = paceRead({
    baselineKg: baseline.weightKg,
    baselineDate: new Date(baseline.date),
    latestKg,
    targetKg: target.weightKg,
    paceKg: target.paceKgPerWeek ?? 0,
    direction: target.direction,
    now,
  })
  if (pace.status !== 'done') return null

  await Goal.updateOne({ _id: nutrition._id }, { $set: { reachedTargetAt: now } })

  const days = Math.max(0, Math.round((now.getTime() - new Date(nutrition.startedAt).getTime()) / 86_400_000))
  return {
    pillar: 'nutrition',
    direction: target.direction,
    unit,
    targetWeight: round1(kgToUnit(target.weightKg, unit)),
    startWeight: round1(kgToUnit(baseline.weightKg, unit)),
    currentWeight: round1(kgToUnit(latestKg, unit)),
    totalChange: round1(Math.abs(kgToUnit(baseline.weightKg, unit) - kgToUnit(latestKg, unit))),
    days,
  }
}
