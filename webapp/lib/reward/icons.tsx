'use client'

// Preset profile icons — the starter set every user can equip for free. Rendered
// from lucide glyphs on a branded gradient, so there's no asset pipeline. Custom
// uploads (User.avatarUrl) are handled separately; this is the built-in catalog.
//
// This lives under lib/reward/ because profile icons are the first "collectible"
// type in the redReward system — later frames/titles/badges join them. Keeping
// the catalog here keeps the cosmetic surface in one place, extractable into
// @redbtn/redreward later.

import {
  Flame, Mountain, Zap, Heart, Dumbbell, Sunrise, Target, Sparkles,
  Leaf, Trophy, type LucideIcon,
} from 'lucide-react'
import type { FitnessGoal } from '@/models/User'

export interface PresetIcon {
  id: string
  label: string
  Icon: LucideIcon
  /** Tailwind gradient classes for the icon's background. */
  gradient: string
}

export const PRESET_ICONS: PresetIcon[] = [
  { id: 'flame', label: 'Flame', Icon: Flame, gradient: 'from-orange-500 to-red-500' },
  { id: 'strength', label: 'Strength', Icon: Dumbbell, gradient: 'from-violet-500 to-indigo-500' },
  { id: 'bolt', label: 'Bolt', Icon: Zap, gradient: 'from-amber-400 to-yellow-500' },
  { id: 'heart', label: 'Heart', Icon: Heart, gradient: 'from-rose-500 to-pink-500' },
  { id: 'summit', label: 'Summit', Icon: Mountain, gradient: 'from-sky-500 to-blue-600' },
  { id: 'sunrise', label: 'Sunrise', Icon: Sunrise, gradient: 'from-amber-400 to-orange-500' },
  { id: 'focus', label: 'Focus', Icon: Target, gradient: 'from-emerald-500 to-green-600' },
  { id: 'spark', label: 'Spark', Icon: Sparkles, gradient: 'from-fuchsia-500 to-violet-500' },
  { id: 'leaf', label: 'Calm', Icon: Leaf, gradient: 'from-green-500 to-teal-500' },
  { id: 'champion', label: 'Champion', Icon: Trophy, gradient: 'from-yellow-400 to-amber-500' },
]

const PRESET_BY_ID = new Map(PRESET_ICONS.map((p) => [p.id, p]))

/** Look up a preset by id (falls back to the first preset). */
export function presetIcon(id: string | null | undefined): PresetIcon {
  return (id && PRESET_BY_ID.get(id)) || PRESET_ICONS[0]
}

/** The default icon for a new user, derived from their onboarding fitness goal. */
const GOAL_TO_ICON: Record<FitnessGoal, string> = {
  lose_weight: 'flame',
  gain_muscle: 'strength',
  improve_performance: 'bolt',
  general_health: 'heart',
  maintain: 'focus',
}

export function defaultIconForGoal(goal: FitnessGoal | undefined | null): string {
  return (goal && GOAL_TO_ICON[goal]) || 'spark'
}
