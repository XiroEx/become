"use client"

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { Card } from '@/components/ui'
import MacroBar from './MacroBar'
import {
  macroStatus,
  macroStrokeColor,
  macroTextClass,
  MACRO_COLORS,
} from '@/lib/nutrition/macroStatus'

interface MacroValues {
  current: number
  goal: number
  /**
   * Grams still planned (not yet logged) for today, on top of `current`.
   * Rendered as a light shadow past the solid fill — a preview of where the
   * bar lands if the rest of today's plan gets eaten.
   */
  planned?: number
}

interface CalorieRingProps {
  consumed: number
  goal: number
  protein: MacroValues
  carbs: MacroValues
  fats: MacroValues
  /** Grams of the day's carbs that are fiber. Shaded inside the carb bar. */
  fiber?: number
  /**
   * Calories still planned (not yet logged) for today, on top of `consumed`.
   * Rendered as a light shadow arc past the solid ring — a preview of where
   * the day lands if the rest of today's plan gets eaten.
   */
  plannedExtra?: number
}

export default function CalorieRing({ consumed, goal, protein, carbs, fats, fiber, plannedExtra }: CalorieRingProps) {
  const router = useRouter()
  const remaining = goal - consumed
  // Calories are a ceiling: hitting the target is the win, a few over is a
  // nudge, well over is the warning. A single calorie over used to read exactly
  // as red as 500 over.
  const status = macroStatus(consumed, goal, 'ceiling')
  const isOver = status === 'over' || status === 'warn'
  const percentage = goal > 0 ? Math.min(consumed / goal, 1) : 0
  const plannedPercentage = goal > 0 && plannedExtra
    ? Math.min((consumed + plannedExtra) / goal, 1)
    : percentage

  const size = 180
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - percentage * circumference
  const plannedDashoffset = circumference - plannedPercentage * circumference

  return (
    <Card>
      {/* Card header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Daily Calories</p>
        <Link
          href="/dashboard/nutrition/goals"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Edit Goals
        </Link>
      </div>

      {/* Ring — button wrapper handles tap reliably on mobile */}
      <div className="flex flex-col items-center">
        <button
          onClick={() => router.push('/dashboard/nutrition/goals')}
          className="relative cursor-pointer rounded-full focus:outline-none active:opacity-70"
          style={{ width: size, height: size }}
          aria-label="Edit calorie goals"
        >
          <svg width={size} height={size} className="-rotate-90" style={{ pointerEvents: 'none' }}>
            <defs>
              <linearGradient id="calorie-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-zinc-200 dark:text-zinc-700"
            />
            {plannedPercentage > percentage && (
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: plannedDashoffset }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className="text-emerald-400/40 dark:text-emerald-500/30"
                aria-hidden="true"
              />
            )}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={macroStrokeColor(status, 'url(#calorie-ring-gradient)')}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          </svg>

          {/* Center text — pointer-events none so button receives the tap */}
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ pointerEvents: 'none' }}>
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className={`text-2xl font-bold tabular-nums ${
                status === 'over' ? 'text-red-500'
                  : status === 'warn' ? 'text-orange-600 dark:text-orange-400'
                  : 'text-zinc-900 dark:text-white'
              }`}
            >
              {Math.abs(remaining)}
            </motion.span>
            <span className={`text-xs font-medium ${
              status === 'over' ? 'text-red-400'
                : status === 'warn' ? 'text-orange-500'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}>
              {isOver ? 'over' : 'remaining'}
            </span>
          </div>
        </button>

        {/* Goal breakdown */}
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Goal {goal}</span>
          {' '}&minus;{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Food {consumed}</span>
          {' '}={' '}
          <span className={macroTextClass(status === 'under' || status === 'empty' ? 'hit' : status)}>
            {Math.abs(remaining)} {isOver ? 'over' : 'remaining'}
          </span>
        </p>
      </div>

      {/* Macro bars */}
      <div className="mt-5 space-y-3" data-tour="macro-rows">
        {/* Protein is a FLOOR — exceeding it is a good outcome, never a warning. */}
        <MacroBar label="Protein" current={protein.current} goal={protein.goal} color={MACRO_COLORS.protein} kind="floor" plannedExtra={protein.planned} />
        <MacroBar label="Carbs" current={carbs.current} goal={carbs.goal} color={MACRO_COLORS.carbs} fiber={fiber} plannedExtra={carbs.planned} />
        <MacroBar label="Fats" current={fats.current} goal={fats.goal} color={MACRO_COLORS.fats} plannedExtra={fats.planned} />
      </div>
    </Card>
  )
}
