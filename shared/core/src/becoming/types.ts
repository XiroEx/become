/**
 * The Becoming — the week model, mirrored for the layout copy (NP-204).
 *
 * `webapp/lib/becoming/layout.ts` type-imports `WeekSnapshot` from
 * `webapp/lib/becoming/weeks.ts`, a module that is NOT copied here (it is the
 * server-side week builder, and it imports the streak helpers by `@/` alias).
 * A copy may only rewrite that import to a relative path, so the shape it
 * points at lives here — type-only, nothing at runtime.
 *
 * Keep it the shape `WeekSnapshot` has on the web and on the wire
 * (`shared/api-client/src/schemas/becoming.ts`); `expo/lib/becoming/types.ts`
 * is the same shape for the native screens.
 */

export type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'

export type Subject = 'training' | 'fuel' | 'mind' | 'all' | 'empty'

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

export type Fact = 'workouts' | 'prs' | 'logging' | 'protein' | 'weight' | 'sessions' | 'checkins' | 'state' | 'chapter' | 'active'

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
  mind: { sessions: number; moodDays: number; dominant: MindState | null; wins: string[]; chapterUnlocked: number | null }
  nutrition: { logDays: number; proteinDays: number; avgCalories: number | null; weightStart: number | null; weightEnd: number | null; delta: number | null }
  training: { workouts: number; target: number | null; hit: boolean; prs: Array<{ name: string; e1RM: number }>; prCount: number }
  headline: string
  sub: string
  said: Fact[]
  tags: string[]
}
