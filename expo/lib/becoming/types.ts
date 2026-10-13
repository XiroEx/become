import type { Pillar } from './pillarColors'

export interface Suggestion {
  key: string
  title: string
  sub: string
  severity: 'warn' | 'nudge' | 'info' | 'good' | string
  url: string
}

export type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'

export type MindMode = 'sessions' | 'checkins'

export type Subject = Pillar

export interface PillarUse {
  training: boolean
  fuel: boolean
  mind: boolean
  mindMode: 'sessions' | 'checkins' | null
}

export interface DayProof {
  key: string
  workout: boolean
  workoutCount: number
  food: boolean
  mind: boolean
  mindSession: boolean
  future: boolean
}

export type Fact =
  | 'workouts'
  | 'prs'
  | 'logging'
  | 'protein'
  | 'weight'
  | 'sessions'
  | 'checkins'
  | 'state'
  | 'chapter'
  | 'active'

export interface WeekSnapshot {
  index: number
  weekKey: string
  label: string
  isCurrent: boolean
  isFirst: boolean
  daysElapsed: number
  score: number
  step: 'up' | 'flat' | 'down' | 'start'
  altitude: number
  subject: Subject
  days: DayProof[]
  gap?: { weeks: number; fromKey: string; toKey: string }
  uses: PillarUse
  mind: {
    sessions: number
    moodDays: number
    dominant: MindState | null
    wins: string[]
    chapterUnlocked: number | null
  }
  nutrition: {
    logDays: number
    proteinDays: number
    avgCalories: number | null
    weightStart: number | null
    weightEnd: number | null
    delta: number | null
  }
  training: {
    workouts: number
    target: number | null
    hit: boolean
    prs: { name: string; e1RM: number }[]
    prCount: number
  }
  headline: string
  sub: string
  said: Fact[]
  tags: string[]
  spark?: number[]
  identity?: string | null
}

export interface JourneyPayload {
  todayKey: string
  identity: string | null
  firstActivity: string | null
  unit: 'lbs' | 'kg'
  target: {
    weight: number | null
    direction: 'lose' | 'maintain' | 'gain' | null
    pace: string | null
    eta: string | null
  }
  weeklyTarget: number | null
  weeks: WeekSnapshot[]
  next: { nutrition: Suggestion; training: Suggestion } | null
  becomingScore: number
  chapter: number
  weights: { day: string; value: number }[]
}

export type CardPillar = 'training' | 'fuel' | 'mind'

export interface Highlight {
  kind: Fact
  pillar: CardPillar | 'all'
  value: string
  of: string | null
  unit: string | null
  label: string
  flag: string | null
  delta: number | null
  change: boolean
  weight: number
}

export interface Nudge {
  pillar: CardPillar
  label: string
  href: string
  lapsed: boolean
}

export interface WeekSignals {
  active: CardPillar[]
  highlights: Highlight[]
  nudge: Nudge | null
  hasDeltas: boolean
}

export type SummaryPillar = CardPillar | 'you'

export interface SummaryLine {
  pillar: SummaryPillar
  label: string
  facts: string[]
}

export interface NextStep {
  pillar: CardPillar
  suggestion: Suggestion
}

export interface WeekSummary {
  label: string
  live: boolean
  headline: string
  sub: string
  lines: SummaryLine[]
  quiet: boolean
  next: NextStep[]
}

export interface LiftProgress {
  slug: string
  name: string
  e1RM: number
  target: number | null
  targetJustification?: string | null
}
