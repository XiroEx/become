"use client"

import type { KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import {
  macroStatus,
  macroBarClass,
  macroTextClass,
  macroChipClass,
  type MacroKind,
} from '@/lib/nutrition/macroStatus'
import { usePlannedTooltip } from '@/hooks/usePlannedTooltip'
import PlannedTooltip from './PlannedTooltip'

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
  /**
   * Grams still planned (not yet logged) for today, on top of `current`.
   * Rendered as a light shadow stretching past the solid fill — a preview of
   * where the bar lands if the rest of today's plan gets eaten.
   */
  plannedExtra?: number
}

export default function MacroBar({ label, current, goal, color, unit = 'g', kind = 'ceiling', fiber, plannedExtra }: MacroBarProps) {
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
  const plannedPercentage = goal > 0 && plannedExtra
    ? Math.min(((current + plannedExtra) / goal) * 100, 100)
    : percentage

  // The fiber slice is drawn as a share of the FILL, not of the whole track, so
  // it stays correct once the bar clamps at 100%.
  const showFiber = fiber != null && fiber > 0 && current > 0
  const fiberShareOfFill = showFiber ? Math.min(fiber / current, 1) * 100 : 0

  // Only when the shadow itself is visible is there anything to explain —
  // otherwise there's no planned-inclusive number that differs from what's
  // already on the label.
  const hasPlanned = plannedPercentage > percentage
  const { open, containerRef, show, hide } = usePlannedTooltip()

  return (
    <div
      ref={containerRef}
      className={`space-y-1.5 ${hasPlanned
        ? 'cursor-pointer touch-manipulation rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900'
        : ''}`}
      {...(hasPlanned
        ? {
            role: 'button' as const,
            tabIndex: 0,
            'aria-label': `${label} including today's plan: ${Math.round(current + (plannedExtra ?? 0))}${unit} of ${Math.round(goal)}${unit}`,
            'aria-expanded': open,
            // The whole macro row is the trigger: label, values, chips, and
            // meter. Click explicitly opens so touch does not depend on a
            // browser synthesizing mouseenter after touchend; outside press,
            // pointer leave, blur, or Escape still dismisses it.
            onClick: show,
            onMouseEnter: show,
            onMouseLeave: hide,
            onFocus: show,
            onBlur: hide,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Escape') hide()
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                show()
              }
            },
          }
        : {})}
    >
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
      <div className="relative">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          {plannedPercentage > percentage && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${plannedPercentage}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              // Sits under the actual fill, at low opacity — a preview of the
              // reach if today's remaining plan gets eaten, not a competing bar.
              // `color` is the macro's own Tailwind bg-* class (not a CSS
              // colour), so opacity is applied as a class too.
              className={`absolute inset-y-0 left-0 h-full rounded-full opacity-25 ${color}`}
              aria-hidden="true"
            />
          )}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`absolute inset-y-0 left-0 h-full rounded-full ${macroBarClass(status, color)}`}
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
        <PlannedTooltip open={hasPlanned && open} label={label} current={current} planned={plannedExtra ?? 0} goal={goal} unit={unit} />
      </div>
    </div>
  )
}
