/**
 * THE WEEK TILE (NP-345) — the web's compact `WeekCard`, as numbers.
 *
 * In the overview, and for any card more than two steps from the focus, the
 * web (`webapp/components/becoming/journey/WeekCard.tsx`, `compact`) draws a
 * week as a block of ITS OWN COLOUR:
 *
 *   background: linear-gradient(160deg, pillarColor(subject, score, 48) 0%,
 *                                        pillarColor(subject, score, 30) 100%)
 *   box-shadow: inset 0 0 0 1px rgba(255,255,255,0.15)
 *   p-7 · a 40px `W<n>` (`…` for a gap) and the week label at 20px on top ·
 *   the headline at 26px and a step chip (`now` / climbed / held / a dip /
 *   new high / start) at 18px on the bottom
 *
 * That is what makes the overview read as grey → green → amber blocks behind
 * the markers. The native tile used to be a near-black box with a thin colour
 * stripe and small type, so at overview scale the tiles all but disappeared.
 *
 * The web's sizes are px inside a card that is `cardSize(390, 844).w` wide on
 * the phone the review was made on. Here they are CARD UNITS — the same
 * fraction of the card's width — so a tile keeps the web's proportions at any
 * card size and scales with the camera like everything else in the world
 * layer. React Native has no CSS gradient, so `WeekTile` draws the ground with
 * expo-linear-gradient; this module is the colours, the geometry and the
 * words, pure, so the test can hold them to the web's.
 */

import { cardSize } from '@become/core'
import { becomingStageTokens, rgbOf } from '@/lib/theme/tokens'
import { gradientLine } from './cardSky'
import { pillarColor, type Pillar } from './pillarColors'
import type { WeekSnapshot } from './types'

/** The phone the web was reviewed on: its card is the tile's reference box. */
export const REFERENCE_VIEWPORT = { w: 390, h: 844 } as const

/** The web's compact card is px inside this many px of width. */
export const REFERENCE_CARD_WIDTH = cardSize(REFERENCE_VIEWPORT.w, REFERENCE_VIEWPORT.h).w

/** One card unit: a web px at the reference card, as a fraction of this card's width. */
export function tileUnit(width: number): number {
  return width / REFERENCE_CARD_WIDTH
}

/** The web's compact card, in px at the reference card. */
export const TILE = {
  /** `p-7` */
  pad: 28,
  /** `inset 0 0 0 1px rgba(255,255,255,0.15)` — one px, like the web's */
  ring: 1,
  /** `text-[40px] font-black leading-none tracking-tight` (−0.025em) */
  mark: 40,
  markTracking: -1,
  /** `mt-2 text-xl font-semibold text-white/85` */
  label: 20,
  labelGap: 8,
  /** `text-[26px] font-extrabold leading-tight` (1.25) */
  headline: 26,
  headlineLineHeight: 32.5,
  /** `mt-3 … rounded-full bg-black/25 px-3 py-1.5 text-lg font-bold`, icon `h-5 w-5`, `gap-1.5` */
  chipGap: 12,
  chip: 18,
  chipIcon: 20,
  chipPadX: 12,
  chipPadY: 6,
  chipInnerGap: 6,
} as const

/** `inset 0 0 0 1px rgba(255,255,255,0.15)` — the stage's white ink at 15%. */
export const TILE_RING_COLOR = rgbOf(becomingStageTokens.ink, 0.15)
/** `bg-black/25` */
export const TILE_CHIP_BACKGROUND = rgbOf(becomingStageTokens.shade, 0.25)

/** `linear-gradient(160deg, …)`: the same line the card's wash runs along. */
export const TILE_ANGLE_DEG = 160

/** The two stops' lightness: lighter at the top-left, the week's hue throughout. */
export const TILE_LIGHTNESS = { from: 48, to: 30 } as const

export interface TileGround {
  colors: [string, string]
  locations: [number, number]
}

/** The week's ground: `pillarColor(subject, score, 48)` into `pillarColor(subject, score, 30)`. */
export function tileGround(subject: Pillar, score: number): TileGround {
  return {
    colors: [pillarColor(subject, score, TILE_LIGHTNESS.from), pillarColor(subject, score, TILE_LIGHTNESS.to)],
    locations: [0, 1],
  }
}

/**
 * The web's `HorizonCard` ground — which is also its overview tile, since the
 * web's Horizon has no compact mode:
 * `linear-gradient(160deg, rgba(124,58,237,0.22), rgba(14,12,23,0.97) 55%)`
 * under a `border-2 border-dashed border-white/25` ring.
 */
export const HORIZON_GROUND: TileGround = {
  colors: [rgbOf(becomingStageTokens.skyViolet, 0.22), rgbOf(becomingStageTokens.card, 0.97)],
  locations: [0, 0.55],
}
export const HORIZON_RING = { width: 2, color: rgbOf(becomingStageTokens.ink, 0.25) } as const

export interface GradientPoint {
  x: number
  y: number
}

export interface GradientPoints {
  start: GradientPoint
  end: GradientPoint
}

/**
 * expo-linear-gradient's `start` / `end` for CSS's 160° line on a box, as
 * fractions of it: `gradientLine`'s px endpoints over the box's width and
 * height. Both natives map the points back to px before drawing, so the
 * bands are perpendicular to the same line the web's are.
 */
export function tileGradientPoints(width: number, height: number): GradientPoints {
  if (width <= 0 || height <= 0) return { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } }
  const line = gradientLine(width, height, TILE_ANGLE_DEG)
  return {
    start: { x: line.x1 / width, y: line.y1 / height },
    end: { x: line.x2 / width, y: line.y2 / height },
  }
}

/** `W<n>`, or `…` for the weeks the member was away. */
export function tileMark(week: Pick<WeekSnapshot, 'index' | 'gap'>): string {
  return week.gap ? '…' : `W${week.index + 1}`
}

export type TileStepIcon = 'up' | 'down' | 'flat' | 'start'

export interface TileStep {
  icon: TileStepIcon
  text: string
}

/**
 * The step chip: the web's words — `now` on the live week, otherwise how the
 * path moved (a gap `held`; a new peak `new high`) — and which glyph goes
 * with it (an arrow, or a flag where it started).
 */
export function tileStep(week: Pick<WeekSnapshot, 'step' | 'gap' | 'isCurrent'>, isPeak = false): TileStep {
  const icon: TileStepIcon = week.step === 'up' ? 'up' : week.step === 'down' ? 'down' : week.step === 'start' ? 'start' : 'flat'
  const text = week.isCurrent
    ? 'now'
    : week.gap
      ? 'held'
      : isPeak
        ? 'new high'
        : week.step === 'up'
          ? 'climbed'
          : week.step === 'flat'
            ? 'held'
            : week.step === 'down'
              ? 'a dip'
              : 'start'
  return { icon, text }
}

/** The Horizon's chip: where the live week is trending, in the web's words. */
export function horizonTrendText(trend: 'up' | 'flat' | 'down'): string {
  return trend === 'up' ? 'Horizon lifting' : trend === 'down' ? 'Horizon eased' : 'Horizon holding'
}
