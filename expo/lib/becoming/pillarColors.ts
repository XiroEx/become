/**
 * The pillar palette — one source of truth for The Becoming.
 */

export type Pillar = 'training' | 'fuel' | 'mind' | 'all' | 'empty'

export interface PillarInk {
  name: string
  hue: number
  sat: number
  hsl: string
  hslOnLight: string
  badge: string
  text: string
  bar: string
}

export const PILLAR: Record<Pillar, PillarInk> = {
  training: {
    name: 'a training week',
    hue: 142,
    sat: 71,
    hsl: 'hsl(142, 71%, 58%)',
    hslOnLight: 'hsl(142, 76%, 36%)',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    text: 'text-green-600 dark:text-green-400',
    bar: 'bg-green-500',
  },
  fuel: {
    name: 'a fuel week',
    hue: 0,
    sat: 84,
    hsl: 'hsl(0, 84%, 71%)',
    hslOnLight: 'hsl(0, 72%, 51%)',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    text: 'text-red-600 dark:text-red-400',
    bar: 'bg-red-500',
  },
  mind: {
    name: 'a mind week',
    hue: 258,
    sat: 90,
    hsl: 'hsl(258, 90%, 76%)',
    hslOnLight: 'hsl(258, 90%, 58%)',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    text: 'text-purple-600 dark:text-purple-400',
    bar: 'bg-purple-500',
  },
  all: {
    name: 'the whole system',
    hue: 38,
    sat: 92,
    hsl: 'hsl(38, 92%, 56%)',
    hslOnLight: 'hsl(38, 92%, 44%)',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-400',
    bar: 'bg-amber-500',
  },
  empty: {
    name: 'a quiet week',
    hue: 240,
    sat: 5,
    hsl: 'hsl(240, 5%, 46%)',
    hslOnLight: 'hsl(240, 5%, 46%)',
    badge: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    text: 'text-zinc-500 dark:text-zinc-400',
    bar: 'bg-zinc-400',
  },
}

export const STREAK_INK = {
  day: {
    hsl: 'hsl(38, 92%, 44%)',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    bar: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-400',
  },
  super: {
    hsl: 'hsl(21, 90%, 48%)',
    badge: 'bg-orange-200 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    bar: 'bg-orange-600 dark:bg-orange-500',
    text: 'text-orange-700 dark:text-orange-400',
  },
}

export function pillarColor(pillar: Pillar, score: number, l = 60, a = 1): string {
  const p = PILLAR[pillar] ?? PILLAR.empty
  const sat =
    pillar === 'empty'
      ? 8
      : Math.round(30 + (p.sat - 30) * Math.max(0, Math.min(1, score / 100)))
  if (a < 1) {
    return `hsla(${p.hue}, ${sat}%, ${l}%, ${a})`
  }
  return `hsl(${p.hue}, ${sat}%, ${l}%)`
}
