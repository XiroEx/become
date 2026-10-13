/**
 * THE STAGE'S MOTION (NP-346) — the web's numbers, pure.
 *
 * Review of NP-204 on 10/8 (web vs the S23 vs the iOS simulator) found four
 * movements the web's stage makes that the native one did not:
 *
 *   1. the LANDING STAGGER. When the camera settles on a card (`landed`) the
 *      web's `WeekCard` / `HorizonCard` fade and slide their content in, row
 *      by row — opacity 0 → 1, y 12 → 0, 60 ms apart, 420 ms each, on
 *      `cubic-bezier(0.16, 1, 0.3, 1)`:
 *
 *        const stagger = (i) => ({ delay: 0.06 * i, duration: 0.42, ease: [0.16, 1, 0.3, 1] })
 *        const anim = (i) => reduced || compact ? {}
 *          : { initial: { opacity: 0, y: 12 }, animate: landed ? { opacity: 1, y: 0 } : { opacity: 0.001, y: 12 }, transition: stagger(i) }
 *
 *      so during the opening the card is an empty frame — its sky, its ring —
 *      and the content assembles after the click; a card that is NOT the
 *      landed one keeps its content down (the web's 0.001 is Framer Motion's
 *      way of keeping the element in layout; React Native needs no such
 *      thing, so hidden is 0 here);
 *   2. NEIGHBOUR DIMMING. `filter: brightness(.55) blur(1px)` one card from
 *      the focus, `brightness(.4) blur(2px)` further — in focus mode only,
 *      never in the opening or the overview — so the focused week pops. React
 *      Native has no cross-platform filter, so the brightness is a BLACK
 *      OVERLAY: black at alpha α over an opaque card multiplies every channel
 *      by 1 − α, which IS `brightness(1 − α)`. The blur is not ported;
 *   3. EMPHASIS TRANSITIONS. `transition: opacity 500ms ease, transform 500ms
 *      ease, filter 500ms ease` on every card slot — the opacity, the scale
 *      and the dimming ease between focus states instead of snapping;
 *   4. the INTRO's BREATHING GLOW on the start card:
 *      `absolute -inset-4 animate-pulse rounded-[40px] bg-violet-400/25 blur-2xl`.
 *
 * Every one is skipped under Reduce Motion, as the web's are (`reduced`).
 * This module is the numbers and the rules, pure, so the test can hold them
 * to the web's without rendering; `WeekCard` draws the stagger,
 * `JourneyStage` the dimming, the transitions and the glow.
 */

import type { BoxShadowValue } from 'react-native'
import type { StageMode } from './stage'

// ── 1. The landing stagger ─────────────────────────────────────────────────

/** `delay: 0.06 * i` — one row every 60 ms. */
export const LANDING_STAGGER_MS = 60
/** `duration: 0.42`. */
export const LANDING_MS = 420
/** `ease: [0.16, 1, 0.3, 1]`. */
export const LANDING_EASING: readonly [number, number, number, number] = [0.16, 1, 0.3, 1]
/** `y: 12` — a row rises twelve points as it fades in. */
export const LANDING_RISE = 12

/**
 * The web's row numbers, so the two cards stagger in the same order with the
 * same beats whether or not a block is present: `WeekCard` eyebrow 0, headline
 * 1, sub 2, highlights 3, nudge 4, wins 5, steps 6, identity row 7;
 * `HorizonCard` eyebrow 0, kicker 1, identity 2, "what writes it" 3, footer 4.
 */
export const WEEK_CARD_ROW = {
  eyebrow: 0,
  headline: 1,
  sub: 2,
  highlights: 3,
  nudge: 4,
  wins: 5,
  steps: 6,
  footer: 7,
} as const

export const HORIZON_CARD_ROW = {
  eyebrow: 0,
  kicker: 1,
  identity: 2,
  writes: 3,
  footer: 4,
} as const

/** How long row `i` waits before it starts. */
export function landingDelay(row: number): number {
  return LANDING_STAGGER_MS * row
}

/**
 * Where a row's content sits: 1 is in place, 0 is down and hidden. A card
 * the stage has landed on shows its content; one it has not keeps it down;
 * a card mounted outside the stage (`landed` undefined) and every card under
 * Reduce Motion simply draw it — the web's `anim(i)` is `{}` there.
 */
export function landingProgress(landed: boolean | null | undefined, reduced: boolean): 0 | 1 {
  if (reduced || landed == null) return 1
  return landed ? 1 : 0
}

/** Whether the change to `landingProgress` is a timing or a cut. */
export function landingAnimates(landed: boolean | null | undefined, reduced: boolean): boolean {
  return !reduced && landed != null
}

// ── 2. Neighbour dimming ───────────────────────────────────────────────────

/** `brightness(.55)` one step from the focus … */
export const NEIGHBOUR_BRIGHTNESS = 0.55
/** … and `brightness(.4)` two or more. */
export const FAR_BRIGHTNESS = 0.4

/**
 * The web's `filter: brightness(…)` rule: `!inOverview && d >= 1 && mode !==
 * 'intro'`, so only in focus mode and only off the focused card.
 */
export function neighbourBrightness(index: number, focus: number, mode: StageMode): number {
  const d = Math.abs(index - focus)
  if (mode !== 'focus' || d === 0) return 1
  return d === 1 ? NEIGHBOUR_BRIGHTNESS : FAR_BRIGHTNESS
}

/**
 * The overlay's alpha that draws that brightness: black at α over an opaque
 * card leaves every channel at 1 − α. Rounded so `.45` is `.45`, not
 * `.44999999999999996`.
 */
export function neighbourDim(index: number, focus: number, mode: StageMode): number {
  return Math.round((1 - neighbourBrightness(index, focus, mode)) * 1000) / 1000
}

/** `rounded-3xl` on a week card and a tile … */
export const CARD_RADIUS = 24

// ── 3. Emphasis transitions ────────────────────────────────────────────────

/** `500ms` on the slot's opacity, transform and filter. */
export const EMPHASIS_MS = 500
/** CSS's `ease`: `cubic-bezier(0.25, 0.1, 0.25, 1)` — not Reanimated's `Easing.ease`, which is CSS's `ease-in`. */
export const EMPHASIS_EASING: readonly [number, number, number, number] = [0.25, 0.1, 0.25, 1]
/** The start card's `scale(1.03)` while the opening plays. */
export const BREATHING_SCALE = 1.03

// ── 4. The intro's breathing glow ──────────────────────────────────────────

/** `-inset-4`: 1rem past the card on every side. */
export const INTRO_GLOW_INSET = -16
/** `rounded-[40px]`. */
export const INTRO_GLOW_RADIUS = 40
/** `bg-violet-400/25`. */
export const INTRO_GLOW_ALPHA = 0.25
/** `blur-2xl`: `blur(40px)`. */
export const INTRO_GLOW_BLUR = 40

/**
 * The web's blur, as React Native's `boxShadow` (the same way the exit-edge
 * light carries its glow): the box is filled violet at 25% and a shadow of
 * the same colour, blurred 40, carries the colour off its edges.
 */
export function introGlowShadow(color: string): BoxShadowValue[] {
  return [{ offsetX: 0, offsetY: 0, blurRadius: INTRO_GLOW_BLUR, spreadDistance: 0, color }]
}
