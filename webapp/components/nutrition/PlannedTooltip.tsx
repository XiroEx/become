"use client"

import { AnimatePresence, motion } from 'framer-motion'

interface PlannedTooltipProps {
  open: boolean
  /** e.g. "Calories" or "Protein" — the metric this breakdown is for. */
  label: string
  /** Already logged today. */
  current: number
  /** Still planned (not yet logged) today, on top of `current`. */
  planned: number
  goal: number
  unit?: string
}

/**
 * The floater that answers "where do those numbers land if I include the
 * planned items" — anchored above whatever renders the planned shadow
 * (the calorie ring's badge, a macro bar), shown on hover/tap of that
 * trigger. Purely presentational; open state lives in the caller via
 * usePlannedTooltip so the same trigger can drive both hover and tap.
 */
export default function PlannedTooltip({ open, label, current, planned, goal, unit = '' }: PlannedTooltipProps) {
  const total = current + planned
  const afterPlan = goal - total
  const afterPlanLabel = afterPlan < 0 ? 'over after plan' : 'left after plan'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-2 text-xs shadow-lg dark:bg-zinc-100"
        >
          <p className="font-semibold text-white dark:text-zinc-900">{label} with today&apos;s plan</p>
          <p className="mt-0.5 tabular-nums text-zinc-300 dark:text-zinc-600">
            {Math.round(current)}{unit} logged + {Math.round(planned)}{unit} planned = {Math.round(total)}{unit} / {Math.round(goal)}{unit}
          </p>
          <p className="mt-1 font-semibold tabular-nums text-emerald-300 dark:text-emerald-700">
            {Math.abs(Math.round(afterPlan))}{unit} {afterPlanLabel}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
