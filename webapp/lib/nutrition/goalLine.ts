/**
 * The one line under the calorie ring that ties today's number to the goal —
 * "2,910 cal/day, on track for 205 lb". The ring showed calories in isolation
 * from the target weight that's supposed to be driving them; this is the only
 * thing in the nutrition tab that says why the number is what it is.
 */

export type PaceStatus = 'ahead' | 'on' | 'behind' | 'done' | 'na'
export type Direction = 'lose' | 'maintain' | 'gain'

export interface GoalLineInput {
  calories: number
  targetWeight: number | null
  unit: 'lbs' | 'kg'
  direction: Direction | null
  paceStatus: PaceStatus | null
}

export function nutritionGoalLine(i: GoalLineInput): string | null {
  if (!(i.calories > 0)) return null
  const cal = `${Math.round(i.calories).toLocaleString()} cal/day`
  if (i.targetWeight == null || !(i.targetWeight > 0)) return cal

  const target = `${Math.round(i.targetWeight)} ${i.unit}`
  if (i.direction === 'maintain' || i.paceStatus === 'done') return `${cal}, holding at ${target}`
  if (i.paceStatus === 'behind') return `${cal}, behind pace for ${target}`
  if (i.paceStatus === 'ahead') return `${cal}, ahead of pace for ${target}`
  return `${cal}, on track for ${target}`
}
