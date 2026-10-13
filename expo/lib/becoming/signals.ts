/**
 * What a Becoming card should actually SAY about a week — pure logic ported for native.
 */

import { shiftDay } from '@become/core/training/streaks/pillars'
import type {
  CardPillar,
  Fact,
  Highlight,
  MindMode,
  Nudge,
  WeekSignals,
  WeekSnapshot,
} from './types'

export const RECENT_WEEKS = 4

export const PILLAR_ORDER: CardPillar[] = ['training', 'fuel', 'mind']

export const PILLAR_LABEL: Record<CardPillar, string> = {
  training: 'Training',
  fuel: 'Fuel',
  mind: 'Mind',
}

export const PILLAR_HREF: Record<CardPillar, string> = {
  training: '/dashboard/workout',
  fuel: '/dashboard/nutrition',
  mind: '/dashboard/mind',
}

export const MAX_HIGHLIGHTS = 3
export const RECORD_MIN_WEEKS = 4

export interface SignalOptions {
  unit?: 'lbs' | 'kg'
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

export function pillarCount(w: WeekSnapshot, pillar: CardPillar, through = 7, mode: MindMode = 'sessions'): number {
  const days = w.days.slice(0, Math.max(0, Math.min(7, through)))
  if (pillar === 'training') return days.reduce((n, d) => n + d.workoutCount, 0)
  if (pillar === 'fuel') return days.filter(d => d.food).length
  return days.filter(d => (mode === 'sessions' ? d.mindSession : d.mind)).length
}

export function activeDays(w: WeekSnapshot, through = 7): number {
  return w.days.slice(0, Math.max(0, Math.min(7, through))).filter(d => d.workout || d.food || d.mind).length
}

export function mindMode(weeks: WeekSnapshot[], index: number): MindMode | null {
  return weeks[index]?.uses.mindMode ?? null
}

export function isPillarActive(weeks: WeekSnapshot[], index: number, pillar: CardPillar): boolean {
  return weeks[index]?.uses[pillar] ?? false
}

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

function weeksBetween(fromKey: string, toKey: string): number {
  let n = 0
  for (let k = fromKey; k < toKey && n < 1000; k = shiftDay(k, 7)) n++
  return n
}

function recordFlag(weeks: WeekSnapshot[], index: number, n: number, count: (w: WeekSnapshot) => number): string | null {
  if (n <= 0 || index <= 0) return null
  const w = weeks[index]
  if (!w) return null
  const first = weeks[0]
  if (!first) return null
  for (let i = index - 1; i >= 0; i--) {
    const wi = weeks[i]
    if (wi && count(wi) >= n) {
      const back = weeksBetween(wi.weekKey, w.weekKey)
      return back >= RECORD_MIN_WEEKS ? `most in ${back} weeks` : null
    }
  }
  return weeksBetween(first.weekKey, w.weekKey) >= RECORD_MIN_WEEKS - 1 ? 'best week yet' : null
}

const rise = (delta: number | null) => (delta == null || delta === 0 ? 0 : delta > 0 ? Math.min(3, delta) * 5 : -5)

function candidates(weeks: WeekSnapshot[], index: number, through: number, opts: Required<SignalOptions>): Highlight[] {
  const w = weeks[index]
  if (!w) return []
  const prev = index > 0 ? (weeks[index - 1] ?? null) : null
  const out: Highlight[] = []
  const add = (h: Omit<Highlight, 'of' | 'unit' | 'flag' | 'delta' | 'change'> & Partial<Pick<Highlight, 'of' | 'unit' | 'flag' | 'delta'>>) =>
    out.push({ of: null, unit: null, flag: null, delta: null, change: false, ...h })
  const moved = (now: number, count: (x: WeekSnapshot) => number) => (prev ? now - count(prev) : null)
  const unitWord = opts.unit

  // Training
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

  // Fuel
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

  // Mind
  const sessions = pillarCount(w, 'mind', through, 'sessions')
  if (sessions > 0) {
    const record = recordFlag(weeks, index, sessions, x => pillarCount(x, 'mind', 7, 'sessions'))
    const delta = moved(sessions, x => pillarCount(x, 'mind', through, 'sessions'))
    add({ kind: 'sessions', pillar: 'mind', value: String(sessions), label: `Mind ${plural(sessions, 'session')}`, flag: record, delta, weight: 45 + (record ? 20 : 0) + rise(delta) })
  } else {
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

  // Habit across app
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

const CHANGE_NOUN: Partial<Record<Fact, (n: number) => string>> = {
  workouts: n => plural(n, 'workout'),
  logging: n => (n === 1 ? 'day logged' : 'days logged'),
  sessions: n => `Mind ${plural(n, 'session')}`,
  checkins: n => plural(n, 'check-in'),
  active: n => (n === 1 ? 'day active' : 'days active'),
}

function asChange(h: Highlight): Highlight | null {
  const noun = CHANGE_NOUN[h.kind]
  if (!noun || h.delta == null || h.delta === 0) return null
  const d = h.delta
  return {
    ...h,
    value: `${d > 0 ? '+' : '−'}${Math.abs(d)}`, of: null, unit: null,
    label: `${noun(Math.abs(d))} vs last week`,
    flag: h.flag === 'target hit' ? null : h.flag,
    delta: null, change: true,
    weight: h.weight - 15,
  }
}

const KIND_ORDER: Fact[] = ['prs', 'chapter', 'workouts', 'weight', 'logging', 'sessions', 'checkins', 'active', 'protein', 'state']

export function weekSignals(weeks: WeekSnapshot[], index: number, options: SignalOptions | 'lbs' | 'kg' = {}): WeekSignals {
  const opts: Required<SignalOptions> = typeof options === 'string'
    ? { unit: options, direction: null }
    : { unit: options.unit ?? 'lbs', direction: options.direction ?? null }
  const w = weeks[index]
  if (!w) return EMPTY
  if (w.gap) return EMPTY

  const through = w.isCurrent ? Math.max(1, Math.min(7, w.daysElapsed)) : 7
  const active = PILLAR_ORDER.filter(p => isPillarActive(weeks, index, p))

  const said = new Set<Fact>(w.said ?? [])
  const highlights = candidates(weeks, index, through, opts)
    .map(h => (said.has(h.kind) ? asChange(h) : h))
    .filter((h): h is Highlight => h != null)
    .sort((a, b) => b.weight - a.weight || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, MAX_HIGHLIGHTS)

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

export function journeySignals(weeks: WeekSnapshot[], options: SignalOptions | 'lbs' | 'kg' = {}): WeekSignals[] {
  return weeks.map((_, i) => weekSignals(weeks, i, options))
}
