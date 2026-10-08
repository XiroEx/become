/**
 * THE FOCUSED CARD'S THREE EXTRAS (NP-343) — the web's numbers, pure.
 *
 * On the web (`webapp/components/becoming/journey/WeekCard.tsx`) the focused
 * card — and only the focused card — carries three things the native card
 * did not:
 *
 *   • the SPARKLINE, top-right of the eyebrow: the whole path in miniature —
 *     every week's altitude on a 56 × 22 polyline at 35% white — with this
 *     week's dot in the week's colour. It is a button ("See your whole
 *     line") that zooms out to the overview;
 *   • the EXIT-EDGE LIGHT: a 3 px bar in the week's colour on the edge that
 *     faces the next card (top on a climb, bottom on a dip, right on a hold),
 *     inset 40 px from the corners, glowing `0 0 18px 4px` at 60% alpha and
 *     pulsing with Tailwind's `animate-pulse` — still under Reduce Motion;
 *   • the IDENTITY WHISPER: `Becoming: <identity>` in serif italic at 12 px
 *     and 45% white, or the subject's name when nothing has been written.
 *
 * This module is the geometry, the colours and the words, pure, so the test
 * can hold them to the web's values without laying anything out. `WeekCard`
 * draws them; `JourneyStage` says which card is focused, which edge faces
 * the next card, and what tapping the sparkline does.
 */

import { Platform } from 'react-native'
import type { BoxShadowValue } from 'react-native'
import { PILLAR, pillarColor, type Pillar } from './pillarColors'

/** Which edge of the focused card faces the next one (`exitEdge` in `@become/core`). */
export type ExitEdge = 'up' | 'right' | 'down'

/** The web's `tone`: `pillarColor(subject, score, 62)` — the dot and the bar. */
export const TONE_LIGHTNESS = 62

export function focusTone(subject: Pillar, score: number): string {
  return pillarColor(subject, score, TONE_LIGHTNESS)
}

// ── The sparkline ──────────────────────────────────────────────────────────

export const SPARK_W = 56
export const SPARK_H = 22
/** The line keeps 3 px clear of the top and bottom edges. */
export const SPARK_PAD_Y = 3
export const SPARK_STROKE_WIDTH = 1.5
/** `rgba(255,255,255,0.35)`: the line is white at 35%. */
export const SPARK_LINE_ALPHA = 0.35
export const SPARK_DOT_R = 2.6
/** The web's `p-1` around the drawing, which is also its tap padding. */
export const SPARK_PADDING = 4

export interface SparklineGeometry {
  /** `<polyline points>` — one `x,y` per week, left to right. */
  points: string
  /** This week's dot. */
  cx: number
  cy: number
}

/**
 * The web's sparkline, point for point: the x axis is the week's index over
 * the path, the y axis its altitude against the highest (never under 1, so a
 * flat start does not divide by zero), with 3 px clear top and bottom.
 */
export function sparklinePoints(altitudes: readonly number[], at: number): SparklineGeometry {
  const max = Math.max(1, ...altitudes)
  const n = Math.max(1, altitudes.length - 1)
  const y = (a: number) => SPARK_H - SPARK_PAD_Y - (a / max) * (SPARK_H - SPARK_PAD_Y * 2)
  const points = altitudes.map((a, i) => `${(i / n) * SPARK_W},${y(a)}`).join(' ')
  return { points, cx: (at / n) * SPARK_W, cy: y(altitudes[at] ?? 0) }
}

// ── The exit-edge light ────────────────────────────────────────────────────

/** `h-[3px]` / `w-[3px]`. */
export const EXIT_EDGE_THICKNESS = 3
/** `inset-x-10` / `inset-y-10`: 2.5rem clear of the corners. */
export const EXIT_EDGE_INSET = 40
export const EXIT_EDGE_RADIUS = 3
/** `box-shadow: 0 0 18px 4px pillarColor(subject, score, 60, 0.6)`. */
export const EXIT_GLOW_BLUR = 18
export const EXIT_GLOW_SPREAD = 4
export const EXIT_GLOW_LIGHTNESS = 60
export const EXIT_GLOW_ALPHA = 0.6

export interface ExitEdgePlacement {
  top?: number
  right?: number
  bottom?: number
  left?: number
  width?: number
  height?: number
}

/**
 * Where the bar sits: along the top on a climb, the bottom on a dip, down
 * the right edge on a hold — always on the edge the next card is past.
 */
export function exitEdgePlacement(edge: ExitEdge): ExitEdgePlacement {
  if (edge === 'up') return { top: 0, left: EXIT_EDGE_INSET, right: EXIT_EDGE_INSET, height: EXIT_EDGE_THICKNESS }
  if (edge === 'down') return { bottom: 0, left: EXIT_EDGE_INSET, right: EXIT_EDGE_INSET, height: EXIT_EDGE_THICKNESS }
  return { right: 0, top: EXIT_EDGE_INSET, bottom: EXIT_EDGE_INSET, width: EXIT_EDGE_THICKNESS }
}

export function exitEdgeGlow(subject: Pillar, score: number): string {
  return pillarColor(subject, score, EXIT_GLOW_LIGHTNESS, EXIT_GLOW_ALPHA)
}

/**
 * The web's `box-shadow`, as React Native's `boxShadow` (New Architecture,
 * which Reanimated 4 already requires): the same blur, spread and colour on
 * both platforms, and clipped by the card's `overflow: hidden` exactly as the
 * web's is.
 */
export function exitEdgeShadow(subject: Pillar, score: number): BoxShadowValue[] {
  return [
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: EXIT_GLOW_BLUR,
      spreadDistance: EXIT_GLOW_SPREAD,
      color: exitEdgeGlow(subject, score),
    },
  ]
}

/**
 * Tailwind's `animate-pulse`: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
 * opacity 1 → .5 at the half → 1. Under Reduce Motion the bar simply stays
 * lit, at full.
 */
export const EXIT_PULSE_MS = 2000
export const EXIT_PULSE_LOW = 0.5
export const EXIT_PULSE_EASING: readonly [number, number, number, number] = [0.4, 0, 0.6, 1]

// ── The identity whisper ───────────────────────────────────────────────────

export const WHISPER_FONT_SIZE = 12
/** `text-white/45`. */
export const WHISPER_ALPHA = 0.45

/**
 * The web's `font-serif` is Tailwind's stack — `ui-serif, Georgia, …` — so
 * on the phone it is the platform's serif: Georgia on iOS, the system serif
 * (Noto Serif) on Android. NP-160 bundles Geist only; there is no serif face
 * to register, and `components/Text.tsx` lets a caller's own `fontFamily`
 * win, which is what this is.
 */
export const WHISPER_FONT_FAMILY: string = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })

/** `identity ? \`Becoming: ${identity}\` : subj.name`. */
export function identityWhisper(identity: string | null | undefined, subject: Pillar): string {
  return identity ? `Becoming: ${identity}` : (PILLAR[subject] ?? PILLAR.empty).name
}
