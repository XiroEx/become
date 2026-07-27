/**
 * Program recommendation scoring.
 *
 * Turns the onboarding answers (goals, experience, days available, equipment)
 * into a ranked list of catalog programs WITH the reasons for each match, so
 * the UI can tell a member exactly why they're being shown a program instead of
 * dropping them into an unfiltered catalog.
 *
 * Pure + dependency-free so it can run on the server (/api/programs/recommend)
 * and be unit-reasoned about without a DB.
 */

export type FitnessGoal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain'
  | 'improve_performance'
  | 'general_health'

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type EquipmentType = 'none' | 'dumbbells' | 'barbell' | 'cables' | 'full_gym'

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  lose_weight: 'Lose Weight',
  gain_muscle: 'Build Muscle',
  maintain: 'Maintain & Tone',
  improve_performance: 'Improve Performance',
  general_health: 'General Health',
}

/**
 * Keywords that mark a program as serving a goal. Matched against the
 * program's tags, name, and free-text `goal` field (all lowercased).
 */
const GOAL_KEYWORDS: Record<FitnessGoal, string[]> = {
  lose_weight: ['fat loss', 'fat-loss', 'shred', 'cut', 'burn', 'lean', 'conditioning', 'hiit', 'transformation'],
  gain_muscle: ['muscle', 'hypertrophy', 'size', 'mass', 'strength', 'split', 'push pull', 'overload'],
  maintain: ['foundation', 'full body', 'maintenance', 'balanced', 'tone', 'consistency'],
  improve_performance: ['conditioning', 'circuit', 'athletic', 'performance', 'hiit', 'strength', 'superset', 'functional'],
  general_health: ['foundation', 'full body', 'bodyweight', 'health', 'functional', 'consistency', 'habit'],
}

/** Keywords marking a program as needing NOTHING but a floor. Deliberately
 *  narrow: "home workout" and "minimal equipment" do NOT qualify — a dumbbell
 *  program tagged "Home Workout" is still unusable with no equipment. */
const BODYWEIGHT_KEYWORDS = ['bodyweight', 'body weight', 'no equipment', 'no-equipment', 'equipment free']
/** Keywords marking a program as runnable on dumbbells alone. */
const DUMBBELL_KEYWORDS = ['dumbbell', 'db only', 'minimal equipment']

/** Weight applied to the Nth goal — the primary goal dominates, but a second
 *  and third genuinely move the ranking. */
const GOAL_WEIGHTS = [40, 22, 12]

export interface ProgramLike {
  program_id: string
  name: string
  description?: string
  goal?: string
  target_user?: string
  training_days_per_week?: number
  duration_weeks?: number
  tags?: string[]
  equipment?: string[]
  coverImage?: string
}

export interface MatchInput {
  /** Ordered — index 0 is the primary goal. */
  goals?: FitnessGoal[]
  experienceLevel?: ExperienceLevel
  weeklyAvailability?: number
  equipmentAccess?: EquipmentType[]
}

export interface ProgramMatch<T extends ProgramLike = ProgramLike> {
  program: T
  score: number
  /** Member-facing "why this program" bullets, most important first. */
  reasons: string[]
}

function haystack(p: ProgramLike): string {
  return [p.name, p.goal, p.description, ...(p.tags ?? []), ...(p.equipment ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function matchesAny(hay: string, keywords: string[]): boolean {
  return keywords.some((k) => hay.includes(k))
}

type EquipmentTier = 'none' | 'dumbbells' | 'gym'

/** What the member has access to. 'none' is the floor. */
function memberEquipmentTier(equipment?: EquipmentType[]): EquipmentTier {
  if (!equipment || equipment.length === 0) return 'gym' // unanswered → don't filter
  if (equipment.includes('full_gym') || equipment.includes('barbell') || equipment.includes('cables')) return 'gym'
  if (equipment.includes('dumbbells')) return 'dumbbells'
  return 'none'
}

/** The minimum kit a program actually needs. */
function programEquipmentTier(hay: string): EquipmentTier {
  if (matchesAny(hay, BODYWEIGHT_KEYWORDS)) return 'none'
  if (matchesAny(hay, DUMBBELL_KEYWORDS)) return 'dumbbells'
  return 'gym'
}

export function scoreProgram(program: ProgramLike, input: MatchInput): { score: number; reasons: string[] } {
  const hay = haystack(program)
  const reasons: string[] = []
  let score = 0

  // ── Goals ───────────────────────────────────────────────────────────────
  const goals = input.goals ?? []
  goals.slice(0, GOAL_WEIGHTS.length).forEach((goal, i) => {
    if (matchesAny(hay, GOAL_KEYWORDS[goal])) {
      score += GOAL_WEIGHTS[i]
      reasons.push(
        i === 0
          ? `Built around your primary goal: ${GOAL_LABELS[goal]}`
          : `Also supports your ${GOAL_LABELS[goal].toLowerCase()} goal`
      )
    }
  })

  // ── Experience level ────────────────────────────────────────────────────
  const target = (program.target_user ?? '').toLowerCase()
  if (input.experienceLevel && target) {
    if (target.includes(input.experienceLevel)) {
      score += 15
      reasons.push(`Pitched at your ${input.experienceLevel} level`)
    } else {
      // "Beginner to Intermediate" is adjacent to advanced, etc.
      const order: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced']
      const mine = order.indexOf(input.experienceLevel)
      const adjacent = order.some((lvl, idx) => target.includes(lvl) && Math.abs(idx - mine) === 1)
      if (adjacent) score += 7
    }
  }

  // ── Days per week ───────────────────────────────────────────────────────
  const available = input.weeklyAvailability
  const needed = program.training_days_per_week
  if (available && needed) {
    const diff = needed - available
    if (diff === 0) {
      score += 18
      reasons.push(`Fits your ${available} days a week exactly`)
    } else if (diff < 0) {
      // Fewer sessions than you have time for — fine, mild preference cost.
      score += Math.abs(diff) === 1 ? 11 : 5
      if (Math.abs(diff) === 1) reasons.push(`${needed} days a week — fits inside your schedule`)
    } else {
      // Needs MORE days than the member has. Penalise: it won't fit.
      score -= diff === 1 ? 6 : 18
    }
  }

  // ── Equipment ───────────────────────────────────────────────────────────
  // A program the member physically can't run is worse than a slightly
  // off-goal one, so mismatches are penalised harder than matches are rewarded.
  const has = memberEquipmentTier(input.equipmentAccess)
  const needs = programEquipmentTier(hay)

  if (has === 'none') {
    if (needs === 'none') {
      score += 22
      reasons.push('No equipment needed — matches what you have access to')
    } else {
      score -= needs === 'dumbbells' ? 18 : 30
    }
  } else if (has === 'dumbbells') {
    if (needs === 'dumbbells') {
      score += 18
      reasons.push('Runs on dumbbells alone')
    } else if (needs === 'none') {
      score += 12
      reasons.push('No equipment needed')
    } else {
      score -= 12
    }
  }
  // A full gym runs everything — no adjustment either way.

  return { score, reasons }
}

export function rankPrograms<T extends ProgramLike>(programs: T[], input: MatchInput): ProgramMatch<T>[] {
  return programs
    .map((program) => {
      const { score, reasons } = scoreProgram(program, input)
      return { program, score, reasons }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Stable, deterministic tiebreak so the same answers always yield the
      // same top pick (important for the "why am I seeing this" promise).
      return a.program.name.localeCompare(b.program.name)
    })
}
