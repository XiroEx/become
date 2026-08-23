/**
 * Strength targets that a member can actually hit, and defend.
 *
 * The old model was a flat +5% on the top three lifts, computed once from
 * whatever the estimated max happened to be the day the goal was created and
 * then frozen. Two things went wrong with that:
 *
 *   1. It never re-baselined. A member whose leg press went 547 → 1020 still
 *      saw "target 575" — a number they had beaten by 445 lbs weeks earlier.
 *      A target below your current lift is not a target, it is noise.
 *   2. One rate for every lift and every lifter. 5% on a first-month bench is
 *      trivially easy; 5% on a decade-old deadlift is a year of work. Handing
 *      both the same number makes the easy one meaningless and the hard one
 *      discouraging.
 *
 * What replaces it is the least controversial idea in strength training: how
 * fast you can add load depends on how long you have been adding it. Someone
 * new to a movement gains quickly because most of the early progress is the
 * nervous system learning the lift; those gains slow down as that runs out and
 * further progress has to come from actual tissue. So the rate is picked per
 * lift, from that lift's own logged history, rather than being a constant.
 *
 * These are norms, not promises, and the copy says so. Sleep, food, stress and
 * program quality all move this more than any formula does. The point is to
 * put up a number that is worth chasing instead of one that is already behind
 * you.
 *
 * Pure: no DB, no clock beyond what the caller passes in.
 */

/**
 * Anything above this is a data-entry mistake (the canonical one in our data is
 * a 1,939 lb leg extension), not a lift. Kept in history so nobody's log is
 * silently rewritten, but never used to set a target off.
 *
 * Lives here rather than in lib/goals/training so the target model has no
 * dependency on the goal layer — the goal layer re-exports it.
 */
export const PLAUSIBLE_E1RM_MAX = 1200

export type LiftTier = 'building' | 'progressing' | 'refining'

export interface LiftHistoryPoint {
  /** Session date. */
  t: Date
  /** Best-set estimated max for that session. */
  e1RM: number
}

export interface TierAssessment {
  tier: LiftTier
  /** Weeks between the first and most recent logged session for this lift. */
  weeksLogged: number
  /** Fractional change over the recent window, e.g. 0.04 = up 4%. Null when there is not enough history to say. */
  recentGain: number | null
  /** How many sessions of this lift we had to work with. */
  sessions: number
}

export interface StrengthTarget {
  slug: string
  name: string
  /** Where they are now. */
  baselineE1RM: number
  /** Where we are pointing them, in the member's unit, on the plate grid. */
  targetE1RM: number
  tier: LiftTier
  /** Gain rate per 4 weeks used to get there, e.g. 0.015 = 1.5%. */
  ratePer4Weeks: number
  horizonWeeks: number
  assessment: TierAssessment
}

/**
 * Gain per 4 weeks, by how established the lift is.
 *
 * Set deliberately at the conservative end of the commonly cited ranges. A
 * target you beat early is a good day; a target you never reach is why people
 * stop looking at the screen.
 */
export const TIER_RATES: Record<LiftTier, number> = {
  building: 0.03,
  progressing: 0.015,
  refining: 0.0075,
}

export const TIER_LABELS: Record<LiftTier, string> = {
  building: 'Building',
  progressing: 'Progressing',
  refining: 'Refining',
}

/**
 * One training block. Short enough to stay motivating, long enough that the
 * smallest real plate jump is a plausible amount of progress.
 */
export const DEFAULT_HORIZON_WEEKS = 8

/** Below this many sessions we cannot read a trend, so we assume early-stage. */
const MIN_SESSIONS_FOR_TREND = 4

/** A lift younger than this is still in its fast-gain phase by default. */
const ESTABLISHED_WEEKS = 8

/** Window used to read "how fast is this lift currently moving". */
const TREND_WINDOW_WEEKS = 8

/** Still climbing quickly. */
const FAST_GAIN = 0.06

/** Moving, but no longer quickly. */
const STEADY_GAIN = 0.015

const WEEK_MS = 7 * 86_400_000

/**
 * Smallest jump that exists in a real gym. You cannot add 0.4 lbs to a
 * barbell, so a target that implies it reads as noise. Also the grid we round
 * onto, which is why it is one number and not two.
 */
export function loadStep(unit: 'lbs' | 'kg'): number {
  return unit === 'kg' ? 2.5 : 5
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

/**
 * Read a lift's own history to decide how fast it can reasonably move.
 *
 * `history` must be ascending by date (what `aggregateStrengthCurve` returns).
 * With too little history we return `building` and say so via `recentGain:
 * null` — the caller surfaces that as "early days" rather than pretending to
 * have measured a trend.
 */
export function assessLift(history: LiftHistoryPoint[], now: Date): TierAssessment {
  const points = history.filter(p => Number.isFinite(p.e1RM) && p.e1RM > 0)
  const sessions = points.length

  if (sessions === 0) {
    return { tier: 'building', weeksLogged: 0, recentGain: null, sessions: 0 }
  }

  const first = points[0]
  const last = points[points.length - 1]
  const weeksLogged = Math.max(0, (last.t.getTime() - first.t.getTime()) / WEEK_MS)

  if (sessions < MIN_SESSIONS_FOR_TREND || weeksLogged < ESTABLISHED_WEEKS) {
    return { tier: 'building', weeksLogged, recentGain: null, sessions }
  }

  // Compare the best of the recent window against the best of everything
  // before it. Best-vs-best rather than last-vs-first so one deload session or
  // one heavy single does not decide the tier.
  const cutoff = new Date(now.getTime() - TREND_WINDOW_WEEKS * WEEK_MS)
  const recent = points.filter(p => p.t >= cutoff)
  const prior = points.filter(p => p.t < cutoff)

  if (recent.length === 0 || prior.length === 0) {
    // All the data sits on one side of the window: we know the lift is old
    // enough to be established but cannot measure its current rate.
    return { tier: 'progressing', weeksLogged, recentGain: null, sessions }
  }

  const recentBest = Math.max(...recent.map(p => p.e1RM))
  const priorBest = Math.max(...prior.map(p => p.e1RM))
  const recentGain = priorBest > 0 ? (recentBest - priorBest) / priorBest : null

  let tier: LiftTier = 'refining'
  if (recentGain !== null && recentGain >= FAST_GAIN) tier = 'building'
  else if (recentGain !== null && recentGain >= STEADY_GAIN) tier = 'progressing'

  return { tier, weeksLogged, recentGain, sessions }
}

export interface BuildTargetArgs {
  slug: string
  name: string
  /** Current estimated max — the target is always built from HERE, never from a stale baseline. */
  currentE1RM: number
  history?: LiftHistoryPoint[]
  unit: 'lbs' | 'kg'
  now: Date
  horizonWeeks?: number
}

/**
 * Build one target from the member's current strength and that lift's history.
 *
 * Always returns something strictly above `currentE1RM`: compounding a small
 * percentage on a light lift can land inside the rounding step, and a target
 * equal to where you already are is worse than no target at all.
 */
export function buildStrengthTarget(args: BuildTargetArgs): StrengthTarget | null {
  const { slug, name, currentE1RM, unit, now } = args
  if (!Number.isFinite(currentE1RM) || currentE1RM <= 0) return null
  if (currentE1RM > PLAUSIBLE_E1RM_MAX) return null // a typo, not a lift

  const horizonWeeks = args.horizonWeeks ?? DEFAULT_HORIZON_WEEKS
  const assessment = assessLift(args.history ?? [], now)
  const rate = TIER_RATES[assessment.tier]
  const step = loadStep(unit)

  // Compound the 4-week rate across the horizon, then hold it to the plate
  // grid. `ceilTo` rather than round so the result cannot land back on the
  // current value for a light lift.
  const projected = currentE1RM * Math.pow(1 + rate, horizonWeeks / 4)
  const atLeastOneStep = Math.max(projected, currentE1RM + step)
  const targetE1RM = Math.min(ceilTo(atLeastOneStep, step), PLAUSIBLE_E1RM_MAX)

  return {
    slug,
    name,
    baselineE1RM: Math.round(currentE1RM),
    targetE1RM,
    tier: assessment.tier,
    ratePer4Weeks: rate,
    horizonWeeks,
    assessment,
  }
}

export interface TargetExplanation {
  /** "1,035 lbs over the next 8 weeks" */
  headline: string
  tier: LiftTier
  tierLabel: string
  /** Why this lift got this rate, in the member's own numbers. */
  why: string[]
  /** How the number was produced. */
  method: string
  /** What the number is not. */
  caveat: string
}

function pct(n: number): string {
  const v = n * 100
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`
}

function fmtLoad(n: number, unit: string): string {
  return `${Math.round(n).toLocaleString()} ${unit}`
}

/** Lower-case term for mid-sentence use. Mirrors EST_MAX_LABEL in lib/strength/language. */
const EST_MAX_TERM = 'estimated max'

/**
 * Turn a target into something a member can read and argue with. Every claim
 * here is derived from their own logged sets, which is the whole point: a
 * target you can see the reasoning for is one you can trust or reject.
 */
export function explainTarget(target: StrengthTarget, unit: 'lbs' | 'kg'): TargetExplanation {
  const { assessment, tier, ratePer4Weeks, horizonWeeks } = target
  const gain = target.targetE1RM - target.baselineE1RM
  const why: string[] = []

  // A stored target the member has already passed is explained against their
  // CURRENT strength, so the arithmetic goes negative. Saying "works out to
  // about -445 lbs" would be worse than saying nothing, so this case gets its
  // own copy and skips the rate sentence entirely.
  if (gain <= 0) {
    return {
      headline: `Already past it — you are at ${fmtLoad(target.baselineE1RM, unit)}`,
      tier,
      tierLabel: TIER_LABELS[tier],
      why: [
        `This target was set when you were lifting less. You have since passed it by ${fmtLoad(Math.abs(gain), unit)}, so it is no longer pointing anywhere.`,
        `Set a new one and it will be built from where you are now, at the rate this lift is actually moving.`,
      ],
      method: `Targets are built from your current ${EST_MAX_TERM}, not the one you had when the goal was created. This one predates that change.`,
      caveat: 'Beating a target early is a good sign, not an error. It usually means the lift was still in a faster phase than the plan assumed.',
    }
  }

  if (assessment.sessions === 0) {
    why.push('This is a new lift for you, so the target assumes the quick early progress most people get while the movement is still unfamiliar.')
  } else if (assessment.recentGain === null) {
    why.push(
      assessment.weeksLogged < ESTABLISHED_WEEKS
        ? `You have about ${Math.max(1, Math.round(assessment.weeksLogged))} week${Math.round(assessment.weeksLogged) === 1 ? '' : 's'} of history on this lift across ${assessment.sessions} session${assessment.sessions === 1 ? '' : 's'}. Early on, strength climbs fast because a lot of it is your nervous system learning the movement, so the target reflects that.`
        : `You have ${assessment.sessions} logged session${assessment.sessions === 1 ? '' : 's'} of this lift, but not enough on both sides of the last ${TREND_WINDOW_WEEKS} weeks to measure a trend. The target uses a steady middle rate.`
    )
  } else if (tier === 'building') {
    why.push(`Your best set on this lift is up ${pct(assessment.recentGain)} over the last ${TREND_WINDOW_WEEKS} weeks. That is a fast climb, so the target keeps pace with it.`)
  } else if (tier === 'progressing') {
    why.push(`Your best set on this lift is up ${pct(assessment.recentGain)} over the last ${TREND_WINDOW_WEEKS} weeks. Steady progress, so the target follows that same trajectory rather than assuming it speeds up.`)
  } else {
    const flat = assessment.recentGain <= 0
    why.push(
      flat
        ? `This lift has not moved in the last ${TREND_WINDOW_WEEKS} weeks. That is normal once a lift is well trained, so the target is set to a small, realistic step rather than a jump you would have to be lucky to hit.`
        : `Your best set on this lift is up ${pct(assessment.recentGain)} over the last ${TREND_WINDOW_WEEKS} weeks. Gains that size mean the lift is fairly well trained, so the target is deliberately modest.`
    )
  }

  why.push(`Lifts in the ${TIER_LABELS[tier].toLowerCase()} stage tend to add roughly ${pct(ratePer4Weeks)} every 4 weeks. Over ${horizonWeeks} weeks that works out to about ${fmtLoad(gain, unit)}.`)

  if (gain <= loadStep(unit)) {
    why.push(`That rounds to the smallest jump you can actually make on this lift, which is ${fmtLoad(loadStep(unit), unit)}. There is no useful target smaller than one plate change.`)
  }

  return {
    headline: `${fmtLoad(target.targetE1RM, unit)} over the next ${horizonWeeks} weeks`,
    tier,
    tierLabel: TIER_LABELS[tier],
    why,
    method: `Built from where you are right now (${fmtLoad(target.baselineE1RM, unit)}), not from where you started, and rounded up to the nearest ${fmtLoad(loadStep(unit), unit)} so it lands on real plates.`,
    caveat: 'These are typical rates, not a promise. Sleep, food, stress and how well the program fits you move strength more than any formula does. Treat it as a direction, not a deadline.',
  }
}

/**
 * Has this target been overtaken? The old model had no notion of this, which
 * is how a beaten target stayed on screen for weeks looking like a goal.
 */
export function isTargetReached(currentE1RM: number, targetE1RM: number): boolean {
  return Number.isFinite(currentE1RM) && Number.isFinite(targetE1RM) && currentE1RM >= targetE1RM
}
