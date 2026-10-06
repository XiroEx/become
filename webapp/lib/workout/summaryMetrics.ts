// What the post-workout summary is allowed to say about a logged set.
//
// The summary screen had exactly one vocabulary — `weight × reps` — and three
// different callers feeding it three different shapes:
//
//   * the Live view packs a timed set's SECONDS into `reps` and its DISTANCE
//     into `weight` (that is its input convention; the save path translates on
//     the way out). The summary read them literally, so a 10-minute / 2000 m
//     treadmill rendered "2000×600" and dropped 1,200,000 lbs into Volume.
//   * the Track view keeps duration/distance/speed in their own fields and
//     leaves reps/weight empty, so the same treadmill rendered " reps".
//   * the calendar hands over a saved log, where an unmeasured field is `null`
//     — `String(null)` is "null", so a past cardio session read "null reps".
//
// So: one module that normalizes whatever arrives, answers by TRACKING TYPE,
// and is the only place that decides what a set, an exercise block or the whole
// session is worth. Grouping lives here too: a circuit and a superset are not
// the same thing and the summary used to show neither.

import { normalizeTracking, tracksTime, setUnitLabel } from './tracking'
import { isFloorsExercise } from './durationUnit'
import { GROUP_KINDS, groupLabelFor, type GroupKind } from './buildAsYouGo'

// ─── Inputs ───────────────────────────────────────────────────────────────────

/**
 * One logged set as the summary receives it. Every measure is optional and may
 * arrive as a string (both logging screens bind their inputs to strings) or a
 * number (a saved log), including `null` for "never measured".
 */
export interface SummarySetInput {
  reps?: string | number | null
  weight?: string | number | null
  /** Seconds. Canonical everywhere — see lib/workout/durationUnit. */
  duration?: string | number | null
  /** Meters, or floors on a stair machine. */
  distance?: string | number | null
  /** mph. */
  speed?: string | number | null
  completed: boolean
}

/** The exercise a set belongs to, as far as the summary cares. */
export interface SummaryExerciseInput {
  name: string
  trackingType?: string | null
  groupId?: string | null
  groupType?: string | null
  groupLabel?: string | null
  groupRounds?: number | null
}

export interface SummaryHistoryEntry {
  weight: number
  reps: number
  duration?: number | null
  date: string
}

/** Every measure of one set, as a number. Unmeasured reads 0, never NaN. */
export interface SummarySetMetrics {
  reps: number
  weight: number
  duration: number
  distance: number
  speed: number
}

function toNumber(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v === null || v === undefined) return 0
  const n = parseFloat(String(v).trim())
  return Number.isFinite(n) ? n : 0
}

export function setMetrics(s: SummarySetInput | null | undefined): SummarySetMetrics {
  return {
    reps: toNumber(s?.reps),
    weight: toNumber(s?.weight),
    duration: toNumber(s?.duration),
    distance: toNumber(s?.distance),
    speed: toNumber(s?.speed),
  }
}

// ─── One set ──────────────────────────────────────────────────────────────────

/**
 * Whether a completed set counts as work rather than a skip.
 *
 * The skip paths write a set out with every measure zeroed (`reps: "0",
 * weight: "0"`), which is the marker the summary has always keyed off. An
 * `intervals` round is the one exception: neither app asks it for a number, so
 * tapping Done IS the measurement. Same rule as the native summary
 * (`isActiveSummarySet` in expo/components/live/WorkoutSummary.tsx) so the two
 * screens never disagree about what happened.
 */
export function isActiveSummarySet(
  s: SummarySetInput | null | undefined,
  trackingType?: string | null,
): boolean {
  if (!s?.completed) return false
  if (normalizeTracking(trackingType) === 'intervals') return true
  const m = setMetrics(s)
  return m.reps > 0 || m.weight > 0 || m.duration > 0 || m.distance > 0
}

/** A completed set with nothing logged against it — the skip marker. */
export function isSkippedSummarySet(
  s: SummarySetInput | null | undefined,
  trackingType?: string | null,
): boolean {
  return !!s?.completed && !isActiveSummarySet(s, trackingType)
}

/** Round to at most 2 decimals and drop a trailing ".00". */
function trim(n: number): string {
  return Number(n.toFixed(2)).toString()
}

/** A duration: seconds under a minute, m:ss up to an hour, h:mm:ss above. */
export function formatDurationSec(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}s`
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  if (mm < 60) return `${mm}:${ss}`
  return `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}:${ss}`
}

/** The distance unit this exercise measures in. Stair machines count floors. */
export function distanceUnitLabel(exerciseName?: string | null): string {
  return isFloorsExercise(exerciseName) ? 'floors' : 'm'
}

/**
 * One set's chip label, by tracking type. Loaded work reads like it always has
 * (`135×5`, `12 reps`); timed work reads its own metrics (`10:00 · 2000 m`,
 * `45s · 6.5 mph`) — never `2000×600`, never `null reps`.
 */
export function formatSummarySet(
  s: SummarySetInput,
  trackingType?: string | null,
  exerciseName?: string | null,
): string {
  const t = normalizeTracking(trackingType)
  const m = setMetrics(s)
  const parts: string[] = []
  if (tracksTime(t)) {
    if (m.duration > 0) parts.push(formatDurationSec(m.duration))
    if (t === 'time_distance' && m.distance > 0) {
      parts.push(`${trim(m.distance)} ${distanceUnitLabel(exerciseName)}`)
    }
    if (m.speed > 0) parts.push(`${trim(m.speed)} mph`)
    return parts.length > 0 ? parts.join(' · ') : 'Done'
  }
  if (m.weight > 0) return `${trim(m.weight)}×${trim(m.reps)}`
  if (m.reps > 0) return `${trim(m.reps)} reps`
  return 'Done'
}

// ─── Whole session ────────────────────────────────────────────────────────────

export interface SummaryTotals {
  /** Completed sets, skips included — what the Sets tile has always counted. */
  totalSets: number
  /** weight × reps over completed LOADED sets. Timed work adds nothing. */
  totalVolume: number
  /** Seconds of logged work across timed sets (not wall-clock session time). */
  totalWorkSeconds: number
  /** Distance across time_distance sets, in whatever unit they measure. */
  totalDistance: number
  /** True when every distance logged came from a stair machine. */
  distanceInFloors: boolean
}

export function summaryTotals(
  exercises: SummaryExerciseInput[],
  setsByExercise: SummarySetInput[][],
): SummaryTotals {
  let totalSets = 0
  let totalVolume = 0
  let totalWorkSeconds = 0
  let totalDistance = 0
  let floorsDistance = 0
  exercises.forEach((exercise, i) => {
    const t = normalizeTracking(exercise.trackingType)
    const timed = tracksTime(t)
    for (const s of setsByExercise[i] ?? []) {
      if (!s?.completed) continue
      totalSets += 1
      const m = setMetrics(s)
      if (timed) {
        totalWorkSeconds += m.duration
        if (t === 'time_distance') {
          totalDistance += m.distance
          if (isFloorsExercise(exercise.name)) floorsDistance += m.distance
        }
      } else {
        totalVolume += m.weight * m.reps
      }
    }
  })
  return {
    totalSets,
    totalVolume: Math.round(totalVolume),
    totalWorkSeconds: Math.round(totalWorkSeconds),
    totalDistance: Math.round(totalDistance * 100) / 100,
    distanceInFloors: totalDistance > 0 && floorsDistance === totalDistance,
  }
}

export interface SummaryStatTile {
  key: 'sets' | 'volume' | 'distance' | 'work'
  label: string
  value: string
}

/**
 * The stat tiles beside Duration. Sets always; then the aggregates this
 * session actually produced, newest problem first: a cardio-only session used
 * to show "0 Volume lbs" and nothing else, which is the whole complaint.
 *
 * Capped at two extras so the row stays a 3- or 4-up grid rather than
 * reflowing into a ragged third line. When the session produced no aggregate
 * at all, Volume stands in at 0 — the tile row never collapses below three.
 */
export function summaryStatTiles(totals: SummaryTotals): SummaryStatTile[] {
  const tiles: SummaryStatTile[] = [
    { key: 'sets', label: 'Sets', value: String(totals.totalSets) },
  ]
  const extras: SummaryStatTile[] = []
  if (totals.totalVolume > 0) {
    extras.push({ key: 'volume', label: 'Volume lbs', value: totals.totalVolume.toLocaleString() })
  }
  if (totals.totalDistance > 0) {
    extras.push({
      key: 'distance',
      label: totals.distanceInFloors ? 'Floors' : 'Distance m',
      value: totals.totalDistance.toLocaleString(),
    })
  }
  if (totals.totalWorkSeconds > 0) {
    extras.push({ key: 'work', label: 'Work time', value: formatDurationSec(totals.totalWorkSeconds) })
  }
  if (extras.length === 0) {
    extras.push({ key: 'volume', label: 'Volume lbs', value: '0' })
  }
  return [...tiles, ...extras.slice(0, 2)]
}

// ─── Records ──────────────────────────────────────────────────────────────────

export interface SummaryPR {
  name: string
  bestLabel: string
  prevLabel: string
}

/**
 * New records: each exercise's best set of THIS session beaten against the
 * previous session (`exerciseHistory`), keyed by exercise name — the rule the
 * summary has always used. Loaded work compares weight then reps; timed work
 * compares duration, because a cardio PR was previously decided by comparing
 * its distance against a stored weight.
 */
export function computeSummaryPRs(
  exercises: SummaryExerciseInput[],
  setsByExercise: SummarySetInput[][],
  exerciseHistory: Record<string, SummaryHistoryEntry>,
): SummaryPR[] {
  const out: SummaryPR[] = []
  exercises.forEach((exercise, i) => {
    const sets = setsByExercise[i] ?? []
    const active = sets.filter(s => isActiveSummarySet(s, exercise.trackingType))
    const history = exerciseHistory[exercise.name]
    const first = active[0]
    if (!history || !first) return

    if (tracksTime(exercise.trackingType)) {
      let best = first
      for (const s of active) {
        const b = setMetrics(best)
        const c = setMetrics(s)
        if (c.duration > b.duration || (c.duration === b.duration && c.distance > b.distance)) best = s
      }
      const prev = history.duration ?? 0
      if (setMetrics(best).duration > prev) {
        out.push({
          name: exercise.name,
          bestLabel: formatSummarySet(best, exercise.trackingType, exercise.name),
          prevLabel: prev > 0 ? formatDurationSec(prev) : '—',
        })
      }
      return
    }

    let best = first
    for (const s of active) {
      const b = setMetrics(best)
      const c = setMetrics(s)
      if (c.weight > b.weight || (c.weight === b.weight && c.reps > b.reps)) best = s
    }
    const m = setMetrics(best)
    if (m.weight > history.weight || (m.weight === history.weight && m.reps > history.reps)) {
      out.push({
        name: exercise.name,
        bestLabel: m.weight > 0 ? `${trim(m.weight)} × ${trim(m.reps)}` : `${trim(m.reps)} reps`,
        prevLabel: history.weight > 0 ? `${history.weight} × ${history.reps}` : `${history.reps} reps`,
      })
    }
  })
  return out
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

export interface SummaryGroupMember {
  exercise: SummaryExerciseInput
  /** Index into the flat `exercises` / `setsByExercise` arrays. */
  index: number
}

export interface SummaryGroupBlock {
  groupId: string | null
  /** "Circuit" / "Superset" / … — null for a plain, ungrouped exercise. */
  label: string | null
  /** The kind behind the label, so the block can be coloured by it. */
  kind: GroupKind | null
  /** Rounds of the block, when it is a group. */
  rounds: number | null
  members: SummaryGroupMember[]
}

function kindOf(groupType: string | null | undefined): GroupKind {
  const t = (groupType ?? '').trim().toLowerCase()
  return (GROUP_KINDS as string[]).includes(t) ? (t as GroupKind) : 'superset'
}

/**
 * What a block of the breakdown is called. A stored `groupLabel` is the
 * coach's or the builder's own words and wins; otherwise the kind names
 * itself through the same helper the builder used to write that label
 * (`groupLabelFor`), so "Circuit" never degrades to "Superset" on this screen.
 */
export function summaryGroupLabel(
  exercise: SummaryExerciseInput,
  size: number,
): string {
  const stored = (exercise.groupLabel ?? '').trim()
  if (stored) return stored
  return groupLabelFor(kindOf(exercise.groupType), size)
}

/**
 * Split the flat exercise list into display blocks, grouping CONSECUTIVE
 * exercises that share a groupId — the same adjacency rule as
 * `groupExercises` in lib/workoutUtils, so the summary draws the blocks the
 * live view actually ran. A group with one member left in it is not a group.
 */
export function summaryGroups(exercises: SummaryExerciseInput[]): SummaryGroupBlock[] {
  const blocks: SummaryGroupBlock[] = []
  let i = 0
  while (i < exercises.length) {
    const head = exercises[i]!
    const id = (head.groupId ?? '').trim()
    if (!id) {
      blocks.push({ groupId: null, label: null, kind: null, rounds: null, members: [{ exercise: head, index: i }] })
      i++
      continue
    }
    const members: SummaryGroupMember[] = []
    while (i < exercises.length && (exercises[i]!.groupId ?? '').trim() === id) {
      members.push({ exercise: exercises[i]!, index: i })
      i++
    }
    if (members.length < 2) {
      blocks.push({ groupId: null, label: null, kind: null, rounds: null, members })
      continue
    }
    const rounds = head.groupRounds && head.groupRounds > 0 ? head.groupRounds : null
    blocks.push({
      groupId: id,
      label: summaryGroupLabel(head, members.length),
      kind: kindOf(head.groupType),
      rounds,
      members,
    })
  }
  return blocks
}

/** "4 rounds" / "3 sets" — the right noun for how this block was tracked. */
export function summaryRoundsLabel(
  block: SummaryGroupBlock,
  setsByExercise: SummarySetInput[][],
): string | null {
  const counts = block.members.map(m => (setsByExercise[m.index] ?? []).length)
  const rounds = block.rounds ?? Math.max(0, ...counts)
  if (!rounds) return null
  // A circuit IS rounds of the whole block, whatever its members track.
  // Anything else defers to its first member's tracking type, the same way a
  // single exercise's line does.
  const head = block.members[0]?.exercise
  const asRounds = block.kind === 'circuit' || tracksTime(head?.trackingType)
  const noun = asRounds
    ? `round${rounds === 1 ? '' : 's'}`
    : `set${rounds === 1 ? '' : 's'}`
  return `${rounds} ${noun}`
}

/** "3 sets" / "4 rounds" for one exercise's logged-vs-planned line. */
export function summarySetCountLabel(
  exercise: SummaryExerciseInput,
  total: number,
): string {
  return setUnitLabel(exercise.trackingType, total).toLowerCase()
}
