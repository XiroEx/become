// What the finish screen is allowed to say about a set.
//
// The summary was written when every exercise was reps × weight, and it never
// learned anything else. A treadmill, a plank and a stair climber all reached
// it through the same two fields and came out the other side as `0×0` chips,
// `0` volume and "3/3 sets" of a thing that has no sets — the member had just
// logged 12 minutes and 2000 m and the celebration screen showed them nothing.
// A circuit and a superset, meanwhile, arrived as a flat list: the shape of
// the session the member actually ran (the thing that made it hard) was gone
// by the time they were being congratulated for it.
//
// So every question the summary asks about a set goes through here, and every
// answer is a function of the exercise's TRACKING TYPE:
//
//   - `formatSummarySet`   one set's chip: `135×5`, `12 reps`, `10:00 · 2000 m`
//   - `isActiveSummarySet` did this set happen, judged on what it tracks
//   - `summaryTotals`      volume over LOADED work only, plus time/distance
//   - `summaryMetricTiles` which stat tiles this session deserves
//   - `computeSummaryPRs`  records, compared on the dimension that was tracked
//   - `summaryGroupBlocks` circuits and supersets, by adjacency (groupExercises)
//
// Pure in, pure out: no React, no DOM, no fetch — so the screen is a renderer
// and the rules are testable on their own.
//
// One trap for callers: the LIVE view types cardio into the same two input
// boxes as reps and weight (labels above them say Duration and Distance), so
// its in-memory `{ reps, weight }` is NOT what it means for a timed exercise.
// It has to translate into `{ duration, distance }` on the way in here exactly
// as its save path does, or the summary reads 720 reps for a 12-minute walk.

import { normalizeTracking, tracksTime } from './tracking'
import { isFloorsExercise } from './durationUnit'

/** A set as the summary reads it: canonical fields, numbers or input strings. */
export interface SummarySet {
  reps?: string | number | null
  weight?: string | number | null
  /** Seconds — time / time_distance / intervals. */
  duration?: string | number | null
  /** Meters, or floors on a stair machine — time_distance. */
  distance?: string | number | null
  /** mph — time_distance / intervals. */
  speed?: string | number | null
  completed: boolean
}

/** An exercise as the summary reads it: its name, what it tracks, its group. */
export interface SummaryExercise {
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

/** Every measurement one set can carry, as numbers. */
export interface SetMeasures {
  weight: number
  reps: number
  duration: number
  distance: number
  speed: number
}

function num(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v !== 'string') return 0
  const n = parseFloat(v.trim())
  return Number.isFinite(n) ? n : 0
}

/** Round to 2dp and drop a trailing `.00` — `2000`, `1.5`, never `1.50`. */
function trimNumber(n: number): string {
  return Number(n.toFixed(2)).toString()
}

export function measuresOf(set: SummarySet | null | undefined): SetMeasures {
  return {
    weight: num(set?.weight),
    reps: num(set?.reps),
    duration: num(set?.duration),
    distance: num(set?.distance),
    speed: num(set?.speed),
  }
}

/** A timed value: seconds under a minute, m:ss above. */
export function formatDurationSec(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A distance, in the unit the exercise actually measures. */
export function formatDistance(distance: number, exerciseName?: string | null): string {
  return isFloorsExercise(exerciseName)
    ? `${trimNumber(distance)} floors`
    : `${trimNumber(distance)} m`
}

/**
 * Did this set happen?
 *
 * `0 × 0` is the skip marker on counted work, so a completed set with nothing
 * in it is a skip — but only for work that HAS numbers to put in. Timed work
 * carries its effort in duration/distance, and an intervals round (or a `none`
 * exercise, which is never given an input at all) is finished by tapping Done,
 * so for those "completed" is the whole answer.
 */
export function isActiveSummarySet(
  set: SummarySet | null | undefined,
  trackingType?: string | null,
): boolean {
  if (!set?.completed) return false
  const t = normalizeTracking(trackingType)
  if (t === 'intervals' || t === 'none') return true
  const m = measuresOf(set)
  return m.weight > 0 || m.reps > 0 || m.duration > 0 || m.distance > 0
}

/**
 * One set's chip, by tracking type. Loaded work reads `135×5`, counted work
 * `12 reps`, timed work its duration and whatever else the machine measured
 * (`10:00 · 2000 m · 3.5 mph`) — never `0×0`.
 */
export function formatSummarySet(
  set: SummarySet,
  trackingType?: string | null,
  exerciseName?: string | null,
): string {
  const t = normalizeTracking(trackingType)
  const m = measuresOf(set)
  if (tracksTime(t)) {
    const parts: string[] = []
    if (m.duration > 0) parts.push(formatDurationSec(m.duration))
    if (m.distance > 0) parts.push(formatDistance(m.distance, exerciseName))
    if (m.speed > 0) parts.push(`${trimNumber(m.speed)} mph`)
    return parts.length > 0 ? parts.join(' · ') : 'Done'
  }
  if (m.weight > 0) return `${trimNumber(m.weight)}×${trimNumber(m.reps)}`
  if (m.reps > 0) return `${trimNumber(m.reps)} reps`
  // A `none` exercise has nothing to type; anything else fell through because
  // the member ticked an empty set, which the breakdown shows as a skip.
  return 'Done'
}

/** One set as the LIVE view holds it in memory: two boxes and a tick. */
export interface LiveInputSet {
  reps: string
  weight: string
  speed?: string
  completed: boolean
}

/**
 * The Live view's two input boxes → canonical summary fields.
 *
 * That view asks for cardio in the SAME two boxes as reps and weight (the
 * labels above them read Duration and Distance), and its save path translates
 * on the way out. The summary has to be handed the same translation or it
 * reads a 12-minute walk as 720 reps and 1600 lbs — which is exactly how the
 * `0 × 0` chips and the nonsense volume got on screen in the first place.
 */
export function summarySetsFromLiveInputs(
  exercises: SummaryExercise[],
  setsByExercise: LiveInputSet[][],
): SummarySet[][] {
  return (exercises ?? []).map((exercise, exIdx) => {
    const t = normalizeTracking(exercise?.trackingType)
    const timed = tracksTime(t)
    return (setsByExercise?.[exIdx] ?? []).map((set) => ({
      reps: timed ? '' : set.reps,
      weight: timed ? '' : set.weight,
      duration: timed ? set.reps : '',
      distance: t === 'time_distance' ? set.weight : '',
      speed: set.speed ?? '',
      completed: set.completed,
    }))
  })
}

export interface SummaryTotals {
  /** Every completed set, skips included — what the count tile shows. */
  totalSets: number
  /** weight × reps over LOADED work only. Cardio adds nothing. */
  totalVolume: number
  /** Seconds of logged timed work (not wall-clock session time). */
  totalWorkSeconds: number
  /** Meters logged by distance-tracked work. */
  totalMeters: number
  /** Floors logged by stair machines, which do not measure meters. */
  totalFloors: number
  /** Was any load moved? Decides whether a volume tile means anything. */
  hasLoadedWork: boolean
  /** Was any time logged against an exercise? */
  hasTimedWork: boolean
  /** "Sets" or "Rounds" — the word for what this session counted. */
  countLabel: string
}

/**
 * The session's numbers, read per exercise so each one is measured on what it
 * tracks. Volume deliberately ignores timed work: a 12-minute walk at 3 mph is
 * not 2160 lbs of volume, and showing it as such was the loudest half of this
 * bug.
 */
export function summaryTotals(
  exercises: SummaryExercise[],
  setsByExercise: SummarySet[][],
): SummaryTotals {
  let totalSets = 0
  let totalVolume = 0
  let totalWorkSeconds = 0
  let totalMeters = 0
  let totalFloors = 0
  let hasLoadedWork = false
  let hasTimedWork = false
  let workedExercises = 0
  let timedWorkedExercises = 0

  ;(exercises ?? []).forEach((exercise, exIdx) => {
    const timed = tracksTime(exercise?.trackingType)
    const sets = setsByExercise?.[exIdx] ?? []
    let didWork = false
    for (const set of sets) {
      if (!set?.completed) continue
      totalSets += 1
      didWork = true
      const m = measuresOf(set)
      if (!timed && m.weight > 0 && m.reps > 0) {
        totalVolume += m.weight * m.reps
        hasLoadedWork = true
      }
      if (m.duration > 0) {
        totalWorkSeconds += m.duration
        hasTimedWork = true
      }
      if (m.distance > 0) {
        if (isFloorsExercise(exercise?.name)) totalFloors += m.distance
        else totalMeters += m.distance
      }
    }
    if (didWork) {
      workedExercises += 1
      if (timed) timedWorkedExercises += 1
    }
  })

  // "Rounds" only when EVERY exercise that was worked is timed — a session
  // with one plank in it still counted sets.
  const allTimed = workedExercises > 0 && timedWorkedExercises === workedExercises
  return {
    totalSets,
    totalVolume: Math.round(totalVolume),
    totalWorkSeconds,
    totalMeters,
    totalFloors,
    hasLoadedWork,
    hasTimedWork,
    countLabel: allTimed ? 'Rounds' : 'Sets',
  }
}

export type SummaryTileKey = 'count' | 'volume' | 'time' | 'distance'

export interface SummaryTile {
  key: SummaryTileKey
  value: string
  label: string
}

/** How many metric tiles sit beside the count tile. */
const MAX_METRIC_TILES = 2

/**
 * The stat tiles this session earned: always the count, then up to two of the
 * metrics it actually produced, in order of how much they say about the work.
 * A cardio-only session gets time and distance where a lifting session gets
 * volume; neither is shown a tile that would read `0`.
 */
export function summaryMetricTiles(
  exercises: SummaryExercise[],
  setsByExercise: SummarySet[][],
): SummaryTile[] {
  const t = summaryTotals(exercises, setsByExercise)
  const tiles: SummaryTile[] = [
    { key: 'count', value: String(t.totalSets), label: t.countLabel },
  ]
  const metrics: SummaryTile[] = []
  if (t.hasLoadedWork) {
    metrics.push({ key: 'volume', value: t.totalVolume.toLocaleString(), label: 'Volume lbs' })
  }
  if (t.hasTimedWork) {
    metrics.push({ key: 'time', value: formatDurationSec(t.totalWorkSeconds), label: 'Work time' })
  }
  if (t.totalMeters > 0) {
    metrics.push({ key: 'distance', value: trimNumber(t.totalMeters), label: 'Distance m' })
  } else if (t.totalFloors > 0) {
    metrics.push({ key: 'distance', value: trimNumber(t.totalFloors), label: 'Floors' })
  }
  // Nothing measurable at all (an all-`none` session, or everything skipped):
  // keep the volume tile so the row does not collapse to two cards.
  if (metrics.length === 0) {
    metrics.push({ key: 'volume', value: t.totalVolume.toLocaleString(), label: 'Volume lbs' })
  }
  return [...tiles, ...metrics.slice(0, MAX_METRIC_TILES)]
}

export interface SummaryPR {
  name: string
  bestLabel: string
  prevLabel: string
}

/**
 * New records: each exercise's best set of the session, beaten against the
 * PREVIOUS session (`exerciseHistory`, keyed by exercise name).
 *
 * Which dimension counts depends on what the exercise tracks. Loaded and
 * counted work compares weight then reps, as it always has. Timed work
 * compares DURATION — it used to be compared on a weight of 0 against a
 * history weight of 0, so a member who held a plank twice as long was told
 * nothing. No history, or no work done, is never a record.
 */
export function computeSummaryPRs(
  exercises: SummaryExercise[],
  setsByExercise: SummarySet[][],
  exerciseHistory: Record<string, SummaryHistoryEntry>,
): SummaryPR[] {
  const out: SummaryPR[] = []
  ;(exercises ?? []).forEach((exercise, exIdx) => {
    const sets = setsByExercise?.[exIdx] ?? []
    const active = sets.filter((s) => isActiveSummarySet(s, exercise?.trackingType))
    const history = exerciseHistory?.[exercise?.name]
    const first = active[0]
    if (!history || !first) return

    if (tracksTime(exercise.trackingType)) {
      let best = first
      for (const s of active) {
        const b = measuresOf(best)
        const c = measuresOf(s)
        if (c.duration > b.duration || (c.duration === b.duration && c.distance > b.distance)) best = s
      }
      const prev = history.duration ?? 0
      if (measuresOf(best).duration > prev) {
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
      const b = measuresOf(best)
      const c = measuresOf(s)
      if (c.weight > b.weight || (c.weight === b.weight && c.reps > b.reps)) best = s
    }
    const m = measuresOf(best)
    if (m.weight > history.weight || (m.weight === history.weight && m.reps > history.reps)) {
      out.push({
        name: exercise.name,
        bestLabel: m.weight > 0 ? `${trimNumber(m.weight)} × ${trimNumber(m.reps)}` : `${trimNumber(m.reps)} reps`,
        prevLabel: history.weight > 0 ? `${history.weight} × ${history.reps}` : `${history.reps} reps`,
      })
    }
  })
  return out
}

/** The word a group of this kind goes by on screen. */
const GROUP_KIND_LABELS: Record<string, string> = {
  superset: 'Superset',
  circuit: 'Circuit',
  triset: 'Triset',
  giant_set: 'Giant set',
  emom: 'EMOM',
  amrap: 'AMRAP',
}

/**
 * What to call a group. An explicit `groupLabel` written by the coach wins;
 * otherwise the kind decides. A group with no kind at all reads "Superset",
 * which is what every other surface already assumes (see the Track view's
 * `GROUP_STYLES[groupType || 'superset']`).
 */
export function summaryGroupLabel(kind?: string | null, groupLabel?: string | null): string {
  const explicit = (groupLabel ?? '').trim()
  if (explicit) return explicit
  const k = (kind ?? '').trim().toLowerCase()
  if (!k) return GROUP_KIND_LABELS.superset
  const known = GROUP_KIND_LABELS[k]
  if (known) return known
  const words = k.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface SummaryGroupMember {
  exercise: SummaryExercise
  /** Index into the flat `exercises` / `setsByExercise` arrays. */
  index: number
}

export interface SummaryGroupBlock {
  /** null for an exercise that ran on its own. */
  groupId: string | null
  /** 'circuit' | 'superset' | … — null when it ran on its own. */
  kind: string | null
  /** 'Circuit' / 'Superset' — null when it ran on its own. */
  label: string | null
  /** How many times through the block, when that is known. */
  rounds: number | null
  members: SummaryGroupMember[]
}

/**
 * The session's shape: consecutive exercises sharing a `groupId` collapse into
 * one block, everything else stands alone — the same adjacency rule as
 * `groupExercises` in lib/workoutUtils, so the summary draws the circuit the
 * live and track views ran.
 *
 * A "group" of one is not a group (the Track view says the same), so a
 * leftover groupId after an ungroup does not badge a lone exercise a superset.
 */
export function summaryGroupBlocks(
  exercises: SummaryExercise[],
  setsByExercise?: SummarySet[][],
): SummaryGroupBlock[] {
  const list = exercises ?? []
  const blocks: SummaryGroupBlock[] = []
  let i = 0
  while (i < list.length) {
    const head = list[i]
    const groupId = (head?.groupId ?? '').trim()
    if (!groupId) {
      blocks.push({ groupId: null, kind: null, label: null, rounds: null, members: [{ exercise: head, index: i }] })
      i += 1
      continue
    }
    const members: SummaryGroupMember[] = []
    while (i < list.length && (list[i]?.groupId ?? '').trim() === groupId) {
      members.push({ exercise: list[i], index: i })
      i += 1
    }
    if (members.length < 2) {
      blocks.push({ groupId: null, kind: null, label: null, rounds: null, members })
      continue
    }
    const prescribed = Number(head?.groupRounds ?? 0)
    const logged = members.reduce((n, m) => Math.max(n, (setsByExercise?.[m.index] ?? []).length), 0)
    const rounds = prescribed > 0 ? Math.floor(prescribed) : logged > 0 ? logged : null
    blocks.push({
      groupId,
      kind: (head?.groupType ?? '').trim() || 'superset',
      label: summaryGroupLabel(head?.groupType, head?.groupLabel),
      rounds,
      members,
    })
  }
  return blocks
}
