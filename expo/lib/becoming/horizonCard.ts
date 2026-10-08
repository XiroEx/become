/**
 * THE HORIZON CARD (NP-344) — the web's background, border and type, as numbers.
 *
 * On the web (`webapp/components/becoming/journey/WeekCard.tsx`, `HorizonCard`)
 * the card one step past the live week is not a week card: it is a violet
 * wash under a dashed border, with the identity set in serif.
 *
 *   rounded-[28px] border-2 border-dashed
 *   border-violet-300/60 while it is the focused card, border-white/25 otherwise
 *   background: linear-gradient(160deg, rgba(124,58,237,.22), rgba(14,12,23,.97) 55%)
 *
 *   "Who am I becoming?"  text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50, mt-6
 *   the identity          mt-2 font-serif italic leading-snug text-white line-clamp-6,
 *                         text-[24px] — text-[19px] when longer than 140 characters
 *
 * Review of NP-204 on 10/8 found the native card a flat dark surface with the
 * identity in sans italic. React Native has no CSS gradient, so `HorizonCard`
 * draws the wash with react-native-svg the way `WeekCard` draws its sky
 * (`cardSky.ts`), and this module is the geometry, the colours and the type,
 * pure, so the test can hold them to the web's values without laying anything
 * out. The colours are the stage's own tokens: the wash is `skyViolet`
 * (violet-600, `rgba(124,58,237)`) over `card` (the web's `#0e0c17`), the
 * focused ring is `horizonRing` (violet-300), and the words are `ink`.
 */

import { WHISPER_FONT_FAMILY } from './focusedCard'
import { becomingStageTokens, rgbOf } from '@/lib/theme/tokens'

// ── The box ────────────────────────────────────────────────────────────────

/** `rounded-[28px]`. */
export const HORIZON_RADIUS = 28
/** `border-2 border-dashed`. */
export const HORIZON_BORDER_WIDTH = 2
export const HORIZON_BORDER_STYLE = 'dashed' as const
/** `border-violet-300/60` while focused … */
export const HORIZON_BORDER_FOCUSED_ALPHA = 0.6
/** … and `border-white/25` otherwise. */
export const HORIZON_BORDER_ALPHA = 0.25

export interface HorizonBorder {
  width: number
  style: typeof HORIZON_BORDER_STYLE
  color: string
}

/** The dashed border: violet-300 at 60% on the focused card, white at 25% on any other. */
export function horizonBorder(focused: boolean): HorizonBorder {
  return {
    width: HORIZON_BORDER_WIDTH,
    style: HORIZON_BORDER_STYLE,
    color: focused
      ? rgbOf(becomingStageTokens.horizonRing, HORIZON_BORDER_FOCUSED_ALPHA)
      : rgbOf(becomingStageTokens.ink, HORIZON_BORDER_ALPHA),
  }
}

// ── The wash ───────────────────────────────────────────────────────────────

/** `linear-gradient(160deg, …)`: the same angle as a week card's wash. */
export const HORIZON_WASH_ANGLE_DEG = 160
/** `rgba(124,58,237,0.22)` at 0% … */
export const HORIZON_WASH_ALPHA = 0.22
/** … to `rgba(14,12,23,0.97)` at 55%, and that colour on to the far corner. */
export const HORIZON_GROUND_ALPHA = 0.97
export const HORIZON_GROUND_AT = 0.55

export interface HorizonWashStop {
  offset: number
  color: string
  opacity: number
}

/**
 * The gradient's stops, as react-native-svg takes them (colour and opacity
 * apart). CSS pads a gradient with its last stop, and so does SVG, so the
 * 55% stop is the last one.
 */
export function horizonWash(): HorizonWashStop[] {
  return [
    { offset: 0, color: rgbOf(becomingStageTokens.skyViolet), opacity: HORIZON_WASH_ALPHA },
    { offset: HORIZON_GROUND_AT, color: rgbOf(becomingStageTokens.card), opacity: HORIZON_GROUND_ALPHA },
  ]
}

// ── The type ───────────────────────────────────────────────────────────────

/** `text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50`, `mt-6`. */
export const HORIZON_KICKER_FONT_SIZE = 11
/** `tracking-[0.3em]` of an 11px face. */
export const HORIZON_KICKER_TRACKING = 0.3 * HORIZON_KICKER_FONT_SIZE
export const HORIZON_KICKER_ALPHA = 0.5
export const HORIZON_KICKER_GAP = 24
/** `mt-2` between the kicker and the words. */
export const HORIZON_IDENTITY_GAP = 8

/** `text-[24px]`, or `text-[19px]` when the identity runs past 140 characters. */
export const HORIZON_IDENTITY_FONT_SIZE = 24
export const HORIZON_IDENTITY_FONT_SIZE_LONG = 19
export const HORIZON_IDENTITY_LONG_OVER = 140
/** `leading-snug`. */
export const HORIZON_IDENTITY_LEADING = 1.375
/** `line-clamp-6`. */
export const HORIZON_IDENTITY_LINES = 6
/**
 * `font-serif`: Tailwind's `ui-serif, Georgia, …`, which on the phone is the
 * platform's serif — the same face the focused card's whisper uses (NP-343).
 */
export const HORIZON_FONT_FAMILY: string = WHISPER_FONT_FAMILY

export interface HorizonIdentityType {
  fontFamily: string
  fontStyle: 'italic'
  fontSize: number
  lineHeight: number
}

/** Serif italic at 24px, snug — 19px once the words run past 140 characters. */
export function horizonIdentityType(identity: string | null | undefined): HorizonIdentityType {
  const fontSize =
    identity && identity.length > HORIZON_IDENTITY_LONG_OVER ? HORIZON_IDENTITY_FONT_SIZE_LONG : HORIZON_IDENTITY_FONT_SIZE
  return { fontFamily: HORIZON_FONT_FAMILY, fontStyle: 'italic', fontSize, lineHeight: fontSize * HORIZON_IDENTITY_LEADING }
}
