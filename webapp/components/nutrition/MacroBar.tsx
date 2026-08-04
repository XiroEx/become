"use client"

import { motion } from 'framer-motion'
import {
  macroStatus,
  macroBarClass,
  macroTextClass,
  macroChipClass,
  type MacroKind,
} from '@/lib/nutrition/macroStatus'

interface MacroBarProps {
  label: string
  current: number
  goal: number
  color: string
  unit?: string
  /** 'ceiling' (calories/carbs/fats — over is bad) or 'floor' (protein — over is fine). */
  kind?: MacroKind
}

export default function MacroBar({ label, current, goal, color, unit = 'g', kind = 'ceiling' }: MacroBarProps) {
  const status = macroStatus(current, goal, kind)
  const remaining = Math.max(0, goal - current)
  const excess = Math.max(0, current - goal)

  // The fill still clamps at 100% — the bar cannot show "beyond full" — so the
  // colour is what carries the over-state.
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className={macroTextClass(status)}>
            {Math.round(current)}{unit} / {Math.round(goal)}{unit}
          </span>
          {excess > 0 ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${macroChipClass(status)}`}>
              +{Math.round(excess)}{unit}
            </span>
          ) : remaining > 0 ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${macroChipClass(status)}`}>
              {Math.round(remaining)}{unit} left
            </span>
          ) : null}
        </div>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${macroBarClass(status, color)}`}
        />
      </div>
    </div>
  )
}
