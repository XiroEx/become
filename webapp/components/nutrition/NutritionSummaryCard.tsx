"use client"

import { motion } from 'framer-motion'
import { macroStatus, macroBarClass, MACRO_COLORS, type MacroKind } from '@/lib/nutrition/macroStatus'
import Link from 'next/link'
import { Droplets, UtensilsCrossed, Zap } from 'lucide-react'
import { Card } from '@/components/ui'

interface MacroValues {
  current: number
  goal: number
}

interface NutritionSummaryCardProps {
  calories: { consumed: number; goal: number }
  protein: MacroValues
  carbs: MacroValues
  fats: MacroValues
  water: MacroValues
}

function MiniMacroBar({
  current,
  goal,
  color,
  kind = 'ceiling',
}: { current: number; goal: number; color: string; kind?: MacroKind }) {
  // This bar had NO over-state at all — it clamped at 100% and kept the macro's
  // own colour, so a member 200g over on carbs saw an ordinary full green bar.
  const status = macroStatus(current, goal, kind)
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`h-full rounded-full ${macroBarClass(status, color)}`}
      />
    </div>
  )
}

export default function NutritionSummaryCard({
  calories,
  protein,
  carbs,
  fats,
  water,
}: NutritionSummaryCardProps) {
  const calPct = Math.min(calories.consumed / calories.goal, 1)
  const remaining = calories.goal - calories.consumed
  const isOver = calories.consumed > calories.goal

  // Mini ring dimensions
  const ringSize = 80
  const strokeWidth = 7
  const radius = (ringSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - calPct * circumference

  const waterPct = Math.min((water.current / water.goal) * 100, 100)

  return (
    <Card>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-900 dark:text-white">Nutrition</span>
        <Link
          href="/dashboard/nutrition"
          className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          View All
        </Link>
      </div>

      <div className="flex gap-4">
        {/* Mini calorie ring */}
        <div className="shrink-0">
          <div className="relative" style={{ width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              <defs>
                <linearGradient id="mini-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-zinc-200 dark:text-zinc-700"
              />
              <motion.circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={isOver ? '#ef4444' : 'url(#mini-ring-gradient)'}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`text-sm font-bold tabular-nums leading-none ${
                  isOver ? 'text-red-500' : 'text-zinc-900 dark:text-white'
                }`}
              >
                {Math.abs(remaining)}
              </span>
              <span className="text-[9px] text-zinc-500 dark:text-zinc-400">
                {isOver ? 'over' : 'left'}
              </span>
            </div>
          </div>
        </div>

        {/* Macros + water */}
        <div className="flex flex-1 flex-col justify-center gap-2.5">
          {/* Macro bars */}
          <div className="space-y-2">
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[11px]">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">Protein</span>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {Math.round(protein.current)}g / {Math.round(protein.goal)}g
                </span>
              </div>
              <MiniMacroBar current={protein.current} goal={protein.goal} color={MACRO_COLORS.protein} kind="floor" />
            </div>
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[11px]">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">Carbs</span>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {Math.round(carbs.current)}g / {Math.round(carbs.goal)}g
                </span>
              </div>
              <MiniMacroBar current={carbs.current} goal={carbs.goal} color={MACRO_COLORS.carbs} />
            </div>
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[11px]">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">Fats</span>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {Math.round(fats.current)}g / {Math.round(fats.goal)}g
                </span>
              </div>
              <MiniMacroBar current={fats.current} goal={fats.goal} color={MACRO_COLORS.fats} />
            </div>
          </div>

          {/* Mini water indicator */}
          <div className="flex items-center gap-2">
            <Droplets className="h-3 w-3 shrink-0 text-blue-400" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${waterPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-blue-400"
              />
            </div>
            <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {water.current}/{water.goal} oz
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href="/dashboard/nutrition"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <UtensilsCrossed className="h-3.5 w-3.5" />
          Log Meal
        </Link>
        <Link
          href="/dashboard/nutrition?quickAdd=true"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <Zap className="h-3.5 w-3.5" />
          Quick Add
        </Link>
      </div>
    </Card>
  )
}
