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
  /**
   * Carbs only: how much of `current` is fiber.
   *
   * Fiber is counted inside total carbohydrate on every label, so it fills this
   * bar like any other gram — but it carries almost no energy. Without seeing
   * it, a member eating high-fiber food watches carbs run out while calories
   * barely move and assumes the numbers are broken. Showing the share is the
   * honest fix: the bar stays faithful to the label, and the part that is not
   * really costing them anything is visible.
   */
  fiber?: number
}

export default function MacroBar({ label, current, goal, color, unit = 'g', kind = 'ceiling', fiber }: MacroBarProps) {
  // Fiber counts toward total carbs on the label but carries almost no energy,
  // so it shouldn't be able to push the bar into "over" on its own — the
  // over/warn/hit colour is judged against NET carbs (total minus fiber), even
  // though the fill and the "123g / 200g" readout stay honest to the label.
  const netCurrent = fiber != null && fiber > 0 ? Math.max(0, current - fiber) : current
  const status = macroStatus(netCurrent, goal, kind)
  const remaining = Math.max(0, goal - current)
  const excess = Math.max(0, current - goal)

  // The fill still clamps at 100% — the bar cannot show "beyond full" — so the
  // colour is what carries the over-state.
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0

  // The fiber slice is drawn as a share of the FILL, not of the whole track, so
  // it stays correct once the bar clamps at 100%.
  const showFiber = fiber != null && fiber > 0 && current > 0
  const fiberShareOfFill = showFiber ? Math.min(fiber / current, 1) * 100 : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className={macroTextClass(status)}>
            {Math.round(current)}{unit} / {Math.round(goal)}{unit}
          </span>
          {showFiber && (
            <span className="text-[11px] font-normal text-zinc-400 dark:text-zinc-500">
              ({Math.round(fiber)}{unit} fiber)
            </span>
          )}
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
        >
          {showFiber && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${fiberShareOfFill}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              // Sits at the left of the fill, deliberately a muted wash of the
              // same bar rather than a second colour: it is part of the carbs,
              // not a competing quantity.
              className="h-full rounded-full bg-white/35 dark:bg-white/25"
              aria-hidden="true"
            />
          )}
        </motion.div>
      </div>
    </div>
  )
}
