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
import { Card, StatTile, type StatTileAccent, type StatTileSize } from '@/components/ui'
import { cn } from '@/lib/cn'
import MoodCard, { type MoodLevel } from '@/components/MoodCard'
import { STREAK_MILESTONES } from '@/lib/streakConstants'
import { streakDisplay, STREAK_VISIBLE_MIN } from '@/lib/streaks/pillars'
import { describeGoal } from '@/lib/dashboard/goalTile'
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
    completedWorkouts?: number
    totalWorkouts?: number
    nextWorkout: string
    nextWorkoutDay?: string
  } | null
  stats: {
    streakDays: number
    totalWorkouts: number
    thisWeekWorkouts: number
    goalProgress: number
  }
  /** The member's goals from their profile — see /api/progress. */
  goal?: {
    fitnessGoal: string | null
    nutritionDirection: string | null
    targetWeightKg: number | null
    startWeightKg: number | null
    weeklyAvailability: number | null
    weightUnit: 'lbs' | 'kg'
  } | null
  longestStreak?: number
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
  /** Workouts per week the member committed to; null when they never set one. */
  weeklyAvailability: number | null
  weightUnit: 'lbs' | 'kg'
  todaysMood: MoodLevel | null
  isMoodUpdating: boolean
  onMoodChange: (mood: MoodLevel) => void
  /**
   * True while the backing data for stat tiles is still loading for the first
   * time (no value has arrived yet and there's no cached value to show). When
   * true, renderers emit a shimmer placeholder instead of zeros/dashes so the
   * grid never flashes "0" / "—" on a cold open. Defaults to false (treated as
   * loaded) when omitted.
   */
  loading?: boolean
}

export interface DashboardTileDef {
  id: DashboardTileId
  label: string
  description: string
  /** Accent shown in the customize modal icon-badge. Mood is special. */
  accent: StatTileAccent
  /** Icon component used by the customize-modal preview badge. */
  Icon: React.ComponentType<{ className?: string }>
  /** Render the tile for the given grid footprint (defaults to square 1x1). */
  render: (ctx: DashboardTileContext, size?: StatTileSize) => React.ReactNode
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
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" />
      <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">{label}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Loading skeleton                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Shimmer placeholder shown while a stat tile's backing data is still loading
 * for the first time. Mirrors the StatTile layout (badge + label + value +
 * footer bar) at identical dimensions so swapping it for the real tile causes
 * no layout shift. Uses `animate-pulse` like the rest of the app.
 */
function StatTileSkeleton({ size = '1x1' }: { size?: StatTileSize }): React.ReactNode {
  const wide = size === '2x1'
  return (
    <Card variant="compact" className="h-full" aria-hidden="true">
      <div className="flex h-full flex-col justify-center gap-2">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'shrink-0 animate-pulse bg-zinc-100 dark:bg-zinc-800',
              wide ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-full',
            )}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className={cn('animate-pulse rounded bg-zinc-100 dark:bg-zinc-800', wide ? 'h-7 w-1/2' : 'h-5 w-1/2')} />
          </div>
        </div>
        <div className="h-1 w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Tile renders                                                               */
/* -------------------------------------------------------------------------- */

function renderStreak(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  const { streakData, data } = ctx
  const days = streakData?.streakDays ?? data.stats.streakDays ?? 0
  const next = streakData?.nextMilestone
  const shown = streakDisplay(days)

  // A streak is not a streak until it is three long. Below that the tile says
  // "Building" and counts up to the first real one, rather than announcing a
  // one-day "streak" that resets tomorrow.
  let footer: React.ReactNode
  let value: React.ReactNode
  if (!shown.visible) {
    const pct = Math.round((Math.min(days, STREAK_VISIBLE_MIN) / STREAK_VISIBLE_MIN) * 100)
    value = <span className="text-zinc-400 dark:text-zinc-500">Building</span>
    footer = (
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-amber-500/70 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">
          {days}/{STREAK_VISIBLE_MIN} · {shown.remaining} more {shown.remaining === 1 ? 'day' : 'days'}
        </p>
      </div>
    )
  } else {
    value = days
    if (next) {
      const prev = STREAK_MILESTONES.filter(m => m <= days).slice(-1)[0] ?? 0
      const pct = Math.min(100, Math.round(((days - prev) / (next - prev)) * 100))
      footer = (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">{next - days}d to {next}-day 🏆</p>
        </div>
      )
    } else {
      footer = <PlaceholderFooter label="Every milestone reached" />
    }
  }

  return (
    <StatTile
      size={size}
      href="/dashboard/streaks"
      accent="amber"
      icon={<Flame className={`${size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} ${streakData?.activityToday ? '' : 'opacity-40'}`} />}
      label="Day Streak"
      labelExtra={streakData && streakData.streakFreezes > 0 ? (
        <span className="ml-1.5 text-blue-500 dark:text-blue-400">
          {'❄'.repeat(streakData.streakFreezes)}
        </span>
      ) : null}
      value={value}
      footer={footer}
    />
  )
}

function renderMood(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  return (
    <MoodCard
      currentMood={ctx.todaysMood}
      onMoodChange={ctx.onMoodChange}
      isUpdating={ctx.isMoodUpdating}
      recentMoods={ctx.data.moodData.slice(-7).map(m => m.value)}
    />
  )
}

function renderWeekly(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  const { data } = ctx
  // The target is what the member set (profile.weeklyAvailability). No target
  // means no fraction — "2/4" against an invented 4 was a goal nobody chose.
  const target = data.goal?.weeklyAvailability ?? ctx.weeklyAvailability ?? null
  const done = data.stats.thisWeekWorkouts
  if (!target) {
    return (
      <StatTile
        size={size}
        href="/dashboard/settings"
        accent="green"
        icon={<TrendingUp className={size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} />}
        label="This Week"
        value={done}
        footer={<PlaceholderFooter label="Set a weekly target" />}
      />
    )
  }
  const pct = Math.min(100, Math.round((done / target) * 100))
  const remaining = Math.max(0, target - done)
  return (
    <StatTile
      size={size}
      href="/dashboard/streaks"
      accent="green"
      icon={<TrendingUp className={size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} />}
      label="This Week"
      value={`${done}/${target}`}
      footer={(
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">
            {remaining === 0 ? 'Weekly target hit 🎉' : `${remaining} to weekly target`}
          </p>
        </div>
      )}
    />
  )
}

function renderGoal(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  const { data } = ctx
  const unit = data.goal?.weightUnit ?? ctx.weightUnit
  const weights = data.weightData
  const view = describeGoal({
    fitnessGoal: data.goal?.fitnessGoal,
    nutritionDirection: data.goal?.nutritionDirection,
    targetWeightKg: data.goal?.targetWeightKg,
    startWeightKg: data.goal?.startWeightKg,
    // weightData is in the member's unit already (weight is stored as logged).
    latestWeight: weights.length ? weights[weights.length - 1].value : null,
    earliestWeight: weights.length ? weights[0].value : null,
    weightUnit: unit,
    program: data.currentProgram
      ? {
          name: data.currentProgram.name,
          completedWorkouts: data.currentProgram.completedWorkouts,
          totalWorkouts: data.currentProgram.totalWorkouts,
          currentWeek: data.currentProgram.currentWeek,
          totalWeeks: data.currentProgram.totalWeeks,
          programId: data.currentProgram.programId,
        }
      : null,
  })
  const barClass = view.atTarget ? 'bg-green-500' : 'bg-purple-500'
  return (
    <StatTile
      size={size}
      href={view.href}
      accent="purple"
      icon={<Target className={size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} />}
      label={view.label}
      value={
        view.kind === 'unset'
          ? <span className="text-zinc-400 dark:text-zinc-500">{view.value}</span>
          // "12 lbs to go" wraps at 2xl on a 1x1 tile; step long values down a size.
          : view.value.length > 8 ? <span className="text-xl">{view.value}</span> : view.value
      }
      footer={(
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${barClass} transition-all duration-500`}
              style={{ width: `${view.pct}%` }}
            />
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-600">
            {view.direction === 'down' ? '↓ ' : view.direction === 'up' ? '↑ ' : ''}{view.footer}
          </p>
        </div>
      )}
    />
  )
}

function renderCalories(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  const calIcon = <Utensils className={size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} />
  const cal = ctx.nutritionData?.calories
  if (!cal || !cal.goal) {
    return (
      <StatTile
        size={size}
        href="/dashboard/nutrition"
        accent="red"
        icon={calIcon}
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
      size={size}
      href="/dashboard/nutrition"
      accent={accent}
      icon={calIcon}
      label="Calories"
      value={`${consumed}/${goal}`}
      footer={(
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${barClass} transition-all duration-500`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">
            {over ? `${overBy} over` : `${remaining} cal left`}
          </p>
        </div>
      )}
    />
  )
}

function renderWater(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  const waterIcon = <Droplets className={size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} />
  const water = ctx.nutritionData?.water
  if (!water || !water.goal) {
    return (
      <StatTile
        size={size}
        href="/dashboard/nutrition"
        accent="blue"
        icon={waterIcon}
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
      size={size}
      href="/dashboard/nutrition"
      accent="blue"
      icon={waterIcon}
      label="Water"
      value={`${current}/${goal} oz`}
      footer={(
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">
            {hit ? 'Hydration goal hit 💧' : `${remaining} oz to goal`}
          </p>
        </div>
      )}
    />
  )
}

function renderWeight(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  const weightIcon = <Scale className={size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} />
  const entries = ctx.data.weightData
  if (entries.length === 0) {
    return (
      <StatTile
        size={size}
        href="/dashboard/progress"
        accent="zinc"
        icon={weightIcon}
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
      size={size}
      href="/dashboard/progress"
      accent="zinc"
      icon={weightIcon}
      label="Weight"
      value={`${latest.toFixed(1)} ${ctx.weightUnit}`}
      footer={(
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${barColor} transition-all duration-500`}
              style={{ width: '50%' }}
            />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">{label}</p>
        </div>
      )}
    />
  )
}

function renderWorkouts(ctx: DashboardTileContext, size: StatTileSize = '1x1'): React.ReactNode {
  if (ctx.loading) return <StatTileSkeleton size={size} />
  const total = ctx.data.stats.totalWorkouts ?? 0
  return (
    <StatTile
      size={size}
      href="/dashboard/progress#workouts"
      accent="zinc"
      icon={<Dumbbell className={size === '2x1' ? 'h-5 w-5' : 'h-4 w-4'} />}
      label="Total Workouts"
      value={total}
      footer={(
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
              style={{ width: '100%' }}
            />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-600">
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
    description: 'Workouts finished vs your weekly target',
    accent: 'green',
    Icon: TrendingUp,
    render: renderWeekly,
  },
  goal: {
    id: 'goal',
    label: 'Goal',
    description: 'How far to your target',
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
