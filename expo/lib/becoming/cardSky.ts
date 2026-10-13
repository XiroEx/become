/**
 * THE WEEK CARD'S SKY (NP-342) — the web's card background, as numbers.
 *
 * On the web (`webapp/components/becoming/journey/WeekCard.tsx`) a week card is
 * `#0e0c17` under two gradients tinted by what the week was ABOUT, with an
 * inset ring in the same hue:
 *
 *   radial-gradient(90% 60% at <sun>, pillarColor(subject, score, 55, .35), transparent 60%),
 *   linear-gradient(160deg, pillarColor(subject, score, 40, .28) 0%, rgba(14,12,23,0) 55%)
 *   inset 0 0 0 1px pillarColor(subject, score, 60, .18)   — 2px at .9 on the live week
 *
 * The "sun" sits high on a climb, low on a dip, mid-right when the week held.
 * It is the amber/green wash that says what a week was about before a word
 * of it is read, and the native card used to be a flat dark surface.
 *
 * React Native has no CSS gradient, so `WeekCard` draws these with
 * react-native-svg. This module is the geometry and the colours, pure, so the
 * test can hold them to the web's values without laying anything out.
 */

import type { WeekSnapshot } from './types'
import { pillarColor, type Pillar } from './pillarColors'

/** `radial-gradient(90% 60% …)`: the sun's ellipse, as fractions of the card. */
export const SUN_RADIUS = { rx: '90%', ry: '60%' } as const
/** `transparent 60%`: the sun is gone six tenths of the way to its rim. */
export const SUN_FADE_AT = 0.6
export const SUN_ALPHA = 0.35
export const SUN_LIGHTNESS = 55

/** `linear-gradient(160deg, … 0%, transparent 55%)`. */
export const WASH_ANGLE_DEG = 160
export const WASH_FADE_AT = 0.55
export const WASH_ALPHA = 0.28
export const WASH_LIGHTNESS = 40

export interface SunCentre {
  cx: string
  cy: string
}

/** Where the sun sits: high on a climb, low on a dip, mid-right when the week held. */
export function sunCentre(step: WeekSnapshot['step']): SunCentre {
  if (step === 'down') return { cx: '80%', cy: '100%' }
  if (step === 'up') return { cx: '75%', cy: '0%' }
  return { cx: '90%', cy: '40%' }
}

export interface GradientLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * CSS's gradient line for `linear-gradient(<angle>, …)` on a width × height
 * box, in px: through the centre, pointing `angle` degrees clockwise from
 * straight up, and exactly long enough that the 0% and 100% lines pass
 * through the box's corners — `abs(W·sin A) + abs(H·cos A)` (css-images-3).
 * The angle depends on the box's shape, which is why the card's size is
 * needed to draw it.
 */
export function gradientLine(width: number, height: number, angleDeg = WASH_ANGLE_DEG): GradientLine {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const length = Math.abs(width * dx) + Math.abs(height * dy)
  const cx = width / 2
  const cy = height / 2
  return {
    x1: cx - (dx * length) / 2,
    y1: cy - (dy * length) / 2,
    x2: cx + (dx * length) / 2,
    y2: cy + (dy * length) / 2,
  }
}

export interface CardSky {
  /** The sun's colour (alpha applied as a stop opacity). */
  sun: string
  sunAlpha: number
  /** The wash's colour at the top-left. */
  wash: string
  washAlpha: number
}

export function cardSky(subject: Pillar, score: number): CardSky {
  return {
    sun: pillarColor(subject, score, SUN_LIGHTNESS),
    sunAlpha: SUN_ALPHA,
    wash: pillarColor(subject, score, WASH_LIGHTNESS),
    washAlpha: WASH_ALPHA,
  }
}

export interface CardRing {
  width: number
  color: string
}

/** The inset ring: a hairline in the week's hue; the live week's is two px and nearly solid. */
export function cardRing(subject: Pillar, score: number, isCurrent: boolean): CardRing {
  return isCurrent
    ? { width: 2, color: pillarColor(subject, score, 65, 0.9) }
    : { width: 1, color: pillarColor(subject, score, 60, 0.18) }
}
