/**
 * What a Becoming card should actually SAY about a week — pure.
 *
 * The card has been rebuilt twice for the same complaint. First it printed all
 * three pillars as seven Sun→Sat dots plus a count ("Training 1/5" beside
 * seven dots). Then the dots went, but it still printed a fixed table of
 * pillar rows — so a member who did two Mind sessions last week read
 * "Mind · 0 sessions" this week, and every card had the same shape whatever
 * the week had been about. Swapping dots for text did not fix that.
 *
 * So a card no longer has rows. It has HIGHLIGHTS: the few facts about this
 * member's week that are worth reading, each one a thing they actually did,
 * ranked by how much it says —
 *
 *   • a record beats a count, and a count that moved beats one that held
 *   • a zero is never a highlight. Nothing they did not do gets a line; the
 *     one place a quiet pillar is mentioned is the small invitation on the
 *     live week
 *   • nothing the headline already said is said again underneath it
 *
 * — so a PR week leads with the lift, a logging streak leads with the streak,
 * and a week that was only two Mind sessions shows two Mind sessions and
 * nothing else. The shape follows the week.
 *
 * Everything here is derived from the week snapshots the journey already
 * builds — no new data, no new query.
 */

import { shiftDay } from '@/lib/streaks/pillars'
import type { Fact, WeekSnapshot } from '@/lib/becoming/weeks'

// One definition of "is this member using X", computed once in buildWeeks over
// the raw week sequence and carried on the snapshot. Recomputing it here would
// read a DIFFERENT window, because a collapsed "away" card stands for several
// calendar weeks at one index.
export { RECENT_WEEKS } from '@/lib/becoming/weeks'

export type CardPillar = 'training' | 'fuel' | 'mind'

/**
 * Workouts, then nutrition, then mindset — the order the coach asked for, used
 * to break ties on the card and in the Details tabs.
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
 * member who only ever taps the daily check-in is still using Mind.
 */
export type MindMode = 'sessions' | 'checkins'

/** At most this many highlights on one card: a lead and two behind it. */
export const MAX_HIGHLIGHTS = 3

/**
 * How far back a count has to reach before "most in N weeks" is worth saying.
 * Beating the last two weeks is ordinary; beating the last four is a change.
 */
export const RECORD_MIN_WEEKS = 4

export interface Highlight {
  kind: Fact
  pillar: CardPillar | 'all'
  /** The number (or word) that matters — drawn large. */
  value: string
  /** Denominator, drawn small after the value: "/5", "/7". */
  of: string | null
  /** Unit, drawn small after the value: "lbs". */
  unit: string | null
  /** What the value is, in words. */
  label: string
  /** The reason it earned a place: "best week yet", "target hit", "every day". */
  flag: string | null
  /**
   * Change against the same stretch of the week before: positive is more.
   * `null` when there is nothing fair to compare against.
   */
  delta: number | null
  /**
   * The value IS the change ("+1", "−2"). Used when the headline already
   * stated the count: repeating "2/5 workouts" under "2 down, 3 to go" says
   * nothing, but how that moved against last week is still news.
   */
  change: boolean
  /** How much it says. Only used to rank, never shown. */
  weight: number
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
  /** Ranked, most telling first. Never a zero. */
  highlights: Highlight[]
  /** At most one, and only on the live week. */
  nudge: Nudge | null
  /** True when a highlight shows a change (a chip, or a change as its value) — the card then names what it is against. */
  hasDeltas: boolean
}

export interface SignalOptions {
  unit?: 'lbs' | 'kg'
  /** The member's weight goal, so a scale move can be called the right way. */
  direction?: 'lose' | 'maintain' | 'gain' | null
}

const STATE_WORD: Record<string, string> = {
  stressed: 'Stressed',
  distracted: 'Distracted',
  low_energy: 'Low energy',
  locked_in: 'Locked in',
}

const EMPTY: WeekSignals = { active: [], highlights: [], nudge: null, hasDeltas: false }

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`

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

/** Days with anything at all on them — the habit, across the whole app. */
export function activeDays(w: WeekSnapshot, through = 7): number {
  return w.days.slice(0, Math.max(0, Math.min(7, through))).filter(d => d.workout || d.food || d.mind).length
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

/** Whole calendar weeks between two Sunday week keys. */
function weeksBetween(fromKey: string, toKey: string): number {
  let n = 0
  for (let k = fromKey; k < toKey && n < 1000; k = shiftDay(k, 7)) n++
  return n
}

/**
 * Is `n` a record for this member? Measured in CALENDAR weeks from the week
 * keys, because a collapsed "away" card is several weeks at one index.
 *
 * Earlier weeks are counted whole. On the live week that is still fair: a
 * partial week that has already passed every full week before it is a record
 * however the rest of it goes.
 */
function recordFlag(weeks: WeekSnapshot[], index: number, n: number, count: (w: WeekSnapshot) => number): string | null {
  if (n <= 0 || index <= 0) return null
  const w = weeks[index]
  for (let i = index - 1; i >= 0; i--) {
    if (count(weeks[i]) >= n) {
      const back = weeksBetween(weeks[i].weekKey, w.weekKey)
      return back >= RECORD_MIN_WEEKS ? `most in ${back} weeks` : null
    }
  }
  // Nothing before it reached this. Only worth saying once there is a history
  // to beat — "best week yet" in week two is just week two.
  return weeksBetween(weeks[0].weekKey, w.weekKey) >= RECORD_MIN_WEEKS - 1 ? 'best week yet' : null
}

/**
 * A rising count reads as more important than a level one, up to a point, and
 * a falling one a little less — so a card leads with what went right when
 * something did, and a drop is still shown, just not first.
 */
const rise = (delta: number | null) => (delta == null || delta === 0 ? 0 : delta > 0 ? Math.min(3, delta) * 5 : -5)

function candidates(weeks: WeekSnapshot[], index: number, through: number, opts: Required<SignalOptions>): Highlight[] {
  const w = weeks[index]
  const prev = index > 0 ? weeks[index - 1] : null
  const out: Highlight[] = []
  const add = (h: Omit<Highlight, 'of' | 'unit' | 'flag' | 'delta' | 'change'> & Partial<Pick<Highlight, 'of' | 'unit' | 'flag' | 'delta'>>) =>
    out.push({ of: null, unit: null, flag: null, delta: null, change: false, ...h })
  const moved = (now: number, count: (x: WeekSnapshot) => number) => (prev ? now - count(prev) : null)
  const unitWord = opts.unit

  // ── Training ──
  const workouts = pillarCount(w, 'training', through)
  if (workouts > 0) {
    const target = w.training.target && w.training.target > 0 ? w.training.target : null
    const hit = !!target && w.training.workouts >= target
    const record = recordFlag(weeks, index, workouts, x => pillarCount(x, 'training'))
    const delta = moved(workouts, x => pillarCount(x, 'training', through))
    add({
      kind: 'workouts', pillar: 'training',
      value: String(workouts), of: target ? `/${target}` : null,
      label: plural(target ?? workouts, 'workout'),
      flag: hit ? 'target hit' : record, delta,
      weight: 50 + (hit ? 25 : 0) + (record ? 20 : 0) + rise(delta),
    })
  }
  const prs = w.training.prs
  if (w.training.prCount === 1 && prs[0]) {
    add({ kind: 'prs', pillar: 'training', value: String(prs[0].e1RM), unit: unitWord, label: `${prs[0].name} · new best`, weight: 90 })
  } else if (w.training.prCount > 1) {
    const names = prs.slice(0, 2).map(p => p.name).join(', ')
    add({ kind: 'prs', pillar: 'training', value: String(w.training.prCount), label: `PRs · ${names}${w.training.prCount > 2 ? '…' : ''}`, weight: 95 })
  }

  // ── Fuel ──
  const logged = pillarCount(w, 'fuel', through)
  if (logged > 0) {
    const everyDay = logged === through && through >= 3
    const record = recordFlag(weeks, index, logged, x => pillarCount(x, 'fuel'))
    const delta = moved(logged, x => pillarCount(x, 'fuel', through))
    add({
      kind: 'logging', pillar: 'fuel',
      value: String(logged), of: `/${through}`, label: 'days logged',
      flag: everyDay ? 'every day' : record, delta,
      weight: 45 + (everyDay ? 15 : 0) + (record ? 20 : 0) + rise(delta),
    })
  }
  const protein = w.nutrition.proteinDays
  if (protein > 0 && logged > 0) {
    add({ kind: 'protein', pillar: 'fuel', value: String(protein), of: `/${w.nutrition.logDays}`, label: 'protein days', weight: protein >= 3 ? 35 : 25 })
  }
  const kg = unitWord === 'kg'
  const wd = w.nutrition.delta
  if (wd != null && Math.abs(wd) >= (kg ? 0.4 : 1)) {
    const right = (opts.direction === 'lose' && wd < 0) || (opts.direction === 'gain' && wd > 0)
    const wrong = (opts.direction === 'lose' && wd > 0) || (opts.direction === 'gain' && wd < 0)
    add({
      kind: 'weight', pillar: 'fuel',
      value: `${wd > 0 ? '+' : '−'}${Math.abs(wd).toFixed(1)}`, unit: unitWord, label: 'on the scale',
      flag: right ? 'the way you want' : null,
      weight: right ? 80 : wrong ? 40 : 50,
    })
  }

  // ── Mind ──
  const sessions = pillarCount(w, 'mind', through, 'sessions')
  if (sessions > 0) {
    const record = recordFlag(weeks, index, sessions, x => pillarCount(x, 'mind', 7, 'sessions'))
    const delta = moved(sessions, x => pillarCount(x, 'mind', through, 'sessions'))
    add({ kind: 'sessions', pillar: 'mind', value: String(sessions), label: `Mind ${plural(sessions, 'session')}`, flag: record, delta, weight: 45 + (record ? 20 : 0) + rise(delta) })
  } else {
    // No session this week, but they checked in: that is still them showing
    // up, and it is counted as what it is rather than as "0 sessions".
    const checkins = pillarCount(w, 'mind', through, 'checkins')
    if (checkins > 0) {
      const record = recordFlag(weeks, index, checkins, x => pillarCount(x, 'mind', 7, 'checkins'))
      const delta = moved(checkins, x => pillarCount(x, 'mind', through, 'checkins'))
      add({ kind: 'checkins', pillar: 'mind', value: String(checkins), label: plural(checkins, 'check-in'), flag: record, delta, weight: 30 + (record ? 10 : 0) + rise(delta) })
    }
  }
  if (w.mind.chapterUnlocked && w.mind.chapterUnlocked > 1) {
    add({ kind: 'chapter', pillar: 'mind', value: `Ch ${w.mind.chapterUnlocked}`, label: 'unlocked', weight: 88 })
  }
  if (w.mind.dominant) {
    add({ kind: 'state', pillar: 'mind', value: STATE_WORD[w.mind.dominant] ?? w.mind.dominant, label: w.isCurrent ? 'so far' : 'most of the week', weight: 20 })
  }

  // ── The habit, across the app ──
  // Only when it says something no single pillar did: two pillars on
  // different days add up to more days than either one alone.
  const days = activeDays(w, through)
  const best = Math.max(
    w.days.slice(0, through).filter(d => d.workout).length,
    logged,
    pillarCount(w, 'mind', through, 'checkins'),
  )
  if (days > best) {
    const everyDay = days === through && through >= 3
    const record = recordFlag(weeks, index, days, x => activeDays(x))
    const delta = moved(days, x => activeDays(x, through))
    add({
      kind: 'active', pillar: 'all',
      value: String(days), of: `/${through}`, label: 'days active',
      flag: everyDay ? 'every day' : record, delta,
      weight: 40 + (everyDay ? 15 : 0) + (record ? 20 : 0) + rise(delta),
    })
  }
  return out
}

/** The noun a change is counted in, for the facts that can move week to week. */
const CHANGE_NOUN: Partial<Record<Fact, (n: number) => string>> = {
  workouts: n => plural(n, 'workout'),
  logging: n => (n === 1 ? 'day logged' : 'days logged'),
  sessions: n => `Mind ${plural(n, 'session')}`,
  checkins: n => plural(n, 'check-in'),
  active: n => (n === 1 ? 'day active' : 'days active'),
}

/**
 * A fact the headline already told. If it moved, what is left to say is HOW
 * it moved, so it comes back as the change alone; if it did not move, or it is
 * not the kind of thing that moves (a PR, the scale), it is dropped.
 */
function asChange(h: Highlight): Highlight | null {
  const noun = CHANGE_NOUN[h.kind]
  if (!noun || h.delta == null || h.delta === 0) return null
  const d = h.delta
  return {
    ...h,
    value: `${d > 0 ? '+' : '−'}${Math.abs(d)}`, of: null, unit: null,
    label: `${noun(Math.abs(d))} vs last week`,
    // "target hit" is in the headline that caused this; a record is not.
    flag: h.flag === 'target hit' ? null : h.flag,
    delta: null, change: true,
    weight: h.weight - 15,
  }
}

const KIND_ORDER: Fact[] = ['prs', 'chapter', 'workouts', 'weight', 'logging', 'sessions', 'checkins', 'active', 'protein', 'state']

/**
 * The highlights and the nudge for one week.
 *
 * `weeks` is the whole journey because both halves are questions about the
 * member rather than the week: whether a count is a record depends on every
 * week before it, and whether Mind is worth an invitation depends on whether
 * they have been doing Mind lately.
 */
export function weekSignals(weeks: WeekSnapshot[], index: number, options: SignalOptions | 'lbs' | 'kg' = {}): WeekSignals {
  const opts: Required<SignalOptions> = typeof options === 'string'
    ? { unit: options, direction: null }
    : { unit: options.unit ?? 'lbs', direction: options.direction ?? null }
  const w = weeks[index]
  if (!w) return EMPTY
  // An "away" card is a collapsed run of empty weeks. It has nothing to report
  // and comparing it to anything is noise.
  if (w.gap) return EMPTY

  const through = w.isCurrent ? Math.max(1, Math.min(7, w.daysElapsed)) : 7
  const active = PILLAR_ORDER.filter(p => isPillarActive(weeks, index, p))

  const said = new Set<Fact>(w.said ?? [])
  const highlights = candidates(weeks, index, through, opts)
    .map(h => (said.has(h.kind) ? asChange(h) : h))
    .filter((h): h is Highlight => h != null)
    .sort((a, b) => b.weight - a.weight || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, MAX_HIGHLIGHTS)

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

  return { active, highlights, nudge, hasDeltas: highlights.some(h => h.change || (h.delta != null && h.delta !== 0)) }
}

/** Signals for every week in one pass — the canvas renders them all. */
export function journeySignals(weeks: WeekSnapshot[], options: SignalOptions | 'lbs' | 'kg' = {}): WeekSignals[] {
  return weeks.map((_, i) => weekSignals(weeks, i, options))
}
