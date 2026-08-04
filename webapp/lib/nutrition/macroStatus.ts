/**
 * Shared "how am I doing against this target" status for calories and macros.
 *
 * Before this, every surface did `current > goal ? red : normal` inline — so a
 * single gram over a 335g carb target looked exactly as alarming as being 200g
 * over, and going over on PROTEIN was flagged red even though eating more
 * protein than you planned is a good outcome, not a mistake.
 *
 * Two ideas make this work:
 *
 *   1. A 5% grace band. Real food logging is not precise to the gram; being a
 *      rounding error over your target is not a failure and should not be
 *      coloured like one.
 *   2. Some targets are CEILINGS (calories, carbs, fats — going over is the
 *      thing to avoid) and some are FLOORS (protein — the target is a minimum
 *      you want to reach, and exceeding it is fine).
 */

export type MacroKind = 'ceiling' | 'floor'

export type MacroStatus =
  /** Nothing logged yet. */
  | 'empty'
  /** Working toward the target. */
  | 'under'
  /** Target met — the good state. */
  | 'hit'
  /** Over a ceiling target, but inside the 5% grace band. */
  | 'warn'
  /** Meaningfully over a ceiling target. */
  | 'over'

/** How far over a ceiling target counts as "basically on target". */
export const OVER_TOLERANCE = 0.05
/** How close to a floor/ceiling target counts as "met". */
export const HIT_TOLERANCE = 0.05

export function macroStatus(current: number, goal: number, kind: MacroKind = 'ceiling'): MacroStatus {
  if (!Number.isFinite(goal) || goal <= 0) return 'empty'
  if (!Number.isFinite(current) || current <= 0) return 'empty'

  const ratio = current / goal

  // A floor target (protein) can never be "over". Reaching it is the win, and
  // going past it stays the win.
  if (kind === 'floor') {
    return ratio >= 1 - HIT_TOLERANCE ? 'hit' : 'under'
  }

  if (ratio > 1 + OVER_TOLERANCE) return 'over'
  if (ratio > 1) return 'warn'
  if (ratio >= 1 - HIT_TOLERANCE) return 'hit'
  return 'under'
}

/**
 * Bar fill colour for a status.
 *
 * `identity` is the macro's own colour (blue protein, green carbs, violet fats)
 * and is used only while the member is still working toward the target. Once a
 * target is met or blown, the bar speaks in STATUS colours instead — which is
 * why the warning colour is a darker orange than the yellow fats bar: when they
 * were the same amber, a fats bar at 40% was indistinguishable from a "just over
 * your target" bar.
 */
export function macroBarClass(status: MacroStatus, identity: string): string {
  switch (status) {
    case 'hit':
      return 'bg-emerald-500'
    case 'warn':
      return 'bg-orange-500'
    case 'over':
      return 'bg-red-500'
    default:
      return identity
  }
}

/** Text colour for the "123g / 200g" readout. */
export function macroTextClass(status: MacroStatus): string {
  switch (status) {
    case 'hit':
      return 'font-semibold text-emerald-600 dark:text-emerald-400'
    case 'warn':
      return 'font-semibold text-orange-600 dark:text-orange-400'
    case 'over':
      return 'font-semibold text-red-500'
    default:
      return 'text-zinc-500 dark:text-zinc-400'
  }
}

/** Chip styling for the trailing "+12g" / "40g left" pill. */
export function macroChipClass(status: MacroStatus): string {
  switch (status) {
    case 'hit':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'warn':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    case 'over':
      return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    default:
      return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
  }
}

/** Ring stroke colour (SVG needs a literal, not a Tailwind class). */
export function macroStrokeColor(status: MacroStatus, fallback: string): string {
  switch (status) {
    case 'hit':
      return '#10b981'
    case 'warn':
      return '#f97316'
    case 'over':
      return '#ef4444'
    default:
      return fallback
  }
}

/**
 * Macro identity colours.
 *
 * Fats is yellow and the "slightly over" warning is ORANGE — same family, split
 * by lightness and hue so they never read as the same thing. Fats sits bright
 * (#facc15); the warning sits noticeably darker and redder (#f97316), which also
 * makes the green → orange → red progression read in the right direction.
 *
 * Protein blue and carbs green are unchanged: green only ever means "good" in
 * both the identity and the status language, so it does not clash.
 */
export const MACRO_COLORS = {
  protein: 'bg-blue-600',
  carbs: 'bg-green-600',
  fats: 'bg-yellow-400',
} as const

/** Which targets are ceilings and which are floors. */
export const MACRO_KINDS = {
  calories: 'ceiling',
  protein: 'floor',
  carbs: 'ceiling',
  fats: 'ceiling',
} as const satisfies Record<string, MacroKind>
