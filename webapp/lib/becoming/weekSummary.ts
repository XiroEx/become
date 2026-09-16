/**
 * "What am I actually doing this week, and what should I do next?" — pure.
 *
 * The Details sheet opens on Story, and Story used to open on the evidence
 * wall: a long list of quotes, then a long list of weeks. Both are history.
 * Neither answers the question someone presses Details to ask, which is what
 * this week adds up to across the whole app and what to do about it.
 *
 * So Story now leads with a summary of the live week — training, fuel, mind
 * and what got banked, in one read — followed by the goal suggestions that
 * already exist per pillar (the same rules the nudge cron sends, so the page
 * and the notification never disagree).
 *
 * Two rules carried over from the card (lib/becoming/signals):
 *
 *   • a pillar this member does not use is never mentioned, so nobody is told
 *     "0 Mind sessions" about a feature they declined;
 *   • a pillar they DO use is reported even when it is empty — "no workouts
 *     yet" is the honest line, and it is the one the recommendation answers.
 *
 * Everything here is derived from the week snapshot the journey already
 * builds plus the reads /api/goals already returns. No new data, no new query.
 */

import { STATE_WORD, type WeekSnapshot } from '@/lib/becoming/weeks'
import { PILLAR_ORDER, type CardPillar } from '@/lib/becoming/signals'
import { formatVolume, formatWorkTime, type WeekTrainingMetrics } from '@/lib/becoming/weekTraining'
import type { Severity, Suggestion } from '@/lib/goals/suggestions'

/** The pillars, plus the line for what the member banked — wins and the streak. */
export type SummaryPillar = CardPillar | 'you'

export interface SummaryLine {
  pillar: SummaryPillar
  /** Row label: "Training", "Fuel", "Mind", "You". */
  label: string
  /** Short phrases, already written, joined by the UI. Never empty. */
  facts: string[]
}

export interface WeekSummary {
  /** Which week this is about: "Sep 14–20". */
  label: string
  /** It is the week in progress — the UI says "this week" rather than naming it twice. */
  live: boolean
  /** The week's own story line — the same one the stage card carries. */
  headline: string
  sub: string
  lines: SummaryLine[]
  /** Nothing has been logged in this week at all. */
  quiet: boolean
  /** What to do next, most urgent first. */
  next: NextStep[]
}

/** One recommendation, tagged with the pillar it came from so the UI can colour it. */
export interface NextStep {
  pillar: CardPillar
  suggestion: Suggestion
}

export interface WeekSummaryInput {
  /** The week to summarise — the live one. `null` before the journey loads. */
  week: WeekSnapshot | null
  /** The member's weight unit. */
  unit: 'lbs' | 'kg'
  /** The member's load unit, if it differs from the weight unit. */
  loadUnit?: 'lbs' | 'kg'
  /** Sets and load moved this week — /api/goals carries these, the journey does not. */
  training?: WeekTrainingMetrics | null
  /** The per-pillar "where to work next" from /api/goals. */
  suggestions?: Partial<Record<CardPillar, Suggestion | null | undefined>>
  /** Day streak, 0 when there is none. */
  streak?: number
}

const LABEL: Record<SummaryPillar, string> = {
  training: 'Training',
  fuel: 'Fuel',
  mind: 'Mind',
  you: 'You',
}

/** Worst first: a warning outranks a nudge outranks an unset goal outranks good news. */
const SEVERITY_RANK: Record<Severity, number> = { warn: 0, nudge: 1, info: 2, good: 3 }

/** At most this many recommendations — the screen is a summary, not a to-do list. */
export const MAX_NEXT_STEPS = 3

/**
 * How many rows of a history Story shows before it asks. Story stacks two of
 * them — every week, and every win — and printing both in full made the screen
 * forty rows long, with the thing you opened it for at the bottom.
 */
export const STORY_PREVIEW = 4

/** A history, cut to its preview until the member asks for the rest. */
export function previewList<T>(items: T[], open: boolean, preview: number = STORY_PREVIEW): { shown: T[]; hidden: number } {
  return { shown: open ? items : items.slice(0, preview), hidden: Math.max(0, items.length - preview) }
}

function s(n: number): string { return n === 1 ? '' : 's' }

function usesPillar(week: WeekSnapshot | null, p: CardPillar): boolean {
  if (!week) return true
  return week.uses[p]
}

/** Training: what got trained, what got beaten, and what actually moved. */
function trainingFacts(w: WeekSnapshot, live: boolean, metrics: WeekTrainingMetrics | null, loadUnit: 'lbs' | 'kg'): string[] {
  const t = w.training
  const facts: string[] = []
  if (t.target) facts.push(`${t.workouts} of ${t.target} workout${s(t.target)}`)
  else if (t.workouts > 0) facts.push(`${t.workouts} workout${s(t.workouts)}`)
  else facts.push(live ? 'no workouts yet' : 'no workouts')
  if (t.prCount === 1) facts.push(`new best: ${t.prs[0].name}`)
  else if (t.prCount > 1) facts.push(`${t.prCount} new bests`)
  // Sets and load only exist for the live week, and only say something once
  // there is a session behind them.
  if (live && metrics && metrics.sessions > 0) {
    if (metrics.sets > 0) facts.push(`${metrics.sets} set${s(metrics.sets)}`)
    facts.push(metrics.hasWeightedWork ? `${formatVolume(metrics.volume, loadUnit)} moved` : `${formatWorkTime(metrics.workSeconds)} under load`)
  }
  return facts
}

/**
 * Fuel: the logging, the protein floor, and where the scale went.
 *
 * A member who weighs in but does not log food still has a fuel line — the
 * weight plan IS the fuel pillar for them — but they are not told "nothing
 * logged", which is a fact about a feature they declined.
 */
function fuelFacts(w: WeekSnapshot, live: boolean, days: number, unit: 'lbs' | 'kg'): string[] {
  const n = w.nutrition
  const facts: string[] = []
  if (n.logDays > 0) facts.push(`logged ${n.logDays} of ${days} day${s(days)}`)
  else if (w.uses.fuel) facts.push(live ? 'nothing logged yet' : 'nothing logged')
  if (n.proteinDays > 0) facts.push(`protein hit ${n.proteinDays} day${s(n.proteinDays)}`)
  if (n.avgCalories) facts.push(`${n.avgCalories.toLocaleString()} cal a day`)
  if (n.delta != null && n.delta !== 0) facts.push(`${n.delta < 0 ? 'down' : 'up'} ${Math.abs(n.delta).toFixed(1)} ${unit} on the scale`)
  else if (n.delta === 0 && n.weightEnd != null) facts.push(`steady at ${n.weightEnd} ${unit}`)
  return facts
}

/** Mind: sessions when they use sessions, check-ins either way, the mood, the chapter. */
function mindFacts(w: WeekSnapshot, live: boolean): string[] {
  const m = w.mind
  const facts: string[] = []
  if (m.sessions > 0) facts.push(`${m.sessions} session${s(m.sessions)}`)
  else if (w.uses.mindMode === 'sessions') facts.push(live ? 'no sessions yet' : 'no sessions')
  if (m.moodDays > 0) facts.push(`checked in ${m.moodDays} day${s(m.moodDays)}`)
  if (m.dominant) facts.push(`mostly ${STATE_WORD[m.dominant]}`)
  if (m.chapterUnlocked) facts.push(`Chapter ${m.chapterUnlocked} opened`)
  // A member who only ever taps the check-in, and has not this week, still
  // gets a line — otherwise Mind silently vanishes from their summary.
  if (!facts.length) facts.push(live ? 'nothing yet' : 'nothing logged')
  return facts
}

/** Everything that is not a pillar: wins banked, the streak held. */
function youFacts(w: WeekSnapshot, streak: number): string[] {
  const facts: string[] = []
  if (w.mind.wins.length) facts.push(`${w.mind.wins.length} win${s(w.mind.wins.length)} banked`)
  if (streak > 0) facts.push(`${streak}-day streak`)
  return facts
}

/**
 * The recommendations, ranked. Only for pillars this member uses — with one
 * exception: a member using nothing yet is exactly who the "set a target"
 * suggestions are written for, so for them everything is on the table.
 */
export function nextSteps(input: WeekSummaryInput): NextStep[] {
  const active = PILLAR_ORDER.filter(p => usesPillar(input.week, p))
  const pool = active.length ? active : PILLAR_ORDER
  return pool
    .map((pillar, i) => ({ pillar, suggestion: input.suggestions?.[pillar] ?? null, i }))
    .filter((x): x is { pillar: CardPillar; suggestion: Suggestion; i: number } => !!x.suggestion)
    .sort((a, b) => (SEVERITY_RANK[a.suggestion.severity] - SEVERITY_RANK[b.suggestion.severity]) || (a.i - b.i))
    .map(({ pillar, suggestion }) => ({ pillar, suggestion }))
    .slice(0, MAX_NEXT_STEPS)
}

export function summarizeWeek(input: WeekSummaryInput): WeekSummary {
  const w = input.week
  const next = nextSteps(input)
  if (!w) {
    return {
      label: '',
      live: true,
      headline: 'Your week is still being written',
      sub: 'Log a workout, a meal or a Mind session and this fills in.',
      lines: [],
      quiet: true,
      next,
    }
  }
  const live = w.isCurrent
  const days = live ? Math.max(1, Math.min(7, w.daysElapsed)) : 7
  const loadUnit = input.loadUnit ?? input.unit
  const lines: SummaryLine[] = []
  if (usesPillar(w, 'training') || w.training.workouts > 0) lines.push({ pillar: 'training', label: LABEL.training, facts: trainingFacts(w, live, input.training ?? null, loadUnit) })
  if (usesPillar(w, 'fuel') || w.nutrition.logDays > 0 || w.nutrition.delta != null) lines.push({ pillar: 'fuel', label: LABEL.fuel, facts: fuelFacts(w, live, days, input.unit) })
  if (usesPillar(w, 'mind') || w.mind.sessions > 0 || w.mind.moodDays > 0) lines.push({ pillar: 'mind', label: LABEL.mind, facts: mindFacts(w, live) })
  const you = youFacts(w, input.streak ?? 0)
  if (you.length) lines.push({ pillar: 'you', label: LABEL.you, facts: you })

  const quiet = w.training.workouts === 0 && w.nutrition.logDays === 0 && w.mind.sessions === 0
    && w.mind.moodDays === 0 && w.mind.wins.length === 0 && w.nutrition.delta == null

  return {
    label: w.label,
    live,
    headline: w.headline,
    sub: w.sub,
    lines,
    quiet,
    next,
  }
}
