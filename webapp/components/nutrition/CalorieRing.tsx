"use client"

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import MacroBar from './MacroBar'

interface MacroValues {
  current: number
  goal: number
}

interface CalorieRingProps {
  consumed: number
  goal: number
  protein: MacroValues
  carbs: MacroValues
  fats: MacroValues
}

export default function CalorieRing({ consumed, goal, protein, carbs, fats }: CalorieRingProps) {
  const remaining = goal - consumed
  const isOver = consumed > goal
  const percentage = Math.min(consumed / goal, 1)

  const size = 180
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - percentage * circumference

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      {/* Card header with edit goals button */}
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

      {/* Ring — tappable, goes to goals */}
      <div className="flex flex-col items-center">
        <Link href="/dashboard/nutrition/goals" className="relative block" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
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
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={isOver ? '#ef4444' : 'url(#calorie-ring-gradient)'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className={`text-2xl font-bold tabular-nums ${
                isOver ? 'text-red-500' : 'text-zinc-900 dark:text-white'
              }`}
            >
              {Math.abs(remaining)}
            </motion.span>
            <span
              className={`text-xs font-medium ${
                isOver ? 'text-red-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {isOver ? 'over' : 'remaining'}
            </span>
          </div>
        </Link>

        {/* Goal breakdown */}
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Goal {goal}</span>
          {' '}&minus;{' '}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Food {consumed}</span>
          {' '}={' '}
          <span className={`font-semibold ${isOver ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {remaining} {isOver ? 'over' : 'remaining'}
          </span>
        </p>
      </div>

      {/* Macro bars */}
      <div className="mt-5 space-y-3">
        <MacroBar label="Protein" current={protein.current} goal={protein.goal} color="bg-blue-600" />
        <MacroBar label="Carbs" current={carbs.current} goal={carbs.goal} color="bg-green-600" />
        <MacroBar label="Fats" current={fats.current} goal={fats.goal} color="bg-amber-500" />
      </div>
    </div>
  )
}
