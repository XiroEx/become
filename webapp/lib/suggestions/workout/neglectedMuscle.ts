// Neglected-muscle suggestion source.
//
// Derives an expected per-muscle training interval from the active program's
// training_days_per_week, then flags any primary muscle the user has trained
// at least once in the recent window but NOT within expectedInterval × 1.5.
//
// expectedInterval = 7 / training_days_per_week days (how often, on average,
// any given muscle should come around in a balanced split). Untrained-this-
// window muscles are deliberately NOT flagged — you can't be "neglecting" a
// muscle that isn't part of your routine at all; this source nags about
// muscles that ARE in rotation but have slipped.
//
// Multiple overdue muscles are batched into one suggestion so the dashboard
// shows a single card, not five.
//
// Pure + injectable: an evaluator over already-shaped inputs, a Source with
// id/title/eligible/render backed by an injectable loader, and an engine
// wrapper registered under its own key.

import { registerSource, listSources } from '../registry'
import type { Suggestion, SuggestionSourceFn } from '../types'
import type { MuscleGroup } from '../../../models/Exercise'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_TRAINING_DAYS_PER_WEEK = 1 // → 7-day baseline interval
const OVERDUE_MULTIPLIER = 1.5

// ── Public types ────────────────────────────────────────────────────────────

export interface NeglectedMuscleInput {
  /** Most recent training date per primary muscle seen in the window. */
  lastTrainedByMuscle: Partial<Record<MuscleGroup, Date>>
  /** active program training_days_per_week; null/undefined → 7-day baseline. */
  trainingDaysPerWeek?: number | null
  now: Date
}

export interface NeglectedMuscleResult {
  /** Muscles overdue for training, most-overdue first. */
  overdue: Array<{ muscle: MuscleGroup; daysSince: number }>
  expectedIntervalDays: number
  thresholdDays: number
}

export type LoadNeglectedMuscleInput = (
  userId: string,
  now: Date,
) => Promise<NeglectedMuscleInput | null>

// ── Helpers ─────────────────────────────────────────────────────────────────

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY)
}

/**
 * Expected interval (days) any given muscle should recur, from the program's
 * weekly training frequency. Unknown/invalid frequency → 7-day baseline.
 */
export function expectedInterval(trainingDaysPerWeek?: number | null): number {
  if (!trainingDaysPerWeek || trainingDaysPerWeek <= 0) {
    return 7 / DEFAULT_TRAINING_DAYS_PER_WEEK
  }
  return 7 / trainingDaysPerWeek
}

function titleizeMuscle(m: string): string {
  return m
    .split(/[-_]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

// ── Pure evaluator ──────────────────────────────────────────────────────────

/**
 * Flag muscles trained in the window but not within expectedInterval × 1.5.
 * Returns null when nothing is overdue.
 */
export function evaluateNeglectedMuscle(
  input: NeglectedMuscleInput,
): NeglectedMuscleResult | null {
  const expectedIntervalDays = expectedInterval(input.trainingDaysPerWeek)
  const thresholdDays = expectedIntervalDays * OVERDUE_MULTIPLIER

  const overdue: Array<{ muscle: MuscleGroup; daysSince: number }> = []
  for (const [muscle, lastDate] of Object.entries(input.lastTrainedByMuscle)) {
    if (!lastDate) continue
    const daysSince = daysBetween(input.now, new Date(lastDate))
    if (daysSince > thresholdDays) {
      overdue.push({ muscle: muscle as MuscleGroup, daysSince })
    }
  }
  if (overdue.length === 0) return null

  overdue.sort((a, b) => b.daysSince - a.daysSince)
  return { overdue, expectedIntervalDays, thresholdDays }
}

// ── Suggestion shaping ──────────────────────────────────────────────────────

export function neglectedToSuggestion(r: NeglectedMuscleResult): Suggestion {
  const names = r.overdue.map(o => titleizeMuscle(o.muscle))
  const list =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  const worst = r.overdue[0]
  return {
    id: 'workout.neglected-muscle',
    severity: 'nudge',
    title: names.length === 1 ? `${list} is overdue` : `${names.length} muscles are overdue`,
    body:
      `You haven't trained ${list} recently — ${worst.muscle} was last hit ` +
      `${worst.daysSince} days ago. Work ${names.length === 1 ? 'it' : 'them'} back in this week to keep your split balanced.`,
    primaryAction: {
      label: 'Browse exercises',
      href: '/dashboard/programming/library',
    },
    dismissible: true,
    cooldownDays: 7,
    source: 'workout',
    sourceData: {
      muscles: r.overdue.map(o => o.muscle),
      thresholdDays: r.thresholdDays,
      expectedIntervalDays: r.expectedIntervalDays,
    },
  }
}

// ── WorkoutSuggestionSource (id / title / eligible / render) ─────────────────

export interface NeglectedSourceArgs {
  userId: string
  now?: Date
}

export interface NeglectedMuscleSource {
  id: string
  title: string
  eligible(args: NeglectedSourceArgs): Promise<boolean>
  render(args: NeglectedSourceArgs): Promise<Suggestion | null>
}

export function makeNeglectedMuscleSource(
  loadInput: LoadNeglectedMuscleInput,
): NeglectedMuscleSource {
  return {
    id: 'workout.neglected-muscle',
    title: 'Neglected muscle',
    async eligible({ userId, now }) {
      const clock = now ?? new Date()
      const input = await loadInput(userId, clock)
      if (!input) return false
      return evaluateNeglectedMuscle(input) != null
    },
    async render({ userId, now }) {
      const clock = now ?? new Date()
      const input = await loadInput(userId, clock)
      if (!input) return null
      const result = evaluateNeglectedMuscle(input)
      return result ? neglectedToSuggestion(result) : null
    },
  }
}

// ── Default Mongoose loader ──────────────────────────────────────────────────

/**
 * Default loader: builds last-trained-per-primary-muscle from the recent
 * (≤ 28d) workout logs + the exercise muscle map, and reads the active
 * program's training_days_per_week.
 */
export const defaultLoadNeglectedMuscleInput: LoadNeglectedMuscleInput = async (
  userId,
  now,
) => {
  const UserProgress = (await import('../../../models/UserProgress')).default
  const Exercise = (await import('../../../models/Exercise')).default

  const doc = await UserProgress
    .findOne({ userId }, { workoutLogs: 1, activePrograms: 1 })
    .lean<{
      workoutLogs: Array<{
        date: Date
        completed?: boolean
        exercises?: Array<{ exerciseSlug?: string }>
      }>
      activePrograms?: Array<{ programId: string }>
    } | null>()
  if (!doc) return null

  const windowStart = now.getTime() - 28 * MS_PER_DAY
  const recent = (doc.workoutLogs || []).filter(l => {
    if (l.completed === false) return false
    const t = new Date(l.date).getTime()
    return t >= windowStart && t <= now.getTime()
  })

  const slugs = new Set<string>()
  for (const log of recent) {
    for (const e of log.exercises || []) {
      if (e.exerciseSlug) slugs.add(e.exerciseSlug.toLowerCase())
    }
  }
  if (slugs.size === 0) return null

  const exDocs = await Exercise
    .find({ slug: { $in: [...slugs] } }, { slug: 1, primaryMuscles: 1 })
    .lean<Array<{ slug: string; primaryMuscles: MuscleGroup[] }>>()
  const primaryBySlug = new Map<string, MuscleGroup[]>()
  for (const e of exDocs) primaryBySlug.set(e.slug.toLowerCase(), e.primaryMuscles || [])

  const lastTrainedByMuscle: Partial<Record<MuscleGroup, Date>> = {}
  for (const log of recent) {
    const d = new Date(log.date)
    for (const e of log.exercises || []) {
      const muscles = primaryBySlug.get((e.exerciseSlug || '').toLowerCase()) || []
      for (const m of muscles) {
        const prev = lastTrainedByMuscle[m]
        if (!prev || d.getTime() > prev.getTime()) lastTrainedByMuscle[m] = d
      }
    }
  }

  // training_days_per_week from the active program.
  let trainingDaysPerWeek: number | null = null
  const activeProgramId = doc.activePrograms?.[0]?.programId
  if (activeProgramId) {
    const Program = (await import('../../../models/Program')).default
    const prog = await Program
      .findById(activeProgramId, { training_days_per_week: 1 })
      .lean<{ training_days_per_week?: number } | null>()
    trainingDaysPerWeek = prog?.training_days_per_week ?? null
  }

  return { lastTrainedByMuscle, trainingDaysPerWeek, now }
}

// ── Engine registration ──────────────────────────────────────────────────────

/**
 * Engine wrapper. Reads an optional `neglectedMuscleInput` extension off the
 * activity bundle; absent that it returns null (injected-data-only, symmetric
 * with the other precise wrappers — no extra DB read per request). Registered
 * under a distinct key so it coexists with the coarse activity-level source.
 */
export const neglectedMuscleEngineSource: SuggestionSourceFn = async (
  _userId,
  activity,
) => {
  const input = (activity as { neglectedMuscleInput?: NeglectedMuscleInput })
    .neglectedMuscleInput
  if (!input) return null
  const result = evaluateNeglectedMuscle(input)
  return result ? neglectedToSuggestion(result) : null
}

const ENGINE_KEY = 'workout.neglected-muscle-dp'

let registered = false
export function ensureNeglectedMuscleRegistered(): void {
  const existing = new Set(listSources().map(s => s.id))
  if (registered && existing.has(ENGINE_KEY)) return
  if (!existing.has(ENGINE_KEY)) {
    registerSource(ENGINE_KEY, 'workout', neglectedMuscleEngineSource)
  }
  registered = true
}

export function __resetNeglectedMuscleRegistrationForTest(): void {
  registered = false
}

/** Default-wired Source for app use. */
export const neglectedMuscleSource = makeNeglectedMuscleSource(defaultLoadNeglectedMuscleInput)
