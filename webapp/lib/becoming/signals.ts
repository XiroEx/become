/**
 * What a Becoming card should actually SAY about a week — pure.
 *
 * The card used to print all three pillars, always, as a row of seven Sun→Sat
 * dots plus a terse count. Two things were wrong with that:
 *
 *   • The dots and the count measured different things. "Training 1/5" beside
 *     seven dots reads as "1 of 7"; the 5 is a weekly workout target and the 7
 *     is the calendar. Nobody can hold both at once, so the row said nothing.
 *   • It was the same three rows for everybody. A member who has never opened
 *     Mind was told "0 sessions" every week for the rest of their life, which
 *     is not a fact about them — it is a fact about a feature they declined.
 *
 * So: no dots, and only the pillars a member is actually using. Each surviving
 * row carries the number that matters AND how it moved against the week
 * before, because the change is the part that is worth reading. A pillar that
 * has gone quiet gets one small invitation instead of a row of zeroes.
 *
 * Everything here is derived from the week snapshots the journey already
 * builds — no new data, no new query.
 */

import type { WeekSnapshot } from '@/lib/becoming/weeks'

// One definition of "is this member using X", computed once in buildWeeks over
// the raw week sequence and carried on the snapshot. Recomputing it here would
// read a DIFFERENT window, because a collapsed "away" card stands for several
// calendar weeks at one index.
export { RECENT_WEEKS } from '@/lib/becoming/weeks'

export type CardPillar = 'training' | 'fuel' | 'mind'

/**
 * Workouts, then nutrition, then mindset — the order the coach asked for, used
 * on the card and in the Details tabs so the app has one priority, not two.
 */
export const PILLAR_ORDER: CardPillar[] = ['training', 'fuel', 'mind']

export const PILLAR_LABEL: Record<CardPillar, string> = {
  training: 'Training',
  fuel: 'Fuel',
  mind: 'Mind',
}

/** Where a nudge sends someone who is not using a pillar. */
export const PILLAR_HREF: Record<CardPillar, string> = {
  training: '/dashboard/workout',
  fuel: '/dashboard/nutrition',
  mind: '/dashboard/mind',
}

/**
 * What Mind is reporting for this member. Sessions are the real metric, but a
 * member who only ever taps the daily check-in is still using Mind, and
 * telling them "0 sessions" is the exact complaint this module exists to fix.
 */
export type MindMode = 'sessions' | 'checkins'

export interface SignalRow {
  pillar: CardPillar
  label: string
  /** The number that matters, already worded. */
  value: string
  /** One extra fact worth a glance — a PR, a weight move, a mood. */
  note: string | null
  /**
   * Change against the same stretch of the week before: positive is more.
   * `null` when there is no earlier week to compare against.
   */
  delta: number | null
}

export interface Nudge {
  pillar: CardPillar
  /** Short, and true to whether they have ever used it. */
  label: string
  href: string
  /** They used this before and stopped, rather than never starting. */
  lapsed: boolean
}

export interface WeekSignals {
  /** Pillars in use around this week, in PILLAR_ORDER. */
  active: CardPillar[]
  rows: SignalRow[]
  /** At most one, and only on the live week. */
  nudge: Nudge | null
  /** True when any row has something to compare against. */
  hasDeltas: boolean
}

const STATE_WORD: Record<string, string> = {
  stressed: 'stressed',
  distracted: 'distracted',
  low_energy: 'low energy',
  locked_in: 'locked in',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * How much of a pillar happened in the first `through` days of a week.
 *
 * Counting from the day proofs rather than the week totals is what makes the
 * live week comparable: on Tuesday it counts the previous week's Sunday and
 * Monday only, so "2 workouts" on day 2 is not measured against a full seven
 * days and reported as a collapse.
 */
export function pillarCount(w: WeekSnapshot, pillar: CardPillar, through = 7, mode: MindMode = 'sessions'): number {
  const days = w.days.slice(0, Math.max(0, Math.min(7, through)))
  if (pillar === 'training') return days.reduce((n, d) => n + d.workoutCount, 0)
  if (pillar === 'fuel') return days.filter(d => d.food).length
  return days.filter(d => (mode === 'sessions' ? d.mindSession : d.mind)).length
}

/**
 * Which way Mind is being used around this week — or `null` when it is not
 * being used at all.
 */
export function mindMode(weeks: WeekSnapshot[], index: number): MindMode | null {
  return weeks[index]?.uses.mindMode ?? null
}

/** Is the member using this pillar around this week? */
export function isPillarActive(weeks: WeekSnapshot[], index: number, pillar: CardPillar): boolean {
  return weeks[index]?.uses[pillar] ?? false
}

/**
 * Did they ever use it, earlier on? Asked only of a pillar that is idle NOW, so
 * any hit at all before this week means they dropped it rather than never
 * having started — which is a different invitation.
 */
function usedBefore(weeks: WeekSnapshot[], index: number, pillar: CardPillar): boolean {
  return weeks.slice(0, index).some(w => pillarCount(w, pillar) > 0 || (pillar === 'mind' && pillarCount(w, 'mind', 7, 'checkins') > 0))
}

const NUDGE_NEW: Record<CardPillar, string> = {
  training: 'Log a workout',
  fuel: 'Log a meal',
  mind: 'Try a Mind session',
}
const NUDGE_LAPSED: Record<CardPillar, string> = {
  training: 'Get back to training',
  fuel: 'Start logging food again',
  mind: 'Pick Mind back up',
}

function trainingRow(w: WeekSnapshot, prev: WeekSnapshot | null, through: number): SignalRow {
  const now = pillarCount(w, 'training', through)
  const target = w.training.target && w.training.target > 0 ? w.training.target : null
  return {
    pillar: 'training',
    label: PILLAR_LABEL.training,
    value: target ? `${now} of ${target} workouts` : plural(now, 'workout'),
    note: w.training.prCount > 0 ? plural(w.training.prCount, 'PR') : null,
    delta: prev ? now - pillarCount(prev, 'training', through) : null,
  }
}

function fuelRow(w: WeekSnapshot, prev: WeekSnapshot | null, through: number, unit: 'lbs' | 'kg'): SignalRow {
  const now = pillarCount(w, 'fuel', through)
  const d = w.nutrition.delta
  return {
    pillar: 'fuel',
    label: PILLAR_LABEL.fuel,
    value: `${now} of ${through} days`,
    note: d != null && d !== 0 ? `${d > 0 ? '+' : ''}${d.toFixed(1)} ${unit}` : null,
    delta: prev ? now - pillarCount(prev, 'fuel', through) : null,
  }
}

function mindRow(w: WeekSnapshot, prev: WeekSnapshot | null, through: number, mode: MindMode): SignalRow {
  const now = pillarCount(w, 'mind', through, mode)
  return {
    pillar: 'mind',
    label: PILLAR_LABEL.mind,
    value: mode === 'sessions' ? plural(now, 'session') : plural(now, 'check-in'),
    note: w.mind.dominant ? STATE_WORD[w.mind.dominant] ?? null : null,
    delta: prev ? now - pillarCount(prev, 'mind', through, mode) : null,
  }
}

/**
 * The rows and the nudge for one week.
 *
 * `weeks` is the whole journey because relevance is a question about the
 * member, not about a single week: whether Mind belongs on this card depends
 * on whether they have been doing Mind lately, which the week itself cannot
 * know.
 */
export function weekSignals(weeks: WeekSnapshot[], index: number, unit: 'lbs' | 'kg' = 'lbs'): WeekSignals {
  const w = weeks[index]
  if (!w) return { active: [], rows: [], nudge: null, hasDeltas: false }
  // An "away" card is a collapsed run of empty weeks. It has nothing to report
  // and comparing it to anything is noise.
  if (w.gap) return { active: [], rows: [], nudge: null, hasDeltas: false }

  const through = w.isCurrent ? Math.max(1, Math.min(7, w.daysElapsed)) : 7
  // An "away" card sitting behind this one carries the day proofs of an empty
  // week, so comparing against it reports "you were away, and now you are
  // back" — which is the change most worth reading.
  const prev = index > 0 ? weeks[index - 1] : null
  const mode = mindMode(weeks, index)

  const active = PILLAR_ORDER.filter(p => isPillarActive(weeks, index, p))
  const rows: SignalRow[] = active.map(p => {
    if (p === 'training') return trainingRow(w, prev, through)
    if (p === 'fuel') return fuelRow(w, prev, through, unit)
    return mindRow(w, prev, through, mode ?? 'sessions')
  })

  // One invitation, on the live week only — a card about August cannot be
  // acted on, and three nudges is a nag rather than a suggestion.
  let nudge: Nudge | null = null
  if (w.isCurrent) {
    const idle = PILLAR_ORDER.find(p => !active.includes(p))
    if (idle) {
      const lapsed = usedBefore(weeks, index, idle)
      nudge = { pillar: idle, label: lapsed ? NUDGE_LAPSED[idle] : NUDGE_NEW[idle], href: PILLAR_HREF[idle], lapsed }
    }
  }

  return { active, rows, nudge, hasDeltas: rows.some(r => r.delta != null) }
}

/** Signals for every week in one pass — the canvas renders them all. */
export function journeySignals(weeks: WeekSnapshot[], unit: 'lbs' | 'kg' = 'lbs'): WeekSignals[] {
  return weeks.map((_, i) => weekSignals(weeks, i, unit))
}
