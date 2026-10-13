/**
 * What the member actually did in the gym this week.
 *
 * The Training screen only ever answered "how strong are you" (estimated maxes
 * and targets). That is the long arc, and on a Tuesday it is not what anyone
 * is asking — they want to know whether this week counted. Those are different
 * questions with different numbers, which is why the screen now has two tabs
 * and this module feeds the near one.
 *
 * Volume load (Σ weight × reps over completed sets) is the headline because it
 * is the one number that moves every session, unlike an estimated max, which
 * can sit still for weeks while real work is happening.
 *
 * Pure: takes logs and a week window, returns numbers.
 */

import { epley1RM } from '@/lib/exercisePRs'

export interface WeekSet {
  weight?: number | null
  reps?: number | null
  duration?: number | null
  completed?: boolean
}

export interface WeekExercise {
  name?: string | null
  exerciseSlug?: string | null
  sets?: WeekSet[] | null
}

export interface WeekWorkoutLog {
  date: Date | string
  completed?: boolean
  title?: string | null
  day?: string | null
  exercises?: WeekExercise[] | null
}

export interface TopSet {
  name: string
  weight: number
  reps: number
  e1RM: number
}

export interface WeekTrainingMetrics {
  /** Completed sessions inside the window. */
  sessions: number
  /** Completed sets that had either load or reps on them. */
  sets: number
  /** Total completed reps. */
  reps: number
  /** Σ weight × reps across completed weighted sets, in the member's unit. */
  volume: number
  /** Seconds of logged work on time-based movements (planks, holds, intervals). */
  workSeconds: number
  /** Heaviest single set of the week by estimated max. */
  topSet: TopSet | null
  /** Distinct exercises touched. */
  exercises: number
  /** True when at least one weighted set exists, i.e. `volume` is meaningful. */
  hasWeightedWork: boolean
}

export function emptyWeekTraining(): WeekTrainingMetrics {
  return {
    sessions: 0,
    sets: 0,
    reps: 0,
    volume: 0,
    workSeconds: 0,
    topSet: null,
    exercises: 0,
    hasWeightedWork: false,
  }
}

/**
 * Aggregate one week of logs.
 *
 * `from`/`to` are inclusive date keys (YYYY-MM-DD) and `keyOf` maps a log date
 * to one, so the caller owns the timezone rule rather than this module
 * guessing at it — day boundaries in this app are a local-time concept and
 * getting them wrong shifts a Sunday session into the wrong week.
 *
 * Incomplete sets are ignored throughout: a set you set up for and did not do
 * is not work, and counting it would let someone inflate a week by opening a
 * session and walking away.
 */
export function computeWeekTraining(
  logs: WeekWorkoutLog[],
  from: string,
  to: string,
  keyOf: (d: Date) => string,
): WeekTrainingMetrics {
  const out = emptyWeekTraining()
  const seenExercises = new Set<string>()

  for (const log of logs) {
    if (log.completed !== true) continue
    const dt = new Date(log.date)
    if (Number.isNaN(dt.getTime())) continue
    const key = keyOf(dt)
    if (key < from || key > to) continue

    out.sessions += 1

    for (const ex of log.exercises ?? []) {
      const label = (ex.name ?? '').trim()
      const id = (ex.exerciseSlug ?? label).toLowerCase()
      let touched = false

      for (const s of ex.sets ?? []) {
        if (s.completed !== true) continue
        const w = numeric(s.weight)
        const r = numeric(s.reps)
        const secs = numeric(s.duration)

        // A completed set counts if it recorded work of any kind. Reps alone
        // covers bodyweight; duration alone covers planks and holds.
        if (r <= 0 && secs <= 0 && w <= 0) continue

        out.sets += 1
        touched = true
        if (r > 0) out.reps += r
        if (secs > 0) out.workSeconds += secs

        if (w > 0 && r > 0) {
          out.volume += w * r
          out.hasWeightedWork = true
          const e = epley1RM(w, r)
          if (!out.topSet || e > out.topSet.e1RM || (e === out.topSet.e1RM && w > out.topSet.weight)) {
            out.topSet = { name: label || 'Lift', weight: w, reps: r, e1RM: e }
          }
        }
      }

      if (touched && id) seenExercises.add(id)
    }
  }

  out.exercises = seenExercises.size
  out.volume = Math.round(out.volume)
  if (out.topSet) out.topSet.e1RM = Math.round(out.topSet.e1RM)
  return out
}

function numeric(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Volume load gets large fast — a normal leg day clears five figures — and a
 * raw `28480` reads as a glitch. Compact it the way the rest of the app
 * compacts big counts.
 */
export function formatVolume(volume: number, unit: 'lbs' | 'kg'): string {
  if (!Number.isFinite(volume) || volume <= 0) return `0 ${unit}`
  if (volume < 1000) return `${Math.round(volume)} ${unit}`
  const k = volume / 1000
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k ${unit}`
}

/** `4500` → `1h 15m`. Used for time-based work only. */
export function formatWorkTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
