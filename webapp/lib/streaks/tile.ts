/**
 * What the dashboard's streak tile shows — pure.
 *
 * The tile used to show one number (the overall day streak). A member running
 * a super streak has earned something rarer than that, so the tile leads with
 * it, and every streak worth showing becomes a page you can swipe through.
 *
 * Only streaks that have reached STREAK_VISIBLE_MIN get a page (one day is not
 * a streak); the overall day streak always has one, so the tile is never empty.
 */

import { STREAK_VISIBLE_MIN } from '@/lib/streaks/pillars'

export type StreakPageId = 'super' | 'overall' | 'workout' | 'nutrition' | 'mindset'

export interface StreaksLite {
  overall: { current: number; best: number; nextMilestone: number | null; activeToday: boolean; freezes: number }
  pillars: {
    workout: { unit: 'days' | 'weeks'; current: number; best: number; thisWeek: number; target: number | null; remainingThisWeek?: number; weekLost: boolean }
    nutrition: { current: number; best: number; activeToday: boolean }
    mindset: { current: number; best: number; activeToday: boolean }
    super: { current: number; best: number; activeToday: boolean; today: { nutrition: boolean; mindset: boolean; trained: boolean; restDay: boolean; weekOnTrack: boolean } }
  }
}

export interface StreakPage {
  id: StreakPageId
  /** Short label for the tile (the icon and colour carry the rest). */
  label: string
  /** Full name, for screen readers and the dot buttons. */
  fullLabel: string
  /** The number, already formatted ("9", "Building"). */
  value: string
  /** Unit word shown after the value, when there is one. */
  unit?: string
  /** Footer line under the bar. */
  footer: string
  /** 0–100 for the bar. */
  pct: number
  /** True when the streak is alive and complete for today. */
  doneToday: boolean
  /** The super streak gets the pulsing treatment. */
  emphasis: boolean
}

/** What today still needs for the super streak to survive. */
export function superMissing(s: StreaksLite): Array<'food' | 'mindset' | 'training'> {
  const t = s.pillars.super.today
  const out: Array<'food' | 'mindset' | 'training'> = []
  if (!t.nutrition) out.push('food')
  if (!t.mindset) out.push('mindset')
  if (!t.trained) out.push('training')
  return out
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const MISSING_LABEL: Record<'food' | 'mindset' | 'training', string> = {
  food: 'log food', mindset: 'check in', training: 'train',
}

/** The pages, in the order they are shown. Super first when it exists. */
export function streakPages(s: StreaksLite | null): StreakPage[] {
  if (!s) return []
  const pages: StreakPage[] = []
  const sup = s.pillars.super

  if (sup.current >= STREAK_VISIBLE_MIN) {
    const missing = superMissing(s)
    pages.push({
      id: 'super',
      label: 'Super Streak', fullLabel: 'Super streak',
      value: String(sup.current),
      unit: sup.current === 1 ? 'day' : 'days',
      // The tile can be half a phone wide: the record only earns its place
      // once it is actually a record to chase.
      footer: sup.activeToday
        ? sup.best > sup.current ? `All three · best ${sup.best}` : 'All three today'
        : missing.length === 0
          ? `Best ${sup.best}`
          : `Today: ${list(missing.map(m => MISSING_LABEL[m]))}`,
      pct: sup.best > 0 ? Math.min(100, Math.round((sup.current / Math.max(sup.best, sup.current)) * 100)) : 100,
      doneToday: sup.activeToday,
      emphasis: true,
    })
  }

  const days = s.overall.current
  const visible = days >= STREAK_VISIBLE_MIN
  const next = s.overall.nextMilestone
  const prevMilestone = next ? Math.max(0, next - 7) : 0
  pages.push({
    id: 'overall',
    label: 'Day Streak', fullLabel: 'Day streak',
    value: visible ? String(days) : 'Building',
    unit: visible ? (days === 1 ? 'day' : 'days') : undefined,
    footer: visible
      ? next ? `${next - days}d to ${next}-day 🏆` : 'Every milestone reached'
      : `${days}/${STREAK_VISIBLE_MIN} · ${STREAK_VISIBLE_MIN - days} more ${STREAK_VISIBLE_MIN - days === 1 ? 'day' : 'days'}`,
    pct: visible
      ? next ? Math.min(100, Math.round(((days - prevMilestone) / Math.max(1, next - prevMilestone)) * 100)) : 100
      : Math.round((Math.min(days, STREAK_VISIBLE_MIN) / STREAK_VISIBLE_MIN) * 100),
    doneToday: s.overall.activeToday,
    emphasis: false,
  })

  const w = s.pillars.workout
  if (w.current >= STREAK_VISIBLE_MIN && w.target) {
    pages.push({
      id: 'workout',
      label: 'Workout', fullLabel: 'Workout streak',
      value: String(w.current),
      unit: w.current === 1 ? 'day' : 'days',
      footer: `This week ${w.thisWeek}/${w.target}${w.weekLost ? ' · off track' : ''}`,
      pct: w.target ? Math.min(100, Math.round((w.thisWeek / w.target) * 100)) : 100,
      doneToday: !w.weekLost,
      emphasis: false,
    })
  }
  const n = s.pillars.nutrition
  if (n.current >= STREAK_VISIBLE_MIN) {
    pages.push({ id: 'nutrition', label: 'Nutrition', fullLabel: 'Nutrition streak', value: String(n.current), unit: n.current === 1 ? 'day' : 'days', footer: n.activeToday ? `Logged today · best ${n.best}` : 'Log a meal to keep it', pct: Math.min(100, Math.round((n.current / Math.max(n.best, n.current)) * 100)), doneToday: n.activeToday, emphasis: false })
  }
  const m = s.pillars.mindset
  if (m.current >= STREAK_VISIBLE_MIN) {
    pages.push({ id: 'mindset', label: 'Mindset', fullLabel: 'Mindset streak', value: String(m.current), unit: m.current === 1 ? 'day' : 'days', footer: m.activeToday ? `Checked in today · best ${m.best}` : 'Check in to keep it', pct: Math.min(100, Math.round((m.current / Math.max(m.best, m.current)) * 100)), doneToday: m.activeToday, emphasis: false })
  }
  return pages
}

/** Evening window for the "your super streak needs X" push. */
export const SUPER_AT_RISK_START_HOUR = 16
export const SUPER_AT_RISK_END_HOUR = 21

export interface SuperRisk {
  atRisk: boolean
  missing: Array<'food' | 'mindset' | 'training'>
  title: string
  body: string
}

/**
 * Is a super streak about to be lost today, and what would save it?
 *
 * Only for streaks long enough to be worth protecting, only when today is not
 * already complete, and only inside the evening window — early enough that
 * there is still time to act.
 */
export function superAtRisk(s: StreaksLite | null, localHour: number): SuperRisk {
  const none: SuperRisk = { atRisk: false, missing: [], title: '', body: '' }
  if (!s) return none
  const sup = s.pillars.super
  if (sup.current < STREAK_VISIBLE_MIN) return none
  if (sup.activeToday) return none
  if (localHour < SUPER_AT_RISK_START_HOUR || localHour > SUPER_AT_RISK_END_HOUR) return none
  const missing = superMissing(s)
  if (missing.length === 0) return none
  return {
    atRisk: true,
    missing,
    title: `Your ${sup.current}-day super streak needs you ✨`,
    body: missing.length === 1
      ? `Just ${MISSING_LABEL[missing[0]]} today and it survives.`
      : `${list(missing.map(m => MISSING_LABEL[m]))} today and it survives.`,
  }
}
