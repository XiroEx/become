"use client"

import * as React from 'react'
import {
  Flame,
  Target,
  TrendingUp,
  Droplets,
  Scale,
  Dumbbell,
  Utensils,
} from 'lucide-react'
import { StatTile, type StatTileAccent } from '@/components/ui'
import MoodCard, { type MoodLevel } from '@/components/MoodCard'
import { STREAK_MILESTONES } from '@/lib/streakConstants'
import type { MetricData } from '@/components/ProgressChart'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type DashboardTileId =
  | 'streak'
  | 'mood'
  | 'weekly'
  | 'goal'
  | 'calories'
  | 'water'
  | 'weight'
  | 'workouts'

export interface UserProgressData {
  weightData: MetricData[]
  bmiData: MetricData[]
  bodyFatData?: MetricData[]
  leanMassData?: MetricData[]
  moodData: MetricData[]
  currentProgram: {
    programId: string
    name: string
    currentPhase: number
    currentWeek: number
    totalWeeks: number
    nextWorkout: string
    nextWorkoutDay?: string
  } | null
  stats: {
    streakDays: number
    totalWorkouts: number
    thisWeekWorkouts: number
    goalProgress: number
  }
}

export interface DashboardStreakData {
  streakDays: number
  longestStreak: number
  streakFreezes: number
  milestonesReached: number[]
  activityToday: boolean
  nextMilestone: number | null
}

export interface DashboardNutritionData {
  calories: { consumed: number; goal: number }
  protein: { current: number; goal: number }
  carbs: { current: number; goal: number }
  fats: { current: number; goal: number }
  water: { current: number; goal: number }
}

export interface DashboardTileContext {
  data: UserProgressData
  streakData: DashboardStreakData | null
  nutritionData: DashboardNutritionData | null
  weeklyAvailability: number
  weightUnit: 'lbs' | 'kg'
  todaysMood: MoodLevel | null
  isMoodUpdating: boolean
  onMoodChange: (mood: MoodLevel) => void
}

export interface DashboardTileDef {
  id: DashboardTileId
  label: string
  description: string
  /** Accent shown in the customize modal icon-badge. Mood is special. */
  accent: StatTileAccent
  /** Icon component used by the customize-modal preview badge. */
  Icon: React.ComponentType<{ className?: string }>
  render: (ctx: DashboardTileContext) => React.ReactNode
}

/* -------------------------------------------------------------------------- */
/* Footer helper                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Empty/placeholder footer used when a tile has no usable data. Keeps height
 * identical to a populated footer so the 2x2 grid stays aligned.
 */
function PlaceholderFooter({ label }: { label: string }) {
  return (
    <div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" />
      <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">{label}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tile renders                                                               */
/* -------------------------------------------------------------------------- */

function renderStreak(ctx: DashboardTileContext): React.ReactNode {
  const { streakData, data } = ctx
  const days = streakData?.streakDays ?? data.stats.streakDays ?? 0
  const next = streakData?.nextMilestone

  let footer: React.ReactNode
  if (next && days > 0) {
    const prev = STREAK_MILESTONES.filter(m => m <= days).slice(-1)[0] ?? 0
    const pct = Math.min(100, Math.round(((days - prev) / (next - prev)) * 100))
    footer = (
      <div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">{next - days}d to 🏆</p>
      </div>
    )
  } else {
    footer = <PlaceholderFooter label="Start your streak" />
  }

  return (
    <StatTile
      href="/dashboard/progress"
      accent="amber"
      icon={<Flame className={`h-4 w-4 ${streakData?.activityToday ? '' : 'opacity-40'}`} />}
      label="Day Streak"
      labelExtra={streakData && streakData.streakFreezes > 0 ? (
        <span className="ml-1.5 text-blue-500 dark:text-blue-400">
          {'❄'.repeat(streakData.streakFreezes)}
        </span>
      ) : null}
      value={days}
      footer={footer}
    />
  )
}

function renderMood(ctx: DashboardTileContext): React.ReactNode {
  return (
    <MoodCard
      currentMood={ctx.todaysMood}
      onMoodChange={ctx.onMoodChange}
      isUpdating={ctx.isMoodUpdating}
      recentMoods={ctx.data.moodData.slice(-7).map(m => m.value)}
    />
  )
}

function renderWeekly(ctx: DashboardTileContext): React.ReactNode {
  const { data, weeklyAvailability } = ctx
  const pct = weeklyAvailability > 0
    ? Math.min(100, Math.round((data.stats.thisWeekWorkouts / weeklyAvailability) * 100))
    : 0
  const remaining = Math.max(0, weeklyAvailability - data.stats.thisWeekWorkouts)
  return (
    <StatTile
      href="/dashboard/progress#workouts"
      accent="green"
      icon={<TrendingUp className="h-4 w-4" />}
      label="This Week"
      value={`${data.stats.thisWeekWorkouts}/${weeklyAvailability}`}
      footer={(
        <div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
            {remaining === 0 ? 'Weekly goal hit 🎉' : `${remaining} to weekly goal`}
          </p>
        </div>
      )}
    />
  )
}

function renderGoal(ctx: DashboardTileContext): React.ReactNode {
  const { data } = ctx
  const pct = Math.min(100, Math.max(0, data.stats.goalProgress))
  return (
    <StatTile
      accent="purple"
      icon={<Target className="h-4 w-4" />}
      label="Goal"
      value={`${data.stats.goalProgress}%`}
      footer={(
        <div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-purple-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
            {pct >= 100 ? 'Annual goal hit 🎯' : 'Annual goal'}
          </p>
        </div>
      )}
    />
  )
}

function renderCalories(ctx: DashboardTileContext): React.ReactNode {
  const cal = ctx.nutritionData?.calories
  if (!cal || !cal.goal) {
    return (
      <StatTile
        href="/dashboard/nutrition"
        accent="red"
        icon={<Utensils className="h-4 w-4" />}
        label="Calories"
        value="0/--"
        footer={<PlaceholderFooter label="Set a calorie goal" />}
      />
    )
  }
  const consumed = Math.round(cal.consumed)
  const goal = Math.round(cal.goal)
  const pct = Math.min(100, Math.max(0, Math.round((consumed / goal) * 100)))
  const over = consumed > goal
  const near = !over && pct >= 90
  const remaining = Math.max(0, goal - consumed)
  const overBy = consumed - goal

  // Bar color: green under, amber 90-100%, red over
  const barClass = over
    ? 'bg-red-500'
    : near
      ? 'bg-amber-500'
      : 'bg-green-500'
  const barPct = over ? 100 : pct
  const accent: StatTileAccent = over ? 'red' : 'green'

  return (
    <StatTile
      href="/dashboard/nutrition"
      accent={accent}
      icon={<Utensils className="h-4 w-4" />}
      label="Calories"
      value={`${consumed}/${goal}`}
      footer={(
        <div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${barClass} transition-all duration-500`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
            {over ? `${overBy} over` : `${remaining} cal left`}
          </p>
        </div>
      )}
    />
  )
}

function renderWater(ctx: DashboardTileContext): React.ReactNode {
  const water = ctx.nutritionData?.water
  if (!water || !water.goal) {
    return (
      <StatTile
        href="/dashboard/nutrition"
        accent="blue"
        icon={<Droplets className="h-4 w-4" />}
        label="Water"
        value="0/-- oz"
        footer={<PlaceholderFooter label="Set a water goal" />}
      />
    )
  }
  const current = Math.round(water.current)
  const goal = Math.round(water.goal)
  const pct = Math.min(100, Math.max(0, Math.round((current / goal) * 100)))
  const remaining = Math.max(0, goal - current)
  const hit = current >= goal
  return (
    <StatTile
      href="/dashboard/nutrition"
      accent="blue"
      icon={<Droplets className="h-4 w-4" />}
      label="Water"
      value={`${current}/${goal} oz`}
      footer={(
        <div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
            {hit ? 'Hydration goal hit 💧' : `${remaining} oz to goal`}
          </p>
        </div>
      )}
    />
  )
}

function renderWeight(ctx: DashboardTileContext): React.ReactNode {
  const entries = ctx.data.weightData
  if (entries.length === 0) {
    return (
      <StatTile
        href="/dashboard/progress"
        accent="zinc"
        icon={<Scale className="h-4 w-4" />}
        label="Weight"
        value="—"
        footer={<PlaceholderFooter label="Log your first weigh-in" />}
      />
    )
  }

  const latest = entries[entries.length - 1].value
  const prev = entries.length >= 2 ? entries[entries.length - 2].value : null
  let label = 'First weigh-in'
  let direction: 'up' | 'down' | 'flat' | 'none' = 'none'

  if (prev !== null) {
    const delta = latest - prev
    const absDelta = Math.abs(delta)
    if (absDelta < 0.05) {
      direction = 'flat'
      label = '→ no change'
    } else if (delta > 0) {
      direction = 'up'
      label = `↑ +${absDelta.toFixed(1)}`
    } else {
      direction = 'down'
      label = `↓ -${absDelta.toFixed(1)}`
    }
  }

  // Neutral zinc bar — sentiment is goal-dependent so we don't try to color it.
  const barColor =
    direction === 'flat' ? 'bg-zinc-300 dark:bg-zinc-700'
    : 'bg-zinc-400 dark:bg-zinc-500'

  return (
    <StatTile
      href="/dashboard/progress"
      accent="zinc"
      icon={<Scale className="h-4 w-4" />}
      label="Weight"
      value={`${latest.toFixed(1)} ${ctx.weightUnit}`}
      footer={(
        <div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${barColor} transition-all duration-500`}
              style={{ width: '50%' }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">{label}</p>
        </div>
      )}
    />
  )
}

function renderWorkouts(ctx: DashboardTileContext): React.ReactNode {
  const total = ctx.data.stats.totalWorkouts ?? 0
  return (
    <StatTile
      href="/dashboard/progress#workouts"
      accent="zinc"
      icon={<Dumbbell className="h-4 w-4" />}
      label="Total Workouts"
      value={total}
      footer={(
        <div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
              style={{ width: '100%' }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
            {total === 0 ? 'Keep going' : 'Lifetime'}
          </p>
        </div>
      )}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export const TILE_DEFS: Record<DashboardTileId, DashboardTileDef> = {
  streak: {
    id: 'streak',
    label: 'Day Streak',
    description: "Days you've been consistent",
    accent: 'amber',
    Icon: Flame,
    render: renderStreak,
  },
  mood: {
    id: 'mood',
    label: "Today's Mood",
    description: 'Your mood today and recent trend',
    accent: 'zinc',
    Icon: Flame, // unused — mood gets a custom badge in the modal
    render: renderMood,
  },
  weekly: {
    id: 'weekly',
    label: 'This Week',
    description: 'Workouts logged this week',
    accent: 'green',
    Icon: TrendingUp,
    render: renderWeekly,
  },
  goal: {
    id: 'goal',
    label: 'Goal',
    description: 'Annual goal progress',
    accent: 'purple',
    Icon: Target,
    render: renderGoal,
  },
  calories: {
    id: 'calories',
    label: 'Calories',
    description: "Today's calories vs goal",
    accent: 'red',
    Icon: Utensils,
    render: renderCalories,
  },
  water: {
    id: 'water',
    label: 'Water',
    description: "Today's water vs goal",
    accent: 'blue',
    Icon: Droplets,
    render: renderWater,
  },
  weight: {
    id: 'weight',
    label: 'Weight',
    description: 'Latest weigh-in and trend',
    accent: 'zinc',
    Icon: Scale,
    render: renderWeight,
  },
  workouts: {
    id: 'workouts',
    label: 'Total Workouts',
    description: 'Lifetime sessions logged',
    accent: 'zinc',
    Icon: Dumbbell,
    render: renderWorkouts,
  },
}

export const ALL_TILE_IDS: DashboardTileId[] = [
  'streak',
  'mood',
  'weekly',
  'goal',
  'calories',
  'water',
  'weight',
  'workouts',
]

export const DEFAULT_TILE_IDS: DashboardTileId[] = ['streak', 'mood', 'weekly', 'goal']

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = 'dashboard.tiles.v1'
const MAX_TILES = 8
const MIN_TILES = 2

function isValidId(value: unknown): value is DashboardTileId {
  return typeof value === 'string' && (ALL_TILE_IDS as string[]).includes(value)
}

export function loadTilePreference(): DashboardTileId[] {
  if (typeof window === 'undefined') return DEFAULT_TILE_IDS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TILE_IDS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_TILE_IDS

    // Dedupe + validate
    const seen = new Set<DashboardTileId>()
    const filtered: DashboardTileId[] = []
    for (const item of parsed) {
      if (isValidId(item) && !seen.has(item)) {
        seen.add(item)
        filtered.push(item)
        if (filtered.length >= MAX_TILES) break
      }
    }

    if (filtered.length < MIN_TILES) return DEFAULT_TILE_IDS
    return filtered
  } catch {
    return DEFAULT_TILE_IDS
  }
}

export function saveTilePreference(ids: DashboardTileId[]): void {
  if (typeof window === 'undefined') return
  try {
    const seen = new Set<DashboardTileId>()
    const filtered: DashboardTileId[] = []
    for (const item of ids) {
      if (isValidId(item) && !seen.has(item)) {
        seen.add(item)
        filtered.push(item)
        if (filtered.length >= MAX_TILES) break
      }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch {
    // Privacy mode / quota — just no-op.
  }
}
