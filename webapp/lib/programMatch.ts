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

/**
 * Name + tags, lowercased — the CURATED description of a program's intent.
 *
 * Deliberately excludes `equipment`, which is derived from the exercise list
 * and is not trustworthy: in the live catalog every program lists "Barbell",
 * including the one tagged "No Equipment / Bodyweight". Reading it made a
 * full-gym program register as dumbbell-only because its exercise list happened
 * to mention dumbbells.
 */
function intentText(p: ProgramLike): string {
  return [p.name, ...(p.tags ?? [])].filter(Boolean).join(' ').toLowerCase()
}

function matchesAny(hay: string, keywords: string[]): boolean {
  return keywords.some((k) => hay.includes(k))
}

function countHits(hay: string, keywords: string[]): number {
  return keywords.filter((k) => hay.includes(k)).length
}

/**
 * How strongly a program serves a goal, 0…1.
 *
 * Graded rather than binary, and weighted by WHERE the match came from. Tags
 * are curated, so they're the real signal; a passing mention of "strength" in a
 * fat-loss program's blurb is incidental and must not make it register as a
 * muscle-building program. Binary matching made nearly every program tie at the
 * same score, so the alphabetical tiebreak decided the recommendation and
 * swapping your goal changed nothing.
 */
function goalStrength(program: ProgramLike, goal: FitnessGoal): number {
  const keywords = GOAL_KEYWORDS[goal]
  const tagHits = countHits((program.tags ?? []).join(' ').toLowerCase(), keywords)
  const nameHits = countHits((program.name ?? '').toLowerCase(), keywords)
  const textHits = countHits([program.goal, program.description].filter(Boolean).join(' ').toLowerCase(), keywords)

  const weighted = tagHits * 1 + nameHits * 0.6 + textHits * 0.25
  // Two solid tag hits is a full-strength match.
  return Math.min(1, weighted / 2)
}

/** Below this, a match is too incidental to claim as a reason to the member. */
const REASON_THRESHOLD = 0.25

type EquipmentTier = 'none' | 'dumbbells' | 'gym'

/** What the member has access to. 'none' is the floor. */
function memberEquipmentTier(equipment?: EquipmentType[]): EquipmentTier {
  if (!equipment || equipment.length === 0) return 'gym' // unanswered → don't filter
  if (equipment.includes('full_gym') || equipment.includes('barbell') || equipment.includes('cables')) return 'gym'
  if (equipment.includes('dumbbells')) return 'dumbbells'
  return 'none'
}

/** The minimum kit a program actually needs, per its curated tags/name. */
function programEquipmentTier(program: ProgramLike): EquipmentTier {
  const intent = intentText(program)
  if (matchesAny(intent, BODYWEIGHT_KEYWORDS)) return 'none'
  if (matchesAny(intent, DUMBBELL_KEYWORDS)) return 'dumbbells'
  return 'gym'
}

export function scoreProgram(program: ProgramLike, input: MatchInput): { score: number; reasons: string[] } {
  // Reasons are assembled at the end in priority order, because the UI only has
  // room for the top few. "You can actually do this with what you own" matters
  // more to a member than "this is pitched at your level".
  const goalReasons: string[] = []
  let equipmentReason: string | undefined
  let daysReason: string | undefined
  let levelReason: string | undefined
  let score = 0

  // ── Goals ───────────────────────────────────────────────────────────────
  const goals = input.goals ?? []
  goals.slice(0, GOAL_WEIGHTS.length).forEach((goal, i) => {
    const strength = goalStrength(program, goal)
    if (strength <= 0) return
    score += GOAL_WEIGHTS[i] * strength
    if (strength >= REASON_THRESHOLD) {
      goalReasons.push(
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
      levelReason = `Pitched at your ${input.experienceLevel} level`
    } else {
      // "Beginner to Intermediate" is adjacent to advanced, etc.
      const order: ExperienceLevel[] = ['beginner', 'intermediate', 'advanced']
      const mine = order.indexOf(input.experienceLevel)
      const adjacent = order.some((lvl, idx) => target.includes(lvl) && Math.abs(idx - mine) === 1)
      if (adjacent) score += 7
    }
  } else if (target.includes('beginner')) {
    // Experience not answered yet (the goal step asks for a recommendation
    // before we know anything else). Lean towards the beginner-inclusive
    // option — a 5-day intermediate shred is a bad guess for an unknown member.
    score += 4
  }

  // ── Days per week ───────────────────────────────────────────────────────
  const available = input.weeklyAvailability
  const needed = program.training_days_per_week
  if (available && needed) {
    const diff = needed - available
    if (diff === 0) {
      score += 18
      daysReason = `Fits your ${available} days a week exactly`
    } else if (diff < 0) {
      // Fewer sessions than you have time for — fine, mild preference cost.
      score += Math.abs(diff) === 1 ? 11 : 5
      if (Math.abs(diff) === 1) daysReason = `${needed} days a week — fits inside your schedule`
    } else {
      // Needs MORE days than the member has. Penalise: it won't fit.
      score -= diff === 1 ? 6 : 18
    }
  }

  // ── Equipment ───────────────────────────────────────────────────────────
  // A program the member physically can't run is worse than a slightly
  // off-goal one, so mismatches are penalised harder than matches are rewarded.
  const has = memberEquipmentTier(input.equipmentAccess)
  const needs = programEquipmentTier(program)

  if (has === 'none') {
    if (needs === 'none') {
      score += 22
      equipmentReason = 'No equipment needed — matches what you have access to'
    } else {
      score -= needs === 'dumbbells' ? 18 : 30
    }
  } else if (has === 'dumbbells') {
    if (needs === 'dumbbells') {
      score += 18
      equipmentReason = 'Runs on dumbbells alone'
    } else if (needs === 'none') {
      score += 12
      equipmentReason = 'No equipment needed'
    } else {
      score -= 12
    }
  }
  // A full gym runs everything — no adjustment either way.

  const reasons = [...goalReasons, equipmentReason, daysReason, levelReason].filter(
    (r): r is string => Boolean(r)
  )

  // Rounded so float noise from the graded goal match can't reorder two
  // programs that are effectively tied — the name tiebreak handles those.
  return { score: Math.round(score * 100) / 100, reasons }
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
