/**
 * The pillar palette — one source of truth.
 *
 * The app has always spoken in these colours: training is green, nutrition is
 * red, mind is violet, and a streak is amber. The Becoming shipped with its own
 * "subject hues" (ember training, honey fuel), so the same pillar was two
 * different colours depending on the screen. Everything now reads from here.
 *
 * `hue`/`sat` drive the generated week colours (saturation scales with how
 * consistent the week was); `hex` is for SVG and inline styles; the class sets
 * are for badges and text.
 */

export type Pillar = 'training' | 'fuel' | 'mind' | 'all' | 'empty'

export interface PillarInk {
  /** Display name for a week that was mostly about this pillar. */
  name: string
  hue: number
  sat: number
  /** Solid colour for graphics (SVG strokes, inline styles) — dark-background safe. */
  hex: string
  /** Slightly deeper variant for light backgrounds. */
  hexOnLight: string
  badge: string
  text: string
  bar: string
}

export const PILLAR: Record<Pillar, PillarInk> = {
  training: {
    name: 'a training week', hue: 142, sat: 71, hex: '#4ade80', hexOnLight: '#16a34a',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500',
  },
  fuel: {
    name: 'a fuel week', hue: 0, sat: 84, hex: '#f87171', hexOnLight: '#dc2626',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    text: 'text-red-600 dark:text-red-400', bar: 'bg-red-500',
  },
  mind: {
    name: 'a mind week', hue: 258, sat: 90, hex: '#a78bfa', hexOnLight: '#7c3aed',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    text: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500',
  },
  // Every pillar showing up in one week is the gold standard — the same amber
  // the streaks wear, so "a complete week" and "a streak" read as one idea.
  all: {
    name: 'the whole system', hue: 38, sat: 92, hex: '#fbbf24', hexOnLight: '#d97706',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500',
  },
  empty: {
    name: 'a quiet week', hue: 240, sat: 5, hex: '#71717a', hexOnLight: '#71717a',
    badge: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    text: 'text-zinc-500 dark:text-zinc-400', bar: 'bg-zinc-400',
  },
}

/** The day streak and the super streak: amber, and orange when it is on fire. */
export const STREAK_INK = {
  day: { hex: '#d97706', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  // Light mode needs the deeper end of the ramp: orange-300 on white is barely there.
  super: { hex: '#ea580c', badge: 'bg-orange-200 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', bar: 'bg-orange-600 dark:bg-orange-500', text: 'text-orange-700 dark:text-orange-400' },
}

/**
 * A week's colour: the pillar's hue, saturated by how consistent the week was
 * (a thin week is dusty, a full one vivid).
 */
export function pillarColor(pillar: Pillar, score: number, l = 60, a = 1): string {
  const p = PILLAR[pillar]
  const sat = pillar === 'empty' ? 8 : Math.round(30 + (p.sat - 30) * Math.max(0, Math.min(1, score / 100)))
  return `hsl(${p.hue} ${sat}% ${l}% / ${a})`
}
