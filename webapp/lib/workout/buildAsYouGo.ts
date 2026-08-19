// Build as you go — add exercises to a workout that is already running, and
// turn what is already there into a superset or a circuit, mid-session.
//
// A session used to be fixed the moment you started it: whatever you picked in
// the builder was the whole workout, and finding the next machine free meant
// finishing early or abandoning the log. These helpers let the live view, the
// track view and the session editor all add, group and ungroup with the same
// rules, so the three never disagree about what the workout is.
//
// Two invariants the rest of the code leans on:
//
//   1. `groupExercises` in lib/workoutUtils only groups CONSECUTIVE exercises
//      sharing a groupId. So grouping has to physically move exercises next to
//      each other — hence every mutation returns an `order` (old index per new
//      position) that callers use to permute their parallel arrays (set data,
//      swaps, per-exercise progress).
//   2. Nothing here touches React, the DOM, or Mongo. Pure in, pure out.

import type { WorkoutExercise } from '@/lib/workoutUtils'

/** The group kinds a member can create from inside a session. */
export type GroupKind = 'superset' | 'circuit' | 'triset' | 'giant_set'

export interface AdHocExercise extends WorkoutExercise {
  /** Added during the session rather than programmed / drafted up front. */
  addedAdHoc?: boolean
}

/** The result of any mutation: the new list plus how the old one maps onto it. */
export interface MutationResult<T extends WorkoutExercise> {
  exercises: T[]
  /** `order[newIndex] = oldIndex`, or -1 for an exercise that did not exist before. */
  order: number[]
}

export const GROUP_KINDS: GroupKind[] = ['superset', 'circuit', 'triset', 'giant_set']

/** Below this many exercises, a session reads as thin — the add-exercise button calls attention to itself. */
export const RECOMMENDED_MIN_EXERCISES = 4

/** Whether the workout is thin enough that "Add exercise" should call attention to itself. */
export function needsMoreExercises(exerciseCount: number): boolean {
  return exerciseCount < RECOMMENDED_MIN_EXERCISES
}

/**
 * Whether to ask "finish with two exercises?" on the way out.
 *
 * Only for a session the member assembled themselves — a three-exercise day in
 * a program is the coach's call and gets no second-guessing — and only once:
 * answering "finish anyway" settles it for the rest of the session.
 */
export function shouldWarnBeforeFinish(opts: {
  selfBuilt: boolean
  exerciseCount: number
  alreadyAsked: boolean
}): boolean {
  if (!opts.selfBuilt || opts.alreadyAsked) return false
  return needsMoreExercises(opts.exerciseCount)
}

/** What a group of this kind and size is called on screen. */
export function groupLabelFor(kind: GroupKind, size: number): string {
  if (kind === 'circuit') return 'Circuit'
  if (kind === 'triset') return 'Triset'
  if (kind === 'giant_set') return 'Giant set'
  return size > 2 ? 'Superset' : 'Superset'
}

/**
 * The kind a group of this size naturally reads as, when the member just says
 * "group these": two is a superset, three a triset, four or more a giant set.
 * Circuits stay an explicit choice — a circuit is an intent, not a headcount.
 */
export function naturalKindFor(size: number): GroupKind {
  if (size >= 4) return 'giant_set'
  if (size === 3) return 'triset'
  return 'superset'
}

/** A group id that cannot collide with one already in the list. */
export function newGroupId(list: Pick<WorkoutExercise, 'groupId'>[], seed?: number): string {
  const taken = new Set(list.map(e => e.groupId).filter(Boolean) as string[])
  let n = Math.max(1, Math.floor(seed ?? 1))
  let id = `adhoc-${n}`
  while (taken.has(id)) id = `adhoc-${++n}`
  return id
}

function identityOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

/** Append an exercise to the end of the workout. */
export function appendExercise<T extends WorkoutExercise>(list: T[], ex: T): MutationResult<T> & { index: number } {
  return { exercises: [...list, ex], order: [...identityOrder(list.length), -1], index: list.length }
}

/**
 * Insert an exercise directly after `afterIndex`. Used for "add it into the
 * superset I am standing in" — the new exercise has to sit beside its group or
 * the flow builder will not interleave it.
 */
export function insertExerciseAfter<T extends WorkoutExercise>(list: T[], afterIndex: number, ex: T): MutationResult<T> & { index: number } {
  const at = Math.max(-1, Math.min(afterIndex, list.length - 1)) + 1
  const exercises = [...list.slice(0, at), ex, ...list.slice(at)]
  const order = [...identityOrder(list.length).slice(0, at), -1, ...identityOrder(list.length).slice(at)]
  return { exercises, order, index: at }
}

/**
 * Add an exercise into the group the given exercise belongs to (or start a new
 * group of the two, when it has none). This is the one-tap "superset this with
 * what I am doing" path.
 */
export function addIntoGroup<T extends WorkoutExercise>(
  list: T[],
  anchorIndex: number,
  ex: T,
  kind: GroupKind = 'superset',
): MutationResult<T> & { index: number; groupId: string } {
  const anchor = list[anchorIndex]
  if (!anchor) {
    const appended = appendExercise(list, ex)
    return { ...appended, groupId: '' }
  }
  if (anchor.groupId) {
    // Slide in behind the last member of the existing group.
    let last = anchorIndex
    while (last + 1 < list.length && list[last + 1]?.groupId === anchor.groupId) last++
    const inserted = insertExerciseAfter(list, last, {
      ...ex,
      groupId: anchor.groupId,
      groupType: anchor.groupType,
      groupLabel: anchor.groupLabel,
      groupRest: anchor.groupRest,
      groupRounds: anchor.groupRounds,
    })
    const size = inserted.exercises.filter(e => e.groupId === anchor.groupId).length
    const relabelled = inserted.exercises.map(e =>
      e.groupId === anchor.groupId
        ? { ...e, groupLabel: groupLabelFor((e.groupType as GroupKind) || 'superset', size) }
        : e,
    )
    return { ...inserted, exercises: relabelled, groupId: anchor.groupId }
  }
  // No group yet: put the new exercise right after the anchor and marry the two.
  const inserted = insertExerciseAfter(list, anchorIndex, ex)
  const grouped = groupIndexes(inserted.exercises, [anchorIndex, inserted.index], kind)
  return {
    exercises: grouped.exercises,
    // Compose the two permutations so the caller moves its set data once.
    order: grouped.order.map(i => (i === -1 ? -1 : inserted.order[i] ?? -1)),
    // The pair is already adjacent, so grouping does not move the new exercise.
    index: inserted.index,
    groupId: grouped.groupId,
  }
}

/**
 * Make the given exercises one group, moving them together at the position of
 * the first one. Returns the permutation so set data can follow its exercise.
 */
export function groupIndexes<T extends WorkoutExercise>(
  list: T[],
  indexes: number[],
  kind: GroupKind = 'superset',
  opts?: { rounds?: number; rest?: string; groupId?: string },
): MutationResult<T> & { groupId: string; indexes: number[] } {
  const picked = [...new Set(indexes)].filter(i => i >= 0 && i < list.length).sort((a, b) => a - b)
  if (picked.length < 2) return { exercises: list, order: identityOrder(list.length), groupId: '', indexes: picked }

  const groupId = opts?.groupId ?? newGroupId(list, picked[0]! + 1)
  const label = groupLabelFor(kind, picked.length)
  const anchor = picked[0]!

  const order: number[] = []
  for (let i = 0; i < anchor; i++) if (!picked.includes(i)) order.push(i)
  order.push(...picked)
  for (let i = anchor + 1; i < list.length; i++) if (!picked.includes(i)) order.push(i)

  const exercises = order.map(oldIdx => {
    const ex = list[oldIdx]!
    if (!picked.includes(oldIdx)) return ex
    return {
      ...ex,
      groupId,
      groupType: kind,
      groupLabel: label,
      ...(opts?.rounds ? { groupRounds: opts.rounds } : {}),
      ...(opts?.rest ? { groupRest: opts.rest } : {}),
    }
  })

  const start = order.indexOf(picked[0]!)
  return { exercises, order, groupId, indexes: picked.map((_, i) => start + i) }
}

/** Break up the group the exercise at `index` belongs to. Order is unchanged. */
export function ungroupAt<T extends WorkoutExercise>(list: T[], index: number): MutationResult<T> {
  const gid = list[index]?.groupId
  if (!gid) return { exercises: list, order: identityOrder(list.length) }
  const exercises = list.map(ex => {
    if (ex.groupId !== gid) return ex
    const next = { ...ex }
    delete next.groupId
    delete next.groupType
    delete next.groupLabel
    delete next.groupRest
    delete next.groupRounds
    return next
  })
  return { exercises, order: identityOrder(list.length) }
}

/** Remove an exercise, dissolving a group that would be left with one member. */
export function removeExercise<T extends WorkoutExercise>(list: T[], index: number): MutationResult<T> {
  if (index < 0 || index >= list.length) return { exercises: list, order: identityOrder(list.length) }
  const gid = list[index]?.groupId
  const order = identityOrder(list.length).filter(i => i !== index)
  let exercises = order.map(i => list[i]!)
  if (gid && exercises.filter(e => e.groupId === gid).length < 2) {
    exercises = exercises.map(e => {
      if (e.groupId !== gid) return e
      const next = { ...e }
      delete next.groupId
      delete next.groupType
      delete next.groupLabel
      delete next.groupRest
      delete next.groupRounds
      return next
    })
  }
  return { exercises, order }
}

/**
 * Move an exercise up or down the workout.
 *
 * Reordering can carry an exercise out of the superset it belonged to, or drop
 * an outsider into the middle of one — `sanitizeGroups` settles that afterwards,
 * because a group whose members are no longer neighbours is not a group.
 */
export function moveExercise<T extends WorkoutExercise>(list: T[], from: number, to: number): MutationResult<T> {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return { exercises: list, order: identityOrder(list.length) }
  }
  const order = identityOrder(list.length)
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved!)
  return { exercises: sanitizeGroups(order.map(i => list[i]!)), order }
}

/** A workout with nothing in it is not a workout — the last exercise stays. */
export function canRemoveExercise(list: unknown[]): boolean {
  return list.length > 1
}

/**
 * Move a caller's parallel array (set data, per-exercise progress, …) through a
 * mutation. `make(newIndex)` supplies a fresh row for an exercise that did not
 * exist before.
 */
export function applyOrder<R>(rows: R[], order: number[], make: (newIndex: number) => R): R[] {
  return order.map((oldIdx, newIdx) => (oldIdx === -1 ? make(newIdx) : rows[oldIdx] ?? make(newIdx)))
}

/** The same, for a keyed record such as `swappedExercises` (index → value). */
export function applyOrderToRecord<V>(record: Record<number, V>, order: number[]): Record<number, V> {
  const next: Record<number, V> = {}
  order.forEach((oldIdx, newIdx) => {
    if (oldIdx !== -1 && record[oldIdx] !== undefined) next[newIdx] = record[oldIdx] as V
  })
  return next
}

/**
 * Where a step index lands after a mutation. The live view is sitting on a
 * step when the workout changes; without this the member gets teleported.
 */
export function remapIndex(order: number[], oldIndex: number): number {
  const at = order.indexOf(oldIndex)
  return at === -1 ? Math.min(oldIndex, Math.max(0, order.length - 1)) : at
}

// ── Restoring an added exercise from a saved log ─────────────────────────────

/** One exercise as it comes back from a saved workout log. */
export interface SavedLogExercise {
  name: string
  exerciseSlug?: string
  sets?: Array<{ reps?: number | null; weight?: number | null; duration?: number | null; completed?: boolean }>
  groupId?: string
  groupType?: string
  groupLabel?: string
  groupRounds?: number
  addedAdHoc?: boolean
  prescription?: { sets?: number; reps?: string; duration?: string; rest?: string; trackingType?: string }
}

/**
 * Rebuild the exercise a member added mid-session from what the log kept.
 * The prescription is authoritative when present; otherwise the shape of the
 * logged sets tells us enough (a duration with no reps is timed work).
 */
export function exerciseFromLog(saved: SavedLogExercise): AdHocExercise {
  const p = saved.prescription
  const first = saved.sets?.[0]
  const timed = !!first && first.duration != null && !(first.reps && first.reps > 0)
  return {
    name: saved.name,
    ...(saved.exerciseSlug ? { exerciseSlug: saved.exerciseSlug } : {}),
    trackingType: p?.trackingType || (timed ? 'time' : 'reps_weight'),
    sets: p?.sets ?? Math.max(1, saved.sets?.length ?? 1),
    reps: p?.reps ?? (!timed && first?.reps ? String(first.reps) : ''),
    ...(p?.duration ? { duration: p.duration } : timed && first?.duration ? { duration: `${first.duration}` } : {}),
    ...(p?.rest ? { rest: p.rest } : {}),
    ...(saved.groupId ? { groupId: saved.groupId } : {}),
    ...(saved.groupType ? { groupType: saved.groupType } : {}),
    ...(saved.groupLabel ? { groupLabel: saved.groupLabel } : {}),
    ...(saved.groupRounds ? { groupRounds: saved.groupRounds } : {}),
    addedAdHoc: true,
  }
}

/**
 * Merge exercises added mid-session back into a programmed workout on resume.
 *
 * A program workout's exercise list is rebuilt from the program every time it
 * loads, so anything added during the session would vanish on reload and its
 * logged sets would be orphaned. Anything the log carries past the program's
 * own list — or explicitly flagged as added — comes back, in order, keeping
 * whatever group it was put in.
 */
export function mergeAdHocFromLog<T extends WorkoutExercise>(
  planned: T[],
  saved: SavedLogExercise[] | undefined,
): (T | AdHocExercise)[] {
  if (!saved?.length) return planned
  const extra = saved
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.addedAdHoc === true || i >= planned.length)
    .map(({ s }) => exerciseFromLog(s))
  if (!extra.length) return planned
  return [...planned, ...extra]
}

/**
 * Drop group fields from any group that no longer holds together: fewer than
 * two members, or members that are no longer neighbours. Reordering is free to
 * split a superset, and a split superset that still claims to be one is worse
 * than none — the flow builder would stop interleaving it while the card kept
 * saying "Superset".
 */
export function sanitizeGroups<T extends WorkoutExercise>(list: T[]): T[] {
  const runs = new Map<string, number[]>()
  list.forEach((ex, i) => {
    if (!ex.groupId) return
    const at = runs.get(ex.groupId)
    if (at) at.push(i)
    else runs.set(ex.groupId, [i])
  })
  const broken = new Set<string>()
  for (const [gid, idxs] of runs) {
    const contiguous = idxs.every((v, k) => k === 0 || v === idxs[k - 1]! + 1)
    if (idxs.length < 2 || !contiguous) broken.add(gid)
  }
  if (!broken.size) return list
  return list.map(ex => {
    if (!ex.groupId || !broken.has(ex.groupId)) return ex
    const next = { ...ex }
    delete next.groupId
    delete next.groupType
    delete next.groupLabel
    delete next.groupRest
    delete next.groupRounds
    return next
  })
}

/** The prescription to persist beside an added exercise's logged sets. */
export function prescriptionOf(ex: WorkoutExercise): SavedLogExercise['prescription'] {
  return {
    sets: Math.max(1, ex.sets ?? 1),
    ...(ex.reps ? { reps: ex.reps } : {}),
    ...(ex.duration ? { duration: ex.duration } : {}),
    ...(ex.rest ? { rest: ex.rest } : {}),
    ...(ex.trackingType ? { trackingType: ex.trackingType } : {}),
  }
}
