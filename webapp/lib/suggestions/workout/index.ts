import { listSources, registerSource } from '../registry'
import type {
  RecentActivity,
  SuggestionSourceFn,
} from '../types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function latestActivityDate(activity: RecentActivity): Date {
  const dates: number[] = []
  for (const log of activity.workoutLogs ?? []) dates.push(log.date.getTime())
  for (const mood of activity.moodHistory ?? []) dates.push(mood.date.getTime())
  for (const weight of activity.weightHistory ?? []) dates.push(weight.date.getTime())
  if (activity.streak?.lastLogDate) dates.push(activity.streak.lastLogDate.getTime())
  return dates.length > 0 ? new Date(Math.max(...dates)) : new Date()
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY)
}

function recentWorkoutLogs(activity: RecentActivity, days: number) {
  const anchor = latestActivityDate(activity)
  return (activity.workoutLogs ?? []).filter(
    (log) => daysBetween(anchor, log.date) <= days,
  )
}

function exerciseCounts(logs: NonNullable<RecentActivity['workoutLogs']>) {
  const counts = new Map<string, number>()
  for (const log of logs) {
    for (const slug of log.exerciseSlugs) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }
  }
  return counts
}

function topExerciseSlug(logs: NonNullable<RecentActivity['workoutLogs']>) {
  let best: { slug: string; count: number } | null = null
  for (const [slug, count] of exerciseCounts(logs)) {
    if (!best || count > best.count) best = { slug, count }
  }
  return best
}

function titleizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function hasRecentPr(activity: RecentActivity, slug: string, days: number): boolean {
  const anchor = latestActivityDate(activity)
  const pr = (activity.exercisePRs ?? []).find(
    (entry) => entry.exerciseSlug === slug,
  )
  return (pr?.dates ?? []).some((date) => daysBetween(anchor, date) <= days)
}

const MUSCLE_HINTS: Array<{ key: string; label: string; terms: string[] }> = [
  { key: 'legs', label: 'legs', terms: ['squat', 'lunge', 'leg', 'quad', 'hamstring', 'calf', 'deadlift', 'hinge'] },
  { key: 'pull', label: 'back and biceps', terms: ['row', 'pull', 'lat', 'chin', 'curl', 'back'] },
  { key: 'push', label: 'chest, shoulders, and triceps', terms: ['press', 'bench', 'push', 'dip', 'tricep', 'shoulder'] },
  { key: 'core', label: 'core', terms: ['plank', 'crunch', 'sit-up', 'ab', 'core', 'hollow'] },
]

function touchedMuscleGroups(logs: NonNullable<RecentActivity['workoutLogs']>) {
  const touched = new Set<string>()
  for (const log of logs) {
    for (const slug of log.exerciseSlugs) {
      const lower = slug.toLowerCase()
      for (const group of MUSCLE_HINTS) {
        if (group.terms.some((term) => lower.includes(term))) {
          touched.add(group.key)
        }
      }
    }
  }
  return touched
}

export const progressionNudgeSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const logs = recentWorkoutLogs(activity, 10)
  if (logs.length < 2) return null
  const top = topExerciseSlug(logs)
  if (!top || top.count < 2) return null
  const exercise = titleizeSlug(top.slug)
  return {
    id: `workout.progression-nudge.${top.slug}`,
    severity: 'nudge',
    title: `Progress ${exercise}`,
    body: `${exercise} has shown up ${top.count} times recently. If the last session moved cleanly, add a small load or one rep next time.`,
    primaryAction: { label: 'Open progress', href: '/dashboard/progress#records' },
    dismissible: true,
    cooldownDays: 4,
    source: 'workout',
    sourceData: { exerciseSlug: top.slug, count: top.count },
  }
}

export const plateauWarningSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const logs = recentWorkoutLogs(activity, 21)
  const top = topExerciseSlug(logs)
  if (!top || top.count < 3 || hasRecentPr(activity, top.slug, 21)) return null
  const exercise = titleizeSlug(top.slug)
  return {
    id: `workout.plateau-warning.${top.slug}`,
    severity: 'warning',
    title: `${exercise} may be stalling`,
    body: `${exercise} has repeated ${top.count} times in the last few weeks without a recent PR. Consider a lighter technique day or a different rep target.`,
    primaryAction: { label: 'Review PRs', href: '/dashboard/progress#records' },
    dismissible: true,
    cooldownDays: 7,
    source: 'workout',
    sourceData: { exerciseSlug: top.slug, count: top.count },
  }
}

export const neglectedMuscleSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const logs = recentWorkoutLogs(activity, 14)
  if (logs.length < 4) return null
  const touched = touchedMuscleGroups(logs)
  const missing = MUSCLE_HINTS.find((group) => !touched.has(group.key))
  if (!missing) return null
  return {
    id: `workout.neglected-muscle.${missing.key}`,
    severity: 'nudge',
    title: `Bring ${missing.label} back in`,
    body: `Your recent logs do not show much ${missing.label} work. Add one focused movement this week to keep the plan balanced.`,
    primaryAction: { label: 'Browse exercises', href: '/dashboard/programming/library' },
    dismissible: true,
    cooldownDays: 7,
    source: 'workout',
    sourceData: { muscleGroup: missing.key },
  }
}

export const fatigueFlagSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const logs = recentWorkoutLogs(activity, 7)
  const moods = (activity.moodHistory ?? [])
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 3)
  if (logs.length < 3 || moods.length < 2) return null
  const avgMood =
    moods.reduce((sum, mood) => sum + mood.value, 0) / moods.length
  if (avgMood > 2.5) return null
  return {
    id: 'workout.fatigue-flag',
    severity: 'warning',
    title: 'Watch recovery this week',
    body: `You logged ${logs.length} workouts recently while mood is trending low. Keep the next session crisp, or swap in a recovery day.`,
    primaryAction: { label: 'Open timeline', href: '/dashboard/timeline' },
    dismissible: true,
    cooldownDays: 5,
    source: 'workout',
    sourceData: { recentWorkoutCount: logs.length, averageMood: avgMood },
  }
}

let initialized = false

export function ensureWorkoutSuggestionsRegistered(): void {
  const existing = new Set(listSources().map((source) => source.id))
  if (initialized && existing.has('workout.progression-nudge')) return
  if (!existing.has('workout.progression-nudge')) {
    registerSource('workout.progression-nudge', 'workout', progressionNudgeSource)
  }
  if (!existing.has('workout.plateau-warning')) {
    registerSource('workout.plateau-warning', 'workout', plateauWarningSource)
  }
  if (!existing.has('workout.neglected-muscle')) {
    registerSource('workout.neglected-muscle', 'workout', neglectedMuscleSource)
  }
  if (!existing.has('workout.fatigue-flag')) {
    registerSource('workout.fatigue-flag', 'workout', fatigueFlagSource)
  }
  initialized = true
}
