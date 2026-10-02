import type {
  CardPillar,
  NextStep,
  SummaryLine,
  SummaryPillar,
  WeekSummary,
  WeekSnapshot,
  Suggestion,
} from './types'
import { PILLAR_ORDER } from './signals'
import { formatVolume, formatWorkTime } from './weekTraining'

export type { NextStep, SummaryPillar } from './types'

export interface WeekTrainingMetrics {
  sessions: number
  sets: number
  reps: number
  volume: number
  workSeconds: number
  hasWeightedWork?: boolean
  topSet: { name: string; weight: number; reps: number; e1RM: number } | null
  exercises: number
}

export interface WeekSummaryInput {
  week: WeekSnapshot | null
  unit: 'lbs' | 'kg'
  loadUnit?: 'lbs' | 'kg'
  training?: WeekTrainingMetrics | null
  suggestions?: Partial<Record<CardPillar, Suggestion | null | undefined>>
  streak?: number
}

const LABEL: Record<SummaryPillar, string> = {
  training: 'Training',
  fuel: 'Fuel',
  mind: 'Mind',
  you: 'You',
}

const STATE_WORD: Record<string, string> = {
  stressed: 'Stressed',
  distracted: 'Distracted',
  low_energy: 'Low energy',
  locked_in: 'Locked in',
}

type Severity = 'warn' | 'nudge' | 'info' | 'good'
const SEVERITY_RANK: Record<Severity, number> = { warn: 0, nudge: 1, info: 2, good: 3 }

export const MAX_NEXT_STEPS = 3
export const MAX_CARD_STEPS = 2
export const STORY_PREVIEW = 4

export function previewList<T>(items: T[], open: boolean, preview: number = STORY_PREVIEW): { shown: T[]; hidden: number } {
  return { shown: open ? items : items.slice(0, preview), hidden: Math.max(0, items.length - preview) }
}

function s(n: number): string { return n === 1 ? '' : 's' }

function usesPillar(week: WeekSnapshot | null, p: CardPillar): boolean {
  if (!week) return true
  return week.uses[p]
}

function trainingFacts(w: WeekSnapshot, live: boolean, metrics: WeekTrainingMetrics | null, loadUnit: 'lbs' | 'kg'): string[] {
  const t = w.training
  const facts: string[] = []
  if (t.target) facts.push(`${t.workouts} of ${t.target} workout${s(t.target)}`)
  else if (t.workouts > 0) facts.push(`${t.workouts} workout${s(t.workouts)}`)
  else facts.push(live ? 'no workouts yet' : 'no workouts')
  if (t.prCount === 1 && t.prs[0]) facts.push(`new best: ${t.prs[0].name}`)
  else if (t.prCount > 1) facts.push(`${t.prCount} new bests`)
  if (live && metrics && metrics.sessions > 0) {
    if (metrics.sets > 0) facts.push(`${metrics.sets} set${s(metrics.sets)}`)
    facts.push(metrics.hasWeightedWork ? `${formatVolume(metrics.volume, loadUnit)} moved` : `${formatWorkTime(metrics.workSeconds)} under load`)
  }
  return facts
}

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

function mindFacts(w: WeekSnapshot, live: boolean): string[] {
  const m = w.mind
  const facts: string[] = []
  if (m.sessions > 0) facts.push(`${m.sessions} session${s(m.sessions)}`)
  else if (w.uses.mindMode === 'sessions') facts.push(live ? 'no sessions yet' : 'no sessions')
  if (m.moodDays > 0) facts.push(`checked in ${m.moodDays} day${s(m.moodDays)}`)
  if (m.dominant) facts.push(`mostly ${STATE_WORD[m.dominant] ?? m.dominant}`)
  if (m.chapterUnlocked) facts.push(`Chapter ${m.chapterUnlocked} opened`)
  if (!facts.length) facts.push(live ? 'nothing yet' : 'nothing logged')
  return facts
}

function youFacts(w: WeekSnapshot, streak: number): string[] {
  const facts: string[] = []
  if (w.mind.wins.length) facts.push(`${w.mind.wins.length} win${s(w.mind.wins.length)} banked`)
  if (streak > 0) facts.push(`${streak}-day streak`)
  return facts
}

export function rankSuggestions(
  pool: CardPillar[],
  suggestions: Partial<Record<CardPillar, Suggestion | null | undefined>> | undefined,
  max: number = MAX_NEXT_STEPS,
): NextStep[] {
  return pool
    .map((pillar, i) => ({ pillar, suggestion: suggestions?.[pillar] ?? null, i }))
    .filter((x): x is { pillar: CardPillar; suggestion: Suggestion; i: number } => !!x.suggestion)
    .sort((a, b) => ((SEVERITY_RANK[a.suggestion.severity as Severity] ?? 3) - (SEVERITY_RANK[b.suggestion.severity as Severity] ?? 3)) || (a.i - b.i))
    .slice(0, max)
    .map(({ pillar, suggestion }) => ({ pillar, suggestion }))
}

export function nextSteps(input: WeekSummaryInput): NextStep[] {
  const active = PILLAR_ORDER.filter(p => usesPillar(input.week, p))
  return rankSuggestions(active.length ? active : PILLAR_ORDER, input.suggestions)
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
