/**
 * "Where to work on next" per pillar — ONE rule set, read by the Becoming page
 * and by the nudge cron, so the page and the notification always say the same
 * thing. Pure: takes the computed reads, returns a suggestion.
 */

import type { PaceRead } from './pace'
import { fmtUnit } from './pace'
import type { AdherenceRead } from './adherence'
import type { LiftProgress } from './training'

export type Severity = 'info' | 'nudge' | 'warn' | 'good'

export interface Suggestion {
  /** Stable id — used as the notification tag / dedupe key. */
  key: string
  title: string
  sub: string
  severity: Severity
  url: string
}

export interface NutritionSuggestInput {
  hasTarget: boolean
  direction: 'lose' | 'maintain' | 'gain' | null
  pace: PaceRead | null
  adherence: AdherenceRead | null
  unit: 'lbs' | 'kg'
  achieved: boolean
}

export function suggestNutrition(i: NutritionSuggestInput): Suggestion {
  if (!i.hasTarget) {
    return { key: 'nutrition.set-target', title: 'Set a target weight', sub: 'Everything on this page compares against it.', severity: 'info', url: '/dashboard/settings' }
  }
  if (i.achieved) {
    return { key: 'nutrition.achieved', title: 'You reached your target', sub: 'Hold it for a week, then set the next one.', severity: 'good', url: '/dashboard/nutrition/goals' }
  }
  const a = i.adherence
  // Adherence first when we can judge it — pace is meaningless if the logging isn't there.
  if (a && a.logDays >= 4 && a.proteinJudged && a.proteinOk === false) {
    return { key: 'nutrition.protein', title: 'Protein is the macro you miss', sub: `Hit it ${a.proteinDays} of the last ${a.totalDays} days — your floor is ${a.proteinTarget}.`, severity: 'nudge', url: '/dashboard/nutrition' }
  }
  if (a && !a.logOk) {
    return { key: 'nutrition.log', title: 'Log more days', sub: `${a.logDays} of ${a.totalDays} days logged — you're aiming for ${a.logTarget}. Trend needs data.`, severity: 'nudge', url: '/dashboard/nutrition' }
  }
  if (i.pace && i.pace.status === 'behind') {
    return { key: 'nutrition.behind', title: `Behind pace by ${fmtUnit(i.pace.behindByKg, i.unit)}`, sub: 'Not lost — a tighter week gets you back on the line.', severity: 'warn', url: '/dashboard/nutrition/goals' }
  }
  if (i.pace && i.pace.status === 'ahead') {
    return { key: 'nutrition.ahead', title: `Ahead of pace by ${fmtUnit(i.pace.aheadByKg, i.unit)}`, sub: 'Keep the habits that got you here; no need to push harder.', severity: 'good', url: '/dashboard/nutrition/goals' }
  }
  if (i.direction === 'maintain') {
    return { key: 'nutrition.hold', title: 'Holding steady', sub: 'Inside your band. Keep logging so drift shows early.', severity: 'good', url: '/dashboard/nutrition' }
  }
  return { key: 'nutrition.on-pace', title: 'On pace', sub: 'Same again next week.', severity: 'good', url: '/dashboard/nutrition' }
}

export interface TrainingSuggestInput {
  target: number | null
  thisWeek: number
  remainingThisWeek: number
  /** Training-day chances left this week (today included if not trained). */
  chancesLeft: number
  weekLost: boolean
  avgLast4: number | null
  lifts: LiftProgress[]
  programName?: string | null
  programPct?: number | null
}

export function suggestTraining(i: TrainingSuggestInput): Suggestion {
  if (!i.target) {
    return { key: 'training.set-days', title: 'Set your training days', sub: 'How many days a week — the week is measured against it.', severity: 'info', url: '/dashboard/settings' }
  }
  const nearLift = i.lifts.find(l => l.target && l.remaining !== undefined && l.remaining > 0 && l.remaining <= Math.max(5, l.target * 0.05))
  if (i.weekLost) {
    return { key: 'training.week-lost', title: `${i.target} isn't happening this week`, sub: `Get ${Math.min(i.remainingThisWeek, Math.max(1, i.chancesLeft))} in anyway — a short week beats a zero week, and next week starts fresh.`, severity: 'info', url: '/dashboard/workout' }
  }
  // Structural before tactical: someone averaging 2 a week against 5 should not
  // be told "4 more by Saturday" every single week.
  if (i.avgLast4 != null && i.avgLast4 < i.target - 1) {
    return { key: 'training.consistency', title: `Averaging ${i.avgLast4}/wk against ${i.target}`, sub: 'The target may be too high for this season, or the schedule needs protecting. Either fix is fine.', severity: 'nudge', url: '/dashboard/settings' }
  }
  if (nearLift) {
    return { key: `training.lift.${nearLift.slug}`, title: `${nearLift.name}: ${nearLift.remaining} from your target`, sub: `${nearLift.now} → ${nearLift.target}. It's right there.`, severity: 'nudge', url: '/dashboard/progress' }
  }
  if (i.remainingThisWeek > 0 && i.chancesLeft > 0 && i.chancesLeft <= i.remainingThisWeek + 1) {
    return { key: 'training.week-tight', title: `${i.remainingThisWeek} more by Saturday`, sub: `${i.thisWeek}/${i.target} so far with ${i.chancesLeft} training day${i.chancesLeft === 1 ? '' : 's'} left. No spare days.`, severity: 'nudge', url: '/dashboard/workout' }
  }
  if (i.remainingThisWeek > 0) {
    return { key: 'training.on-track', title: `${i.remainingThisWeek} more this week`, sub: `${i.thisWeek}/${i.target} done — on track.`, severity: 'good', url: '/dashboard/workout' }
  }
  return { key: 'training.week-done', title: 'Week done', sub: `${i.thisWeek}/${i.target}. Rest counts.`, severity: 'good', url: '/dashboard/workout' }
}

/**
 * Which suggestion (if any) becomes tonight's push. Only actionable severities;
 * warnings first; the same rule is not repeated inside the cooldown.
 */
export function pickGoalNudge(
  suggestions: Suggestion[],
  last: { key?: string | null; at?: number | null },
  now: number,
  cooldownMs: number,
): Suggestion | null {
  const actionable = suggestions
    .filter(sg => sg.severity === 'warn' || sg.severity === 'nudge')
    .sort((a, b) => (a.severity === 'warn' ? 0 : 1) - (b.severity === 'warn' ? 0 : 1))
  for (const sg of actionable) {
    const repeat = last.key === sg.key && last.at != null && now - last.at < cooldownMs
    if (!repeat) return sg
  }
  return null
}
