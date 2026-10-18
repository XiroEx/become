// Personal-record bookkeeping for workout sets.
//
// Three dimensions are tracked independently per (user, exerciseSlug):
//   • maxWeight  — heaviest completed set (weight primary, reps tiebreaker)
//   • maxReps    — most reps in a single completed set (reps primary, weight tiebreaker)
//   • maxE1RM    — best estimated 1-rep max via the Epley formula
//
// All functions are pure: they accept plain objects, return plain objects,
// touch no DB, no clock, no IO. The completed/incompleted set flag is honored
// (incomplete sets are ignored). Sets with weight=0 still count for maxReps
// (bodyweight PRs); sets with reps=0 are ignored entirely.

import { readBellCount, type BellCount } from './workout/bellCount'
import { getBellWeightInfo } from './workout/dumbbellWeight'

export type PRDimensionName = 'maxWeight' | 'maxReps' | 'maxE1RM'

export interface IPRDimension {
  weight: number
  reps: number
  e1rm?: number
  /**
   * The unit `weight` (and the `weight` the e1rm estimate was derived from)
   * was entered in — NP-209, raw + unit, same shape IWeightEntry.unit uses.
   * Absent on every PR set before this field existed: grandfathered as lbs,
   * never converted. Set from the triggering set's own `weightUnit`
   * (IPRSetCandidate), stamped server-side — never recomputed later.
   */
  unit?: 'lbs' | 'kg'
  date: Date
  programId?: string
}

export interface IExercisePR {
  exerciseSlug: string
  exerciseName: string
  maxWeight: IPRDimension | null
  maxReps: IPRDimension | null
  maxE1RM: IPRDimension | null
}

export interface IPRSetCandidate {
  weight?: number | null
  reps?: number | null
  completed?: boolean
  /** The unit `weight` was entered in — NP-209. See IPRDimension.unit. */
  weightUnit?: 'lbs' | 'kg' | null
  /** One dumbbell or two — 1-DB and 2-DB get tracked as separate PRs. */
  bells?: BellCount | null
}

export interface IPRSetContext {
  exerciseSlug: string
  exerciseName: string
  date: Date
  programId?: string
}

export interface PRUpdateResult {
  pr: IExercisePR
  newPRsAchieved: PRDimensionName[]
}

export interface IPRExerciseCandidate {
  name: string
  exerciseSlug?: string
  sets?: IPRSetCandidate[] | null
  equipment?: string[] | null
}

export interface WorkoutPRUpdateResult {
  prs: IExercisePR[]
  newPRsAchieved: Array<{
    exerciseSlug: string
    exerciseName: string
    dimensions: PRDimensionName[]
  }>
}

// Epley 1RM estimate: w × (1 + r/30). Returns 0 for non-positive inputs.
export function epley1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return 0
  if (weight <= 0 || reps <= 0) return 0
  return weight * (1 + reps / 30)
}

function emptyPR(slug: string, name: string): IExercisePR {
  return {
    exerciseSlug: slug,
    exerciseName: name,
    maxWeight: null,
    maxReps: null,
    maxE1RM: null,
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function bellSuffixFor(
  bells: unknown,
  exercise?: { name?: string; exerciseSlug?: string; equipment?: string[] | null } | null,
): { slugSuffix: string; nameSuffix: string } {
  const count = readBellCount(bells)
  if (!count) return { slugSuffix: '', nameSuffix: '' }

  const info = getBellWeightInfo({
    name: exercise?.name,
    equipment: exercise?.equipment ? (exercise.equipment as string[]) : undefined,
  })
  const isKb =
    info.style === 'kettlebell' ||
    /\b(kettlebell|kb)\b/i.test(exercise?.name ?? '') ||
    /\b(kettlebell|kb)\b/i.test(exercise?.exerciseSlug ?? '')
  const tag = isKb ? 'kb' : 'db'
  const tagUpper = isKb ? 'KB' : 'DB'

  return {
    slugSuffix: `-${count}-${tag}`,
    nameSuffix: ` (${count} ${tagUpper})`,
  }
}

// Apply a single set's effect to an exercise's PR record. Returns the new PR
// record plus the list of dimensions that were newly broken by this set.
export function updatePRsForSet(
  existing: IExercisePR | null,
  set: IPRSetCandidate,
  context: IPRSetContext,
): PRUpdateResult {
  const count = readBellCount(set.bells)
  let targetSlug = context.exerciseSlug
  let targetName = context.exerciseName
  if (count) {
    const { slugSuffix, nameSuffix } = bellSuffixFor(count, {
      name: targetName,
      exerciseSlug: targetSlug,
    })
    if (!targetSlug.endsWith(slugSuffix)) targetSlug = `${targetSlug}${slugSuffix}`
    if (!targetName.endsWith(nameSuffix)) targetName = `${targetName}${nameSuffix}`
  }

  const base = existing ?? emptyPR(targetSlug, targetName)
  // Refresh display name to whatever the caller has now (handles renames).
  const next: IExercisePR = {
    exerciseSlug: base.exerciseSlug,
    exerciseName: targetName || base.exerciseName,
    maxWeight: base.maxWeight,
    maxReps: base.maxReps,
    maxE1RM: base.maxE1RM,
  }

  if (!set.completed) return { pr: next, newPRsAchieved: [] }

  const w = Number(set.weight ?? 0) || 0
  const r = Number(set.reps ?? 0) || 0
  // NP-209: raw + unit. Absent (a set saved before this existed, or for a
  // member with no stored weightUnit yet) is grandfathered as lbs at DISPLAY
  // time — it is never written here, so an un-stamped set stays un-stamped.
  const unit = set.weightUnit ?? undefined
  const newPRs: PRDimensionName[] = []

  // maxWeight — only valid for weight > 0 AND reps > 0 (a weighted set with
  // 0 reps is a failed attempt, not a PR). Tiebreaker: more reps at same weight.
  if (w > 0 && r > 0) {
    const prior = next.maxWeight
    if (!prior || w > prior.weight || (w === prior.weight && r > prior.reps)) {
      next.maxWeight = {
        weight: w,
        reps: r,
        date: context.date,
        ...(unit ? { unit } : {}),
        ...(context.programId ? { programId: context.programId } : {}),
      }
      newPRs.push('maxWeight')
    }
  }

  // maxReps — bodyweight counts (w can be 0). Tiebreaker: heavier weight at same reps.
  if (r > 0) {
    const prior = next.maxReps
    if (!prior || r > prior.reps || (r === prior.reps && w > prior.weight)) {
      next.maxReps = {
        weight: w,
        reps: r,
        date: context.date,
        ...(unit ? { unit } : {}),
        ...(context.programId ? { programId: context.programId } : {}),
      }
      newPRs.push('maxReps')
    }
  }

  // maxE1RM — Epley estimate. Only meaningful when both w>0 and r>0.
  const e = epley1RM(w, r)
  if (e > 0) {
    const prior = next.maxE1RM
    if (!prior || e > (prior.e1rm ?? 0)) {
      next.maxE1RM = {
        weight: w,
        reps: r,
        e1rm: e,
        date: context.date,
        ...(unit ? { unit } : {}),
        ...(context.programId ? { programId: context.programId } : {}),
      }
      newPRs.push('maxE1RM')
    }
  }

  return { pr: next, newPRsAchieved: newPRs }
}

export interface IWorkoutLogForReplay {
  date: Date | string
  programId?: string
  completed?: boolean
  exercises?: IPRExerciseCandidate[] | null
}

// Replay a user's full workout-log history through updatePRsForWorkout to
// reconstruct the exercisePRs array from scratch. Used by the backfill
// migration; deterministic — same input always produces the same output, so
// running the migration twice in a row is a no-op on the second pass.
//
// Logs are sorted chronologically before replay so that PR `date` fields
// reflect when the record was actually first set, not the order Mongo returned.
export function computeExercisePRsFromLogs(logs: IWorkoutLogForReplay[]): IExercisePR[] {
  const completed = logs
    .filter((l) => l?.completed)
    .map((l) => ({ ...l, _t: new Date(l.date).getTime() }))
    .sort((a, b) => a._t - b._t)

  let prs: IExercisePR[] = []
  for (const log of completed) {
    const { prs: next } = updatePRsForWorkout(
      prs,
      log.exercises ?? [],
      new Date(log.date),
      log.programId,
    )
    prs = next
  }
  return prs
}

// Project persisted PRs into the legacy {name → {weight, reps}} response shape
// used by GET /api/workouts (`exercisePRs` field on the response). Only
// maxWeight is emitted — that is what the live-workout UI surfaces today.
export function formatPRsForLiveWorkout(
  prs: IExercisePR[] | null | undefined,
): Record<string, { weight: number; reps: number; unit?: 'lbs' | 'kg' }> {
  const out: Record<string, { weight: number; reps: number; unit?: 'lbs' | 'kg' }> = {}
  for (const pr of prs ?? []) {
    if (!pr?.maxWeight || !pr.exerciseName) continue
    out[pr.exerciseName] = {
      weight: pr.maxWeight.weight,
      reps: pr.maxWeight.reps,
      ...(pr.maxWeight.unit ? { unit: pr.maxWeight.unit } : {}),
    }
  }
  return out
}

// Project persisted PRs into the {slug-or-name → {name, weight, reps, date}}
// shape used by GET /api/progress (`pbs` field). Caller is responsible for
// any cosmetic date formatting — we return the raw Date.
export function formatPRsForProgressDetail(
  prs: IExercisePR[] | null | undefined,
): Record<string, { name: string; weight: number; reps: number; date: Date }> {
  const out: Record<string, { name: string; weight: number; reps: number; date: Date }> = {}
  for (const pr of prs ?? []) {
    if (!pr?.maxWeight || !pr.exerciseSlug || !pr.exerciseName) continue
    out[pr.exerciseSlug] = {
      name: pr.exerciseName,
      weight: pr.maxWeight.weight,
      reps: pr.maxWeight.reps,
      date: pr.maxWeight.date,
    }
  }
  return out
}

// Apply every set in a completed workout to the user's PR collection.
// Returns the rewritten PR array (existing entries preserved when not bested,
// new entries appended for first-seen exercises) plus a per-exercise list of
// dimensions newly broken in this workout. Idempotent if called twice with
// the same sets — the second call breaks no new PRs.
export function updatePRsForWorkout(
  prs: IExercisePR[],
  exercises: IPRExerciseCandidate[],
  date: Date,
  programId?: string,
): WorkoutPRUpdateResult {
  const prMap = new Map<string, IExercisePR>()
  for (const pr of prs) {
    if (pr?.exerciseSlug) prMap.set(pr.exerciseSlug, pr)
  }

  const allNewPRs: WorkoutPRUpdateResult['newPRsAchieved'] = []

  for (const ex of exercises) {
    const baseSlug = (ex.exerciseSlug?.trim() || slugify(ex.name)).toLowerCase()
    if (!baseSlug) continue

    // Group sets by target PR slug so 1-DB and 2-DB sets form separate PRs
    const setsBySlug = new Map<string, { slug: string; name: string; sets: IPRSetCandidate[] }>()

    for (const set of ex.sets ?? []) {
      const count = readBellCount(set.bells)
      let setSlug = baseSlug
      let setName = ex.name
      if (count) {
        const { slugSuffix, nameSuffix } = bellSuffixFor(count, {
          name: ex.name,
          exerciseSlug: baseSlug,
          equipment: ex.equipment,
        })
        if (!setSlug.endsWith(slugSuffix)) setSlug = `${setSlug}${slugSuffix}`
        if (!setName.endsWith(nameSuffix)) setName = `${setName}${nameSuffix}`
      }
      let group = setsBySlug.get(setSlug)
      if (!group) {
        group = { slug: setSlug, name: setName, sets: [] }
        setsBySlug.set(setSlug, group)
      }
      group.sets.push(set)
    }

    for (const group of setsBySlug.values()) {
      const broken = new Set<PRDimensionName>()
      let current = prMap.get(group.slug) ?? null

      for (const set of group.sets) {
        const { pr, newPRsAchieved } = updatePRsForSet(current, set, {
          exerciseSlug: group.slug,
          exerciseName: group.name,
          date,
          programId,
        })
        current = pr
        for (const d of newPRsAchieved) broken.add(d)
      }

      // Only persist a PR record if at least one dimension carries data. This
      // avoids littering the array with empty placeholders for exercises whose
      // sets were all incomplete.
      if (current && (current.maxWeight || current.maxReps || current.maxE1RM)) {
        prMap.set(group.slug, current)
        if (broken.size > 0) {
          allNewPRs.push({
            exerciseSlug: group.slug,
            exerciseName: group.name,
            dimensions: Array.from(broken),
          })
        }
      }
    }
  }

  return { prs: Array.from(prMap.values()), newPRsAchieved: allNewPRs }
}
