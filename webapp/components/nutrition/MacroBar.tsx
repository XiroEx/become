"use client"

import { motion } from 'framer-motion'

interface MacroBarProps {
  label: string
  current: number
  goal: number
  color: string
  unit?: string
}

export default function MacroBar({ label, current, goal, color, unit = 'g' }: MacroBarProps) {
  const percentage = Math.min((current / goal) * 100, 100)
  const isOver = current > goal
  const remaining = Math.max(0, goal - current)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className={isOver ? 'font-semibold text-red-500' : 'text-zinc-500 dark:text-zinc-400'}>
            {Math.round(current)}{unit} / {Math.round(goal)}{unit}
          </span>
          {!isOver && remaining > 0 && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {Math.round(remaining)}{unit} left
            </span>
          )}
          {isOver && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
              +{Math.round(current - goal)}{unit}
            </span>
          )}
        </div>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${isOver ? 'bg-red-500' : color}`}
        />
      </div>
    </div>
  )
}
