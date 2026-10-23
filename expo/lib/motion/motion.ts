/**
 * NATIVE MOTION — the web's framer-motion numbers, ported to Reanimated.
 *
 * The web animates throughout (~120 files): PageTransition (opacity + 20pt
 * rise, 0.4s), toasts (8pt rise + fade, 0.2s), banners (6pt drop), modals
 * (spring up 30–80pt), dropdowns, tiles and progress fills (0.3–0.5s), and
 * the Becoming door's own pulse (2.4s loud / 3.2s calm halo). This module is
 * the single source of those numbers so a native screen and its web twin
 * move the same way.
 *
 * Every consumer also reads `useReducedMotion` (lib/a11y/reducedMotion):
 * reduced motion keeps the END STATE and drops the travel
 * (`motionDuration` → 0, `modalAnimation` → "none"). The rule travels —
 * `__tests__/reducedMotion.test.tsx` fails any file importing moti or
 * Reanimated that does not consult it.
 */

export const MOTION_MS = {
  /** PageTransition's duration: opacity 0→1, y 20→0, easeOut. */
  screenEnter: 400,
  /** Toast: opacity 0→1, y 8→0, 0.2s easeOut. */
  toast: 200,
  /** Banners (MoodGateway drops from -6): quick settle. */
  banner: 250,
  /** Modal/sheet card rise (web springs 30–80pt): a firm ease-out. */
  sheet: 300,
  /** Dropdown/popover pop (avatar menu): short and snappy. */
  pop: 180,
  /** Tile stagger step between grid children. */
  tileStagger: 60,
  /** Progress fills: the web's `transition-all duration-300/500`. */
  fill: 300,
  /** Milestone fire pop: scale 0→1.3→1 in 0.5s. */
  firePop: 500,
  /** Becoming door loud pulse: unread week halo, 2.4s loop. */
  becomingLoud: 2400,
  /** Becoming door calm nudge: quieter halo, 3.2s loop. */
  becomingCalm: 3200,
} as const;

/**
 * Screen-enter travel: PageTransition's `y: 20` initial offset, in points.
 * Screens fade in while rising 20pt; the exit drops 20pt the other way.
 */
export const SCREEN_ENTER_TRAVEL = 20;

/** Sheet/modal card rise: the web's 30–80pt spring, settled at 40pt. */
export const SHEET_ENTER_TRAVEL = 40;

/** Toast rise: the web's `y: 8`. */
export const TOAST_ENTER_TRAVEL = 8;

/** Banner drop: the web's `y: -6`. */
export const BANNER_ENTER_TRAVEL = -6;

/** Dropdown/pop scale: the web's `scale: 0.95` → 1. */
export const POP_ENTER_SCALE = 0.95;

/**
 * A duration, or zero when motion is reduced. Zero rather than "skip the
 * animation": the end STATE still has to be applied, or the thing being
 * animated never arrives. (Mirrors `motionDuration` in reducedMotion.ts so
 * motion consumers import from one place.)
 */
export function motionMs(ms: number, reduced: boolean): number {
  return reduced ? 0 : ms;
}

/**
 * Stagger delay for the Nth tile in a grid: the web's `staggerChildren: 0.1`
 * on PageTransition, tightened to 60ms so a full grid lands in under a
 * second. Reduced motion removes the stagger (all arrive together, at once).
 */
export function tileDelay(index: number, reduced: boolean): number {
  return reduced ? 0 : index * MOTION_MS.tileStagger;
}
