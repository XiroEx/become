"use client"

// THE app-standard segmented control (timeline Day/Week/Month, recipes
// Recipes/Favorites, etc). Bordered full-width strip, black active segment.
// Use this instead of hand-rolling the pattern.
//
// The active pill is a single `layoutId`-tracked element that Framer Motion
// slides between segments on change, instead of an instant bg-color swap.

import { motion } from 'framer-motion'
import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface Segment<T extends string> {
  value: T
  label: string
  Icon?: LucideIcon
}

export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className = '',
  'data-tour': dataTour,
}: {
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  /** Onboarding-tour anchor (see lib/tutorials) — same passthrough pattern as HeaderPillLink. */
  'data-tour'?: string
}) {
  // Scoped per instance — a shared layoutId across multiple SegmentedControls
  // on the same page would make Framer Motion try to morph the pill between
  // unrelated controls.
  const layoutId = useId()

  return (
    <div data-tour={dataTour} className={`inline-flex w-full rounded-xl border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {segments.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold sm:text-sm ${
            value === v
              ? 'text-white dark:text-black'
              : 'text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          {value === v && (
            <motion.span
              layoutId={`segmented-pill-${layoutId}`}
              className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative flex items-center justify-center gap-1.5">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </span>
        </button>
      ))}
    </div>
  )
}
